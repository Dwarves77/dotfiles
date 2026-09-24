## Skill

remediation-discipline

## Change

File changed: `fsi-app/.claude/skills/remediation-discipline/SKILL.md`.

Added Section 4, category 51 ("no title renders narrower than its longest word, and no title is
measured on a fallback face"), documenting the RD-82 class fix this lane built: the shared Masthead's
viewport-keyed 1440 grid collapsed the auth frame's title track to 0px, and no guard rule measured a
title against its own words. The new category records the cause, why each existing gate missed it,
the shared detector (layout-guard L13 plus the auth page leg), the visibility-test correction found
on the rule's first run, and the `verifyFontsLoaded` precondition. It is the anchor text
`fsi-app/.discipline/governance/invariants.d/RD-82.mjs` cites verbatim. No existing category text was
changed.

## Citing files reviewed

Per skill-contract-map.mjs's own convention (citing files = files matching a `GOVERNING SKILL(S):`
marker for this skill under CITATION_SCAN_ROOTS, `fsi-app/src` and `fsi-app/scripts`):
`git grep -ln "GOVERNING SKILL" -- fsi-app/src fsi-app/scripts | xargs grep -l "remediation-discipline"`
from the worktree root names:

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

None of these 27 files changed in this lane's range. The addition is a new, append-only category
with its own heading; it does not alter or retire any existing category's text, numbering, or
cross-reference, so no citing file's dependency on prior content is affected.

Also reviewed directly (load-bearing for this change):

- `fsi-app/.discipline/governance/invariants.d/RD-82.mjs`, whose `anchor` field is the exact new
  heading text.
