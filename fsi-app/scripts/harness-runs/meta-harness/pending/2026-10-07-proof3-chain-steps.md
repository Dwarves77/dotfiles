## Change

Lane PROOF-3 (2026-10-07) extended the `governing_files` list of the `chain-proof` family
(`fsi-app/scripts/harness-runs/chain-proof/family.json`) with the chain step runner and its modules under
`fsi-app/scripts/proof/steps/`. A family descriptor is one of the meta-harness family's own governing files
(`ALLOWED_FAMILIES` and `GOVERNING_FILES` are derived from every descriptor), so this file is the meta-harness
family's acknowledgment of the edit, per F28's RANGE rule. The chain-proof family carries its own marker
(`chain-proof/pending/2026-10-07-proof3-chain-steps.md`).

## Planned run

The meta-harness family's own next run (whichever lane or coordinator pass next touches the meta-harness
governing files). This marker is superseded by that run; delete it in the change that lands it.
