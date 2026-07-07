import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient, readAll } = await import("../lib/db.mjs");
const items = await readAll("intelligence_items","id,legacy_id,title,provenance_status,last_regenerated_at",{match:(q)=>q.eq("is_archived",false)});
const it = items.find(x=>x.id.slice(0,8)==="03b5f234");
console.log("03b5f234:", it ? JSON.stringify({status:it.provenance_status,last_regen:String(it.last_regenerated_at).slice(0,19),title:it.title.slice(0,40)}) : "NOT FOUND");
