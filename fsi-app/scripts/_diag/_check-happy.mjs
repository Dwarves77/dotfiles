import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const { data } = await sb.from("intelligence_items")
  .select("id,legacy_id,item_type,source_url,provenance_status,full_brief")
  .eq("id", "007104ed-b4e4-4735-b7ac-c16bc214c1eb").single();
console.log(`id=${data.id}\nlegacy=${data.legacy_id}\ntype=${data.item_type}\nsource_url=${data.source_url}\nprov=${data.provenance_status}\nbriefLen=${(data.full_brief||"").length}`);
process.exit(0);
