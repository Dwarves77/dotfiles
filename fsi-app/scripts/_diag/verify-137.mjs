/** READ-ONLY post-apply verification for migration 137. Asserts:
 *   1. standard/framework/guidance penalty_summary + primary_deadline now carry GAP wording
 *      (claim_kind=GAP + non-binding characterisation).
 *   2. regulation/directive penalty_summary + primary_deadline are UNCHANGED (still terse, HARD).
 *   3. effective_date + jurisdictional_scope UNCHANGED on all five types (HARD everywhere). */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll } from "../lib/db.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const rows = await readAll("item_type_required_slots", "item_type,slot_key,description",
  { match: (q) => q.in("item_type", ["regulation", "directive", "standard", "framework", "guidance"]) });
const get = (t, k) => (rows.find((r) => r.item_type === t && r.slot_key === k) || {}).description || "";

let pass = true;
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗ FAIL"}  ${label}`); if (!cond) pass = false; };

console.log("\n=== LOOSENED (must contain claim_kind=GAP + non-binding language) ===");
for (const t of ["standard", "framework", "guidance"]) {
  for (const k of ["penalty_summary", "primary_deadline"]) {
    const d = get(t, k);
    ok(d.includes("claim_kind=GAP") && /voluntary|non-binding/i.test(d) && /never invent/i.test(d), `${t}.${k} loosened`);
  }
}

console.log("\n=== UNCHANGED — regulation/directive penalty_summary + primary_deadline stay HARD (terse, no GAP) ===");
for (const t of ["regulation", "directive"]) {
  for (const k of ["penalty_summary", "primary_deadline"]) {
    const d = get(t, k);
    ok(!d.includes("claim_kind=GAP"), `${t}.${k} still HARD  («${d.slice(0, 48)}…»)`);
  }
}

console.log("\n=== UNCHANGED — effective_date + jurisdictional_scope stay HARD on ALL five types ===");
for (const t of ["regulation", "directive", "standard", "framework", "guidance"]) {
  for (const k of ["effective_date", "jurisdictional_scope"]) {
    const d = get(t, k);
    ok(!d.includes("claim_kind=GAP"), `${t}.${k} still HARD`);
  }
}

console.log(`\n${pass ? "ALL CHECKS PASS — migration 137 applied exactly as scoped." : "SOME CHECKS FAILED — investigate."}`);
process.exit(pass ? 0 : 1);
