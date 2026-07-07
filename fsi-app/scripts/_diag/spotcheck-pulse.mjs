import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
for (const k of ["singapore-maritime-decarbonisation-blueprint-implementation-regulations","007f42b1","a5"]) {
  const col = k.length>20 ? "legacy_id" : null;
  let it;
  if (k==="a5") it=(await sb.from("intelligence_items").select("id,legacy_id,provenance_status,updated_at,full_brief").eq("legacy_id","a5").single()).data;
  else if (k.startsWith("007")) it=(await sb.from("intelligence_items").select("id,legacy_id,provenance_status,updated_at,full_brief").ilike("id","007f42b1%").limit(1).single()).data;
  else it=(await sb.from("intelligence_items").select("id,legacy_id,provenance_status,updated_at,full_brief").eq("legacy_id",k).single()).data;
  if (!it){console.log(k,"NOT FOUND");continue;}
  console.log(`${(it.legacy_id||k).slice(0,18).padEnd(19)} prov=${it.provenance_status.padEnd(11)} brief=${(it.full_brief||"").length}ch updated=${it.updated_at}`);
}
