import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import("../../src/lib/sources/canonical-fetch.mjs");
const t=()=>Date.now();
async function webSearch(query){
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","anthropic-beta":"web-search-2025-03-05"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1200,tools:[{type:"web_search_20250305",name:"web_search",max_uses:4}],messages:[{role:"user",content:`Find the OFFICIAL PRIMARY government source URLs (regulator/ministry, not news) for: ${query}. List up to 6 exact URLs, one per line, most authoritative first.`}]})});
  const j=await r.json(); let txt=""; for(const b of (j.content||[])) if(b.type==="text") txt+=b.text;
  return [...new Set((txt.match(/https?:\/\/[^\s)\]}"'<>]+/g)||[]).map(u=>u.replace(/[.,;:]+$/,"")))];
}
async function probe(url,ms=20000){ const s=t(); try{ const r=await Promise.race([browserlessFetch(url,{maxTextLength:40000}),new Promise((_,rej)=>setTimeout(()=>rej(new Error("TIMEOUT")),ms))]); const txt=(r.text||"").replace(/\s+/g," ").trim(); return {s:((t()-s)/1000).toFixed(1),len:txt.length,txt};}catch(e){return {s:((t()-s)/1000).toFixed(1),err:e.message.slice(0,16)};} }
for (const [name,q,facts] of [
  ["JAPAN","Japan GX-ETS emissions trading system mandatory phase FY2026 April 2026 annual emissions report deadline January 31",["2026","January 31","GX-ETS","report"]],
  ["INDIA","India National Logistics Policy ISO 14083 freight carbon emissions ULIP TEMT official",["14083","ULIP","logistics","emission"]],
]){
  console.log(`\n===== ${name} — web_search primaries =====`);
  let urls=[]; try{ urls=await webSearch(q);}catch(e){console.log("websearch ERR",e.message.slice(0,40));}
  console.log("candidates:",urls.slice(0,6).join(" | ")||"(none)");
  for(const u of urls.slice(0,5)){ const p=await probe(u); if(p.err){console.log(`  ${p.s}s ERR(${p.err}) ${u}`);continue;} const hits=facts.filter(f=>p.txt.toLowerCase().includes(f.toLowerCase())); console.log(`  ${p.s}s ${p.len}ch  facts[${hits.join(",")}]  ${u}`); }
}
process.exit(0);
