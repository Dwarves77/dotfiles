// READ-ONLY: of the cat-2 oversize-section set, how many QUARANTINED remain to re-ground through the
// chokepoint after 576554b3 (flipped) + 27dfbe4c, split by current provenance_status. ZERO writes/fetch.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.loadEnvFile(resolve(ROOT, ".env.local"));
const { readAll } = await import("../lib/db.mjs");
const audit = JSON.parse(readFileSync(resolve(ROOT, "scripts", "_plans", "completeness-audit.json"), "utf8"));
const cat2ids = audit.cat2.map((x) => x.id);
const items = await readAll("intelligence_items", "id,legacy_id,provenance_status,is_archived");
const byId = new Map(items.map((i) => [i.id, i]));
const keyOf = (id) => (byId.get(id)?.legacy_id || id.slice(0, 8));
const NAMED = { "576554b3": "flipped", "27dfbe4c": "candidate/held" };
const rows = cat2ids.map((id) => { const it = byId.get(id); const k = id.slice(0, 8); return { key: keyOf(id), short: k, st: it?.provenance_status || "MISSING", arch: it?.is_archived, named: NAMED[k] || "" }; });
const byStatus = {};
for (const r of rows) (byStatus[r.st] ||= []).push(`${r.key}${r.named ? `[${r.named}]` : ""}${r.arch ? "(arch)" : ""}`);
const quarantinedToReground = rows.filter((r) => r.st === "quarantined" && !r.arch && !r.named);
console.log(`\n=== CAT-2 SET (${cat2ids.length} items) — current provenance_status ===`);
for (const [st, list] of Object.entries(byStatus).sort((a, b) => b[1].length - a[1].length)) console.log(`  [${list.length}] ${st}: ${list.join(", ")}`);
console.log(`\nNAMED: ${rows.filter((r) => r.named).map((r) => `${r.key}=${r.named}(${r.st})`).join(", ") || "none in set"}`);
console.log(`\n>>> QUARANTINED remaining to re-ground (excl named + archived): ${quarantinedToReground.length}`);
if (quarantinedToReground.length) console.log(`    ${quarantinedToReground.map((r) => `${r.key}(${r.short})`).join(", ")}`);
process.exit(0);
