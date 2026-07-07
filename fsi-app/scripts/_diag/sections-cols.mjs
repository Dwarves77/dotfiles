import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const { data } = await sb.from("intelligence_item_sections").select("*").limit(1);
console.log("intelligence_item_sections columns:", Object.keys(data?.[0]||{}).join(", "));
const { count } = await sb.from("intelligence_item_sections").select("id",{count:"exact",head:true});
console.log("total section rows:", count);
