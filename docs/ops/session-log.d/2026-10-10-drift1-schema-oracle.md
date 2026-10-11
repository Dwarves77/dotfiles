## 2026-10-10, lane DRIFT-1 (drift1-schema-oracle-562): the schema oracle's 562 differing objects classified, canonicalised, and given a structural record; two migrations written (NOT APPLIED)

Start: chain proof fire 9 (run 38058989236, head 76bec7b28) ran the schema oracle gate for the first time: 562 differing objects between the replayed schema and a dump of production. No database and no network were available to this lane (COMMON rule 5), and the report holds names and hashes only, so no definition text was read: every class below rests on repo evidence named per row in the scratch register (fsi-app/scripts/tmp/drift1-register-2026-10-10.md in the lane worktree, gitignored).

### Classification (the 562 rows; the artifact names 522, see the cap note)

| Class | Meaning | Rows | Where |
|---|---|---|---|
| N | the same object printed or built two ways | 501 | 24 foreign keys to auth.users and 135 policies [HYPOTHESIS: search_path qualification]; 342 grants [oracle construction, see below] |
| P | production has it, no migration creates it | 32 | 11 tables (row level security), 7 columns, 6 constraints, 7 policies, 1 index |
| R | replay has it, production lacks it | 6 | 5 indexes, 1 function grant |
| C | both have it, definitions really differ | 23 | 23 functions |

- [CONFIRMED: AUD-AT-1 section 0 and the 11 table rows, read from production on 2026-10-08] production has row level security on every public table, so the 11 differing tables are P (no file enables it on them).
- [CONFIRMED: AUD-AT-1 table rows for aggregate_query_log, derivation_edges, harness_runs, pending_first_fetch, sensitive_field_policy] anon and authenticated hold no privilege on these in production while the oracle reports grants on them. The oracle cluster therefore carries grants production does not have. [HYPOTHESIS, unverified] cause: the oracle image's ALTER DEFAULT PRIVILEGES grant anon and authenticated on every object the dump creates, and pg_dump emits no REVOKE for a role absent from the ACL. This covers the 102 only-oracle and 240 changed grants (343 with the one only-replayed).
- [HYPOTHESIS, unverified] the 24 constraints that reference auth.users and the 135 policies that call auth.uid() or auth.role() are one cause: pg_get_constraintdef and pg_get_expr print a schema qualifier only when the schema is off the reading session's search_path, and the stack's postgres role and the oracle cluster's supabase_admin role carry different search_path settings. The list shapes match; no text was read.
- [CONFIRMED: APPLIED-MAP.json] 63 migration files are ledger class code-differs / changed-in-place; 10 of the 23 differing functions have such a file as their last definer, 2 are outside-ledger, 9 are ledger-identical with a cause the ledger does not explain. Class C for all 23 is [HYPOTHESIS]; no function body was rewritten on a hypothesis.
- [CONFIRMED: report cap] schema-diff caps each name list at 200 (MAX_NAMES): 240 grants differ, 200 are named, so 40 rows are not enumerable from the artifact and are classed N by count.

### Accomplished

1. `fsi-app/scripts/proof/schema-diff.mjs`: the catalog is read as definition text (the md5 wrappers are gone); both sides are read with `PGOPTIONS=-c search_path=pg_catalog` (the canonical form, an ambient PGOPTIONS never wins); `canonicalise` (whitespace, the space inside parentheses and after commas outside string literals, privilege-list order) feeds the comparison; `diffCatalogs` reports `normalised_away` (equal once canonicalised, not counted); `buildDetail` writes `replay-schema-diff-detail.json` beside the report whenever anything differs: per object the class R/P/C, the shape (qualification-only versus substantive), both lengths, the first differing offset, the identifier tokens each side has more of, and grants' privilege letters, and NEVER definition text or a string literal (the artifact is world-readable); `runGate` is the gate (pass condition ZERO differing objects; any difference lists the object in the log, the report and the record); `--catalog-only --out <file>` writes the stack's canonical catalog.
2. `fsi-app/supabase/migrations/384_schema_drift_reconcile_production_only.sql` (NOT APPLIED, a no-op on production by construction, every statement guarded and its production evidence cited): row level security on the 11 tables; 5 constraints on the mig-009 tables; the 3 intelligence_summaries policies in their 259 + 381 final form plus sector_contexts_read_authenticated (coordinator request, SEC-9's precondition; behaviour [CONFIRMED: AUD-AT-1 line 195], predicate text [HYPOTHESIS], written as the summaries read policy's); REVOKE PUBLIC execute on gate_a_health().
3. `fsi-app/supabase/migrations/385_schema_drift_repair_replay_only_indexes.sql` (NOT APPLIED, changes production): the 5 indexes the files define and production lacks, IF NOT EXISTS, definitions equal to 009 and 271.
4. `.github/workflows/migration-proof.yml`: one new step after the pending apply: reads the stack's whole canonical catalog, applies 384 and 385 a second time (ON_ERROR_STOP, one transaction), reads it again, fails unless the two reads are byte for byte equal (cmp); the catalog files stay under RUNNER_TEMP, never uploaded.
5. Tests: `schema-diff-drift1.test.mjs` (8, new), `migration-proof-drift1.test.mjs` (3, new, with mutation attacks), `384_...test.mjs` (7) and `385_...test.mjs` (3) static tests, two assertions updated in `schema-diff.test.mjs`.

### Red then green

| File | Against the old code | After |
|---|---|---|
| schema-diff-drift1.test.mjs | does not import (no export CANONICAL_PGOPTIONS), 0 of 8 run | 8 of 8 |
| schema-diff.test.mjs | 2 of 21 fail (md5 expectation, report keys) | 21 of 21 |
| migration-proof-drift1.test.mjs | step absent: the verifier returns "the second-apply step is absent" | 3 of 3 |
| 384 and 385 static tests | the files did not exist; their verifier is attacked red by an unguarded constraint, an unguarded policy, a DELETE and a missing self-check | 10 of 10 |

Local: `node --test` on the touched files, 32 of 32 (schema-diff, schema-diff-drift1, migration-proof-drift1) and 10 of 10 (384, 385). The existing `migration-proof-workflow.test.mjs` fails locally on this machine for a reason older than this lane (the working copy is CRLF, its regexes expect LF); CI is Linux. The SQL was not run: no database here; the migration-proof job runs it on the PR.

### Read and reused

Read: COMMON, drift1 brief, root CLAUDE.md, schema-diff.mjs and its test, migration-proof.yml and its workflow test, chain-proof.yml (gate step), replay-migrations (runFileWithPsql), apply-pending-migrations header, create-oracle-db and apply-schema-dump headers, migrations 009, 259, 271, 279, 381 (parts 1, 2), 382 header, `_lib/applied-status.mjs`, APPLIED-MAP.json, docs/inventories/out-of-band-objects.md, docs/audits/aud-at1-rls-grants-attacked-2026-10-08.md (sections 0 and the table rows), docs/archive/sprint-1/phase-2-dedup-plan.md (line 55), fsi-app/docs/inventories/db-check-constraints.json, the PROOF-7 and PROOF-9 session logs, and the fire 9 artifact. Reused: the catalog query (edited, not copied), `readCatalog`/`describePsqlFailure`, `assertLoopbackDbUrl`, `headerProblems`, the artifact upload directory (the record rides the existing upload), the migration-proof job's stack and preflight steps. No new module.

### Decisions

- The structural record carries no definition text: the repository and its workflow artifacts are public (migration-proof.yml header). Whoever holds the production credential reads the text itself when a migration is written.
- 384 creates only objects whose production definition the tree fixes (evidence cited per statement), plus sector_contexts_read_authenticated on the coordinator's instruction with its predicate text labelled a hypothesis. It does not guess the other three out-of-band policies, the urgency_score check or the 7 columns.
- 385 follows the brief: the file is the truth, so production gets the indexes. Evidence that production dropped them on purpose was searched for and not found.

### NOT done

- The three other out-of-band policies (changes_read_authenticated, changes_write_service, sector_contexts_write_service), the intelligence_summaries_urgency_score_check constraint and the 7 differing columns: their production text is in no file. The executor reads pg_policies, pg_get_constraintdef and the column defaults in one query and a next lane writes them into a migration. [WORK: owed]
- The 23 functions: bodies need both texts; fire 10's record gives the token difference per function, and the credentialed read gives the text. [WORK: owed]
- The grants (342 after 384): the oracle cluster must have the image's default privileges for anon, authenticated and service_role in schema public removed before the dump is applied. The edit belongs in `fsi-app/scripts/proof/apply-schema-dump.mjs`, outside this lane's write set. NEEDS WRITE-SET EXPANSION. [WORK: owed]
- Migrations 384 and 385 are not applied; the executor applies both after CI is green (384 is a no-op on production, 385 creates 5 indexes) and then fires chain proof 10. [WORK: owed]
- Expected fire 10 counts, all [HYPOTHESIS] until fire 10: tables 11 to 0; columns 7 to 7; constraints only-oracle 6 to 1, changed 24 to 0; indexes 5 to 0 and 1 to 0; functions 23 to 23; policies only-oracle 7 to 3, changed 135 to 0; grants 343 to 342 (and to 0 once apply-schema-dump is fixed); total 376 (34 after the grants fix). The oracle gate's pass condition is 0 and is not expected yet.
- Not run locally: the whole suite, the fitness runner, tsc, any SQL. [NOT-WORK: COMMON rules 5 and 9, CI is the gate]
- The committed db-catalog.json is stale (108 tables against 122): DEAD-1d regenerates it. [NOT-WORK: another lane owns it]

### Open items

- If the operator rules that production dropped the four idx_intel_* indexes on purpose (they are prefix-redundant to the unique key), a new migration drops them in the replay and 385's four are removed before it is applied. [NOT-WORK: operator-only ruling, none pending: the brief ruled the file is the truth]
