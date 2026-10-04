## 33. `tier-opinions` / `derive-obligations` / `tag-proposals` / `apply-classifications` - also chained automatically

**Lane CHAIN, 2026-09-06** (audit loop finding 5 / plan section 1 "the loop as one unit" / rule 17). These four
steps (section 2, section 4b, section 6a, section 17 above) now run TWICE over, by design: by hand from THIS workflow (as documented
in their own sections above, unchanged), and automatically, in that exact order, from
`.github/workflows/downstream-chain.yml` - a `workflow_run` chain off `["Population turn", "Corpus
turn"]` completing with real work done (see that file's own header for the exact gate: `metrics.minted >
0` for population-turn, `metrics.tickets_selected > 0` for corpus-turn, both read off the triggering
run's own committed artifact, never assumed from `conclusion` alone). This closes the gap this runbook's
own section 1 named for the first time: population-turn.yml's mandatory flywheel step already runs
`derive-obligations`/`tag-proposals` for a mint's own item ids, and corpus-turn.yml never ran any of the
four - a mint or a turn used to end there. `downstream-chain.yml` calls the SAME
`fsi-app/scripts/maintenance/<step>.mjs --mode --arg --out` invocation this workflow's own steps do,
through `./.github/actions/maintenance-step` (a shared composite action - no second copy of the `run:`
line in two workflow files). It always runs `mode=apply` on a real chain (never a partial "some steps"
apply - all four, in order, or none, per the gate).

Re-running these four after a sibling pass already covered part of the same ground is deliberate, not
wasted work: all four are whole-corpus / append-or-merge-on-identity idempotent (section 2/section 4b/section 6a/section 17's own
Idempotency notes), so a chained re-run finds nothing new to write for rows a prior pass already
resolved, and finds real new work for rows it didn't (corpus-turn's own scope, which population-turn's
flywheel never touches; new tag-proposal/classification candidates a later item's mint or turn made
newly detectable).

See `docs/runbooks/PROPAGATION-DRAIN-RUNBOOK.md` for the full workflow → trigger → gate → next table
covering this hop plus every other hop in the loop (source-sweep → ledger-consume → population-turn →
downstream-chain → propagation-drain, and corpus-turn → downstream-chain → propagation-drain).

**First dispatch (coordinator, to close the closure-gate's NEVER-RUN grace window and prove the chain
live end to end):** dispatch `source-sweep.yml` with `walker=sitemap mode=dry check_coverage=true` first
to confirm live secrets/wiring cheaply, then a real chain-exercising sequence - e.g. `ledger-consume.yml`
`mode=plan` (a `workflow_dispatch` plan run, to confirm candidates exist) followed by
`population-turn.yml` `mode=apply limit=<small>` dispatched by hand (or let a prior `ledger-consume`
`mode=apply` run with `promoted > 0` chain into it automatically) - a population-turn run that mints
`metrics.minted > 0` is the artifact `downstream-chain.yml`'s own gate reads. Expected artifacts, in
order: `population-turn` run's own `population/<run_id>` branch carrying its enriched `mint-run-NNN.json`
(section 9 outcomes already written by the mandatory flywheel step) → a NEW `downstream-chain.yml` Actions run,
triggered automatically, its own `downstream-chain-<run_id>` GitHub Actions artifact (four `summary.json`
files) → a NEW `propagation-drain.yml` Actions run, triggered automatically off that, its own
`propagation/<run_id>` branch carrying `scripts/harness-runs/propagation/propagation-run-NNN.json`. Record
each run's id in `docs/ops/dispatch-ledger.jsonl` (`{"workflow":"downstream-chain", ...}`) once it lands -
`.discipline/governance/closure-gate.mjs`'s NEVER-RUN check reads exactly that ledger for
`workflow:downstream-chain.yml`'s own dispatch evidence (a 3-train grace period applies from this lane's
own train; see that file's own `gatherNeverRunTargets`).

---

