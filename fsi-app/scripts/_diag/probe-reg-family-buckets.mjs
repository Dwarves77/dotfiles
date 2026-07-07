/** READ-ONLY spot-check for migration-137 carry-condition A (Jason): the slot×item_type matrix is
 *  only as safe as item_type. Before loosening penalty_summary + primary_deadline to GAP-ok on
 *  standard/framework/guidance, confirm those buckets are NOT holding mislabeled BINDING instruments
 *  (a binding reg mistyped as 'framework' would get the loosened gate and could omit a real
 *  penalty/deadline). Findings drive reclassify (fix the type), NOT loosen.
 *
 *  Also dumps the current item_type_required_slots descriptions for the three types (the migration-137
 *  rewrite targets) + provenance_status distribution per type. Pure reads; no writes. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const TYPES = ["standard", "framework", "guidance"];
// Title/markers that suggest a BINDING legal instrument (would be mistyped if carrying these as framework/guidance/standard)
const BINDING_RX = /\b(regulation|directive|\bact\b|statute|\blaw\b|mandate|mandates|mandatory|final rule|binding|enforceable|penalt|deadline|comply by|in force from|enters? into force|shall\b)\b/i;

const slots = await readAll("item_type_required_slots", "item_type,slot_key,description",
  { match: (q) => q.in("item_type", TYPES) });
console.log("\n===== item_type_required_slots (current, the migration-137 targets) =====");
for (const t of TYPES) {
  console.log(`\n--- ${t} ---`);
  for (const s of slots.filter((x) => x.item_type === t).sort((a, b) => a.slot_key.localeCompare(b.slot_key))) {
    console.log(`  [${s.slot_key}] ${s.description}`);
  }
}

const items = await readAll(
  "intelligence_items",
  "id,legacy_id,title,item_type,source_url,provenance_status,priority,is_archived",
  { match: (q) => q.in("item_type", TYPES).eq("is_archived", false) }
);

console.log(`\n\n===== reg-family buckets (standard/framework/guidance), non-archived: ${items.length} items =====`);
const byType = {};
const byStatus = {};
for (const it of items) {
  byType[it.item_type] = (byType[it.item_type] || 0) + 1;
  const k = `${it.item_type}/${it.provenance_status}`;
  byStatus[k] = (byStatus[k] || 0) + 1;
}
console.log("by type:", JSON.stringify(byType));
console.log("by type/provenance_status:", JSON.stringify(byStatus, null, 0));

console.log(`\n===== MISLABEL SPOT-CHECK — items whose TITLE carries binding-instrument markers =====`);
const suspects = items.filter((it) => BINDING_RX.test(it.title || ""));
if (!suspects.length) console.log("  (none — no title in these buckets matches binding-instrument markers)");
for (const it of suspects.sort((a, b) => a.item_type.localeCompare(b.item_type))) {
  const m = (it.title.match(BINDING_RX) || [])[0];
  console.log(`  [${it.item_type}] ${(it.legacy_id || it.id.slice(0, 8)).padEnd(16)} «${m}» ${it.title}`);
}

console.log(`\n===== FULL BUCKET LISTING (eyeball every row — title is the only honest signal here) =====`);
for (const t of TYPES) {
  console.log(`\n--- ${t} (${byType[t] || 0}) ---`);
  for (const it of items.filter((x) => x.item_type === t).sort((a, b) => (a.legacy_id || a.id).localeCompare(b.legacy_id || b.id))) {
    console.log(`  ${(it.legacy_id || it.id.slice(0, 8)).padEnd(16)} ${String(it.provenance_status).padEnd(20)} ${it.title}`);
  }
}
console.log("\n(done — READ ONLY, no writes)");
