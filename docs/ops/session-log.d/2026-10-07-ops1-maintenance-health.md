# Lane OPS-1 (ops1-maintenance-health), 2026-10-07

Source: chain-fire report 2026-10-06, sections 8 and 9 (F-RED-1, F-RED-2, F7).

## Accomplished (each confirmed by a test run in this worktree)

- `step=all` skips a step that needs an input. `scripts/maintenance/lib/cli.mjs` gains `REQUIRES_ARG`
  (`attach-found-sources`, `reopen-validation-holds`) and the pure `fanoutSkipSummary`; `runCli` uses it before the
  credential check, so under `RUN_STEP=all` with no `--arg` the step logs "skipped in step=all fan-out: <reason>",
  writes `skipped: true` to summary.json and exits 0. A named dispatch is unchanged. `all` lives in
  `maintenance.yml` (per-step `if:` lines), which is NOT edited: the workflow already exports `RUN_STEP`.
  Test: `scripts/maintenance/lib/cli.test.mjs` (6 tests incl. a spawned real wrapper with no DB credentials).
- Gate A gauges are never null. New `src/lib/health/gate-a-gauges.mjs`: `readGateAHealth` shapes the
  `gate_a_health()` RPC result into five gauges `{value, state, computed_at, reason}` with state `computed`,
  `not_computed` (cache empty or past its 30 minute TTL, reason names the age) or `unreadable` (RPC error, throw,
  unrecognised error text, malformed value). `decideGateAProbe` fails on `unreadable` or a computed alarm above 0
  and passes `not_computed` with a warning line naming the age. `src/app/api/health/surfaces/route.ts` calls it.
  `scripts/health/gate-a-probe.mjs` runs the decision; `.github/workflows/uptime-probes.yml` (the probe lives inline
  in that file) now sparse-checks-out those files and calls the script instead of inline jq/case shell.
  Test: `src/lib/health/gate-a-gauges.test.mjs` (12 tests: endpoint shape for five RPC outcomes, probe decisions,
  three attack tests proving an unreadable gauge, a computed alarm, an old bare-null shape and a string value still fail).
- Also fixed in passing, same code: the route did `gate_a = {...data, error: null}`, which erased the cache's own
  stale/empty message and left the fields undefined; that is why the probe saw bare nulls with no reason.
- Research walker names its run kind. `research-walker.mjs`: `describeRunKind`, `buildWalkerConfig`; the dry
  fixture path logs "FIXTURE RUN: no live corpus; counts are fixture counts" and writes `run_mode: fixture` plus the
  banner into the artifact config, `metrics.run_mode` and proposer_notes. `--live --holdings-needs` records
  `run_mode: live_search`. `config.mode` keeps meaning dry/apply (read by `assemble-train.mjs` and the harness ledger
  export), so the brief's `mode: fixture` is carried as `run_mode`. Test: 3 added tests in `research-walker.test.mjs`.
- F28 pending markers: `maintenance` and `research-walker` (both `2026-10-07-ops1-maintenance-health.md`). No other
  family lists a touched file as governing (grep of every `family.json`).

## Read and reused

Read in full: both briefs, the chain-fire report, `refetch-capped.mjs` and `.test.mjs`, `refetch-capped-worklist.mjs`,
`lib/cli.mjs`, the paged reader in `scripts/lib/db.mjs` (`readAll`) and `src/lib/db/paginate.mjs`, the health route,
`surface-health.mjs`, migrations 226, 256 and 322, `uptime-probes.yml`, `research-walker.mjs`, `research-walker.yml`.
Reused: `runCli`'s existing exit/summary contract, the existing `gate_a_health()` RPC and cache (no migration),
`isMainModule`, the walker's existing artifact builder.

## Decisions

- Gate A gauges are NOT computed on request. Threshold: a gauge may run on request only if it is an indexed count
  that decompresses no stored text. `verified_failing_revalidation` calls `validate_item_provenance` per verified
  item (reads each item's `agent_run_searches.result_content` pool) and `briefless_verified` filters
  `coalesce(full_brief,'')` over the verified set; migration 322's header records that read shape as 23 and 26
  second scans and a three and a half hour database hang. All five gauges are one SQL function, so they cannot be
  split without a migration. Cost was assessed by reading the committed SQL, NOT timed (no live database in this lane).
  Live table sizes: the 2026-10-04 inventory in the repo carries none; the only recorded size is migration 322's
  2026-09-16 figure, agent_run_searches 6,393 rows, 245 MB total, 239 MB TOAST.

## NOT done

- F-RED-1 root cause fix (statement timeout). Root cause [CONFIRMED by reading the code]: the failing read is
  `buildWorklist` in `scripts/remediation/refetch-capped-worklist.mjs` (the script `refetch-capped.mjs` wraps), a
  `readAll` of `agent_run_searches` selecting `result_content` (up to 600,000 chars per row, 239 MB TOAST in the
  table) in 1000-row pages just to compute `.length` client side; page 1 decompresses tens of MB and times out.
  That file and its test are outside this lane's write set: NEEDS WRITE-SET EXPANSION (see the report for the
  staged patch). Nothing was changed there.
- Live timing of any of this: confirmed after merge by the coordinator's executor.
