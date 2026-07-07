import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readAll } = await import("../lib/db.mjs");
const items = await readAll("intelligence_items", "id,regeneration_skill_version,provenance_status,format_type,severity", { match: (q)=>q.eq("is_archived", false) });
const byVer = {}, byProv = {};
let noSeverity = 0, noFormat = 0;
for (const it of items) {
  const v = it.regeneration_skill_version || "(none)";
  byVer[v] = (byVer[v]||0)+1;
  byProv[it.provenance_status] = (byProv[it.provenance_status]||0)+1;
  if (!it.severity) noSeverity++;
  if (!it.format_type) noFormat++;
}
console.log("non-archived items:", items.length);
console.log("by regeneration_skill_version:", JSON.stringify(byVer, null, 0));
console.log("by provenance_status:", JSON.stringify(byProv));
console.log("missing severity:", noSeverity, "| missing format_type:", noFormat);
