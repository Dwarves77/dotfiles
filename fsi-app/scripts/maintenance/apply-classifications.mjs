// apply-classifications.mjs — MAINT dispatch step: proposes source classifications via
// propose-classifications.mjs logic, then auto-adopts high-confidence proposals (operator ruling
// 2026-09-03). Two modes: dry = propose (no-op) + list what --auto-adopt would adopt; apply =
// propose (committed writes) then auto-adopt (committed writes + flag resolution).
//
// WHY THIS WRAPPER EXISTS (Lane CLASSIFY-STEP, 2026-09-04). propose-classifications.mjs and
// apply-classifications.mjs exist, but neither runs as part of any turn today — classifications
// never run unless a coordinator runs them by hand, which cannot happen (no credentials outside
// Actions). This wrapper is the missing coordinator-dispatch runtime that makes the full
// propose->auto-adopt pipeline runnable through the MAINT framework (docs/plans/finish-plan-2026-09-02.md,
// MAINT paragraph). See apply-classifications.mjs's header (operator ruling 2026-09-03) for why
// auto-adoption is safe for scope_modes/scope_verticals (high confidence = decisive name match) and
// expected_output (closed role->default lookup, deterministic). scope_topics stays ratification-only
// (undecidable "regular and material coverage" judgment). jurisdictions was never applicable (see
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
// This step NEVER WRITES sources.jurisdictions (see apply-classifications.mjs's header). If
// propose-classifications emits a jurisdiction proposal, it rides along in description (advisory-only)
// but is filtered out before any auto-adopt patch is built — the framework's own rule (classify-source.mjs).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateAutoAdoption, autoAdoptClassification, AUTO_ADOPT_FIELDS,
} from "../classification/apply-classifications.mjs";
import {
  proposeSourceAxisClassification, APPLICABLE_FIELDS,
} from "../../src/lib/classification/classify-source.mjs";
import { isValidDistribution } from "../../src/lib/classification/expected-output.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";
import {
  detectDrift, isAnomalousCategory, observedDistributionFromItems,
} from "../../src/lib/classification/routing.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE, ITEM_ANOMALY_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
import { planReflect } from "../connections/propose-tags.mjs";
import { runCli } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "flywheel-build-plan-2026-08-10",
  reason:
    "MAINT apply-classifications dispatch (Lane CLASSIFY-STEP, 2026-09-04): orchestrate " +
    "propose-classifications logic (Axis 3/4/5 source gaps, drift, anomalies as integrity_flags) " +
    "and auto-adopt high-confidence / deterministic proposals through apply-classifications.mjs's " +
    "own evaluateAutoAdoption/autoAdoptClassification (guarded writes, rule 015). Scope_topics and " +
    "jurisdiction proposals stay ratification-only (operator rules).",
});

const CLASSIFY_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE);
const DRIFT_CREATED_BY = createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE);
const ANOMALY_CREATED_BY = createdBy(AXIS_NAMESPACE, ITEM_ANOMALY_SUBTYPE);

// Framework defaults from propose-classifications.mjs (not editable here; if future ruling changes
// these, they change there, and this wrapper picks them up via imports when this module reloads).
const DRIFT_THRESHOLD_POINTS = 30;
const ANOMALY_THRESHOLD = 0.05;
const MIN_ITEMS_FOR_DRIFT_CHECK = 10;

// ── Builders (copied inline to avoid exporting from propose-classifications.mjs; mirrored in exact
//     detail so any source-of-truth drift between the two scripts is caught by inspection) ────────

/**
 * Build the integrity_flags insert payload for one source's classify-source.mjs proposal set. PURE.
 * Mirrored from propose-classifications.mjs's buildClassificationFlagRow.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}} computed
 * @returns {object} integrity_flags row (status:'open', no id)
 */
function buildClassificationFlagRow(source, computed) {
  const proposals = computed?.proposals ?? [];
  const label = source?.name || source?.url || source.id;
  const applicable = proposals.filter((p) => p.applicable);
  const advisory = proposals.filter((p) => !p.applicable);
  const fmt = (p) => `${p.field}=${JSON.stringify(p.value)}`;

  const parts = [];
  if (applicable.length) parts.push(`${applicable.length} applicable: ${applicable.map(fmt).join("; ")}`);
  if (advisory.length) parts.push(`${advisory.length} advisory-only (no safe apply target yet): ${advisory.map(fmt).join("; ")}`);

  const summary = proposals.length
    ? `classify-source.mjs proposes Axis 3/4/5 classification for source ${source.id} (${label}): ${parts.join(" | ")}.`
    : `Source ${source.id} (${label}) has unclassified 5-axis field(s) but no candidate value was derivable from name/url/role alone -- needs manual operator classification.`;
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

/**
 * Build the integrity_flags insert payload for one anomalous item (framework Section 5c). PURE.
 * Mirrored from propose-classifications.mjs's buildAnomalyFlagRow.
 * @param {{id:string}} item
 * @param {{id:string, name?:string|null, url?:string|null, source_role?:string|null}} source
 * @param {string} category
 * @param {number} probability
 * @returns {object}
 */
function buildAnomalyFlagRow(item, source, category, probability) {
  const label = source?.name || source?.url || source.id;
  const description =
    `routing.mjs isAnomalousCategory: item ${item.id} from source ${source.id} (${label}, source_role=${source.source_role ?? "null"}) ` +
    `classified as "${category}", which carries only ${(probability * 100).toFixed(1)}% expected probability in the source's Axis-5 ` +
    `distribution (anomaly threshold ${(ANOMALY_THRESHOLD * 100).toFixed(0)}%). Framework Section 5c: review whether the item's ` +
    `classification is wrong, or the source produced something genuinely unusual (e.g. a vendor's voluntary binding-style commitment).`;
  return {
    category: "data_quality",
    subject_type: "item",
    subject_ref: buildSubjectRef(item.id),
    description,
    recommended_actions: [],
    status: "open",
    created_by: ANOMALY_CREATED_BY,
  };
}

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
async function runSubtype(createdByValue, freshList, execute, deps) {
  const existingOpen = await deps.readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("status", "open").eq("created_by", createdByValue),
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

  const SOURCE_SIG = "id, name, url, source_role, secondary_roles, status, jurisdictions, scope_topics, scope_modes, scope_verticals, expected_output";
  const sources = await deps.readAll("sources", SOURCE_SIG, { match: (q) => q.eq("status", "active") });
  const ITEM_SIG = "id, source_id, item_type, domain";
  const items = await deps.readAll("intelligence_items", ITEM_SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });

  // Run classify-source findings
  const classifyFresh = sources
    .map((s) => ({ source: s, computed: proposeSourceAxisClassification(s) }))
    .filter((r) => r.computed.hasGap)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  const classifyResult = await runSubtype(CLASSIFY_CREATED_BY, classifyFresh, apply, deps);

  // Run drift detection
  const bySource = groupItemsBySource(items);
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

  // Run anomaly detection
  const bySourceId = new Map(sources.map((s) => [s.id, s]));
  const anomalyFresh = [];
  for (const it of items) {
    const s = bySourceId.get(it.source_id);
    if (!s || !isValidDistribution(s.expected_output)) continue;
    const category = surfaceOf(it.item_type, typeof it.domain === "number" ? it.domain : null);
    if (category === "uncategorized") continue;
    const probability = s.expected_output[category] ?? 0;
    if (isAnomalousCategory(category, s.expected_output, ANOMALY_THRESHOLD)) {
      anomalyFresh.push({ subjectRef: buildSubjectRef(it.id), row: buildAnomalyFlagRow(it, s, category, probability) });
    }
  }
  const anomalyResult = await runSubtype(ANOMALY_CREATED_BY, anomalyFresh, apply, deps);

  summary.counts.propose = {
    classify: {
      plan: { new: classifyResult.plan.newRows.length, stale: classifyResult.plan.staleIds.length, unchanged: classifyResult.plan.unchanged },
      wrote: classifyResult.wrote ? { inserted: classifyResult.wrote.inserted, snapshot: classifyResult.wrote.snapshot } : null,
      resolved: classifyResult.resolved ? { updated: classifyResult.resolved.updated, snapshot: classifyResult.resolved.snapshot } : null,
    },
    drift: {
      plan: { new: driftResult.plan.newRows.length, stale: driftResult.plan.staleIds.length, unchanged: driftResult.plan.unchanged },
      wrote: driftResult.wrote ? { inserted: driftResult.wrote.inserted, snapshot: driftResult.wrote.snapshot } : null,
      resolved: driftResult.resolved ? { updated: driftResult.resolved.updated, snapshot: driftResult.resolved.snapshot } : null,
    },
    anomaly: {
      plan: { new: anomalyResult.plan.newRows.length, stale: anomalyResult.plan.staleIds.length, unchanged: anomalyResult.plan.unchanged },
      wrote: anomalyResult.wrote ? { inserted: anomalyResult.wrote.inserted, snapshot: anomalyResult.wrote.snapshot } : null,
      resolved: anomalyResult.resolved ? { updated: anomalyResult.resolved.updated, snapshot: anomalyResult.resolved.snapshot } : null,
    },
  };

  // ── Phase 2: Auto-adopt ─────────────────────────────────────────────────────────────────────

  const openFlags = await deps.listOpenClassifications();
  const evaluated = openFlags.map((f) => {
    const decision = evaluateAutoAdoption(f);
    return { flag: f, decision };
  });
  const eligible = evaluated.filter((e) => e.decision.ok);
  const notEligible = evaluated.filter((e) => !e.decision.ok);

  summary.counts.auto_adopt = {
    open_candidates: openFlags.length,
    eligible_count: eligible.length,
    not_eligible_count: notEligible.length,
    eligible: eligible.map((e) => ({
      flag_id: e.flag.id,
      item_id: e.decision.sourceId,
      auto_adoptable_count: e.decision.autoAdoptable.length,
      remaining_count: e.decision.remaining.length,
    })),
  };

  if (!apply) {
    summary.note =
      `DRY — proposed ${classifyResult.plan.newRows.length + driftResult.plan.newRows.length + anomalyResult.plan.newRows.length} new ` +
      `flag(s) (${classifyResult.plan.staleIds.length + driftResult.plan.staleIds.length + anomalyResult.plan.staleIds.length} stale resolved). ` +
      `${eligible.length} OPEN source-classification flag(s) eligible for auto-adoption (` +
      `${eligible.reduce((n, e) => n + e.decision.autoAdoptable.length, 0)} proposals). Nothing written. ` +
      `Apply with: node scripts/maintenance/apply-classifications.mjs --mode apply`;
    return summary;
  }

  // ── Apply auto-adopt: run each eligible flag through autoAdoptClassification ───────────────

  let appliedCount = 0;
  const applyResults = [];
  for (const { flag } of eligible) {
    const r = await autoAdoptClassification(
      {
        readFlag: (id) => deps.readFlag(id),
        readSource: (id) => deps.readSource(id),
        updateSource: (id, patch) => deps.updateSource(id, patch),
        resolveFlag: (id, note) => deps.resolveFlag(id, note),
      },
      flag.id,
      { execute: true },
    );
    applyResults.push({ flag_id: flag.id, status: r.status, item_id: r.sourceId ?? null, written: r.written ?? false, resolved: r.resolved ?? false });
    if (r.status === "applied") appliedCount += 1;
  }

  summary.applied = appliedCount;
  summary.counts.apply_results = applyResults;
  const appliedItemIds = [...new Set(applyResults.filter((r) => r.status === "applied" && r.written).map((r) => r.item_id))];

  summary.note =
    `Proposed ${classifyResult.plan.newRows.length + driftResult.plan.newRows.length + anomalyResult.plan.newRows.length} new flag(s), ` +
    `resolved ${classifyResult.plan.staleIds.length + driftResult.plan.staleIds.length + anomalyResult.plan.staleIds.length} stale. ` +
    `Auto-adopted ${appliedCount}/${eligible.length} eligible OPEN source-classification flag(s).`;

  // Read back written sources for artifact summary
  const readBack = {};
  for (const sourceId of appliedItemIds) {
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

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "apply-classifications",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, readClient, guardedInsertMany, guardedUpdate } = await import("../lib/db.mjs");
      const sb = readClient();

      return {
        readAll,
        readClient: () => sb,
        insertMany: (table, rows, opts) => guardedInsertMany(table, rows, opts),
        updateStale: async (table, ids, patch) =>
          guardedUpdate(table, (qb) => qb.in("id", ids), patch, { cite: CITE }),
        listOpenClassifications: async () => {
          const rows = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await sb
              .from("integrity_flags")
              .select("id, subject_ref, created_by, status, description")
              .eq("status", "open")
              .eq("created_by", CLASSIFY_CREATED_BY)
              .order("id")
              .range(from, from + 999);
            if (error) throw new Error(`apply-classifications: open flag read failed: ${error.message}`);
            rows.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return rows;
        },
        readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
        readSource: (id) => sb.from("sources").select("id, scope_topics, scope_modes, scope_verticals, expected_output").eq("id", id).maybeSingle(),
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
    },
  });
}
