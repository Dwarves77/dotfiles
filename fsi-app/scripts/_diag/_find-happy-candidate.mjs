import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readClient } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(ROOT + "/.env.local"); } catch {}
const sb = readClient();
const { data } = await sb.from("intelligence_items")
  .select("id,legacy_id,item_type,source_url,provenance_status")
  .ilike("legacy_id", "%weights%dimensions%");
console.log("weights/dimensions:", JSON.stringify(data, null, 2));
process.exit(0);
