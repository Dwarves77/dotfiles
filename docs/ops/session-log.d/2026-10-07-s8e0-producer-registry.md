# 2026-10-07 lane S8-E0 (s8e0-producer-registry): producers register from an entry directory

## Accomplished

- `fsi-app/scripts/producers/registry/` is an entry directory, one JSON file per producer (name, script,
  domain_table, source, licence, dry_capable, enabled_env, in_all; optional args and a pre fetch stage).
  The four existing producers moved in with no behaviour change: `ecb-fx`, `eia-v2-petroleum-spot`,
  `eu-weekly-oil-bulletin` (with its `fetch-oil-bulletin.mjs` pre stage and `--since`), and
  `sbti-target-dashboard` (`in_all: false`, as before: name-only because its `--apply` is licence-refused).
- `load-registry.mjs` validates every entry (unknown field, missing field, filename must equal name,
  `dry_capable` must be true, script under `scripts/producers/` or `scripts/gen/` and on disk, no
  `--apply` in args) and selects runs; `run-registered.mjs` is the CLI producers.yml now runs.
- `.github/workflows/producers.yml`: the four hand steps are replaced by one "Registry producers" step. The
  `producer` choice gains `registry`, the four names leave the list, and a `registry_producer` string input
  names one entry. `producer=all` still runs every `in_all` entry.
- `fsi-app/.discipline/fitness/functions/F51-no-shared-append.mjs`: one line added to `ENTRY_DIRS`.
- F28: `scripts/harness-runs/producers/pending/2026-10-07-s8e0.md` (producers.yml is a governing file).

## Read and reused

- Read: CLAUDE.md, lane-common-contract.md, producers.yml in full, F51's entry-dir logic and
  `origin/lane/rules1-gate-precision` (PR 977, unmerged) diff of F51, F25 dispatch-root sources, F27's
  entry-point definition, `producer-summary-wiring.test.mjs`, the producers family (`family.json`,
  `FAMILY.md`, pending markers), `loadLoopHops` in `loop-manifest.mjs`, the four producers' headers,
  `source-licence.mjs`.
- Reused: the F51 entry-dir pattern and the `loadLoopHops` validate-a-directory shape; `isMainModule`
  (`scripts/lib/is-main.mjs`); the existing producers and their kill-switch env vars untouched; the
  existing `PRODUCER_SUMMARY_DIR` hand-off (children inherit the environment).

## Decisions

- Entry fields beyond the brief's list (`enabled_env`, `in_all`, optional `args` and `pre`) are what makes
  "no behaviour change" expressible: the oil bulletin needs its fetch stage and `--since`, SBTi must stay out
  of the `all` sweep, and each producer's runtime kill switch must still be set for its child.
- Dispatch syntax for the four moved producers changes from `-f producer=<name>` to
  `-f producer=registry -f registry_producer=<name>`. GitHub choice inputs cannot be dynamic, so keeping the
  names would have kept a hand list in producers.yml.
- `EIA_API_KEY` is passed in the registry step's env (it was in the removed EIA step's env).

## NOT done (NEEDS WRITE-SET EXPANSION, patches staged outside the repo)

- `fsi-app/scripts/producers/lib/producer-summary-wiring.test.mjs` asserts the exact list of scripts
  producers.yml runs with `--apply`; the four moved scripts no longer appear there, so it is red until its
  expected list drops them and a registry-driven check holds them to the same import rule.
- `fsi-app/.discipline/fitness/functions/F25-module-liveness.mjs`: the four producer scripts plus
  `fetch-oil-bulletin.mjs` have no workflow path any more, so F25 reports 5 UNWIRED MODULE. A new dispatch
  root source reading the registry entries fixes it.
- `docs/runbooks/eia-api-key-registration.md` lines 66 and 91 carry the old dispatch command.

## Open items

- PR 977 (RULES-1) edits F51 too; re-cut after it merges before pushing.
