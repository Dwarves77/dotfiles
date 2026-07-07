import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { browserlessFetch } = await jiti.import("../../src/lib/sources/canonical-fetch.mjs");
const t = () => Date.now();
async function timed(label, fn, ms=60000){ const s=t(); try { const r = await Promise.race([fn(), new Promise((_,rej)=>setTimeout(()=>rej(new Error("TIMEOUT")),ms))]); console.log(`${label}: ${((t()-s)/1000).toFixed(1)}s OK ${r}`);} catch(e){ console.log(`${label}: ${((t()-s)/1000).toFixed(1)}s ERR ${e.message.slice(0,50)}`);} }
// 1. Browserless fetch of each reg primary
await timed("BL meti.go.jp", async()=>{ const r=await browserlessFetch("https://meti.go.jp/english/policy/energy_environment/global_warming/gx-freight-standards.html",{maxTextLength:30000}); return `${(r.text||"").length}ch`; });
await timed("BL commerce.gov.in", async()=>{ const r=await browserlessFetch("https://commerce.gov.in/trade/national-logistics-policy-carbon-standards",{maxTextLength:30000}); return `${(r.text||"").length}ch`; });
// 2. minimal Sonnet call (no web_search) — measures Anthropic synthesis latency
await timed("Sonnet minimal", async()=>{ const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:16,messages:[{role:"user",content:"say ok"}]})}); return `HTTP ${r.status}`; }, 90000);
process.exit(0);
