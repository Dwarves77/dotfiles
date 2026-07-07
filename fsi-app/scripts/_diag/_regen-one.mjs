// Empirical test: does the FROM-STORED regen path fix an analysis_missing_label_syntax item?
// regenerate brief from stored pool -> section -> ground, report before/after provenance + failures.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefFromStored, sectionBrief, groundBrief } = await jiti.import(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"));
const sb = readClient();
const KEY = process.argv[2] || "6f1e6615";
const { data: items } = await sb.from("intelligence_items").select("id,legacy_id,item_type,provenance_status").eq("is_archived", false);
const it = items.find((x) => x.legacy_id === KEY || x.id.startsWith(KEY));
if (!it) { console.log("NOT FOUND:", KEY); process.exit(0); }
const failNow = async () => { const { data: vr } = await sb.rpc("validate_item_provenance", { p_item_id: it.id }); const row = Array.isArray(vr) ? vr[0] : vr; return (row?.failures ?? []).map((f) => f.reason); };
const prov = async () => (await sb.from("intelligence_items").select("provenance_status").eq("id", it.id).single()).data?.provenance_status;
console.log(`${it.legacy_id || it.id.slice(0, 8)} [${it.item_type}] BEFORE prov=${await prov()} failures=${JSON.stringify(await failNow())}`);
const t = Date.now();
const g = await generateBriefFromStored(it.id); console.log(`  regen-stored: ok=${g.ok} ${(g.detail || "").slice(0, 80)}`);
if (g.ok) { const s = await sectionBrief(it.id); console.log(`  section: ok=${s.ok}`); const gr = await groundBrief(it.id); console.log(`  ground: ok=${gr.ok} ${(gr.detail || "").slice(0, 80)}`); }
console.log(`${it.legacy_id || it.id.slice(0, 8)} AFTER (${((Date.now() - t) / 1000).toFixed(0)}s) prov=${await prov()} failures=${JSON.stringify(await failNow())}`);
process.exit(0);
