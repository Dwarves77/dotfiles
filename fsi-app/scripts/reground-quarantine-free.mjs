/** FREE quarantine remediation (ZERO Browserless): for quarantined items that already have a full_brief
 *  + a stored generate-pool (agent_run_searches), re-run sectionBrief + groundBrief ONLY (no generate).
 *  The current grounding step (canonical-pipeline) covers every required slot with a FACT span OR a GAP
 *  claim (omit-with-note — integrity rule), labels assertions, and re-grounds URLs against the stored
 *  pool. So this one free pass addresses criterion 3 (FACT span), 4 (unlabeled_assertion), 5
 *  (missing_required_slot) and no_section_content — WITHOUT any web fetch.
 *  NON-DESTRUCTIVE: section/ground operate on the EXISTING brief; a failed pass leaves it quarantined,
 *  never erased. Items with NO stored pool are reported (they need generate — a separate budgeted step),
 *  not touched here. GOVERNING: analysis-construction-spec (grounding models) + environmental-policy
 *  (integrity) + remediation-discipline (classify-before-spend). DRY-RUN default; --apply [--limit=N]. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const APPLY = process.argv.includes("--apply");
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith("--limit=")); return a ? parseInt(a.slice(8), 10) : Infinity; })();
const sb = readClient();
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;

// quarantined, non-archived, with a usable full_brief
const quarantined = await readAll("intelligence_items", "id,legacy_id,title", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const withBrief = [];
for (const it of quarantined) {
  const { data: b } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  if ((b?.full_brief || "").length > 400) withBrief.push(it);
}
// stored-pool set (free re-ground/section). Items NOT here need generate (Browserless) — reported, not touched.
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolItems = new Set(pool.filter((p) => (p.result_content_excerpt || "").length > 150).map((p) => p.intelligence_item_id));
const free = withBrief.filter((it) => poolItems.has(it.id));
const noPool = quarantined.filter((it) => !poolItems.has(it.id));

console.log(`\n===== FREE REGROUND (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`quarantined: ${quarantined.length}  | with-brief: ${withBrief.length}  | FREE (stored pool): ${free.length}  | NO-pool (need generate): ${noPool.length}`);
console.log(`Browserless: 0 units. Anthropic ~$${(Math.min(free.length, LIMIT) * 0.15).toFixed(2)} (~$0.15/item, section+ground).`);
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--limit=N]. No-pool items (need generate) are listed below.`); console.log(`no-pool sample:`, noPool.slice(0, 10).map((x) => x.legacy_id || x.id.slice(0, 8)).join(", ")); process.exit(0); }

let verified = 0, stillQ = 0, fail = 0, n = 0;
const residual = {};
for (const it of free.slice(0, LIMIT)) {
  n++;
  const key = it.legacy_id || it.id.slice(0, 8);
  try {
    const s = await sectionBrief(it.id);
    await groundBrief(it.id);
    const after = await prov(it.id);
    if (after === "verified") { verified++; console.log(`  ${key.padEnd(12)} VERIFIED  ${(it.title || "").slice(0, 42)}`); continue; }
    stillQ++;
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const row = Array.isArray(data) ? data[0] : data;
    for (const f of (row?.failures || [])) { const k = f.reason === "missing_required_slot" ? `slot:${f.slot_key}` : f.reason; residual[k] = (residual[k] || 0) + 1; }
    console.log(`  ${key.padEnd(12)} still-Q (section.ok=${s.ok})  ${(it.title || "").slice(0, 36)}`);
  } catch (e) { fail++; console.log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 70)}`); }
}
console.log(`\nprocessed ${n}: VERIFIED ${verified}  still-quarantined ${stillQ}  errors ${fail}`);
console.log(`residual failure reasons:`, JSON.stringify(residual));
process.exit(0);
