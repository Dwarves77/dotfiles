# 2026-09-28: Lane STATUTORY-WRITER

## Dispatch and ruling context

Coordinator dispatch: build the producer that writes `statutory_computations` (the "statutory writer"),
fixtures-first, dry mode; its downstream per the flywheel (rule 17); a harness record
(`fsi-app/scripts/lib/record-harness-run.mjs`). R14 (2026-09-25/26): no live site-data writes this build
phase, SELECT-only; this lane made none. Rule 17 (CLAUDE.md): "a mint is not done until the flywheel has
connected it... and the harness has recorded the outcome in the run's own artifact."

## Investigation first (per the lane-common-contract prior-art rule)

Before writing anything, searched for prior art: the statutory writer **already exists** and is **already
product-reachable**, contrary to the dispatch's implicit premise that it needed to be built from scratch.

- `fsi-app/scripts/propagation/write-statutory.mjs` (lane DAG-AUTHOR, 2026-09-04): the FuelEU Annex IV
  penalty writer, rows-file-driven (no live source table exists for ship-level GHG/energy figures --
  checked live by that lane, cited in its own header).
- `fsi-app/src/lib/propagation/statutory-rows.ts` (lane M7a FIX, 2026-09-21): the ONE pure home for row
  parsing/validation/write, imported by both the CLI and the admin route (moved out of the route's import
  graph after a 252.76 MB Vercel function-size incident traced to db.mjs's fs-backed snapshot path).
- `POST /api/admin/statutory-rows` (lane M7a, 2026-09-20/21, PR #765): the product-reachable path
  `docs/plans/data-machine-tool-gaps-2026-09-25.md`'s M7 row asks for ("spec-09 upload flow reused").
  Already gated by `requireAdminRoute`, already mode=dry/apply, already validated against
  `PLACEHOLDER_MARKERS` before any apply.
- Migration 286 (`statutory_and_estimates.sql`): schema, uniqueness, `assert_statutory_purity()` trigger,
  RLS. Applied live 2026-09-02.

**What was actually missing**, matching the tool-gaps register's own M7 characterization more precisely
than its "partial, input path" framing: **no harness family, no run artifact, no `harness_runs` record**
for either invocation path. Confirmed by `git grep -n "record-harness-run\|harness_runs" --
write-statutory.mjs statutory-rows.ts route.ts logic.mjs` returning nothing. This is the rule-17 gap the
dispatch actually names ("harness record").

**Downstream (rule 17's first half): already wired, DB-native, cited not re-implemented.**
`statutory_computations` is deliberately TERMINAL in the derivation DAG -- migration 285's
`derivation_edges_from_table_allowed` CHECK lists it as an allowed `from_table`, but migration 286's own
header and self-check state explicitly that a `statutory_computations` row is **never** a `to_value_id`
("a published statutory figure is the strongest class... never an input to anything else"). So this
writer must NOT call `author-edges.mjs` the way the M5 regional producers do -- that would defeat the
purity isolation `F32-statutory-purity.mjs` and `assert_statutory_purity()` exist to enforce. The
downstream connection statutory_computations DOES have is migration 286's own
`propagation_outbox_trg` (`AFTER INSERT OR UPDATE OR DELETE ON public.statutory_computations`), the same
outbox trigger `derived_values` uses: a real `--apply` INSERT already emits its own `propagation_events`
row automatically, no JS-side call needed. Read from the migration files, not re-verified live (no DB
credentials in this worktree; R14 holds the actual write regardless).

## What was built

1. `fsi-app/scripts/harness-runs/statutory/family.json`: new harness family `statutory`, governing files
   `write-statutory.mjs`, `statutory-rows.ts`, `validate-statutory-rows-file.mjs`.
2. `fsi-app/scripts/propagation/write-statutory.mjs`: extracted a new `runWriter({mode, rawRows}, deps)`
   orchestration function (deps: `sb`, `readAllFn`, `writeOneRowFn`, `recordHarnessRunFn`, `familyDir`,
   `now`, `trigger`, all overridable for tests) that runs the existing row loop, THEN writes this family's
   own run artifact (`writeRunArtifact`/`buildRunArtifactEnvelope`/`claimRunId`/`hashHarnessVersion`, the
   same primitives `plan-quarantine-disposition.mjs` uses) and best-effort records it to `harness_runs` via
   a freshly-built write-capable client (never the guard-wrapped `readClient()` proxy, which throws on
   `.insert` by design -- same distinction the quarantine planner's own header documents). Added
   `nextRunNumberFromHarnessRuns` (same logic as the quarantine planner's own helper; a small duplicate
   rather than a cross-script import, since the two scripts have unrelated dependency trees). `main()` now
   calls `runWriter` instead of looping inline; CLI behavior (args, exit codes, --dry default) unchanged.
3. `fsi-app/scripts/propagation/write-statutory.test.mjs`: 5 new tests proving the full flow end to end
   with injected fakes (fake `sb`, fake `readAllFn`, tmp `familyDir`, `recordHarnessRunFn` override) --
   dry-mode artifact + harness record; apply-mode structural refusal still records; run-id numbering reads
   `harness_runs`, not always `-001`; a `record-harness-run` failure is caught, never thrown, and the
   artifact on disk survives it regardless.

No change to `statutory-rows.ts` or the admin route: harness-run recording is fs-backed by design
(`writeRunArtifact` writes JSON to disk), and the M7a incident above is exactly why fs-backed logic must
stay out of the Next.js route's import graph. The CLI is the correct, and only, place for this.

## Test what you built: real local end-to-end dry run

No DB credentials exist in this worktree (lane-common-contract, by design). Proved the full flow with
`node --test` against injected fakes instead (same substitution the QUARANTINE-DISPOSITION lane used
earlier today for the identical constraint):

- `runWriter` (dry, fixture row from `goodRow()`): writes a real JSON artifact to a tmp dir
  (`statutory-run-001`, `harness_family=statutory`, `config.mode=dry`, `config.r14_live_write_held=false`,
  `per_item=[{outcome:"would-write"}]`), calls `recordHarnessRunFn` exactly once with that artifact.
- `runWriter` (apply, structural refusal): still writes an artifact and records it
  (`r14_live_write_held=true` for the not-attempted write); no `statutory_computations` write path
  reached, consistent with the row failing `parseRow` before `writeOneRow` is ever called.
- Run-id numbering reads current `harness_runs` state (`statutory-run-003` when rows `-001`/`-002`
  already exist), matching `plan-quarantine-disposition.mjs`'s own convention exactly.
- A `record-harness-run` failure is caught and reported in `r.harnessRunRow`, never thrown; the artifact
  file on disk is unaffected (best-effort, per `record-harness-run.mjs`'s own header).

Confirmed the CLI's own no-cred self-skip still holds unchanged: `node scripts/propagation/
write-statutory.mjs --rows-file scripts/propagation/fixtures/fueleu-annex-i-iv-statutory-constants-
2026-09-06.json` -> `write-statutory: no DB creds, cannot run here (exit 2).`

No live `statutory_computations` row was written or attempted against any real database this session
(R14, SELECT-only, and no credentials exist in this worktree regardless).

## Gates run

- `bash .discipline/run-test-suite.sh`: 1805 tests, 1801 pass, 4 skip (no-cred self-skip), 0 fail.
- `npx tsc --noEmit`: clean.
- `node .discipline/fitness/runner.mjs`: PENDING/see below.
- No `.tsx`/`.css` touched; UX contract and rendering guard not applicable.

## Open items

- The dispatch's premise ("build the producer") was largely already satisfied; this lane's actual
  contribution is the harness-record half of rule 17 plus documenting (not rebuilding) the already-DB-
  native downstream. Worth a note back to whoever maintains `docs/plans/data-machine-tool-gaps-2026-09-25.md`'s
  M7 row: its "partial... input path" framing should be corrected to "input path built and
  product-reachable since lane M7a (PR #765); harness record was the actual gap, closed this lane."
- A genuine `--apply` write against the live DB (a real, reviewed, non-fixture rows-file) is still a live
  data write held under R14, unchanged by this lane.
- The DB-native downstream claim (outbox trigger fires `propagation_events` on a real
  `statutory_computations` INSERT) is read from migration 286's text, not re-verified live this session
  (no credentials); labeled `[HYPOTHESIS]` in the code comment for that reason, though the migration's own
  self-check block already exercises the trigger path as part of its own apply-time proof.
