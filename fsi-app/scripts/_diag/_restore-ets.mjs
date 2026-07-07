// Restore ETS-maritime (erased over an ungrounded cited URL) through the fixed workflow: criterion 2 now
// records cited URLs (no false ungrounded_url), and the reason-aware retry skips the wasted re-ground.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { generateBriefWorkflow } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const sb = readClient();
const { data } = await sb.from("intelligence_items").select("id").eq("legacy_id", "eu-emissions-trading-system-ets-extension-to-maritime-transport").limit(1);
const id = data?.[0]?.id;
const t = Date.now();
const r = await generateBriefWorkflow(id, false);
console.log(`status=${r.status} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
const stepKeys = Object.keys(r.steps || {});
console.log(`steps fired: ${stepKeys.join(" -> ")}  ${stepKeys.includes("reground") ? "(reground RAN)" : "(reground SKIPPED ✓)"}`);
for (const [k, v] of Object.entries(r.steps || {})) console.log(`  ${k.padEnd(10)} ${typeof v === "object" ? JSON.stringify(v).slice(0, 100) : v}`);
const { data: it } = await sb.from("intelligence_items").select("provenance_status,is_archived,full_brief").eq("id", id).single();
console.log(`FINAL: prov=${it.provenance_status} archived=${it.is_archived} briefLen=${(it.full_brief || "").length} customer-visible=${it.provenance_status === "verified" && !it.is_archived ? "YES ✓" : "NO ✗"}`);
process.exit(0);
