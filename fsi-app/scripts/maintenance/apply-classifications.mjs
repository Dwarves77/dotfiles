// apply-classifications.mjs -- MAINT dispatch step: proposes source classifications via
// propose-classifications.mjs logic, then auto-adopts high-confidence proposals (operator ruling
// 2026-09-03). Two modes: dry = propose (no-op) + list what --auto-adopt would adopt; apply =
// propose (committed writes) then auto-adopt (committed writes + flag resolution).
//
// WHY THIS WRAPPER EXISTS (Lane CLASSIFY-STEP, 2026-09-04). propose-classifications.mjs and
// apply-classifications.mjs exist, but neither runs as part of any turn today -- classifications
// never run unless a coordinator runs them by hand, which cannot happen (no credentials outside
// Actions). This wrapper is the missing coordinator-dispatch runtime that makes the full
// propose->auto-adopt pipeline runnable through the MAINT framework (docs/plans/finish-plan-2026-09-02.md,
// MAINT paragraph). See apply-classifications.mjs's header (operator ruling 2026-09-03) for why
// auto-adoption is safe for scope_modes/scope_verticals/jurisdiction_iso (high confidence = decisive
// name/host match) and expected_output (closed role->default lookup, deterministic). scope_topics stays
// ratification-only (undecidable "regular and material coverage" judgment). jurisdiction_iso joined the
// applicable/auto-adoptable set D9, lane L14, 2026-09-13 (migration 033 gives Axis 3 a safe home); the
// legacy `sources.jurisdictions` column was never applicable and stays untouched forever (see
// classify-source.mjs).
//
// WHAT IT DOES, both modes use this file's own orchestration with DB access injected.
//   Dry: runs the full propose logic (compute fresh proposals, dedup against existing open flags,
//   reflect to see what would be written), then evaluates every resulting OPEN source-classification
//   flag to list what --auto-adopt would adopt (partitioned into eligible >= threshold vs below).
//   Writes nothing.
//   Apply: runs the full propose logic with execute=true (writes new integrity_flags rows, resolves
//   stale ones), then runs autoAdoptClassification for every OPEN source-classification flag
//   (evaluating + writing only the high-confidence and deterministic proposals, resolving flags once
//   nothing applicable remains). Committed writes via the guarded path (rule 015).
//
// This step NEVER WRITES the legacy sources.jurisdictions column (see apply-classifications.mjs's
// header) -- classify-source.mjs never emits field "jurisdictions". Axis-3 writes go to
// sources.jurisdiction_iso only, through the same guarded APPLICABLE_FIELDS/AUTO_ADOPT_FIELDS gate as
// every other axis (D9, lane L14, 2026-09-13; migration 033).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAutoAdoption, autoAdoptClassification, AUTO_ADOPT_FIELDS,
  autoResolveDriftFlag, retireAnomalyFlag, buildNoDerivableClassificationNote,
  isZeroProposalClassificationFlag, DRIFT_CREATED_BY, ANOMALY_CREATED_BY,
} from "../classification/apply-classifications.mjs";
import {
  proposeSourceAxisClassification, APPLICABLE_FIELDS,
} from "../../src/lib/classification/classify-source.mjs";
import { isValidDistribution } from "../../src/lib/classification/expected-output.mjs";
import {
  detectDrift, observedDistributionFromItems,
} from "../../src/lib/classification/routing.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE,
  SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
import { planReflect } from "../connections/propose-tags.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT apply-classifications dispatch (Lane CLASSIFY-STEP, 2026-09-04): orchestrate " +
    "propose-classifications logic (Axis 3/4/5 source gaps, drift as integrity_flags) " +
    "and auto-adopt high-confidence / deterministic proposals through apply-classifications.mjs's " +
    "own evaluateAutoAdoption/autoAdoptClassification (guarded writes, rule 015). Scope_topics stays " +
    "ratification-only (operator rules); jurisdiction_iso auto-adopts at high confidence (D9, lane L14, " +
    "2026-09-13, migration 033). D17 families 4/5 (2026-09-12): a " +
    "zero-proposal classification flag is re-derived from the SC-13 class table + observed output; " +
    "every open drift flag is resolved (adopt-observed or insufficient-sample); every open anomaly " +
    "flag is retired (the detector itself is deleted).",
});

const CLASSIFY_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
const NO_DERIVABLE_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE);
// DRIFT_CREATED_BY / ANOMALY_CREATED_BY imported directly from ../classification/apply-classifications.mjs
// (D17 families 4/5, 2026-09-12) rather than locally re-derived, so this wrapper's family-5 resolution
// loop and that core file's own CLI can never drift on the exact created_by string.

// Framework defaults from propose-classifications.mjs (not editable here; if future ruling changes
// these, they change there, and this wrapper picks them up via imports when this module reloads).
const DRIFT_THRESHOLD_POINTS = 30;
const MIN_ITEMS_FOR_DRIFT_CHECK = 10;

// ── Builders (copied inline to avoid exporting from propose-classifications.mjs; mirrored in exact
//     detail so any source-of-truth drift between the two scripts is caught by inspection) ────────

/**
 * The integrity_flags row for a source classify-source.mjs's name/role matchers found ZERO candidate
 * values for. Born ALREADY RESOLVED -- mirrored from propose-classifications.mjs's
 * buildNoDerivableClassificationFlagRow (D17 family 4 part 2, 2026-09-12).
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {Date} [today]
 * @returns {object} integrity_flags row (status:'resolved', no id)
 */
function buildNoDerivableClassificationFlagRow(source, today = new Date()) {
  const label = source?.name || source?.url || source.id;
  const description =
    `Source ${source.id} (${label}) has unclassified 5-axis field(s) but no candidate value was ` +
    "derivable from name/url/role alone.\n\nPROPOSALS_JSON: []";
  return {
    category: "source_issue",
    subject_type: "source",
    subject_ref: buildSubjectRef(source.id),
    description,
    recommended_actions: [],
    status: "resolved",
    resolved_at: today.toISOString(),
    resolved_by: "apply-classifications.mjs (MAINT)",
    resolution_note: buildNoDerivableClassificationNote(today),
    created_by: NO_DERIVABLE_CREATED_BY,
  };
}

/**
 * Build the integrity_flags insert payload for one source's classify-source.mjs proposal set. PURE.
 * Mirrored from propose-classifications.mjs's buildClassificationFlagRow. A ZERO-proposal result
 * delegates to buildNoDerivableClassificationFlagRow (D17 family 4 part 2).
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}} computed
 * @returns {object} integrity_flags row
 */
function buildClassificationFlagRow(source, computed) {
  const proposals = computed?.proposals ?? [];
  if (!proposals.length) return buildNoDerivableClassificationFlagRow(source);

  const label = source?.name || source?.url || source.id;
  const applicable = proposals.filter((p) => p.applicable);
  const advisory = proposals.filter((p) => !p.applicable);
  const fmt = (p) => `${p.field}=${JSON.stringify(p.value)}`;

  const parts = [];
  if (applicable.length) parts.push(`${applicable.length} applicable: ${applicable.map(fmt).join("; ")}`);
  if (advisory.length) parts.push(`${advisory.length} advisory-only (no safe apply target yet): ${advisory.map(fmt).join("; ")}`);

  const summary = `classify-source.mjs proposes Axis 3/4/5 classification for source ${source.id} (${label}): ${parts.join(" | ")}.`;
  const description = `${summary}\n\nPROPOSALS_JSON: ${JSON.stringify(proposals)}`;

  return {
    category: "source_issue",
    subject_type: "source",
    subject_ref: buildSubjectRef(source.id),
    description,
    recommended_actions: [],
    status: "open",
    created_by: CLASSIFY_CREATED_BY,
  };
}

/**
 * Build the integrity_flags insert payload for one source's drift finding (framework Section 5b).
 * PURE. Mirrored from propose-classifications.mjs's buildDriftFlagRow.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{drifted:boolean, deltas:Record<string, number>}} drift
 * @returns {object}
 */
function buildDriftFlagRow(source, drift) {
  const label = source?.name || source?.url || source.id;
  const drifted = Object.entries(drift.deltas)
    .filter(([, d]) => d > DRIFT_THRESHOLD_POINTS)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, d]) => `${cat} (+${d.toFixed(1)}pp)`);
  const description =
    `routing.mjs detectDrift: source ${source.id} (${label})'s observed item-category distribution deviates from its ` +
    `Axis-5 expected_output by more than ${DRIFT_THRESHOLD_POINTS} percentage points on: ${drifted.join(", ")}. ` +
    `Framework Section 5b names four possible causes: the source's real scope changed, its classification was wrong ` +
    `at registration, the item rules need refinement, or this is genuinely anomalous output -- only an operator can ` +
    `disposition which.\n\nDELTAS_JSON: ${JSON.stringify(drift.deltas)}`;
  return {
    category: "source_issue",
    subject_type: "source",
    subject_ref: buildSubjectRef(source.id),
    description,
    recommended_actions: [],
    status: "open",
    created_by: DRIFT_CREATED_BY,
  };
}

// buildAnomalyFlagRow DELETED (D17 family 5, 2026-09-12) -- mirrors propose-classifications.mjs's own
// deletion; see that file's header for the retirement rationale. Any surviving open item-anomaly flag is
// retired by this file's own Phase 2c below (retireAnomalyFlag, imported unmodified).

/**
 * Group a flat item list by source_id. PURE.
 * @param {Array<{source_id?:string|null}>} items
 * @returns {Map<string, Array>}
 */
function groupItemsBySource(items) {
  const map = new Map();
  for (const it of items || []) {
    const sid = it?.source_id;
    if (!sid) continue;
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(it);
  }
  return map;
}

/**
 * Run one classification subtype's full propose+reflect+write pass. EXACT createdBy match.
 * Mirrored from propose-classifications.mjs's runSubtype inner logic, but integrated here
 * so the wrapper can use it and report back to main().
 * @param {string} createdByValue
 * @param {Array<{subjectRef:string, row:object}>} freshList
 * @param {boolean} execute
 * @param {{
 *   readAll: (table:string, cols:string, opts:object) => Promise<Array>,
 *   insertMany: (table:string, rows:Array, opts:object) => Promise<{inserted:number, snapshot:string|null}>,
 *   updateStale: (table:string, ids:Array, opts:object) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 * @returns {Promise<{plan:object, wrote:object|null, resolved:object|null}>}
 */
async function runSubtype(createdByValue, freshList, execute, deps, { anyStatus = false } = {}) {
  const existingOpen = await deps.readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => (anyStatus ? q : q.eq("status", "open")).eq("created_by", createdByValue),
  });
  const plan = planReflect(existingOpen, freshList);

  let wrote = null, resolved = null;
  if (execute) {
    if (plan.newRows.length) {
      wrote = await deps.insertMany("integrity_flags", plan.newRows, { cite: CITE, select: "id" });
    }
    if (plan.staleIds.length) {
      resolved = await deps.updateStale("integrity_flags", plan.staleIds, {
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: "apply-classifications.mjs (MAINT)",
        resolution_note: `${createdByValue} finding no longer applicable (re-computed this run and not reproduced).`,
      });
    }
  }

  return { plan, wrote, resolved };
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readAll: (table:string, cols:string, opts:object) => Promise<Array>,
 *   insertMany: (table:string, rows:Array, opts:object) => Promise<{inserted:number, snapshot:string|null}>,
 *   updateStale: (table:string, ids:Array, opts:object) => Promise<{updated:number, snapshot:string|null}>,
 *   listOpenClassifications: () => Promise<Array>,
 *   listOpenDrift: () => Promise<Array>,
 *   listOpenAnomaly: () => Promise<Array>,
 *   readFlag: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   readSource: (id:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   updateSource: (id:string, patch:object) => Promise<{updated:number, snapshot:string|null}>,
 *   resolveFlag: (id:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "apply-classifications", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  // ── Phase 1: Propose ────────────────────────────────────────────────────────────────────────

  // jurisdiction_iso added (D9, lane L14, 2026-09-13) so proposeSourceAxisClassification's gap check
  // sees the source's REAL current value instead of always reading it as empty.
  const SOURCE_SIG = "id, name, url, source_role, secondary_roles, status, jurisdictions, jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output";
  const sources = await deps.readAll("sources", SOURCE_SIG, { match: (q) => q.eq("status", "active") });
  // created_at added (D17 family 5): countDistinctDates needs it for the drift-resolution sample check.
  const ITEM_SIG = "id, source_id, item_type, domain, created_at";
  const items = await deps.readAll("intelligence_items", ITEM_SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });
  const bySource = groupItemsBySource(items);
  // D17 families 4 and 5: a closure over the ALREADY-loaded items, reused as the `readSourceItems` dep
  // both the zero-proposal re-derivation (Phase 2) and the drift auto-resolution (Phase 2b) need, no
  // second DB read.
  const readSourceItems = async (sourceId) => bySource.get(sourceId) || [];

  // Run classify-source findings. D17 family 4 part 2: split proposal-bearing (open) from
  // zero-derivation (born resolved, distinct subtype) so the two never share a dedup key.
  const classifyComputed = sources
    .map((s) => ({ source: s, computed: proposeSourceAxisClassification(s) }))
    .filter((r) => r.computed.hasGap);
  const classifyFresh = classifyComputed.filter((r) => r.computed.proposals.length > 0)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  const noDerivableFresh = classifyComputed.filter((r) => r.computed.proposals.length === 0)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  const classifyResult = await runSubtype(CLASSIFY_CREATED_BY, classifyFresh, apply, deps);
  const noDerivableResult = await runSubtype(NO_DERIVABLE_CREATED_BY, noDerivableFresh, apply, deps, { anyStatus: true });

  // Run drift detection (proposing side unchanged; Phase 2b below is what now ALWAYS resolves these).
  const classifiedSources = sources.filter((s) => isValidDistribution(s.expected_output));
  const driftFresh = [];
  for (const s of classifiedSources) {
    const sourceItems = bySource.get(s.id) || [];
    if (sourceItems.length < MIN_ITEMS_FOR_DRIFT_CHECK) continue;
    const observed = observedDistributionFromItems(sourceItems);
    const drift = detectDrift(observed, s.expected_output, DRIFT_THRESHOLD_POINTS);
    if (drift.drifted) driftFresh.push({ subjectRef: buildSubjectRef(s.id), row: buildDriftFlagRow(s, drift) });
  }
  const driftResult = await runSubtype(DRIFT_CREATED_BY, driftFresh, apply, deps);

  // Anomaly detection REMOVED (D17 family 5, 2026-09-12) -- the detector is deleted; any surviving open
  // row is retired unconditionally by Phase 2c below.

  summary.counts.propose = {
    classify: {
      plan: { new: classifyResult.plan.newRows.length, stale: classifyResult.plan.staleIds.length, unchanged: classifyResult.plan.unchanged },
      wrote: classifyResult.wrote ? { inserted: classifyResult.wrote.inserted, snapshot: classifyResult.wrote.snapshot } : null,
      resolved: classifyResult.resolved ? { updated: classifyResult.resolved.updated, snapshot: classifyResult.resolved.snapshot } : null,
    },
    classify_no_derivable: {
      plan: { new: noDerivableResult.plan.newRows.length, stale: noDerivableResult.plan.staleIds.length, unchanged: noDerivableResult.plan.unchanged },
      wrote: noDerivableResult.wrote ? { inserted: noDerivableResult.wrote.inserted, snapshot: noDerivableResult.wrote.snapshot } : null,
      resolved: noDerivableResult.resolved ? { updated: noDerivableResult.resolved.updated, snapshot: noDerivableResult.resolved.snapshot } : null,
    },
    drift: {
      plan: { new: driftResult.plan.newRows.length, stale: driftResult.plan.staleIds.length, unchanged: driftResult.plan.unchanged },
      wrote: driftResult.wrote ? { inserted: driftResult.wrote.inserted, snapshot: driftResult.wrote.snapshot } : null,
      resolved: driftResult.resolved ? { updated: driftResult.resolved.updated, snapshot: driftResult.resolved.snapshot } : null,
    },
    anomaly: { retired: true },
  };

  // ── Phase 2: Auto-adopt (D17 family 4: zero-proposal flags now decided too, never skipped) ────

  const openFlags = await deps.listOpenClassifications();
  const evaluated = openFlags.map((f) => ({ flag: f, decision: evaluateAutoAdoption(f) }));
  const eligible = evaluated.filter((e) => e.decision.ok);
  const zeroProposal = evaluated.filter((e) => !e.decision.ok && isZeroProposalClassificationFlag(e.flag));
  const notEligible = evaluated.filter((e) => !e.decision.ok && !isZeroProposalClassificationFlag(e.flag));

  summary.counts.auto_adopt = {
    open_candidates: openFlags.length,
    eligible_count: eligible.length,
    zero_proposal_count: zeroProposal.length,
    not_eligible_count: notEligible.length,
    eligible: eligible.map((e) => ({
      flag_id: e.flag.id,
      item_id: e.decision.sourceId,
      proposal_count: e.decision.proposals.length,
    })),
  };

  // D17 family 5: every OPEN drift/anomaly flag is decided regardless of dry/apply mode (dry previews
  // the decision; apply writes/resolves it) -- computed here so the dry summary carries it too.
  const openDrift = await deps.listOpenDrift();
  const openAnomaly = await deps.listOpenAnomaly();
  const family5Deps = { readFlag: deps.readFlag, readSource: deps.readSource, readSourceItems, updateSource: deps.updateSource, resolveFlag: deps.resolveFlag };
  const driftPreview = [];
  for (const f of openDrift) driftPreview.push(await autoResolveDriftFlag(family5Deps, f.id, { execute: false }));
  summary.counts.family5 = {
    drift_open: openDrift.length,
    drift_would_adopt: driftPreview.filter((r) => r.decision?.adopt).length,
    anomaly_open: openAnomaly.length,
  };

  if (!apply) {
    summary.note =
      `DRY -- proposed ${classifyResult.plan.newRows.length + driftResult.plan.newRows.length} new ` +
      `flag(s) (${classifyResult.plan.staleIds.length + driftResult.plan.staleIds.length} stale resolved; ` +
      `${noDerivableResult.plan.newRows.length} zero-derivation row(s) recorded already-resolved). ` +
      `${eligible.length} OPEN source-classification flag(s) eligible for auto-adoption (` +
      `${eligible.reduce((n, e) => n + e.decision.proposals.length, 0)} proposals), ${zeroProposal.length} zero-proposal ` +
      `flag(s) would be re-derived (D17). ${openDrift.length} open drift flag(s) would be resolved ` +
      `(${summary.counts.family5.drift_would_adopt} would adopt), ${openAnomaly.length} open anomaly flag(s) ` +
      "would be retired. Nothing written. Apply with: node scripts/maintenance/apply-classifications.mjs --mode apply";
    return summary;
  }

  // ── Apply auto-adopt: run each eligible AND zero-proposal flag through autoAdoptClassification ──

  const classificationDeps = {
    readFlag: (id) => deps.readFlag(id),
    readSource: (id) => deps.readSource(id),
    readSourceItems,
    updateSource: (id, patch) => deps.updateSource(id, patch),
    resolveFlag: (id, note) => deps.resolveFlag(id, note),
  };

  let appliedCount = 0, rederivedCount = 0;
  const applyResults = [];
  for (const { flag } of eligible) {
    const r = await autoAdoptClassification(classificationDeps, flag.id, { execute: true });
    applyResults.push({ flag_id: flag.id, status: r.status, item_id: r.sourceId ?? null, written: r.written ?? false, resolved: r.resolved ?? false });
    if (r.status === "applied") appliedCount += 1;
  }
  const rederiveResults = [];
  for (const { flag } of zeroProposal) {
    const r = await autoAdoptClassification(classificationDeps, flag.id, { execute: true });
    rederiveResults.push({ flag_id: flag.id, status: r.status, item_id: r.sourceId ?? null });
    if (r.status === "re_derived_adopted" || r.status === "re_derived_no_change") rederivedCount += 1;
  }

  summary.applied = appliedCount;
  summary.counts.apply_results = applyResults;
  summary.counts.rederive_apply_results = rederiveResults;
  const appliedItemIds = [
    ...new Set([
      ...applyResults.filter((r) => r.status === "applied" && r.written).map((r) => r.item_id),
      ...rederiveResults.filter((r) => r.status === "re_derived_adopted").map((r) => r.item_id),
    ]),
  ];

  // ── Phase 2b/2c: resolve every open drift flag, retire every open anomaly flag ──────────────

  let driftResolvedCount = 0;
  const driftApplyResults = [];
  for (const f of openDrift) {
    const r = await autoResolveDriftFlag(family5Deps, f.id, { execute: true });
    driftApplyResults.push({ flag_id: f.id, status: r.status, source_id: r.sourceId ?? null, adopted: r.adopted ?? false });
    if (r.status === "resolved") { driftResolvedCount += 1; if (r.adopted && r.sourceId) appliedItemIds.push(r.sourceId); }
  }
  let anomalyRetiredCount = 0;
  const anomalyApplyResults = [];
  for (const f of openAnomaly) {
    const r = await retireAnomalyFlag(family5Deps, f.id, { execute: true });
    anomalyApplyResults.push({ flag_id: f.id, status: r.status });
    if (r.status === "resolved") anomalyRetiredCount += 1;
  }
  summary.counts.family5.drift_apply_results = driftApplyResults;
  summary.counts.family5.anomaly_apply_results = anomalyApplyResults;
  summary.counts.family5.drift_resolved = driftResolvedCount;
  summary.counts.family5.anomaly_retired = anomalyRetiredCount;

  summary.note =
    `Proposed ${classifyResult.plan.newRows.length + driftResult.plan.newRows.length} new flag(s), ` +
    `resolved ${classifyResult.plan.staleIds.length + driftResult.plan.staleIds.length} stale ` +
    `(${noDerivableResult.plan.newRows.length} zero-derivation row(s) recorded already-resolved). ` +
    `Auto-adopted ${appliedCount}/${eligible.length} eligible OPEN source-classification flag(s); ` +
    `${rederivedCount}/${zeroProposal.length} zero-proposal flag(s) re-derived (D17). ` +
    `${driftResolvedCount}/${openDrift.length} drift flag(s) resolved; ${anomalyRetiredCount}/${openAnomaly.length} anomaly flag(s) retired.`;

  // Read back written sources for artifact summary
  const readBack = {};
  for (const sourceId of [...new Set(appliedItemIds)]) {
    const { data } = await deps.readSource(sourceId);
    readBack[sourceId] = data
      ? {
          scope_topics: data.scope_topics,
          scope_modes: data.scope_modes,
          scope_verticals: data.scope_verticals,
          expected_output: data.expected_output,
        }
      : null;
  }
  summary.read_back = readBack;

  return summary;
}

// Extracted to a named export (fix round, 2026-09-12 -- coordinator-reported crash, maintenance run
// 34691660889): `updateSource` and `resolveFlag` below both call `guardedUpdate`, which this function's
// own db.mjs import omitted -- a `ReferenceError: guardedUpdate is not defined` at apply time only,
// because Phase 2's apply branch (`updateSource`/`resolveFlag`) is unreachable in dry mode (`main`
// returns before Phase 2's write loop when `!apply` -- see this file's own `main`). Dry mode therefore
// passed clean while a real `--mode apply` dispatch crashed on the first eligible auto-adopt. Exporting
// `buildRealDeps` (rather than leaving it inline inside the `IS_MAIN` block) lets a test call it directly
// with db.mjs's `__setWriteClientForTest` seam, so an apply-only closure with a missing import fails the
// test the same way it failed production, instead of only being exercised by fake `deps` objects that
// never touch the real imports (see apply-classifications.test.mjs's own "buildRealDeps" tests).
/** Paginated open-flag read scoped to one exact created_by value. Shared by listOpenClassifications/
 *  listOpenDrift/listOpenAnomaly below (D17, 2026-09-12) so the three lists never hand-copy the same
 *  pagination loop three times. */
async function listOpenByCreatedBy(sb, createdByValue) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("integrity_flags")
      .select("id, subject_ref, created_by, status, description")
      .eq("status", "open")
      .eq("created_by", createdByValue)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`apply-classifications: open flag read failed (${createdByValue}): ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function buildRealDeps() {
  const { readAll, readClient, guardedInsertMany, guardedUpdateByIds, guardedUpdate } = await import("../lib/db.mjs");
  const sb = readClient();

  return {
    readAll,
    readClient: () => sb,
    insertMany: (table, rows, opts) => guardedInsertMany(table, rows, opts),
    // plan.staleIds is runtime-scaled (every stale integrity_flags row this classification pass
    // found) with no declared cap -- chunked via guardedUpdateByIds, not a single .in(), IN-CHUNK
    // class (2026-09-06; same shape as analyze-corpus.mjs's 1,317-id resolve).
    updateStale: async (table, ids, patch) =>
      guardedUpdateByIds(table, ids, patch, { cite: CITE }),
    listOpenClassifications: async () => listOpenByCreatedBy(sb, CLASSIFY_CREATED_BY),
    // D17 family 5 (2026-09-12): the open-flag lists Phase 2b/2c iterate.
    listOpenDrift: async () => listOpenByCreatedBy(sb, DRIFT_CREATED_BY),
    listOpenAnomaly: async () => listOpenByCreatedBy(sb, ANOMALY_CREATED_BY),
    readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
    // Widened 2026-09-12 (task 7.2): decideScopeTopicsProposal re-checks a scope_topics proposal's
    // per-topic evidence against the source's OWN name/source_role at apply time.
    // Widened again 2026-09-12 (D17 family 4): `url` added so deriveClassTableCandidates can resolve the
    // SC-13 class table tier for the source's own registered host.
    // jurisdiction_iso added (D9, lane L14, 2026-09-13) so buildMergePatch merges against the source's
    // real current value.
    readSource: (id) => sb.from("sources").select("id, name, url, source_role, jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output").eq("id", id).maybeSingle(),
    updateSource: async (id, patch) => {
      const res = await guardedUpdate("sources", (qb) => qb.eq("id", id), patch, { cite: CITE });
      return { updated: res.updated, snapshot: res.snapshot };
    },
    resolveFlag: async (id, note) => {
      const res = await guardedUpdate(
        "integrity_flags",
        (qb) => qb.eq("id", id),
        { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "apply-classifications.mjs (MAINT)", resolution_note: note },
        { cite: CITE },
      );
      return { updated: res.updated, snapshot: res.snapshot };
    },
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "apply-classifications",
    main,
    needsDb: true,
    buildDeps: buildRealDeps,
  });
}
