import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const items = await readAll("intelligence_items","id,provenance_status,is_archived",{match:(q)=>q.eq("is_archived",false).eq("provenance_status","quarantined")});
const qids = new Set(items.map((i)=>i.id));
const flags = await readAll("integrity_flags","subject_ref,created_at,status",{match:(q)=>q.eq("subject_type","item").eq("status","open")});
const earliest = new Map();
for (const f of flags) { if(!qids.has(f.subject_ref)) continue; const t=f.created_at; const ex=earliest.get(f.subject_ref); if(!ex||t<ex) earliest.set(f.subject_ref,t); }
const byMonth = {}; for (const [,t] of earliest) { const k=(t||"").slice(0,10); byMonth[k]=(byMonth[k]||0)+1; }
const sorted = Object.entries(byMonth).sort();
console.log("quarantined items:", items.length, "| with open flag:", earliest.size);
console.log("earliest-open-flag date -> count:");
for (const [d,n] of sorted) console.log(`  ${d}: ${n}`);
process.exit(0);
