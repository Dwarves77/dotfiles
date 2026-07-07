// THROWAWAY: isolate ONE streamed groundBrief call to confirm it RETURNS (vs the non-streaming hang)
// and to surface the real error if node exited 127. Full timing + error capture.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch (e) { console.log("env load:", e.message); }
process.on("unhandledRejection", (r) => { console.log("UNHANDLED REJECTION:", r && r.message || r); });
process.on("uncaughtException", (e) => { console.log("UNCAUGHT:", e && e.message || e); });
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { groundBrief } = await jiti.import(resolve(ROOT, "src/lib/agent/canonical-pipeline.ts"));
// india item id resolved by legacy_id earlier; use the legacy slug → resolve via db
import { readClient } from "../lib/db.mjs";
const sb = readClient();
const { data } = await sb.from("intelligence_items").select("id,provenance_status").eq("legacy_id", "india-s-national-logistics-policy-carbon-intensity-standards").limit(1);
const id = data?.[0]?.id;
console.log("india id:", id, "prov:", data?.[0]?.provenance_status);
const t = Date.now();
try {
  const r = await groundBrief(id);
  console.log(`groundBrief returned in ${((Date.now() - t) / 1000).toFixed(1)}s →`, JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.log(`groundBrief THREW in ${((Date.now() - t) / 1000).toFixed(1)}s → fatal=${e?.fatal} msg=${(e?.message || "").slice(0, 200)}`);
}
process.exit(0);
