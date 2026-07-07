// 1-unit Browserless probe: does the CSRD enacted-text page (EUR-Lex CELEX:32022L2464) roadblock
// server-side? Runs the SAME detectRoadblock the pipeline uses. Confirms whether enacted text fell out
// of CSRD's groundable pool (the root-cause mechanism inference).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import(resolve(ROOT, "src/lib/sources/canonical-fetch.mjs"));
const { detectRoadblock } = await jiti.import(resolve(ROOT, "src/lib/sources/primary-fallback.mjs"));

const URLS = [
  "https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464",                 // CSRD declared primary
  "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464",            // explicit HTML rendering
];
for (const u of URLS) {
  const t = Date.now();
  let text = "", status = 0, err = null;
  try { const r = await browserlessFetch(u); text = (r && r.text) || ""; status = (r && r.status) || 0; }
  catch (e) { err = String(e?.message || e); }
  const d = detectRoadblock(text, { httpStatus: status || 200, timedOut: false });
  console.log(`\nURL: ${u}`);
  console.log(`  status=${status} len=${text.length} (${((Date.now() - t) / 1000).toFixed(0)}s)${err ? ` err=${err}` : ""}`);
  console.log(`  roadblock=${d.roadblocked} reason=${d.reason} langRatio=${d.langRatio?.toFixed?.(2)}`);
  console.log(`  head: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
}
process.exit(0);
