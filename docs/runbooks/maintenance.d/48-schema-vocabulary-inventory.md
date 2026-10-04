## 48. `schema-vocabulary-inventory`

**Purpose**: D7 (docs/plans/defect-fix-plan-2026-09-12.md, the D2 class fix). A tracked, committed
inventory of every list-valued CHECK constraint on the public schema, so a writer that uses a value the
database refuses fails a unit test before it fails in production (`provisional_sources_status_check`
rejecting `status: "promoted"`, D2, is the case that motivated this).

**READ-ONLY BY DESIGN**: this step never writes the database. `mode=apply` is refused by the script
itself, before any DB connection is attempted, printing a note and exiting 0 -- there is nothing to
apply, only to (re)generate.

**Upstream**: `scripts/maintenance/schema-vocabulary-inventory.mjs`, the pure parser in
`scripts/maintenance/lib/vocab-inventory.mjs` (its own tests: `vocab-inventory.test.mjs`). Runs exactly
this query (direct Postgres, `scripts/lib/pg-conn.mjs`'s shared resolver):

```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'c'
  and connamespace = 'public'::regnamespace
  and pg_get_constraintdef(oid) ~ 'ANY \(ARRAY'
order by 1, 2
```

Each row's definition is parsed (column + allowed values) by `parseCheckConstraintDef`, which handles
both the `= ANY (ARRAY[...])` shape (what Postgres always normalizes a source-authored `IN (...)` into)
and a raw `IN (...)` clause. A definition the parser cannot resolve to exactly one column and a non-empty
value set is recorded as `{ table, column, constraint, allowed: null, unparsed: <def> }`, never guessed.

**Dispatch**: `mode=dry` (or `all`'s dry fan-out) runs the query, writes
`fsi-app/docs/inventories/db-check-constraints.json` as `{ source: "live", generated: <ISO date>,
constraints: [...] }`, and reports `counts.constraints` / `counts.unparsed` / `counts.tables` in
`summary.json`. Needs `SUPABASE_DB_PASSWORD` (a direct Postgres connection), not the REST creds this
job's own secrets-verify step checks; self-skips exit 2 without it, same convention as
`source-role-cleanup` above (`|| true` so this does not fail an `all` dry fan-out).

**Seed** (2026-09-12, lane w9-d5-d7): the coordinator's own live dump was not available to the lane that
built this step, so the tracked JSON is seeded by running the SAME parser over
`supabase/migrations/*.sql` text instead (`buildVocabularyFromMigrationSources`, same module): every
`check (... = any (array[...]))` and `check (... in (...))`, last definition per constraint name wins
(an `ALTER TABLE ... DROP CONSTRAINT` with no later re-`ADD CONSTRAINT` removes the entry entirely). The
file's header carries `"source": "migrations"` until the first LIVE dry run replaces it with
`"source": "live"`. 187 entries seeded from 284 migration files, 2026-09-12; one compound (`dimension`-
gated, three-branch OR) constraint on `source_bias_tags` recorded `unparsed` rather than guessed.

**Commit-back**: this step writes a FILE (never the database); the run's checkout does not survive past
the job. The refreshed `docs/inventories/db-check-constraints.json` is committed back to the dispatched
ref the SAME way `resolve-error-body-gate`'s worklist is (task 7.4 fix round 1): reusing
`scripts/maintenance/commit-worklist-artifact.sh`, never a second copy of the push-degradation logic.
Runs only on a named `mode=dry` dispatch, never from `all`.

**Consumers**: `fsi-app/.discipline/check-vocabulary.test.mjs` (a unit test scanning
`scripts/maintenance/*.mjs`, `scripts/turns/*.mjs`, `src/app/api/**/route.ts`, `src/lib/**/*.{ts,mjs}` for
a governed-column literal not in the tracked allowed set) and `scripts/verify/check-vocabulary-drift.mjs`
(the data-audit-lane verifier comparing this file against the live schema; see the Appendix entry below).

**Registration**: no `docs/inventories/shared-dataset-ownership.md` writer row -- that registry scopes
DATABASE table writers (`intelligence_items`, `integrity_flags`, etc.); this step writes a docs/
inventories JSON FILE, never a database row, so it is out of that registry's scope by design (confirmed
against the registry's own scan-scope comment before skipping the row).
