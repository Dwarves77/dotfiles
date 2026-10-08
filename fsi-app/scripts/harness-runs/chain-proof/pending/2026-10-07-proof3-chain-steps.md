## Change

Lane PROOF-3 (2026-10-07) pointed the chain step of `.github/workflows/chain-proof.yml` (a governing file of this
family) at `fsi-app/scripts/proof/steps/run-chain-steps.mjs`, the runner that executes the chain's scripts in hop
order in apply mode on the local stack with a read-back assertion after every step. The runner, its manifest
(`chain-steps.json`), the assertion, prepare, verdict-fixture and live-prompt-version modules sit beside it. All
proven on fixtures and stubs only; the workflow has not been fired.

## Planned run

The coordinator's first dispatch of `chain-proof.yml` after PROOF-2 (the subset export and load) is on master. It
uploads `chain-steps-report.json` with the rest of the run directory. This marker is superseded by that run; delete
it in the change that lands it.
The runner, its manifest and the supporting modules are now listed in this family's `family.json` `governing_files` (coordinator ruling on PR 987).
