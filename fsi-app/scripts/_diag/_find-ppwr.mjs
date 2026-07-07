import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const { data } = await sb.from("intelligence_items")
  .select("id,legacy_id,title,item_type,provenance_status,is_archived")
  .or("legacy_id.ilike.%packaging%,legacy_id.ilike.%ppwr%,title.ilike.%packaging%,title.ilike.%PPWR%");
console.log(`matches: ${data?.length || 0}`);
for (const d of data || []) console.log(`  ${d.id.slice(0,8)} [${d.provenance_status}${d.is_archived?",ARCHIVED":""}] type=${d.item_type} | ${d.legacy_id}`);
process.exit(0);
