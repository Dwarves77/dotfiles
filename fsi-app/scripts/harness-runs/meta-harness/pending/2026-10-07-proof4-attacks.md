## Change

Lane PROOF-4 (2026-10-07) added `scripts/proof/attacks/run-attacks.mjs` and `scripts/proof/attacks/attacks.json` to the
`chain-proof` family's `governing_files` in `fsi-app/scripts/harness-runs/chain-proof/family.json`. A family descriptor
is itself a meta-harness governing file, so this file is the meta-harness family's acknowledgment of that edit (F28's
range rule), the same shape the PROOF-1 registration used.

## Planned run

The meta-harness family's own next run, whichever lane or coordinator pass next touches the meta-harness substrate.
Delete this file once that run's artifact lands.
