import { resolve, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs"); const sb = readClient();
const q = async (s)=> (await sb.from("intelligence_items").select("id",{count:"exact",head:true}).eq("is_archived",false).eq("provenance_status",s)).count;
console.log("verified:", await q("verified"), "quarantined:", await q("quarantined"));
const f = async (t)=> (await sb.from("integrity_flags").select("id",{count:"exact",head:true}).eq("created_by",t).eq("status","open")).count;
console.log("open flags — skill-conformance-audit:", await f("skill-conformance-audit"), "| skill-conformance-semantic:", await f("skill-conformance-semantic"));
