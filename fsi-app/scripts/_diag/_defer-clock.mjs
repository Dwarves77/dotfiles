import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { readClient, readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const flags = await readAll("integrity_flags","subject_ref,created_by,recommended_actions,status",{match:q=>q.eq("subject_type","item").eq("status","open").eq("created_by","disposition_deferred")});
const now=new Date(); const dist={};
let expired=0,live=0;
for(const f of flags){ let pl=null; const ra=f.recommended_actions; if(Array.isArray(ra)){for(const e of ra)if(e&&e.deferral){pl=e.deferral;break;}} if(!pl)continue; const du=pl.deferred_until; const day=String(du).slice(0,10); dist[day]=(dist[day]||0)+1; if(new Date(du)<=now)expired++;else live++; }
console.log("today:",now.toISOString().slice(0,10));
console.log("deferral count:",flags.length,"| live:",live,"| expired:",expired);
console.log("deferred_until distribution:",JSON.stringify(dist));
process.exit(0);
