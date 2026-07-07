/** READ-ONLY probe: resolve the migration-vs-snapshot discrepancy on intelligence_items.severity
 *  (migration 102 says lowercase_underscore; recon snapshot shows UPPERCASE). Whatever is STORED in the
 *  live DB necessarily satisfies the LIVE CHECK constraint, so distinct stored values decide which
 *  constraint is actually in force. Also tallies priority/urgency_tier/format_type distinct values so the
 *  B-fix maps EVERY constrained field from live truth, not from a possibly-stale file. ZERO writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}
const { readAll } = await import("../lib/db.mjs");

const rows = await readAll(
  "intelligence_items",
  "id,is_archived,severity,priority,urgency_tier,format_type,item_type",
  { match: (q) => q.eq("is_archived", false) },
);

function tally(field) {
  const m = new Map();
  for (const r of rows) {
    const v = r[field] === null || r[field] === undefined ? "(null)" : JSON.stringify(r[field]);
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

console.log(`\n===== LIVE intelligence_items (non-archived): ${rows.length} rows =====`);
for (const f of ["severity", "priority", "urgency_tier", "format_type"]) {
  console.log(`\n-- distinct ${f} --`);
  for (const [v, n] of tally(f)) console.log(`  ${String(n).padStart(4)}  ${v}`);
}
console.log("\nVERDICT: severity stored form reveals the live CHECK form (lowercase_underscore => mig-102 applied; UPPERCASE space => mig-018/pre-102).");
