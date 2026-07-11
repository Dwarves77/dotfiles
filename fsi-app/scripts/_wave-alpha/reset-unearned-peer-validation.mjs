/**
 * reset-unearned-peer-validation.mjs — Wave-α Track D d5 (DB-4 register F7).
 *
 * Service-role one-shot: case_studies rows carrying HAND-SET validation_status='peer_validated'
 * (written by supabase/seed/seed-community.sql on 2026-04-05, never earned through the
 * case_study_endorsements trigger, which only promotes from 'under_review' at count >= 2)
 * are reset to 'submitted' wherever the row has ZERO endorsement rows. Surface-honesty /
 * integrity-rule class: the table is anon-readable, so a future Community build would ship
 * fabricated peer validation to customers.
 *
 * Idempotent: only rows still 'peer_validated' with 0 endorsements match; a second run
 * prints "0 to reset". Prints BEFORE/AFTER per row. Writes go through the guarded path
 * (rule 015) — snapshot + cite. The seed file itself is fixed in the same Wave-α commit
 * (peer_validated -> submitted) so a re-seed cannot reintroduce the defect.
 *
 * Usage:  node scripts/_wave-alpha/reset-unearned-peer-validation.mjs [--dry-run]
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* env may come from the shell */ }

const { readAll, guardedUpdate } = await import("../lib/db.mjs");

const DRY = process.argv.includes("--dry-run");
const CITE = {
  skill: "sprint-followups-discipline",
  reason: "Wave-α Track D d5 (DB-4 F7): reset hand-set peer_validated seed labels with zero endorsements to 'submitted' (surface-honesty class)",
};

const claimed = await readAll(
  "case_studies",
  "id, title, validation_status, peer_validation_count",
  { match: (q) => q.eq("validation_status", "peer_validated") }
);
const endorsements = await readAll("case_study_endorsements", "case_study_id, endorser_id");
const endorseCounts = new Map();
for (const e of endorsements) endorseCounts.set(e.case_study_id, (endorseCounts.get(e.case_study_id) ?? 0) + 1);

const unearned = claimed.filter((c) => (endorseCounts.get(c.id) ?? 0) === 0);
const earned = claimed.filter((c) => (endorseCounts.get(c.id) ?? 0) > 0);

console.log(`case_studies with validation_status='peer_validated': ${claimed.length}`);
console.log(`  earned (>=1 endorsement row, untouched): ${earned.length}`);
console.log(`  unearned (0 endorsements, resetting to 'submitted'): ${unearned.length}`);

let reset = 0;
for (const row of unearned) {
  console.log(
    `BEFORE ${row.id} "${row.title}": validation_status=${row.validation_status}, ` +
    `peer_validation_count=${row.peer_validation_count}, endorsements=0`
  );
  if (!DRY) {
    const res = await guardedUpdate(
      "case_studies",
      (q) => q.eq("id", row.id).eq("validation_status", "peer_validated"),
      { validation_status: "submitted" },
      { cite: CITE }
    );
    if (res.updated !== 1) throw new Error(`${row.id}: expected 1 row updated, got ${res.updated}`);
    console.log(`AFTER  ${row.id}: validation_status=submitted`);
    reset++;
  }
}

console.log(`\nDONE${DRY ? " (dry-run, no writes)" : ""}: ${DRY ? unearned.length + " would be" : reset} reset.`);
