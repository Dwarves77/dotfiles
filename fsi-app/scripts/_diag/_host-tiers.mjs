import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const host=u=>{try{return new URL(u).host.replace(/^www\./,"").toLowerCase();}catch{return"";}};
const sources = await readAll("sources","id,url,base_tier,effective_tier,tier_override,status");
const WANT=["pib.gov.in","commerce.gov.in","meti.go.jp","gx-league.go.jp","dpiit.gov.in","pmindia.gov.in"];
for(const w of WANT){ const m=sources.filter(s=>host(s.url)===w); if(!m.length){console.log(`${w.padEnd(20)} NOT REGISTERED`);continue;} for(const s of m) console.log(`${w.padEnd(20)} base_tier=${s.base_tier} eff=${s.effective_tier} override=${s.tier_override??"-"} status=${s.status}  ${s.url.slice(0,50)}`); }
process.exit(0);
