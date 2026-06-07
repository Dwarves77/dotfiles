/** TIER-2 RESEARCH-OR-ERASE batch: drive every quarantined item to VERIFIED or ERASED — never leave
 *  it quarantined (operator: "nothing should be quarantined"). Per item, replicate the wired
 *  generate-brief workflow as plain lib calls:
 *    generate (web_search widens pool; checkBriefContent gate) -> section -> ground ; if not verified,
 *    ONE re-research retry (regenerate -> section -> ground) ; if STILL not verified -> ERASE
 *    (null full_brief + drop sections) + ARCHIVE reason='ungroundable_erased' (leaves the quarantine set
 *    honestly; reason is NOT source-y so the migration-135 trigger does not gate it).
 *  Browserless via generateBrief (~7 fetches/item). GOVERNING: analysis-construction-spec + env-policy
 *  integrity rule (erase ungroundable, never persist). DRY-RUN default; --apply [--limit=N]. */
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
const { generateBrief, sectionBrief, groundBrief } = await jiti.import("../src/lib/agent/canonical-pipeline.ts");

const prov = async (id) => (await sb.from("intelligence_items").select("provenance_status").eq("id", id).single()).data?.provenance_status;
const targets = await readAll("intelligence_items", "id,legacy_id,title", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "quarantined") });

console.log(`\n===== TIER-2 RESEARCH-OR-ERASE (${APPLY ? "APPLY" : "DRY-RUN"}) =====`);
console.log(`quarantined to resolve: ${targets.length}${LIMIT < Infinity ? ` (limit ${LIMIT})` : ""}  | est Browserless ~${targets.length * 7} units, Sonnet ~$${(targets.length * 0.35).toFixed(0)}`);
if (!APPLY) { console.log(`\nDRY-RUN — pass --apply [--limit=N].`); process.exit(0); }

// NON-DESTRUCTIVE: regenerate (current pipeline labels assertions + grounds URLs + fills/gap-notes
// slots). A failed regen leaves the EXISTING brief intact (generateBrief returns ok:false BEFORE any
// overwrite). NO erase here — items that still fail after regen are LEFT quarantined and their residual
// failure reasons reported, to be cleared by gate-calibration (inapplicable slots) not by deleting real
// content. One regen attempt per item (cost control; a second pass can run later on the residual).
let verified = 0, stillQ = 0, fail = 0, n = 0;
const residual = {};
async function attempt(id) { const g = await generateBrief(id); if (!g.ok) return false; const s = await sectionBrief(id); if (!s.ok) return false; await groundBrief(id); return (await prov(id)) === "verified"; }

for (const it of targets.slice(0, LIMIT)) {
  n++;
  const key = it.legacy_id || it.id.slice(0, 8);
  try {
    const ok = await attempt(it.id);
    if (ok) { verified++; console.log(`  ${key.padEnd(12)} VERIFIED  ${(it.title || "").slice(0, 44)}`); continue; }
    stillQ++;
    const { data } = await sb.rpc("validate_item_provenance", { p_item_id: it.id });
    const row = Array.isArray(data) ? data[0] : data;
    for (const f of (row?.failures || [])) residual[f.reason] = (residual[f.reason] || 0) + 1;
    console.log(`  ${key.padEnd(12)} still-quarantined  ${(it.title || "").slice(0, 40)}`);
  } catch (e) { fail++; console.log(`  ${key.padEnd(12)} ERROR: ${e.message.slice(0, 60)}`); }
}
console.log(`\nregenerated ${n}: VERIFIED ${verified}  still-quarantined ${stillQ}  errors ${fail}`);
console.log(`residual failure reasons (the calibrate-or-erase set):`, JSON.stringify(residual));
process.exit(0);
