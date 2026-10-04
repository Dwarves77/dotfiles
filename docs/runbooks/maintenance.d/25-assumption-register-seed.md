## 25. `assumption-register-seed`

**Documentation gap closed, Lane W71-WIRE, 2026-09-05** (plan section W7.1, B1 Gap #4). Written from
`scripts/gen/assumption-register-seed.mjs`'s own header. **CORRECTS a stale claim in
`docs/inventories/migrations.md` row 271**: that row previously read "NOT YET APPLIED" - confirmed live
2026-09-05 via read-only SQL (`list_migrations` shows version `20260830201604` applied; `assumption_
register` carries 20 live columns, 0 rows) that the coordinator applied it at some point before this
lane's pass; the row is corrected accordingly.

**Purpose**: seeds the 10 catalogued WO-20 modelling constants
(`docs/plans/wo20-assumption-register-spec.md` section 2) from the committed fixture
`scripts/gen/fixtures/assumption-register/wo20-catalogued-assumptions-2026-08-30.json` into
`assumption_register` (migration 271, live) via `guardedInsertMany`. Idempotent on the natural key
`assumption_key`.

**What it does NOT do**: does not create or alter the table (schema landed with migration 271, separately
and earlier) and does not read or write anything else.

**Upstream**: `scripts/gen/assumption-register-common.mjs` (`loadFixtureRows`, `seedAssumptions`) - the
one seeding-mechanics home this script and any future re-seed both share.

**Ruling**: none by token - the 10 constants and their `code_location`/`governing_decision` pointers are
the catalogued spec content itself (section 2), not an operator ruling requiring a separate citation.

**Dispatch**: no `arg`. Raw-CLI invoked (the script's own `--apply` flag, same shape as
`spec09-reroute` above, no `cli.mjs` wrapper). `mode=dry` reports what
would be inserted (idempotent skip on rows already present); writes nothing. `mode=apply` adds `--apply`.

**Artifact / read back**: this step's own console output (no `cli.mjs`/`summary.json`). Confirm against
`SELECT assumption_key, subsystem, label FROM assumption_register ORDER BY assumption_key` (expect 10
rows after the first successful apply; 0 as of 2026-09-05, unrun).

**Reader**: per `docs/plans/wo20-assumption-register-spec.md` section 4, the admin `/admin` page now carries an
"Assumptions" panel (`fetchAssumptionRegister()` in `src/app/admin/page.tsx` +
`src/components/admin/AdminDashboard.tsx`) - see this lane's report for the exact files. This is the
minimum first reader the spec names; the table is no longer write-only.

---

