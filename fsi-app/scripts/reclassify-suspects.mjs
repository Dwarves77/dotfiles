/** reclassify-suspects.mjs — item_type accuracy pass (authorized 2026-06-04, data-pull approved).
 *
 * Re-runs the EXISTING classifier (src/lib/llm/first-fetch-classify.ts — CONFIRMED to emit
 * item_type + entity_verdict) on the deterministic suspect set, judging from RE-FETCHED source
 * content (Browserless), not from the possibly-wrong stored brief. Three outcomes per item:
 *   AGREE   — classifier item_type == current -> no change (deterministic flag was a false alarm).
 *   RETYPE  — entity_verdict=specific_document AND item_type differs -> propose item_type change.
 *   DEMOTE  — entity_verdict=portal/uncertain -> this is NOT an item (source/portal mis-minted);
 *             flagged for review (NOT auto-archived — that is the vertical-fit/archive pass).
 *
 * Caches classifications to _diag/reclassify-results.json so dry-run + --execute don't double-spend
 * Browserless/Haiku. dry-run default; --execute --confirm applies RETYPEs (guarded per-row + read-back).
 * Supply stays paused; this touches item_type only.
 */
import pg from "pg";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { browserlessFetch } from "../src/lib/sources/canonical-fetch.mjs";

const __d = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(__d, "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { firstFetchClassify } = await jiti.import("../src/lib/llm/first-fetch-classify.ts");
const ref = readFileSync(resolve(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
const pooler = readFileSync(resolve(ROOT, "supabase/.temp/pooler-url"), "utf8").trim();
const CONN = pooler.replace(`postgres.${ref}@`, `postgres.${ref}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const KEY = process.env.ANTHROPIC_API_KEY;
const EXECUTE = process.argv.includes("--execute") && process.argv.includes("--confirm");
const CACHE = resolve(__d, "_diag/reclassify-results.json");

const SIG = (title, ty) => {
  const t = (title || "").toLowerCase();
  if ((ty === "regulation" || ty === "directive" || ty === "framework") && /roadmap|strategic plan|action plan|\bpathway|vision 20|\bgoals?\b|\bsdg|sustainable development goals/.test(t)) return "nonbinding-as-binding";
  if (ty === "research_finding" && /\bcentre\b|\bcenter\b|\binstitute\b|university|school of/.test(t)) return "institution-as-finding";
  if ((ty === "technology" || ty === "tool") && /\bplatform\b|explorer|\bhub\b|database|data (and|&) statistics|statistics (explorer|hub)/.test(t)) return "platform-as-tech";
  if (/organizational framework|\bsdgs?\b|library of congress|quantum comput|\bcpi\b|unemployment/.test(t)) return "off-vertical?";
  return null;
};

const c = new pg.Client({ connectionString: CONN }); await c.connect();
const q = (s, p) => c.query(s, p).then((r) => r);

async function classifyAll() {
  const rows = (await q(`SELECT i.id, i.title, i.item_type, i.source_url, s.name src_name, s.category src_cat
     FROM intelligence_items i LEFT JOIN sources s ON s.id=i.source_id
     WHERE i.is_archived=false`)).rows;
  const suspects = rows.filter((r) => SIG(r.title, r.item_type));
  console.log(`classifying ${suspects.length} suspects (Browserless fetch + Haiku)...\n`);
  const out = [];
  for (const it of suspects) {
    let text = "";
    try { const r = await browserlessFetch(it.source_url, { maxTextLength: 8000 }); text = (r.text || "").trim(); } catch (e) { /* dead url */ }
    let res = { ok: false };
    if (text.length > 150) {
      try { res = await firstFetchClassify({ source_id: it.id, source_url: it.source_url, source_name: it.src_name, source_category: it.src_cat, text }, KEY); } catch (e) { res = { ok: false, error: e.message }; }
    }
    const rec = { id: it.id, title: it.title, current: it.item_type, flag: SIG(it.title, it.item_type),
      fetched: text.length > 150,
      verdict: res.ok ? res.result.entity_verdict : null,
      newType: res.ok ? res.result.item_type : null,
      rationale: res.ok ? (res.result.rationale || "").slice(0, 90) : (res.error || "no fetchable content") };
    out.push(rec);
    console.log(`  ${rec.verdict || "FETCH/CLASSIFY-FAIL"} | ${it.item_type}->${rec.newType ?? "-"} | ${(it.title||"").slice(0,52)}`);
  }
  writeFileSync(CACHE, JSON.stringify(out, null, 2));
  return out;
}

const results = (EXECUTE && existsSync(CACHE)) ? JSON.parse(readFileSync(CACHE, "utf8")) : await classifyAll();

const retype = results.filter((r) => r.verdict === "specific_document" && r.newType && r.newType !== r.current);
const demote = results.filter((r) => r.verdict === "portal" || r.verdict === "uncertain");
const agree = results.filter((r) => r.verdict === "specific_document" && r.newType === r.current);
console.log(`\n== ${EXECUTE ? "EXECUTE" : "DRY-RUN"} == agree(false-alarm)=${agree.length}  RETYPE=${retype.length}  DEMOTE(not-an-item)=${demote.length}  unfetchable=${results.filter(r=>!r.verdict).length}`);
console.log("\nRETYPE:");
for (const r of retype) console.log(`  ${r.current} -> ${r.newType}  "${(r.title||"").slice(0,56)}"  (${r.rationale})`);
console.log("\nDEMOTE (portal/uncertain — NOT an item; flagged for vertical-fit/archive review, NOT auto-archived):");
for (const r of demote) console.log(`  [${r.verdict}] "${(r.title||"").slice(0,56)}"`);

if (EXECUTE) {
  let applied = 0;
  for (const r of retype) {
    const u = await q(`UPDATE intelligence_items SET item_type=$2 WHERE id=$1 AND item_type=$3 RETURNING item_type`, [r.id, r.newType, r.current]);
    if (u.rowCount === 1 && u.rows[0].item_type === r.newType) applied++; else console.error(`  HALT read-back: ${r.id}`);
  }
  writeFileSync(resolve(__d, "_diag/reclassify-apply-log.json"), JSON.stringify({ at: "2026-06-04", retyped: retype, demote_flagged: demote }, null, 2));
  console.log(`\napplied ${applied}/${retype.length} re-types (read-back verified). DEMOTE set flagged to log for the vertical-fit pass.`);
}
await c.end();
