import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import("../../src/lib/sources/canonical-fetch.mjs");
const t=()=>Date.now();
async function probe(label,url,ms=25000){ const s=t(); try{ const r=await Promise.race([browserlessFetch(url,{maxTextLength:30000}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("TIMEOUT")),ms))]); const txt=(r.text||"").replace(/\s+/g," ").trim(); console.log(`${((t()-s)/1000).toFixed(1)}s ${txt.length}ch  ${label}\n        ${url}\n        "${txt.slice(0,120)}"`);}catch(e){console.log(`${((t()-s)/1000).toFixed(1)}s ERR(${e.message.slice(0,18)})  ${label}\n        ${url}`);} }
console.log("=== JAPAN GX-ETS / GX freight primary candidates ===");
await probe("GX League EN","https://gx-league.go.jp/en/");
await probe("METI GX policy EN","https://www.meti.go.jp/english/policy/energy_environment/global_warming/GX/index.html");
await probe("METI press EN index","https://www.meti.go.jp/english/press/index.html");
await probe("MLIT EN","https://www.mlit.go.jp/en/index.html");
console.log("\n=== INDIA NLP / ISO 14083 primary candidates ===");
await probe("ISO 14083 standard","https://www.iso.org/standard/78864.html");
await probe("National Logistics Portal","https://www.nlp.gov.in/");
await probe("ULIP","https://www.goulip.in/");
await probe("PIB site","https://pib.gov.in/indexd.aspx");
process.exit(0);
