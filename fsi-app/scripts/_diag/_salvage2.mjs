import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const key = process.env.BROWSERLESS_API_KEY;
const base = (process.env.BROWSERLESS_BASE_URL || "https://chrome.browserless.io").replace(/\/+$/, "");
const URL_ = "https://smartfreightcentre.org/en/about-sfc/news/a-solid-foundation-to-further-accelerate-freight-decarbonization-smart-freight-centre-releases-updated-glec-framework-version-30";
const strip = (h) => h.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
async function content(stealth){ const qs = stealth?`&launch=${encodeURIComponent(JSON.stringify({stealth:true}))}`:""; const res = await fetch(`${base}/content?token=${key}${qs}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:URL_,gotoOptions:{waitUntil:"networkidle2",timeout:20000}})}); const h = await res.text(); return {status:res.status, len:strip(h).length, head:strip(h).slice(0,160)}; }
async function unblock(){ const res = await fetch(`${base}/unblock?token=${key}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:URL_,content:true,gotoOptions:{waitUntil:"domcontentloaded",timeout:25000}})}); const d = await res.json().catch(()=>({})); const h = typeof d?.content==="string"?d.content:""; return {status:res.status, len:strip(h).length, head:strip(h).slice(0,160)}; }
for (const [name,fn] of [["stealth",()=>content(true)],["unblock",()=>unblock()]]) {
  try { const r = await fn(); console.log(`${name}: status=${r.status} textLen=${r.len}\n  head: ${r.head}\n`); }
  catch(e){ console.log(`${name}: THREW ${String(e.message).slice(0,140)}\n`); }
}
