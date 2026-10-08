## 67. `migration-proof`

**New this runbook, lane MIG-CI, 2026-10-08.** Not a `maintenance.yml` step: a pull_request workflow,
`.github/workflows/migration-proof.yml` (workflow "Migration proof", one job, check context
`Migration proof (apply on a local stack)`). Why it exists: on 2026-10-08 three production applies aborted on defects a
run would have caught (migration 372: a text/text[] coalesce, then a NOT NULL fixture; migration 370: a CHECK-list fixture
value). Each migration's own self-check did its job at production and rolled back, but production was the first database
to run the file. Now the stack is. Related: `docs/decisions/ADR-045-chain-proof-on-a-local-stack.md` (the stack and the
replay), `docs/runbooks/maintenance.d/64-chain-proof.md`, ADR-046 (constructive gates, one check one site).

**What a green job proves.** On a disposable local Supabase stack with no production credential:
1. The applied set replays: `scripts/proof/replay-migrations.mjs`, files selected through
   `fsi-app/supabase/migrations/APPLIED-MAP.json`, the same call chain-proof makes.
2. Every migration production has NOT applied then applies, in number order, each file as one psql run with
   `ON_ERROR_STOP` in one transaction (`scripts/proof/apply-pending-migrations.mjs --apply`), so the file's own
   self-check (the NOTICE lines and sentinel rollbacks in the migration headers) runs on the stack exactly as it will at
   production. The pending set is the map's `never-applied` entries plus every `.sql` file no map entry references (a file
   a PR adds). File headers are not the selector: several still say NOT APPLIED for applied migrations. `299` is excluded
   by name: its header says LEFT UNAPPLIED (two-track policy), the coordinator applies it after reading its self-check
   count, in the population-pass sequence. A test fails if that header text changes, so the exclusion is revisited then.
3. A failure fails the job with the file name, the line, the statement, and the full psql error text (job log and the
   `migration-proof-report` artifact, 7 days). The stack holds no production data, so the text carries no production row.

**Production apply follows a green job.** Two-track policy is unchanged (CLAUDE.md standing rule 3): schema DDL applies
via the Supabase CLI before the dependent code commits; data migrations commit with their consumer code and run after
merge. This job is the proof that precedes the apply; it does not apply anything to production and holds no credential
that could (no secret is referenced in the file, `permissions` is `contents: read`, the composite action's preflight
refuses a production host and every forbidden credential name).

**By design: a defect in any pending migration fails every migration PR until it reaches production.** The pending set is
everything not yet applied, not only what the PR adds, because a later migration may depend on an earlier unapplied one and
the stack must be built in production's real order. Migrations 370, 371 and 372 are in that set today. Fix the defective
file (an amendment in place while its header says NOT APPLIED), or let it reach production and update its map entry in the
same PR that records the apply; do not add a skip list.

**When it runs, and why the job always reports.** It triggers on every pull_request to master with no path filter, and
decides inside the job whether the PR touched `fsi-app/supabase/migrations/**` (the diff of the merge commit against its
base parent). A path-filtered workflow that does not fire never reports a status, and a required check that never reports
blocks the merge forever (the reason `discipline.yml` rejects path filters). So a PR that touches no migration passes on the
fast path, with every stack step skipped. A PR that does touch one (including an `APPLIED-MAP.json` edit) runs the proof.
The check is required in the branch protection list; that is a repository setting the coordinator maintains.

**Runtime.** Fast path: one checkout of two commits and one `git diff`, about a minute billed. Stack path: dominated by the
Supabase CLI start and the replay of the applied set; it is measured on the first migration PR and bounded by the job's
30 minute timeout. No `npm ci` is run: the replay, preflight and apply scripts import only Node built-ins and relative
modules.

**Shared stack steps.** psql, the Supabase CLI, the empty stack started from a scratch directory holding only
`fsi-app/supabase/config.toml` (so the CLI never applies the migration tree), the loopback-only env file and the preflight
are the composite action `.github/actions/local-stack/action.yml`, used by this workflow and by `chain-proof.yml`: one site.

**Reading a failure.** The job summary shows the replay counts and the apply result. A replay failure names the file and
statement as chain-proof's does (runbook 64). An apply failure prints `FAILED <file> line <n>: <message>`, the statement
at that line, and the full psql error text; reproduce it on any local Postgres by running the file with
`psql -v ON_ERROR_STOP=1 --single-transaction -f <file>` after replaying the applied set.

**Tests.** `fsi-app/scripts/proof/migration-proof-workflow.test.mjs` (workflow shape: required-check form, no secret, gated
stack steps, replay before apply, pipefail), `apply-pending-migrations.test.mjs` (selection, order, the 299 exclusion
against its real header, one-file-one-run, the stop rule, and a negative fixture in which a CHECK-violating migration fails
the step), `chain-proof-workflow.test.mjs` (the lift into the composite action).
