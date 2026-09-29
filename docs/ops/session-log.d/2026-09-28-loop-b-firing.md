# 2026-09-28: Lane LOOP-B-FIRING

## Task

Find exactly why decision propagation (spec 08 Loop B) has never fired autonomously from its
upstream; wire the chained trigger per the existing hop pattern; make loop-hops 07/08
(`downstream-chain-to-propagation-drain`, `data-producers-to-propagation-drain`) provable; prove the
drain runs end to end locally in dry mode. No push, no workflow dispatch (CI-parity fix pending, per
coordinator).

## Diagnosis (CONFIRMED by `gh run list` / `gh api .../actions/runs/{id}` read back for all 9
propagation-drain runs and every relevant upstream run, this session)

The `workflow_run` edge is correctly wired and has been since 2026-09-06 (commit b3504d1):
`propagation-drain.yml`'s `on.workflow_run.workflows` names `["Data producers", "Downstream
chain"]`, both names match their producer `.yml` files' `name:` field exactly, and the edge was
live on `master` well before every run examined below.

Read back every propagation-drain run on record (9 total, `gh api
repos/Dwarves77/dotfiles/actions/workflows/348356629/runs`) and, for each `workflow_run`-triggered
one, the exact upstream run its own "Resolve run parameters" step logged
(`UPSTREAM_NAME`/`UPSTREAM_RUN_ID`/`UPSTREAM_CONCLUSION`, read from `gh run view <id> --log`):

- Run 33989162904 (2026-09-05): fired from producers run 33989121767, a plain `workflow_dispatch` (hand).
- Run 34078881801 (2026-09-07): fired from downstream-chain run 34078833140, a plain `workflow_dispatch` (hand).

Those are the *only two* workflow_run-triggered firings propagation-drain has ever recorded. No
firing on record traces to an immediate upstream that was itself reached purely by chaining.

Direct counter-evidence that the edge nonetheless silently fails at that depth: downstream-chain
run 34747128614 (2026-09-13T08:12:57Z) was **itself** `workflow_run`-triggered (off a population-turn
completion, confirmed via its own log: `UPSTREAM_NAME="Population turn"`,
`UPSTREAM_RUN_ID=34747109487`, `UPSTREAM_CONCLUSION="success"`), ran on `master`, job `chain`
completed with `conclusion: "success"`. `propagation-drain.yml`'s workflow (id 348356629) recorded
**zero** runs in the following hour: `gh run list --created 2026-09-13` shows no "Propagation
drain" entry anywhere near 08:12 to 08:23 that day, though 20+ unrelated workflow runs fired in
that same window (proving the polling/listing itself wasn't the gap).

By contrast, the shallower hop one level up (source-sweep to ledger-consume to population-turn,
depth 2, and ledger-consume to population-turn to downstream-chain, depth 3) DOES fire reliably
from a chained (non-hand) upstream: population-turn run 34747109487 above was itself triggered by
a `workflow_run`-chained (not hand-dispatched) ledger-consume run.

**HYPOTHESIS**, not decisively isolated: an undocumented GitHub Actions reliability gap specific
to `workflow_run` chains at this hop's depth (evidenced: the depth-3 hop fires from a chained
upstream; the depth-4 hop, downstream-chain to propagation-drain, does not, in the only 2 samples
on record). Cannot be tested further without dispatching workflows on GitHub, held per the
coordinator's CI-parity instruction. Recorded as a hypothesis, not asserted as fixed or as GitHub's
documented behavior.

## What was built

`fsi-app/scripts/turns/run-propagation-drain.mjs`: added the top-level `trigger` field
(`"workflow_run"` | `"workflow_dispatch"`) the loop-wiring gate F50
(`.discipline/fitness/functions/F50-loop-wiring.mjs`) reads to prove a hop fired autonomously.
Mirrors the field `emit-gate-a-rescan-artifact.mjs` already carries for the gate-a-rescan family,
and the generic support already present in `scripts/lib/run-artifact.mjs`'s `TRIGGER_VALUES`. No
new CLI flag: derived purely from `--trigger-context`'s presence via a new pure, tested helper
`resolveArtifactTrigger(triggerContext)`. `propagation-drain.yml`'s own "Resolve run parameters"
step only ever passes `--trigger-context` on a chained `workflow_run` dispatch, never on
`workflow_dispatch`, so that presence already is the trigger kind; no second source of truth, no
yml change needed.

Added 2 unit tests (`run-propagation-drain.test.mjs`); full suite 20/20 green.

## Proof: real local dry run, end to end

`node scripts/turns/run-propagation-drain.mjs --mode dry --batch 50` against the real Supabase
project (service-role creds from the main checkout's untracked `.env.local`, copied into the
worktree for this run only, then removed, never committed). SELECT/RPC-only per R14 (`mode: dry`
equals `invalidate_dependents(p_apply=false)`, counts only, confirmed nothing written): queue depth
776, 50 events considered, 0 invalidated/recomputed/errors. Landed
`scripts/harness-runs/propagation/propagation-run-010.json` plus
`traces/propagation-run-010.report.json`, `trigger: "workflow_dispatch"` (correct for a local hand
run). `validateRunArtifact`, F28 (harness-run-integrity), and F50 (loop-wiring) all pass clean
against it.

## Flags found and fixed in the same motion (rule 13)

Two stale `pending/` files under `scripts/harness-runs/propagation/pending/`
(`2026-09-19-n3-migrated.md`, `2026-09-20-m3b.md`) each said "delete this file the moment
propagation-run-010 lands", deleted with this run. `LAST-PROPOSER-PASS.md` updated with a new
proposer pass entry for run-009 (F28 rule (d): the file must name the latest artifact verbatim).

## Loop-hops manifest updates

`fsi-app/.discipline/governance/loop-hops.d/07-downstream-chain-to-propagation-drain.json` and
`08-data-producers-to-propagation-drain.json`: notes rewritten with the diagnosis above.
`enforceEdge` stays `true` (confirmed live). `enforceFired` stays `false`: no artifact on record
yet carries `trigger:"workflow_run"`; this lane does not claim the hop has fired, only that it is
now mechanically provable the moment a real one does (per the coordinator's explicit instruction:
enforceFired proof comes after the push hold lifts and a real dispatch runs).

## Not done / deferred to the coordinator

- No workflow dispatched, nothing pushed (hard rule, CI-parity fix pending).
- The deep-`workflow_run`-chain hypothesis is not resolved. Proposal for next cycle: once dispatch
  is authorized, hand-dispatch `downstream-chain.yml` once (not population-turn/corpus-turn) to
  produce a second hop-08-shape sample, and separately hand-dispatch `population-turn.yml` to see
  whether repeating the depth-3 chained-firing pattern is consistent, before proposing a structural
  fix (e.g. an explicit API re-dispatch step as a `workflow_run` fallback) if the platform gap is
  confirmed at this specific depth.

## Verification run

- `node --test scripts/turns/run-propagation-drain.test.mjs`: 20/20 pass.
- `node --test .discipline/governance/loop-manifest.test.mjs .discipline/fitness/functions/F50-loop-wiring.test.mjs scripts/lib/run-artifact.test.mjs`: 106/106 pass.
- F28 (harness-run-integrity), F50 (loop-wiring): both clean, direct invocation.
- Real local dry run against live Supabase (SELECT/RPC-only, R14-compliant), see above.

Committed locally on `lane/loop-b-firing` in worktree `.claude/worktrees/loop-b-firing`. Not
pushed.
