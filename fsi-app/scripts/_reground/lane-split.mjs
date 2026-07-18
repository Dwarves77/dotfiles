#!/usr/bin/env node
// lane-split.mjs — partition the quarantined items into the two drain lanes and publish to drain_worklist
// (operator ruling 2026-07-16). LANE B (mechanical) = primary target-match id-confirmed (via an instrument
// identifier, NOT subject-overlap) AND its validate failures are all in the proven mechanical patterns (orphan
// / relabel / missing-slot / sub-floor-reattribute). LANE A (judgment) = everything else: no/unconfirmed/wrong
// primary, conflation, non-EN, holds. Read-only over items; writes only the worklist. Usage: node lane-split.mjs [--apply]
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const APPLY = process.argv.includes("--apply");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { readClient, readAll, guardedDelete, guardedInsert } = await jiti.import("../lib/db.mjs");
const { verifyTargetMatch } = await jiti.import("../../src/lib/sources/target-match.mjs");
const sb = readClient();

const MECHANICAL_REASONS = new Set(["analysis_missing_label_syntax", "missing_required_slot", "orphaned_no_prose_referent"]);

const items = await readAll("intelligence_items",
  "id,legacy_id,title,item_type,instrument_type,instrument_identifier,canonical_instrument_key,jurisdiction_iso,source_url,source_id",
  { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });

const rows = [];
for (const it of items) {
  // primary capture = pool rows on the item's source_url
  const { data: pool } = await sb.from("agent_run_searches").select("result_url, result_content_excerpt").eq("intelligence_item_id", it.id);
  const norm = (u) => String(u || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
  const primaryText = (pool || []).filter((r) => norm(r.result_url) === norm(it.source_url)).map((r) => r.result_content_excerpt || "").join("\n");
  const hasPrimary = primaryText.length >= 200;
  const tm = hasPrimary ? verifyTargetMatch({ title: it.title, item_type: it.item_type, instrument_type: it.instrument_type, identifier: it.instrument_identifier, canonical_instrument_key: it.canonical_instrument_key, jurisdiction: it.jurisdiction_iso }, primaryText) : { verdict: "no-primary", via: "none", score: 0 };
  const idConfirmed = tm.verdict === "match" && (tm.via === "instrument-id" || tm.via === "raw-id");
  // validate failure profile
  const { data: v } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
  const val = Array.isArray(v) ? v[0] : v;
  const reasons = [...new Set((val?.failures || []).map((f) => f.reason))];
  const allMechanical = reasons.length > 0 && reasons.every((r) => MECHANICAL_REASONS.has(r));
  // Lane B only when the primary is id-confirmed AND every failure is a proven mechanical pattern.
  const lane = idConfirmed && allMechanical ? "B" : "A";
  // B-CANDIDATE: a Lane A item whose primary SUBJECT-matches (correct doc) and whose defects are mechanical —
  // one id-stamp (ruling #5) from Lane B. This is the priority Lane A prep that feeds Session B.
  const bCandidate = lane === "A" && tm.verdict === "match" && tm.via === "subject-overlap" && allMechanical;
  const notes = lane === "B" ? "id-confirmed primary; mechanical defects" :
    bCandidate ? "B-CANDIDATE: subject-matched primary + mechanical defects — id-stamp to promote to Lane B" :
    (!hasPrimary ? "no primary capture on source_url — re-acquire" : tm.verdict === "mismatch" ? `WRONG primary (${tm.target_match_verdict || tm.via}) — re-acquire` : !idConfirmed ? `primary not id-confirmed (${tm.verdict}/${tm.via})` : `non-mechanical failures: ${reasons.join(",")}`);
  rows.push({ intelligence_item_id: it.id, key: it.legacy_id || it.id.slice(0, 8), lane,
    primary_id_confirmed: idConfirmed, target_match_verdict: `${tm.verdict}/${tm.via}`,
    defect_summary: { failures: reasons, id_confirmed: idConfirmed, has_primary: hasPrimary }, notes });
}

rows.sort((a, b) => (a.lane === b.lane ? a.key.localeCompare(b.key) : a.lane.localeCompare(b.lane)));
const A = rows.filter((r) => r.lane === "A"), B = rows.filter((r) => r.lane === "B");
console.log(`\n===== DRAIN LANE SPLIT — ${rows.length} quarantined items  (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`LANE B (mechanical): ${B.length}   LANE A (judgment): ${A.length}\n`);
console.log("| lane | key | id-confirmed | target-match | notes |");
console.log("|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.lane} | ${r.key} | ${r.primary_id_confirmed ? "yes" : "no"} | ${r.target_match_verdict} | ${r.notes} |`);

if (!APPLY) { console.log("\n(dry-run — re-run with --apply to write drain_worklist)"); process.exit(0); }
const cite = { skill: "remediation-discipline", reason: "parallel-drain lane split (operator ruling 2026-07-16): partition quarantined items into Lane A judgment / Lane B mechanical, published to drain_worklist" };
// idempotent: clear existing worklist rows for these items, then insert
const ids = rows.map((r) => r.intelligence_item_id);
const { data: existing } = await sb.from("drain_worklist").select("intelligence_item_id").in("intelligence_item_id", ids);
for (const e of existing || []) await guardedDelete("drain_worklist", [e.intelligence_item_id], { cite }).catch(() => {});
for (const r of rows) await guardedInsert("drain_worklist", { intelligence_item_id: r.intelligence_item_id, lane: r.lane, primary_id_confirmed: r.primary_id_confirmed, target_match_verdict: r.target_match_verdict, defect_summary: r.defect_summary, notes: r.notes, assigned_by: "lane-split.mjs" }, { cite });
console.log(`\nwrote ${rows.length} rows to drain_worklist (Lane A ${A.length}, Lane B ${B.length}).`);
process.exit(0);
