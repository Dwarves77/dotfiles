## Skill

remediation-discipline

## Change

This range changes `fsi-app/.claude/skills/remediation-discipline/SKILL.md`: adds a new category,
"Section 4 - category 55: a workflow_run-chained firing is never an explicit dispatch, and build mode
forces dry mechanically, not by operator vigilance", documenting the lane CHAINED-DRY-GUARD live
incident (a hand-dispatched Source sweep chained into Ledger consume's own hardcoded chained-apply
step, cancelled by the coordinator by hand) and its class fix (the shared `chained-dry-guard.mjs` gate,
fitness function F61, and the new `"workflow_run_forced_dry"` trigger value threaded through every
family's harness_runs row via the ONE canonical `writeRunArtifact` stamping site). No existing
category, rule or threshold in this skill was changed; the new category is additive, inserted
immediately before Section 9, following the same category-51-and-52 pattern category 54 (this session's
own prior range) already used. Registers invariant RD-87
(`fsi-app/.discipline/governance/invariants.d/RD-87-chained-dry-guard-wired.mjs`),
`enforcedBy: fitness:F61` plus its two selftest files, `anchor` a verbatim quote of the new category's
bold binding statement.

## Citing files reviewed

No new file cites `remediation-discipline` as a `GOVERNING SKILL(S)` in this range; the new fitness
function (`F61-chained-dry-guard-wired.mjs`) and pure module (`scripts/lib/chained-dry-guard.mjs`) are
discipline-engine internals, not consumers of this skill's doctrine, so they carry no such citation. The
new category text was checked against the class-over-instance recognition criteria (Section 3): signal
1 fires (recurrence: the identical latent gap existed in all 8 workflow_run-triggered workflows, not
one) and signal 2 fires (infrastructure-variation the platform must absorb: a build-mode invariant that
must hold regardless of which family's runner is chaining, not a one-off script bug); 2+ signals, class
confirmed, matching the threshold rule Section 3 states.
