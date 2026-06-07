/** GROUNDING TIER-1 (free re-ground; zero Browserless): re-run groundBrief on QUARANTINED items that
 *  already have a stored generate-pool (agent_run_searches). groundBrief grounds against the stored
 *  pool (no re-fetch), so this costs ~$0.15 Anthropic/item and $0 Browserless. After the 669-row
 *  section backfill, items that quarantined on missing_required_slot / no_section_content may now pass.
 *  GOVERNING: analysis-construction-spec (grounding). DRY-RUN default; --apply [--limit=N]. */
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
const { groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

// quarantined, non-archived, has full_brief
const quarantined = await readAll("intelligence_items", "id,legacy_id,title,provenance_status", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });
const withBrief = [];
for (const it of quarantined) {
  const { data: b } = await sb.from("intelligence_items").select("full_brief").eq("id", it.id).single();
  if ((b?.full_brief || "").length > 600) withBrief.push(it);
}
// candidates = quarantined-with-brief that have a usable stored pool (>200ch excerpt)
const pool = await readAll("agent_run_searches", "intelligence_item_id,result_content_excerpt");
const poolItems = new Set(pool.filter((p) => (p.result_content_excerpt || "").length > 200).map((p) => p.intelligence_item_id));
const candidates = withBrief.filter((it) => poolItems.has(it.id));

console.log(`\n===== GROUNDING TIER-1 (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`quarantined: ${quarantined.length}  with-brief: ${withBrief.length}  WITH stored pool (free re-ground): ${candidates.length}`);
console.log(`est Anthropic cost if all run: ~$${(candidates.length * 0.15).toFixed(2)}  | Browserless: $0 (stored pool)`);

if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--limit=N] to re-ground.`); process.exit(0); }

let verified = 0, stillQ = 0, fail = 0, n = 0;
for (const it of candidates.slice(0, LIMIT)) {
  n++;
  try {
    const r = await groundBrief(it.id);
    const { data: after } = await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single();
    const flip = after?.provenance_status;
    if (flip === "verified") verified++; else stillQ++;
    console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ground.ok=${r.ok} -> ${flip}  ${(it.title || "").slice(0, 40)}`);
  } catch (e) { fail++; console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
}
console.log(`\nre-grounded ${n}: VERIFIED ${verified}  still-quarantined ${stillQ}  errors ${fail}`);
process.exit(0);
