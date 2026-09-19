# maintenance family

Moved from `CONVENTION.md` (lane N2, 2026-09-19); meaning unchanged from the original prose, em dashes
and section signs replaced per pre-commit rule 022.

`maintenance` (lane M9b, 2026-09-18, closing stage-audit-2026-09-18 `s6-gates-harness.md`'s finding: the
`maintenance.yml` family uploads an ephemeral artifact instead of committing one, every run already wrote
a structured `summary.json` per step, via `scripts/maintenance/lib/cli.mjs`'s shared `runCli`, but only as
a 90-day GitHub Actions upload-artifact, never git history a proposer lane could read), registered over
`.github/workflows/maintenance.yml` itself (the 62-step MAINT orchestrator, dispatch-only, `mode` dry|apply
per step) and `scripts/maintenance/lib/cli.mjs` (the shared `--mode`/`--arg`/`--out` CLI bootstrap and
`summary.json` contract every wrapper's `main(opts, deps)` writes through): an eleventh shape, whose "runs"
are one maintenance dispatch, a single named step, or every step fanned out dry-only under `step=all`,
never a mint, a screen round, a fetch-drain replay, an enumeration walk, a ledger consume, a
change-detection chain, a propagation drain, a corpus turn, nor a brief-apply batch. Unlike every family
above except `corpus-turn`, `maintenance` has no single canonical `run-*.mjs` entry point (each step is its
own `scripts/maintenance/<step>.mjs` wrapper, or the `./.github/actions/maintenance-step` composite action),
the governing files are the orchestrator itself and the one module every wrapper's CLI shape is built on,
the same "orchestrator file is the governing file" call `corpus-turn`'s own entry makes for
`.github/workflows/corpus-turn.yml`. `scripts/harness-runs/maintenance/PENDING-RUN.md` records why this
family starts at zero artifacts (registered ahead of the coordinator's next live dispatch, the same posture
`ledger-consume`, `corpus-turn` and `brief-apply` recorded at their own registration).

**maintenance's standing metric** (build plan S2's "measurement, not assertion," per family): *steps run
clean per dispatch*, of the steps a run actually executed (one named step, or every step under `step=all`
dry fan-out), how many wrote a `summary.json` with no nonzero `exitCode` (`steps_with_summary` minus
`steps_nonzero_exit` in the artifact's own `metrics`), the maintenance-family counterpart to
`ledger-consume`'s disposition-mix-per-run: a proposer pass reading this family's history sees which of the
62 registered steps are actually landing clean on a given dispatch, never only that the workflow itself ran.
