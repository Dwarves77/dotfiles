// Run the GROW step (registerCitedSources + compound) that the ad-hoc reground/regen runners skipped.
// The canonical workflow is generate→register→section→ground→GROW; the reground runners stopped at
// ground, so cited corroborator hosts were never registered → unregistered-span count rose. grow makes
// NO Sonnet call (deterministic). Idempotent / host-deduped. Scoped to verified items that have a brief.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { growStep } = await jiti.import(resolve(ROOT, "src/workflows/generate-brief.ts"));
const sb = readClient();
const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,full_brief", { match: (q) => q.eq("is_archived", false).eq("provenance_status", "verified") });
const targets = items.filter((it) => it.full_brief);
console.log(`grow pass over ${targets.length} verified items with a brief…`);
let ok = 0, fail = 0, reg = 0;
for (let i = 0; i < targets.length; i++) {
  const it = targets[i];
  try { const r = await growStep(it.id); ok++; if (r && typeof r.detail === "string") { const m = r.detail.match(/(\d+)\s+regist/i); if (m) reg += parseInt(m[1], 10); } }
  catch (e) { fail++; if (fail <= 5) console.log(`  grow FAIL ${it.legacy_id || it.id.slice(0, 8)}: ${(e.message || "").slice(0, 80)}`); }
  if ((i + 1) % 25 === 0) console.log(`  …${i + 1}/${targets.length} (ok=${ok} fail=${fail})`);
}
console.log(`DONE grow: ok=${ok} fail=${fail} (of ${targets.length})`);
process.exit(0);
