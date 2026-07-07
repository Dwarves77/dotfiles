import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readClient } = await import("../lib/db.mjs");
const sb = readClient();
const { data, error } = await sb.from("integrity_flags").select("category,subject_type,status,created_by").limit(500);
if (error) { console.log("ERR", error.message); } else {
  const byCat={}, byStatus={}; for (const r of data) { byCat[r.category]=(byCat[r.category]||0)+1; byStatus[r.status]=(byStatus[r.status]||0)+1; }
  console.log("total flags:", data.length, "| by category:", JSON.stringify(byCat), "| by status:", JSON.stringify(byStatus));
}
