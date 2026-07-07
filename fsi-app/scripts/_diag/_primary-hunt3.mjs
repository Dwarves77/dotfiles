import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import("../../src/lib/sources/canonical-fetch.mjs");
const t=()=>Date.now();
const clean=u=>u.replace(/[`.,;:]+$/,"");
async function probe(label,url,facts,ms=20000){ url=clean(url); const s=t(); try{ const r=await Promise.race([browserlessFetch(url,{maxTextLength:40000}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("TIMEOUT")),ms))]); const txt=(r.text||"").replace(/\s+/g," ").trim(); const ascii=txt.replace(/[^\x00-\x7F]/g,"").length, en=txt.length?Math.round(ascii/txt.length*100):0; const hits=facts.filter(f=>txt.toLowerCase().includes(f.toLowerCase())); console.log(`  ${((t()-s)/1000).toFixed(1)}s ${String(txt.length).padStart(6)}ch en~${en}% facts[${hits.join(",")}]  ${label}\n        "${txt.slice(0,90)}"`);}catch(e){console.log(`  ${((t()-s)/1000).toFixed(1)}s ERR(${e.message.slice(0,16)})  ${label} ${url}`);} }
console.log("=== JAPAN (clean) ===");
const jf=["2026","January 31","GX-ETS","report","mandatory"];
await probe("METI ets.html","https://www.meti.go.jp/policy/energy_environment/global_warming/ets.html",jf);
await probe("METI ets_setup.pdf","https://www.meti.go.jp/policy/energy_environment/global_warming/ets_setup.pdf",jf);
await probe("METI EN GX","https://www.meti.go.jp/english/policy/energy_environment/global_warming/",jf);
console.log("=== INDIA (clean) ===");
const inf=["14083","ULIP","logistics","emission","carbon"];
await probe("DPIIT NLP","https://www.dpiit.gov.in/logistics/national-logistics-policy",inf);
await probe("PIB PRID2167224","https://www.pib.gov.in/PressReleasePage.aspx?PRID=2167224",inf);
await probe("PMIndia NLP","https://www.pmindia.gov.in/en/news_updates/pm-launches-national-logistics-policy/",inf);
process.exit(0);
