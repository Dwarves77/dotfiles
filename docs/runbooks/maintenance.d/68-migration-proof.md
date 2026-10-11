## 68. `migration-proof`

**New this runbook, lane MIG-CI, 2026-10-08; moved by lane PIPE-1, 2026-10-11.** Not a `maintenance.yml` step: steps of the
`schema` job of the one pull_request workflow, `.github/workflows/ci.yml` (workflow "CI", check context `schema`; the former
workflow `migration-proof.yml` and its context `Migration proof (apply on a local stack)` are retired). The `schema` job also
runs the RLS persona matrix, the view and function attacks and the route attacks on the SAME stack. Why it exists: on 2026-10-08 three production applies aborted on defects a
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
   `schema-report` artifact, 7 days). The stack holds no production data, so the text carries no production row.

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

**When it runs, and why the job always reports.** The `inputs` job runs the one classifier
(`fsi-app/.discipline/governance/job-inputs.mjs`) over the merge commit's diff against its base parent, and the `schema` job
has the job-level `if` over its output (`schema`: migrations, `fsi-app/supabase/**`, the proof scripts, the attack files,
the routes and the route guard). A path-filtered workflow that does not fire never reports a status, and a required check
that never reports blocks the merge forever; a job skipped at job level reports skipped, which satisfies branch protection.
So a PR that touches none of the inputs skips the whole job. A PR that does touch one (including an `APPLIED-MAP.json`
edit) runs the proof. The check is required in the branch protection list; that is a repository setting the executor maintains.

**Runtime.** Skipped path: nothing is billed for the job. Stack path: dominated by the Supabase CLI start (86 s) and the
replay of the applied set (27 s), measured on the 2026-10-11 runs; bounded by the job's 40 minute timeout. The job runs
`npm ci` once because the RLS matrix and the route attacks need the app's dependencies; the replay, preflight and apply
scripts themselves import only Node built-ins and relative modules.

**Shared stack steps.** psql, the Supabase CLI, the empty stack started from a scratch directory holding only
`fsi-app/supabase/config.toml` (so the CLI never applies the migration tree), the loopback-only env file and the preflight
are the composite action `.github/actions/local-stack/action.yml`, used by the `schema` job and by `chain-proof.yml`: one site.

**Reading a failure.** The job summary shows the replay counts and the apply result. A replay failure names the file and
statement as chain-proof's does (runbook 64). An apply failure prints `FAILED <file> line <n>: <message>`, the statement
at that line, and the full psql error text; reproduce it on any local Postgres by running the file with
`psql -v ON_ERROR_STOP=1 --single-transaction -f <file>` after replaying the applied set.

**Tests.** `fsi-app/scripts/proof/migration-proof-workflow.test.mjs` (the schema job's shape: required-check form, no secret,
classifier-scoped, replay before apply, pipefail), `workflow-mutation-attacks.test.mjs` (each property broken on purpose), `apply-pending-migrations.test.mjs` (selection, order, the 299 exclusion
against its real header, one-file-one-run, the stop rule, and a negative fixture in which a CHECK-violating migration fails
the step), `chain-proof-workflow.test.mjs` (the lift into the composite action).
