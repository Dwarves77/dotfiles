## Change

Lane STATE-COST-PRODUCER registered a new harness family, `state-cost`
(`scripts/harness-runs/state-cost/family.json`). `meta-harness`'s own governing files include every
family's `family.json` descriptor (`governing-files.mjs`'s `deriveGoverningFiles`, "meta-harness watches
every family's own descriptor file too"), so adding this one new descriptor changed one of
`meta-harness`'s own governing files with no new `meta-harness-run-NNN.json` artifact in the same range.

## Planned run

The next meta-harness wave (a proposer pass, a build-plan-section-3 "self-application" run, or the next
lane that lands a `meta-harness-run-NNN.json` artifact) closes this. Delete this file the moment that
artifact lands.
