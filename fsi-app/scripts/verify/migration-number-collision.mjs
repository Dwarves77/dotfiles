#!/usr/bin/env node
// migration-number-collision.mjs — HARD CI guard: no two migration files may
// share a numeric prefix.
//
// WHY THIS EXISTS (2026-08-08). Migration numbers are claimed by branches and
// worktrees independently, and nothing machine-checked the union until merge
// day. Two live instances at time of writing, both eyeball-caught:
//   - PR #370 carries a 223 that master later assigned (renumber ruling:
//     223 -> 240, corpus series 241+; AWAITING operator).
//   - .worktrees/wt-session-c carries 237/238 files that collide with
//     master's 237_personal_list_order / 238_reorder_user_list_item (#401).
// A collision that lands silently corrupts the apply order and the migrations
// inventory. This guard turns merge-day surprise into a red PR check: the
// colliding branch fails CI until its files are renumbered.
//
// Deterministic, zero-dependency, fails the build (bug-class-guard HARD tier).
// Duplicate numbers can only enter via a PR, so a PR-time check is the
// chokepoint; worktrees stay untouched (standing rule 7) — their collision
// surfaces when they raise a PR, which is exactly when renumbering is theirs
// to do.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "supabase", "migrations");

// GRANDFATHERED (frozen 2026-08-08 — exemption format: exception + reason +
// scope, machine-checkable). These duplicate prefixes are APPLIED history from
// the repo's earliest phase; renaming an applied migration would desync the
// migration ledger, so they are exempted by exact filename set and this list
// never grows. A collision is exempt ONLY if its file set matches exactly —
// adding a third 006 or a fourth 007 still fails.
const GRANDFATHERED = new Map([
  ["6", ["006_multi_tenant.sql", "006_rls_multi_tenant.sql"]],
  ["7", ["007_community_layer.sql", "007_full_brief.sql", "007_rls_community.sql"]],
]);

function isGrandfathered(num, files) {
  const frozen = GRANDFATHERED.get(num);
  if (!frozen) return false;
  if (files.length !== frozen.length) return false;
  const sorted = [...files].sort();
  return frozen.every((f, i) => sorted[i] === f);
}

const byNumber = new Map();
for (const name of readdirSync(migrationsDir)) {
  // Numeric prefix up to the first underscore; anything unnumbered (e.g. a
  // README) is not a migration and is ignored.
  const m = /^(\d+)_/.exec(name);
  if (!m) continue;
  // Normalise so 007 and 7 collide too — the CLI orders numerically.
  const key = String(Number(m[1]));
  const list = byNumber.get(key) ?? [];
  list.push(name);
  byNumber.set(key, list);
}

const collisions = [...byNumber.entries()].filter(
  ([num, files]) => files.length > 1 && !isGrandfathered(num, files)
);

if (collisions.length === 0) {
  console.log(
    `migration-number-collision: OK — ${byNumber.size} numbered migrations, no duplicate prefixes beyond the frozen 006/007 grandfather set.`
  );
  process.exit(0);
}

console.error("migration-number-collision: FAIL — duplicate migration numbers:");
for (const [num, files] of collisions) {
  console.error(`  ${num}: ${files.join("  ·  ")}`);
}
console.error(
  "\nRenumber the newer file(s) to the next free number before merge. If an" +
    "\noperator renumbering ruling is pending (see docs/tech-debt-log.md), apply it."
);
process.exit(1);
