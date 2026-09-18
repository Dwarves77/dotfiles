#!/usr/bin/env node
// propose-classifications.mjs — Phase 2/3 of the 5-axis source-classification framework
// (docs/plans/source-classification-framework-2026-05-10.md): makes gaps and drift VISIBLE to an
// operator. NEVER writes sources or intelligence_items directly (rule: no assumptions, never silent
// auto-classification) — every finding lands as an integrity_flags row for ratification, in the exact
// TAG pattern scripts/connections/propose-tags.mjs established (dedup-before-insert/resolve-if-stale,
// PROPOSALS_JSON block, apply command in recommended_actions — read that file's header before touching
// this one). apply-classifications.mjs (this lane's sibling script) is the ONLY place a ratified
// finding becomes a written value.
//
// TWO FINDING SUBTYPES this script still proposes (flags.mjs is the SoT for the createdBy subtype
// strings; a third, item-anomaly, is RETIRED -- see below):
//
//   --classify   Axis 3/4/5 field proposals for one source with an unset field (classify-source.mjs).
//                subject_type 'source'. The ONLY subtype apply-classifications.mjs's ratify/auto-adopt
//                paths ever apply, and even then only its APPLICABLE_FIELDS (jurisdiction_iso/
//                scope_topics/scope_modes/scope_verticals/expected_output) -- jurisdiction_iso joined
//                this list D9, lane L14, 2026-09-13 (migration 033 gives Axis 3 a safe, ISO-shaped home;
//                see classify-source.mjs's header). The legacy `sources.jurisdictions` region-bucket
//                column is never proposed or written by this path, by construction. A ZERO-proposal
//                finding (D17 family 4, defect-fix-plan-2026-09-12) no longer opens a flag asking a human -- it is
//                recorded as an ALREADY-RESOLVED row (buildClassificationFlagRow, "no candidate value was
//                derivable" branch), since apply-classifications.mjs's decider now re-derives from the
//                SC-13 class table + the source's observed output for the true residue.
//   --drift      Framework Section 5b: a source's observed item-category distribution (rolling window,
//                recent items) deviates from its Axis-5 expected_output by more than the drift
//                threshold on any one category. subject_type 'source'. This script still only ever
//                OPENS the flag (never writes sources, see file top); apply-classifications.mjs's
//                `autoResolveDriftFlag` (D17 family 5) is what now ALWAYS resolves it, adopting the
//                observed distribution as the new expected_output once the sample is large enough, else
//                closing with an "insufficient sample" note. Never left open either way.
//
// RETIRED, D17 family 5 (defect-fix-plan-2026-09-12): `--anomalies` / buildAnomalyFlagRow (Framework
// Section 5c, "an item's classified category carries less than the anomaly threshold's expected
// probability") is DELETED -- an advisory review trigger with no reader that ever acted on it. The flag
// is still parseable for backward compatibility (parseArgs) but is always a no-op now; any surviving open
// `flywheel-axis:item-anomaly` row is retired by apply-classifications.mjs's `retireAnomalyFlag` with the
// note "advisory retired under the ADR-030 rider".
//
// No mode flag = run classify + drift (anomalies is retired, see above). --execute opts into writing;
// the default is compute + report only.
//
// AUTO-ADOPTION (operator ruling 2026-09-03, GSIG lane — see apply-classifications.mjs's header for the
// full reasoning): this script's own output is UNCHANGED — it still only ever writes an OPEN
// integrity_flags row per source, never sources itself, and every proposal it computes already carries
// the `confidence` field (classify-source.mjs's own shape) that decision needs. What changed is what
// happens to that flag AFTER this script writes it: apply-classifications.mjs's `--auto-adopt` mode now
// evaluates OPEN `--classify` flags directly (no `ratify:classification` marker required) and writes the
// scope_modes/scope_verticals/jurisdiction_iso proposals whose confidence is "high" (jurisdiction_iso
// additionally declines a value outside vocab.mjs's shape, regardless of confidence -- D9, lane L14,
// 2026-09-13), and the expected_output proposal always (a closed role->default lookup, not a judgment
// call), resolving the flag once nothing APPLICABLE remains unresolved. scope_topics proposals (always
// "medium" by this script's own design, see classifyScopeTopics's "regular and material coverage needs
// operator confirmation" comment) stay review-only exactly as before, so a flag carrying only that never
// auto-adopts and keeps needing the ratify marker this script's `recommended_actions` already point to.
//
// EXACT-MATCH DEDUP, NOT A PREFIX SCAN (deliberate deviation from propose-tags.mjs's TAG_NAMESPACE
// `.like(ns + '%')` scan, named here because it is the one place this script's design differs from its
// template). All three subtypes share AXIS_NAMESPACE. A subject_ref (a source or item id) can carry
// open flags from MORE THAN ONE subtype at once — a source can have both a classify gap and a drift
// finding open simultaneously, and they must never be confused for each other's stale/fresh state. Each
// mode below therefore reads its OWN existingOpen set with `.eq("created_by", <exact subtype string>)`
// and reflects against ONLY its own freshly-computed list — planReflect (imported unmodified from
// propose-tags.mjs, which is generic and takes no TAG-specific state) never sees another subtype's rows,
// so a narrow `--drift`-only run can never mistake a `--classify` flag on the same source for stale.
//
// Usage:
//   node scripts/classification/propose-classifications.mjs [--classify] [--drift] [--anomalies] [--execute]
//     (no mode flag runs all three)
//     --dry      compute + report, write nothing (DEFAULT)
//     --execute  actually write/resolve integrity_flags rows (explicit opt-in)
// Exit 0 done · 2 no DB creds (cannot run here).

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Prior art (lane L36, 2026-09-17): scripts/maintenance/lib/cli.mjs's runCli is the shared
// bootstrap (argv scaffold, .env.local load, DB-creds-check-and-exit(2), IS_MAIN pattern) every
// scripts/maintenance/*.mjs wrapper already uses (grep hit: canonical-key-dedup.mjs, record-hollow-sweep.mjs,
// apply-classifications.mjs, ...). This script re-implemented that same boilerplate by hand; runCli replaces
// it below. Its own --classify/--drift/--anomalies/--execute flags and every console line are unchanged;
// runCli's mode/arg/out fields are simply unused by this script's main(), same as before its own hand-rolled
// argv parsing (system-health-audit-2026-09-17.md section 2 names this script in the clone family; the
// maintenance.yml propose-classifications step invokes this script's own --execute flag directly, not
// runCli's --mode/--arg/--out, so that invocation is unchanged).
import { runCli } from "../maintenance/lib/cli.mjs";
import { proposeSourceAxisClassification } from "../../src/lib/classification/classify-source.mjs";
import { detectDrift, observedDistributionFromItems } from "../../src/lib/classification/routing.mjs";
import { isValidDistribution } from "../../src/lib/classification/expected-output.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE,
  SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
// buildNoDerivableClassificationNote imported unmodified from apply-classifications.mjs (D17 family 4
// part 2, defect-fix-plan-2026-09-12) so the decider's zero-proposal re-derivation and this proposer's
// zero-derivation write use byte-identical wording.
import { buildNoDerivableClassificationNote } from "./apply-classifications.mjs";
// planReflect is generic (subject_ref/created_by keyed, no TAG-specific state) — read-only reuse of the
// SAME dedup-before-insert/resolve-if-stale plan propose-tags.mjs exports, per that file's own header
// ("mirroring analyze-corpus.mjs's reflectFlags() convention"). propose-tags.mjs itself is untouched.
import { planReflect } from "../connections/propose-tags.mjs";

// @supabase/supabase-js reaches this file only THROUGH scripts/lib/db.mjs's lazy-require — nothing here
// imports it directly, so this module stays importable without node_modules installed (matches
// propose-tags.mjs's own posture).

// Framework open questions 2/3 leave these unratified; these are HYPOTHESIS-level starting points (the
// framework's own stated defaults), not operator-ruled constants — named here, not buried, so a future
// ruling has one obvious place to land.
export const DRIFT_THRESHOLD_POINTS = 30; // framework Section 5b default
export const ANOMALY_THRESHOLD = 0.05; // framework Section 5c default
export const MIN_ITEMS_FOR_DRIFT_CHECK = 10; // framework leaves window size to operator (open question 2); a
// single-digit item count trivially "drifts" from any distribution, so a floor avoids noise pending that ruling.

/**
 * Parse + validate CLI args. PURE (no process.env, no I/O). `--anomalies` is still ACCEPTED (never an
 * "unknown flag" surprise for an existing caller) but is a no-op as of D17 family 5
 * (defect-fix-plan-2026-09-12): the anomaly detector is retired, never proposes a new flag.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{execute:boolean, modes:{classify:boolean, drift:boolean, anomalies:boolean}}}
 */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const execute = args.includes("--execute");
  const wantClassify = args.includes("--classify");
  const wantDrift = args.includes("--drift");
  const wantAnomalies = args.includes("--anomalies");
  const anySelected = wantClassify || wantDrift || wantAnomalies;
  return {
    execute,
    modes: {
      classify: anySelected ? wantClassify : true,
      drift: anySelected ? wantDrift : true,
      anomalies: false, // retired (D17 family 5) -- accepted for parse-compatibility, never runs
    },
  };
}

const CLASSIFY_APPLY_COMMAND = "node scripts/classification/apply-classifications.mjs --flag <this flag's id> --execute";

/**
 * The integrity_flags row for a source classify-source.mjs's name/role matchers found ZERO candidate
 * values for. Born ALREADY RESOLVED -- never an open "ask a human" flag (D17 family 4 part 2: the defect
 * this closes is the same class as D15's tag zero-proposal flags, a proposal-less flag no human ever
 * actioned). Uses apply-classifications.mjs's OWN buildNoDerivableClassificationNote (imported, not
 * duplicated) so the decider's D17-family-4 re-derivation and this proposer-side write share
 * byte-identical wording. PURE except for the date stamp.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {Date} [today]
 * @returns {object} integrity_flags row (status:'resolved', no id)
 */
export function buildNoDerivableClassificationFlagRow(source, today = new Date()) {
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
    resolved_by: "propose-classifications.mjs",
    resolution_note: buildNoDerivableClassificationNote(today),
    created_by: createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE),
  };
}

/**
 * Build the integrity_flags insert payload for one source's classify-source.mjs proposal set. PURE. A
 * proposal-bearing result opens a normal review flag; a ZERO-proposal result delegates to
 * buildNoDerivableClassificationFlagRow (D17 family 4 part 2) so there is exactly one implementation of
 * that shape, never a second hand-copy.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}} computed
 * @returns {object} integrity_flags row
 */
export function buildClassificationFlagRow(source, computed) {
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

  const recommended_actions = [];
  if (applicable.length) {
    recommended_actions.push("Review the applicable proposal(s) against the source's real coverage.");
    recommended_actions.push(`If correct, resolve this flag with resolution_note containing the token "ratify:classification", then run: ${CLASSIFY_APPLY_COMMAND}`);
  }
  if (advisory.length) {
    // As of D9 (lane L14, 2026-09-13) every APPLICABLE_FIELDS axis, including jurisdiction_iso, has a
    // safe write target, so this branch is not expected to fire for the current axis set; kept generic
    // for any future axis that genuinely has no column of its own yet.
    recommended_actions.push(
      "Advisory-only proposal(s) have no safe apply target -- apply-classifications.mjs will never write them. Assign the field manually or via an ADR-ruled new column.",
    );
  }

  return {
    category: "source_issue",
    subject_type: "source",
    subject_ref: buildSubjectRef(source.id),
    description,
    recommended_actions,
    status: "open",
    created_by: createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE),
  };
}

/**
 * Build the integrity_flags insert payload for one source's drift finding (framework Section 5b). PURE.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{drifted:boolean, deltas:Record<string, number>}} drift
 * @returns {object}
 */
export function buildDriftFlagRow(source, drift) {
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
    recommended_actions: [
      "Review the source's recent item output against its registered expected_output distribution.",
      "Update the source's scope/expected_output if its real coverage changed, or resolve as reviewed/false-positive.",
    ],
    status: "open",
    created_by: createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE),
  };
}

// buildAnomalyFlagRow DELETED (D17 family 5, defect-fix-plan-2026-09-12): "delete buildAnomalyFlagRow
// and its call sites" -- the item-anomaly detector is retired under the ADR-030 rider (an anomaly finding
// is a review trigger with no reader that ever acted on it; the framework's own Section 5c review is
// superseded). Any surviving OPEN `flywheel-axis:item-anomaly` row from before this ruling is retired,
// never re-derived, by apply-classifications.mjs's `retireAnomalyFlag`. ITEM_ANOMALY_SUBTYPE stays
// exported from flags.mjs so that resolver can still name the exact created_by value it closes.

/**
 * Group a flat item list by source_id. PURE.
 * @param {Array<{source_id?:string|null}>} items
 * @returns {Map<string, Array>}
 */
export function groupItemsBySource(items) {
  const map = new Map();
  for (const it of items || []) {
    const sid = it?.source_id;
    if (!sid) continue;
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(it);
  }
  return map;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  await runCli({ step: "propose-classifications", main, needsDb: true });
}

async function main() {
const { execute: EXECUTE, modes } = parseArgs(process.argv.slice(2));

const { readAll, guardedInsertMany, guardedUpdateByIds } = await import("../lib/db.mjs");

const CITE = {
  skill: "source-classification-framework-2026-05-10",
  reason: "AXIS lane (2026-09-02): propose Phase 2/3 Axis 3/4/5 findings (classification gaps, drift) as integrity_flags rows for operator ratification (guarded path, rule 015); a zero-derivation finding (D17 family 4) is recorded already-resolved instead. Never writes sources or intelligence_items.",
};

/**
 * One subtype's full propose+reflect+write pass. EXACT createdBy match (see file header).
 * @param {string} createdByValue
 * @param {Array<{subjectRef:string, row:object}>} freshList
 * @param {{anyStatus?:boolean}} [opts] - D17 family 4 part 2: the no-derivable subtype is born resolved,
 *   so its dedup read must be any-status (an open-only scan would never see it and would re-insert a
 *   duplicate every run).
 */
async function runSubtype(createdByValue, freshList, { anyStatus = false } = {}) {
  const existingOpen = await readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => (anyStatus ? q : q.eq("status", "open")).eq("created_by", createdByValue),
  });
  const plan = planReflect(existingOpen, freshList);
  console.log(`propose-classifications: [${createdByValue}] plan = ${plan.newRows.length} new, ${plan.staleIds.length} stale, ${plan.unchanged} unchanged.`);
  if (!EXECUTE) return;
  if (plan.newRows.length) {
    const ins = await guardedInsertMany("integrity_flags", plan.newRows, { cite: CITE, select: "id" });
    console.log(`WROTE: [${createdByValue}] ${ins.inserted} new integrity_flags row(s) (snapshot: ${ins.snapshot}).`);
  }
  if (plan.staleIds.length) {
    // plan.staleIds is runtime-scaled (every stale integrity_flags row this classification pass
    // found) with no declared cap — chunked via guardedUpdateByIds, not a single .in(), IN-CHUNK
    // class (2026-09-06; same shape as analyze-corpus.mjs's 1,317-id resolve).
    const res = await guardedUpdateByIds(
      "integrity_flags",
      plan.staleIds,
      {
        status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "propose-classifications.mjs",
        resolution_note: `${createdByValue} finding no longer applicable (re-computed this run and not reproduced).`,
      },
      { cite: CITE },
    );
    console.log(`RESOLVED: [${createdByValue}] ${res.updated} stale flag(s) (snapshot: ${res.snapshot}).`);
  }
}

// jurisdiction_iso added (D9, lane L14, 2026-09-13) alongside the legacy jurisdictions column (kept for
// any other reader of this select list; classify-source.mjs itself only ever reads jurisdiction_iso).
const SOURCE_SIG = "id, name, url, source_role, secondary_roles, status, jurisdictions, jurisdiction_iso, scope_topics, scope_modes, scope_verticals, expected_output";
const sources = await readAll("sources", SOURCE_SIG, { match: (q) => q.eq("status", "active") });
console.log(`propose-classifications: ${sources.length} active source(s) loaded.`);

if (modes.classify) {
  const computed = sources
    .map((s) => ({ source: s, computed: proposeSourceAxisClassification(s) }))
    .filter((r) => r.computed.hasGap);
  // D17 family 4 part 2: split proposal-bearing (open, normal review) from zero-derivation (born
  // resolved, distinct subtype) so the two can never share a dedup key -- see buildClassificationFlagRow
  // and SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE's own header for why that distinction matters.
  const withProposals = computed.filter((r) => r.computed.proposals.length > 0)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  const noDerivable = computed.filter((r) => r.computed.proposals.length === 0)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  console.log(
    `propose-classifications: --classify: ${computed.length}/${sources.length} source(s) have an unclassified axis field ` +
    `(${withProposals.length} with proposals, ${noDerivable.length} zero-derivation).`,
  );
  await runSubtype(createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE), withProposals);
  await runSubtype(createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_NO_DERIVABLE_SUBTYPE), noDerivable, { anyStatus: true });
}

// modes.anomalies is always false now (D17 family 5, defect-fix-plan-2026-09-12) -- the anomaly
// detector is retired, never proposes a new flag. The --drift condition alone gates this whole block.
if (modes.drift) {
  const ITEM_SIG = "id, source_id, item_type, domain";
  const items = await readAll("intelligence_items", ITEM_SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });
  const bySource = groupItemsBySource(items);
  const classifiedSources = sources.filter((s) => isValidDistribution(s.expected_output));
  console.log(`propose-classifications: ${items.length} verified item(s) loaded; ${classifiedSources.length}/${sources.length} source(s) carry a well-shaped expected_output.`);

  const fresh = [];
  for (const s of classifiedSources) {
    const sourceItems = bySource.get(s.id) || [];
    if (sourceItems.length < MIN_ITEMS_FOR_DRIFT_CHECK) continue;
    const observed = observedDistributionFromItems(sourceItems);
    const drift = detectDrift(observed, s.expected_output, DRIFT_THRESHOLD_POINTS);
    if (drift.drifted) fresh.push({ subjectRef: buildSubjectRef(s.id), row: buildDriftFlagRow(s, drift) });
  }
  console.log(`propose-classifications: --drift: ${fresh.length} source(s) drifted (>${DRIFT_THRESHOLD_POINTS}pp, min ${MIN_ITEMS_FOR_DRIFT_CHECK} items).`);
  await runSubtype(createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE), fresh);
}

if (!EXECUTE) console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
process.exit(0);
}
