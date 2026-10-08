## Change

Lane PROOF-1 registered a new harness family, `chain-proof`
(`fsi-app/scripts/harness-runs/chain-proof/family.json`, 2026-10-07). Adding any family descriptor is itself a
change to one of the meta-harness family's own governing files, since `ALLOWED_FAMILIES` and `GOVERNING_FILES` are
derived from every descriptor (family-registry.mjs's own header, "the loop applies to itself"). The new family
carries its own pending file (`chain-proof/pending/2026-10-07-proof1-stack-and-replay.md`); this file is the
meta-harness family's acknowledgment of the registration, per F28's RANGE rule.

## Planned run

The meta-harness family's own next run (whichever lane or coordinator pass next touches the meta-harness
substrate itself, for example a future family registration or a `run-artifact.mjs` change). Delete this file once
that run's artifact lands, or sooner if the coordinator judges the registration already covered.
