import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const { data } = await sb.from("section_claim_provenance").select("*").limit(1);
console.log("section_claim_provenance columns:", data?.[0] ? Object.keys(data[0]).join(", ") : "no rows");
