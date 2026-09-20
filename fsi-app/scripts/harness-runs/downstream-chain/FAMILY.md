# downstream-chain family

Registered by lane M3, 2026-09-19 (build plan section 6.1 row M3, the loop-manifest's own
`population-turn-to-downstream-chain` and `corpus-turn-to-downstream-chain` hops, both `familyPending:
true` before this lane).

`.github/workflows/downstream-chain.yml` (dated 2026-09-06 in its own header, lane CHAIN) is the shared
closer for the two mint-side workflows: it re-runs `tier-opinions`, `derive-obligations`, `tag-proposals`
and `apply-classifications` (all four genuinely whole-corpus / idempotent) after `population-turn.yml` or
`corpus-turn.yml` completes with real work, then chains into `propagation-drain.yml`. The edge was already
wired both directions (confirmed by reading the file, 2026-09-18); what this family closes is the
committed-artifact half: before this lane, every run's outcome was the `maintenance` family's own posture,
a GitHub Actions ephemeral `upload-artifact` only (this workflow's own header, "ARTIFACT" section) --
`scripts/harness-runs/` had no `downstream-chain/` directory and no `ALLOWED_FAMILIES` entry, so a proposer
lane reading harness history saw nothing for this hop even after it fired for real.

Unlike every family with a canonical `run-*.mjs` entry point, `downstream-chain` has none of its own: the
workflow itself is the orchestrator, and the four scripts it chains (`tier-opinions.mjs`,
`derive-obligations.mjs`, `tag-proposals.mjs`, `apply-classifications.mjs`) are none of them a registered
harness family in their own right (matching the identical fact this workflow's own header states for
itself). The governing files are the workflow (whose resolve/gate step and artifact-writer step define
what a downstream-chain run is) and the shared composite action every one of its four steps calls
(`.github/actions/maintenance-step/action.yml`), the same "orchestrator file is the governing file"
convention `corpus-turn` and `maintenance` each already use for themselves.

`scripts/harness-runs/downstream-chain/pending/2026-09-19-m3.md` records why this family starts at zero
artifacts (registered ahead of the coordinator's next live dispatch, the same posture `ledger-consume`,
`corpus-turn`, `brief-apply` and `maintenance` each recorded at their own registration).

**downstream-chain's standing metric** (build plan section 2's "measurement, not assertion," per family):
*derivations re-run clean per dispatch*, of the four steps a run actually executed (`tier-opinions`,
`derive-obligations`, `tag-proposals`, `apply-classifications`), how many wrote a `summary.json` with no
nonzero `exitCode` (the same `steps_with_summary` / `steps_nonzero_exit` shape the `maintenance` family's
own metrics use, since both read the identical composite-action contract) -- a proposer pass reading this
family's history sees which of the four whole-corpus derivations are landing clean on a given chained
firing, never only that the workflow itself ran.
