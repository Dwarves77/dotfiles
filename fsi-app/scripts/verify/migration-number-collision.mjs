#!/usr/bin/env node
// migration-number-collision.mjs — SOFT scan: report duplicate migration
// filename prefixes as a READABILITY signal. Report-only by design.
//
// WHY REPORT-ONLY, NOT A MERGE GATE (read before "promoting" this): the
// 2026-08-02 session-log retraction (docs/ops/session-log.md, "RETRACTION:
// the migration collision was NOT a defect"), verified against the live DB,
// established that Supabase versions applied migrations by TIMESTAMP — the
// 3-digit filename prefix is a human convention with no apply-order
// authority. Master and the coverage_gap_* series already coexist with ~25
// duplicate prefixes, every one applied exactly once, and RENAMING an
// applied migration is what would manufacture a real inconsistency (the
// applied-name record desyncs from the tree). Operator-ratified there:
// "Do not renumber existing files."
//
// So a duplicate prefix is NEVER a landing blocker and this scan must never
// instruct a rename. What it IS: ambiguity in the directory and in
// docs/inventories/migrations.md, and a prompt — when a NEW file takes a
// number the tree already uses, the author should check whether that was
// deliberate (parallel-lane numbering, later applied by timestamp) or an
// accidental double-claim of the "next" number that is better taken fresh
// BEFORE the file is ever applied. Renaming is safe ONLY pre-apply.
//
// Known prefix reuse at time of writing (expected in the report, not news):
// the 006 pair, the 007 trio, and — once the corpus-integrity lanes land —
// the coverage_gap_* 215-246 overlap with master's 215-239.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "supabase", "migrations");

const byNumber = new Map();
for (const name of readdirSync(migrationsDir)) {
  // Numeric prefix up to the first underscore; anything unnumbered (e.g. a
  // README) is not a migration and is ignored.
  const m = /^(\d+)_/.exec(name);
  if (!m) continue;
  // Normalise so 007 and 7 count as the same prefix.
  const key = String(Number(m[1]));
  const list = byNumber.get(key) ?? [];
  list.push(name);
  byNumber.set(key, list);
}

const dupes = [...byNumber.entries()]
  .filter(([, files]) => files.length > 1)
  .sort(([a], [b]) => Number(a) - Number(b));

if (dupes.length === 0) {
  console.log(
    `migration-number-collision: ${byNumber.size} numbered migrations, no duplicate prefixes.`
  );
  process.exit(0);
}

console.log(
  `migration-number-collision: ${dupes.length} duplicate prefix(es) across ${byNumber.size} numbers — READABILITY SIGNAL, not a blocker:`
);
for (const [num, files] of dupes) {
  console.log(`  ${num}: ${files.sort().join("  ·  ")}`);
}
console.log(
  "\nDuplicate prefixes are cosmetic: Supabase applies by timestamp (see the" +
    "\n2026-08-02 retraction in docs/ops/session-log.md). NEVER rename an applied" +
    "\nmigration. If a file in THIS PR accidentally double-claimed the next free" +
    "\nnumber and is not yet applied anywhere, renaming it now is safe and kind" +
    "\nto future readers; if it is applied or deliberate, leave it and move on."
);
// Report-only: always exit 0. Promoting this to a gate would re-encode the
// retracted "collisions block merges" premise.
process.exit(0);
