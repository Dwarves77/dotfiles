## Skill

remediation-discipline

## Change

This range changes `fsi-app/.claude/skills/remediation-discipline/SKILL.md`: adds a new category,
"Section 4 - category 54: workflow_run chains are checked against GitHub's own documented 3-level
limit, not assumed reliable at any depth", documenting the lane LOOP-B-FIRING finding (decision
propagation never fired autonomously because the downstream-chain-to-propagation-drain hop sits at
workflow_run chain depth 4, past GitHub's documented 3-level limit) and its class fix (the
`workflow-run-depth.mjs` depth model, fitness function F60, and an explicit `gh workflow run` dispatch
fallback for any hop past the limit). No existing category, rule or threshold in this skill was
changed; the new category is additive, inserted immediately before Section 9. Registers invariant
RD-86 (`fsi-app/.discipline/governance/invariants.d/RD-86-workflow-run-chain-depth.mjs`),
`enforcedBy: fitness:F60` plus its two selftest files, `anchor` a verbatim quote of the new category's
bold binding statement.

## Citing files reviewed

No new file cites `remediation-discipline` as a `GOVERNING SKILL(S)` in this range; the new fitness
function (`F60-workflow-run-chain-depth.mjs`) and pure module (`workflow-run-depth.mjs`) are
discipline-engine internals, not consumers of this skill's doctrine, so they carry no such citation.
The new category text itself was checked against the class-over-instance recognition criteria
(Section 3): signal 2 fires (infrastructure-variation the platform must absorb, a GitHub Actions
platform limit, not a repo-local wiring defect) and signal 4 fires (reinventing-the-wheel: any future
lane adding a workflow_run hop would re-derive the same depth math and re-discover the same silent
failure mode by hand): 2+ signals, class confirmed, matching the threshold rule Section 3 states.
