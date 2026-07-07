import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { browserlessFetch } = await import("../../src/lib/sources/canonical-fetch.mjs");
const { detectRoadblock } = await import("../../src/lib/sources/primary-fallback.mjs");
const strip = (h)=>h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
async function plain(url){ try { const r = await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; CarosLedge/1.0)"},redirect:"follow",signal:AbortSignal.timeout(25000)}); if(!r.ok) return {ok:false,status:r.status}; const t=strip(await r.text()); return {ok:true,status:r.status,len:t.length,road:detectRoadblock(t).roadblocked}; } catch(e){ return {ok:false,err:String(e.message).slice(0,60)}; } }
// simulate fetchWithTransport (browserless -> if roadblocked, plain fallback) on the announcement URL.
const URLS = [
  "https://smartfreightcentre.org/en/about-sfc/news/a-solid-foundation-to-further-accelerate-freight-decarbonization-smart-freight-centre-releases-updated-glec-framework-version-30",
  "https://www.smartfreightcentre.org/en/our-programs/emissions-accounting/global-logistics-emissions-council/",
];
for (const u of URLS) {
  console.log(`\n• ${u.slice(0,80)}...`);
  let bl=null; try { const r=await browserlessFetch(u,{maxTextLength:120000}); bl={len:r.textLength,road:detectRoadblock(r.text).roadblocked,reason:detectRoadblock(r.text).reason}; } catch(e){ bl={threw:String(e.message).slice(0,50)}; }
  console.log(`  Browserless: ${JSON.stringify(bl)}`);
  if (!bl || bl.road || bl.threw) { const p = await plain(u); console.log(`  -> TRY-BOTH plain fallback: ${JSON.stringify(p)}  ${p.ok&&!p.road?"✓ SALVAGED via plain":"(plain also blocked)"}`); }
}
