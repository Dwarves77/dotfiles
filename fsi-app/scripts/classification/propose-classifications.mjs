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
// THREE FINDING SUBTYPES, one per axis-classification primitive this framework defines (flags.mjs is
// the SoT for the three createdBy subtype strings):
//
//   --classify   Axis 3/4/5 field proposals for one source with an unset field (classify-source.mjs).
//                subject_type 'source'. The ONLY subtype apply-classifications.mjs ever applies — and
//                even then only its APPLICABLE_FIELDS (scope_topics/scope_modes/scope_verticals/
//                expected_output); a jurisdiction proposal in the same flag is advisory-only, by
//                construction (classify-source.mjs's header explains why sources.jurisdictions has no
//                safe write target today).
//   --drift      Framework Section 5b: a source's observed item-category distribution (rolling window,
//                recent items) deviates from its Axis-5 expected_output by more than the drift
//                threshold on any one category. subject_type 'source'. Advisory only — the framework
//                names four POSSIBLE causes (scope changed / wrong registration / item-rule gap /
//                genuine anomaly), which only an operator can disposition; there is nothing to apply.
//   --anomalies  Framework Section 5c: one item's classified category carries less than the anomaly
//                threshold's expected probability under its source's Axis-5 distribution (the
//                Maersk-lands-in-Regulatory case). subject_type 'item'. Advisory only, same reason.
//
// No mode flag = run all three (the documented default, same "no selector" convention propose-tags.mjs
// uses for --untagged). --execute opts into writing; the default is compute + report only.
//
// AUTO-ADOPTION (operator ruling 2026-09-03, GSIG lane — see apply-classifications.mjs's header for the
// full reasoning): this script's own output is UNCHANGED — it still only ever writes an OPEN
// integrity_flags row per source, never sources itself, and every proposal it computes already carries
// the `confidence` field (classify-source.mjs's own shape) that decision needs. What changed is what
// happens to that flag AFTER this script writes it: apply-classifications.mjs's `--auto-adopt` mode now
// evaluates OPEN `--classify` flags directly (no `ratify:classification` marker required) and writes the
// scope_modes/scope_verticals proposals whose confidence is "high", and the expected_output proposal
// always (a closed role->default lookup, not a judgment call) — resolving the flag once nothing
// APPLICABLE remains unresolved. scope_topics proposals (always "medium" by this script's own design —
// see classifyScopeTopics's "regular and material coverage needs operator confirmation" comment) and
// jurisdiction proposals (never applicable — no safe write target, see classify-source.mjs) stay
// review-only exactly as before, so a flag carrying only those never auto-adopts and keeps needing the
// ratify marker this script's `recommended_actions` already point to.
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

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { proposeSourceAxisClassification } from "../../src/lib/classification/classify-source.mjs";
import { detectDrift, isAnomalousCategory, observedDistributionFromItems } from "../../src/lib/classification/routing.mjs";
import { isValidDistribution } from "../../src/lib/classification/expected-output.mjs";
import { surfaceOf } from "../../src/lib/surface-of.mjs";
import {
  AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE, SOURCE_DRIFT_SUBTYPE, ITEM_ANOMALY_SUBTYPE,
} from "../../src/lib/classification/flags.mjs";
import { createdBy, buildSubjectRef } from "../../src/lib/connections/flag-namespaces.mjs";
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
 * Parse + validate CLI args. PURE (no process.env, no I/O).
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
      anomalies: anySelected ? wantAnomalies : true,
    },
  };
}

const CLASSIFY_APPLY_COMMAND = "node scripts/classification/apply-classifications.mjs --flag <this flag's id> --execute";

/**
 * Build the integrity_flags insert payload for one source's classify-source.mjs proposal set. PURE.
 * @param {{id:string, name?:string|null, url?:string|null}} source
 * @param {{proposals:Array<{field:string, value:unknown, confidence:string, basis:string, applicable:boolean}>}} computed
 * @returns {object} integrity_flags row (status:'open', no id)
 */
export function buildClassificationFlagRow(source, computed) {
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

  const recommended_actions = [];
  if (applicable.length) {
    recommended_actions.push("Review the applicable proposal(s) against the source's real coverage.");
    recommended_actions.push(`If correct, resolve this flag with resolution_note containing the token "ratify:classification", then run: ${CLASSIFY_APPLY_COMMAND}`);
  }
  if (advisory.length) {
    recommended_actions.push(
      "Advisory-only proposal(s) (e.g. jurisdiction) have no safe apply target -- apply-classifications.mjs will never write them. " +
      "Assign sources.jurisdictions manually (its live vocabulary is region buckets, not ISO codes -- see classify-source.mjs's header) or via an ADR-ruled new column.",
    );
  }
  if (!proposals.length) {
    recommended_actions.push("Classify manually via SQL/admin, or extend the relevant classifier if a real, recurring signal was missed.");
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

/**
 * Build the integrity_flags insert payload for one anomalous item (framework Section 5c). PURE.
 * @param {{id:string}} item
 * @param {{id:string, name?:string|null, url?:string|null, source_role?:string|null}} source
 * @param {string} category
 * @param {number} probability
 * @returns {object}
 */
export function buildAnomalyFlagRow(item, source, category, probability) {
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
    recommended_actions: [
      "Confirm the item's item_type/domain classification is correct.",
      "If correct, the source may be drifting from its registered scope -- consider a scope/expected_output review.",
    ],
    status: "open",
    created_by: createdBy(AXIS_NAMESPACE, ITEM_ANOMALY_SUBTYPE),
  };
}

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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const { execute: EXECUTE, modes } = parseArgs(process.argv.slice(2));

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("propose-classifications: no DB creds — cannot run here (exit 2).");
  process.exit(2);
}

const { readAll, guardedInsertMany, guardedUpdate } = await import("../lib/db.mjs");

const CITE = {
  skill: "source-classification-framework-2026-05-10",
  reason: "AXIS lane (2026-09-02): propose Phase 2/3 Axis 3/4/5 findings (classification gaps, drift, anomalies) as integrity_flags rows for operator ratification (guarded path, rule 015). Never writes sources or intelligence_items.",
};

/** One subtype's full propose+reflect+write pass. EXACT createdBy match (see file header). */
async function runSubtype(createdByValue, freshList) {
  const existingOpen = await readAll("integrity_flags", "id, subject_ref, created_by", {
    match: (q) => q.eq("status", "open").eq("created_by", createdByValue),
  });
  const plan = planReflect(existingOpen, freshList);
  console.log(`propose-classifications: [${createdByValue}] plan = ${plan.newRows.length} new, ${plan.staleIds.length} stale, ${plan.unchanged} unchanged.`);
  if (!EXECUTE) return;
  if (plan.newRows.length) {
    const ins = await guardedInsertMany("integrity_flags", plan.newRows, { cite: CITE, select: "id" });
    console.log(`WROTE: [${createdByValue}] ${ins.inserted} new integrity_flags row(s) (snapshot: ${ins.snapshot}).`);
  }
  if (plan.staleIds.length) {
    const res = await guardedUpdate(
      "integrity_flags",
      (qb) => qb.in("id", plan.staleIds),
      {
        status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "propose-classifications.mjs",
        resolution_note: `${createdByValue} finding no longer applicable (re-computed this run and not reproduced).`,
      },
      { cite: CITE },
    );
    console.log(`RESOLVED: [${createdByValue}] ${res.updated} stale flag(s) (snapshot: ${res.snapshot}).`);
  }
}

const SOURCE_SIG = "id, name, url, source_role, secondary_roles, status, jurisdictions, scope_topics, scope_modes, scope_verticals, expected_output";
const sources = await readAll("sources", SOURCE_SIG, { match: (q) => q.eq("status", "active") });
console.log(`propose-classifications: ${sources.length} active source(s) loaded.`);

if (modes.classify) {
  const fresh = sources
    .map((s) => ({ source: s, computed: proposeSourceAxisClassification(s) }))
    .filter((r) => r.computed.hasGap)
    .map((r) => ({ subjectRef: buildSubjectRef(r.source.id), row: buildClassificationFlagRow(r.source, r.computed) }));
  console.log(`propose-classifications: --classify — ${fresh.length}/${sources.length} source(s) have an unclassified axis field.`);
  await runSubtype(createdBy(AXIS_NAMESPACE, SOURCE_CLASSIFICATION_SUBTYPE), fresh);
}

if (modes.drift || modes.anomalies) {
  const ITEM_SIG = "id, source_id, item_type, domain";
  const items = await readAll("intelligence_items", ITEM_SIG, {
    match: (q) => q.eq("provenance_status", "verified").eq("is_archived", false),
  });
  const bySource = groupItemsBySource(items);
  const classifiedSources = sources.filter((s) => isValidDistribution(s.expected_output));
  console.log(`propose-classifications: ${items.length} verified item(s) loaded; ${classifiedSources.length}/${sources.length} source(s) carry a well-shaped expected_output.`);

  if (modes.drift) {
    const fresh = [];
    for (const s of classifiedSources) {
      const sourceItems = bySource.get(s.id) || [];
      if (sourceItems.length < MIN_ITEMS_FOR_DRIFT_CHECK) continue;
      const observed = observedDistributionFromItems(sourceItems);
      const drift = detectDrift(observed, s.expected_output, DRIFT_THRESHOLD_POINTS);
      if (drift.drifted) fresh.push({ subjectRef: buildSubjectRef(s.id), row: buildDriftFlagRow(s, drift) });
    }
    console.log(`propose-classifications: --drift — ${fresh.length} source(s) drifted (>${DRIFT_THRESHOLD_POINTS}pp, min ${MIN_ITEMS_FOR_DRIFT_CHECK} items).`);
    await runSubtype(createdBy(AXIS_NAMESPACE, SOURCE_DRIFT_SUBTYPE), fresh);
  }

  if (modes.anomalies) {
    const bySourceId = new Map(sources.map((s) => [s.id, s]));
    const fresh = [];
    for (const it of items) {
      const s = bySourceId.get(it.source_id);
      if (!s || !isValidDistribution(s.expected_output)) continue;
      const category = surfaceOf(it.item_type, typeof it.domain === "number" ? it.domain : null);
      if (category === "uncategorized") continue; // not a real Axis-5 category, nothing to compare
      const probability = s.expected_output[category] ?? 0;
      if (isAnomalousCategory(category, s.expected_output, ANOMALY_THRESHOLD)) {
        fresh.push({ subjectRef: buildSubjectRef(it.id), row: buildAnomalyFlagRow(it, s, category, probability) });
      }
    }
    console.log(`propose-classifications: --anomalies — ${fresh.length} item(s) anomalous (<${(ANOMALY_THRESHOLD * 100).toFixed(0)}% expected probability).`);
    await runSubtype(createdBy(AXIS_NAMESPACE, ITEM_ANOMALY_SUBTYPE), fresh);
  }
}

if (!EXECUTE) console.log("DRY RUN — nothing written. Re-run with --execute to apply.");
process.exit(0);
}
