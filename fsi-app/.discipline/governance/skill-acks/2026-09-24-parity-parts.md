## Skill

remediation-discipline

## Change

File changed: `fsi-app/.claude/skills/remediation-discipline/SKILL.md`.

Added Section 4, category 51 ("the four detail surfaces drifted from the approved artboards on eight
independent axes, each traced to ONE shared part"), documenting the RD-84 class fix this lane built: the
regulation, market, research, and operations detail pages had each drifted from the approved artboards
(`docs/design/handoff-2026-09-07/`) on the same eight axes independently, and the fix attacked the class
cause in the one shared part behind each axis (band-context.tsx, Masthead's actionSlot, ImpactMeter's
variant gate, Absence's default-render, SectionIndex's DOM containment, the rail-vs-main-content
placement of ItemConnectionsCard) rather than patching each of the four surfaces separately. The new
category is the anchor text `fsi-app/.discipline/governance/invariants.d/RD-84.mjs` cites verbatim. No
existing category text was changed.

## Citing files reviewed

Per skill-contract-map.mjs's own convention (citing files = files matching a `GOVERNING SKILL(S):` marker
for this skill under CITATION_SCAN_ROOTS, `fsi-app/src` and `fsi-app/scripts`):
`git grep -rln "GOVERNING SKILL" -- fsi-app/src fsi-app/scripts | xargs grep -l "remediation-discipline"`
from the worktree root names the same 26 files the 2026-09-22-g3 ack already enumerated:

`fsi-app/scripts/audit-skill-conformance.mjs`, `fsi-app/scripts/lib/db.mjs`,
`fsi-app/scripts/lib/deferral.mjs`, `fsi-app/scripts/verify/candidate-dwell-audit.mjs`,
`fsi-app/scripts/verify/canonical-key-uniqueness.mjs`, `fsi-app/scripts/verify/check-vocabulary-drift.mjs`,
`fsi-app/scripts/verify/claims-tier-audit.mjs`, `fsi-app/scripts/verify/column-existence-parity.mjs`,
`fsi-app/scripts/verify/deferral-hygiene-audit.mjs`, `fsi-app/scripts/verify/flag-age-audit.mjs`,
`fsi-app/scripts/verify/layer-c-insert-gate-proof.mjs`, `fsi-app/scripts/verify/no-generic-source-audit.mjs`,
`fsi-app/scripts/verify/one-tier-per-host-audit.mjs`, `fsi-app/scripts/verify/orphan-source-audit.mjs`,
`fsi-app/scripts/verify/pause-flag-guard-proof.mjs`, `fsi-app/scripts/verify/prov-guard-adversarial-audit.mjs`,
`fsi-app/scripts/verify/quarantine-disposition-audit.mjs`, `fsi-app/scripts/verify/remediate-orphan-sources.mjs`,
`fsi-app/scripts/verify/rls-credential-parity.mjs`, `fsi-app/scripts/verify/schema-drift-audit.mjs`,
`fsi-app/scripts/verify/source-link-audit.mjs`, `fsi-app/scripts/verify/spec09-org-rls-adversarial-audit.mjs`,
`fsi-app/scripts/verify/staged-transit-audit.mjs`, `fsi-app/scripts/verify/substrate-agreement-audit.mjs`,
`fsi-app/scripts/verify/surface-visibility-audit.mjs`, `fsi-app/scripts/verify/unregistered-span-host-audit.mjs`,
`fsi-app/src/lib/sources/canonical-fetch-caller-thread.test.mjs`.

None of these 26 files changed in this lane's range (this lane's write set is the four detail surfaces,
their shared parts, and the rendering-guard/fitness proofs). The addition is a new, append-only category
with its own heading; it does not alter or retire any existing category's text, numbering, or
cross-reference, so no citing file's dependency on prior content is affected.

Also reviewed directly (outside the citation-scan mechanism, load-bearing for this change):

- `fsi-app/.discipline/governance/invariants.d/RD-84.mjs`, whose `anchor` field is the exact new heading
  text, verified by `node --test fsi-app/.discipline/governance/invariant-coverage.test.mjs` and
  `node --test fsi-app/.discipline/skill-drift-gate.test.mjs` passing clean after this file and the
  invariant's `enforcedBy` correction (citing the rendering-guard entrypoint, not the smoke module
  directly, per the execution-wiring resolver's surface list) both landed.
