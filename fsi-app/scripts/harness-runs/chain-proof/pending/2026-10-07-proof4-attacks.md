## Change

Lane PROOF-4 (2026-10-07) built the chain-proof attack suite under `fsi-app/scripts/proof/attacks/`
(`run-attacks.mjs`, `attacks.json`, the attack engine, the script and migration-block runners, the tier-override
attack, the local fixtures). It is the PROOF-4 step of the chain-proof job and writes `attacks-report.json`
(invariant, expected, observed, pass or fail per attack) into the job's output directory. The `chain-proof` family
descriptor (`family.json`) arrives with PR 975 (lane PROOF-1) and is not on master yet, so this marker is inert until
that PR merges. Owed on top of 975: the attack step in `chain-proof.yml` must call
`scripts/proof/attacks/run-attacks.mjs` (975's placeholder names `scripts/proof/attacks.mjs`), and
`scripts/proof/attacks/run-attacks.mjs` plus `scripts/proof/attacks/attacks.json` belong in the family's
`governing_files`.

## Planned run

The coordinator's first dispatch of `chain-proof.yml` after PR 975 and this lane merge (the exact `gh workflow run`
line is in `docs/runbooks/maintenance.d/64-chain-proof.md` on 975). Its run artifact supersedes this marker; delete it
in the change that lands that run. Nothing was fired in this lane.
