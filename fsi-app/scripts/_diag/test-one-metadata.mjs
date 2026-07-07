/** TEST-ONE (operator directive "before we run all of them we must test one"): run the REDO's real path
 *  generateBriefFromStored -> sectionBrief -> groundBrief (ZERO Browserless) on TWO items — one
 *  non-research and one research_finding (the ONLY format that exercises the theme path) — then read back
 *  and ASSERT the metadata actually persisted under the fixed pipeline. Snapshots prior rows first
 *  (reversible). DRY-RUN lists picks; --apply runs. Full-conformance bar: write ok + severity persisted in
 *  live lowercase_underscore + format_type correct + contract current + sections present + provenance. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored, sectionBrief, groundBrief } = await jiti.import("../../src/lib/agent/canonical-pipeline.ts");

const DB_SEVERITY = new Set(["action_required", "cost_alert", "window_closing", "competitive_edge", "monitoring"]);
const FORMAT_FOR = { regulation: "regulatory_fact_document", directive: "regulatory_fact_document", standard: "regulatory_fact_document", guidance: "regulatory_fact_document", framework: "regulatory_fact_document", technology: "technology_profile", innovation: "technology_profile", tool: "technology_profile", regional_data: "operations_profile", market_signal: "market_signal_brief", initiative: "market_signal_brief", research_finding: "research_summary" };

const ROW_COLS = "id,legacy_id,title,item_type,severity,priority,urgency_tier,format_type,theme,theme_candidate,topic_tags,signal_band,regeneration_skill_version,provenance_status,full_brief,last_regenerated_at";
const row = async (id) => (await sb.from("intelligence_items").select(ROW_COLS).eq("id", id).single()).data;
const sectionCount = async (id) => (await sb.from("intelligence_item_sections").select("id", { count: "exact", head: true }).eq("item_id", id)).count;

// candidates: open skill-conformance-audit flag + has usable stored pool (>200ch row)
const flags = await readAll("integrity_flags", "subject_ref", { match: (q) => q.eq("created_by", "skill-conformance-audit").eq("status", "open") });
const flagged = new Set(flags.map((f) => f.subject_ref));
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolItems = new Set(pool.filter((p) => (p.result_content_excerpt || "").length > 200).map((p) => p.intelligence_item_id));
const items = await readAll("intelligence_items", "id,legacy_id,title,item_type", { match: (q) => q.eq("is_archived", false) });
const eligible = items.filter((it) => flagged.has(it.id) && poolItems.has(it.id));
// --ids=a,b overrides the auto-pick (match legacy_id or id prefix) — used to target a rich-stored-pool
// non-research item (from screen-stored-pools.mjs) to prove the multi-word severity mapping end-to-end.
const idsArg = process.argv.find((x) => x.startsWith("--ids="));
let picks;
if (idsArg) {
  const wanted = idsArg.slice(6).split(",").map((s) => s.trim()).filter(Boolean);
  picks = wanted.map((w) => eligible.find((it) => it.legacy_id === w || it.id.startsWith(w))).filter(Boolean);
} else {
  const research = eligible.find((it) => it.item_type === "research_finding");
  const nonResearch = eligible.find((it) => it.item_type !== "research_finding");
  picks = [nonResearch, research].filter(Boolean);
}

console.log(`\n===== TEST-ONE metadata persist (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`eligible (flagged + stored pool): ${eligible.length}; picks: ${picks.length}`);
for (const it of picks) console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ${it.item_type.padEnd(16)} ${(it.title || "").slice(0, 50)}`);
if (!picks.length) { console.log("no eligible picks"); process.exit(1); }
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply to run generateBriefFromStored->section->ground on these + assert.`); process.exit(0); }

mkdirSync(resolve(ROOT, "scripts/_diag/_test-one"), { recursive: true });
let allPass = true;
for (const it of picks) {
  const key = it.legacy_id || it.id.slice(0, 8);
  const before = await row(it.id);
  writeFileSync(resolve(ROOT, `scripts/_diag/_test-one/_prior_${key}.json`), JSON.stringify(before, null, 1));
  console.log(`\n── ${key} (${it.item_type}) ──`);
  console.log(`  BEFORE: sev=${JSON.stringify(before?.severity)} fmt=${JSON.stringify(before?.format_type)} theme=${JSON.stringify(before?.theme)} ver=${before?.regeneration_skill_version} prov=${before?.provenance_status}`);
  let gen, sec, grd;
  try {
    gen = await generateBriefFromStored(it.id);
    if (gen.ok) { sec = await sectionBrief(it.id); grd = await groundBrief(it.id); }
  } catch (e) { console.log(`  THREW: ${e.message.slice(0, 200)}`); allPass = false; continue; }
  console.log(`  generate: ok=${gen.ok} :: ${gen.detail}`);
  if (sec) console.log(`  section : ok=${sec.ok} :: ${sec.detail}`);
  if (grd) console.log(`  ground  : ok=${grd.ok} :: ${grd.detail}`);
  const after = await row(it.id);
  const secs = await sectionCount(it.id);
  const expectFmt = FORMAT_FOR[it.item_type];
  // assertions (full-conformance bar)
  const checks = {
    "generate ok (metadata write succeeded)": gen.ok === true,
    "severity persisted in live lowercase_underscore": it.item_type === "research_finding" ? (after?.severity == null || DB_SEVERITY.has(after.severity)) : DB_SEVERITY.has(after?.severity),
    "format_type correct": after?.format_type === expectFmt,
    "regeneration_skill_version current (>=2026-04-29)": !!after?.regeneration_skill_version && after.regeneration_skill_version >= "2026-04-29",
    "theme is DB-valid-or-null (never topic-tag form)": after?.theme == null || ["emissions_accounting","fuels_saf","packaging_circular","carbon_markets","cold_chain_art","last_mile_electrification","disclosure_regimes"].includes(after.theme),
    "sections present": (secs ?? 0) > 0,
    "last_regenerated_at advanced": !!after?.last_regenerated_at && after.last_regenerated_at !== before?.last_regenerated_at,
  };
  console.log(`  AFTER : sev=${JSON.stringify(after?.severity)} fmt=${JSON.stringify(after?.format_type)} theme=${JSON.stringify(after?.theme)} theme_candidate=${JSON.stringify(after?.theme_candidate)} ver=${after?.regeneration_skill_version} prov=${after?.provenance_status} sections=${secs}`);
  if (it.item_type === "research_finding") console.log(`    NOTE research theme path: theme=${JSON.stringify(after?.theme)} (DB-valid-or-null) + theme_candidate=${JSON.stringify(after?.theme_candidate)} (capture-not-null bank)`);
  for (const [name, ok] of Object.entries(checks)) { console.log(`    ${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) allPass = false; }
}
console.log(`\n===== ${allPass ? "ALL CHECKS PASS — pipeline persists metadata; safe to scope the batch" : "FAILURES PRESENT — do NOT batch"} =====`);
process.exit(allPass ? 0 : 1);
