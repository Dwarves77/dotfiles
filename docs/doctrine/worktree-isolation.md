# Doctrine seed — Worktree isolation

> **Doctrine-register SEED (machine-checkable).** This is a committed seed entry the Autonomous
> Disposition Engine's **Unit 0 (doctrine register)** will consume. When Unit 0 lands (15-seed register,
> verbatim doctrine + enforcing-invariant/exemption, meta-gate FAILs an unenforced doctrine, dispatches
> cite by ID), this entry MIGRATES into that register keyed by `id` below and this file becomes a pointer.
> Until then it is the durable, reviewable home for the doctrine + its enforcement binding.

The shape mirrors the governance exemption format (`fsi-app/.discipline/governance/exemptions.mjs`):
an `id`, the verbatim `doctrine`, the `enforcedBy` binding (NOT an exemption — this doctrine ships
ENFORCED), the `scope`, and the `status`.

```yaml
id: worktree-isolation
status: enforced            # ships ENFORCED (not exempt); the meta-gate would FAIL an unenforced doctrine
enforcing_invariant: RD-19-worktree-isolation   # fsi-app/.discipline/governance/invariants.mjs
doctrine: >
  Agent branch/checkout/merge operations occur ONLY in that agent's assigned worktree. The main
  checkout is the orchestrator's exclusive surface. An agent that finds itself in the main checkout
  stops and reports, it does not operate there.
scope: >
  All parallel-agent development-process git operations in this repository. "Main checkout" = the
  primary git working tree (git-dir == git-common-dir, the repo root). "Assigned worktree" =
  a linked worktree under .claude/worktrees/ (git-dir under <common>/worktrees/<name>). Governs
  branch / checkout / switch / merge / rebase / worktree-add and commit. Does NOT govern the product
  runtime — this is a DEVELOPMENT-PROCESS doctrine (same boundary class as the out-of-repo skill-gate).
enforced_by:
  # DUAL, fail-closed, belt-and-suspenders (mirrors the RD-11 transport-hold dual pattern):
  - mechanism: git post-checkout hook
    catches: an AGENT context performing a branch checkout in the MAIN checkout
    action: HARD-FAIL loudly naming the doctrine (detection + alarm; cannot undo the HEAD move)
    fires_in: any session type (git hooks run in git's invoking process — CATCHES SUB-AGENTS)
    source: fsi-app/.discipline/hooks/post-checkout -> worktree-isolation-hook.mjs
  - mechanism: git pre-commit hook
    catches: a commit in the MAIN checkout under an agent context OR on an agent-owned branch
             (worktree-agent-<hex> / agent-<hex>)
    action: BLOCK (nonzero exit aborts the commit) — the real stop for the wrong-label commit
    fires_in: any session type (CATCHES SUB-AGENTS)
    source: fsi-app/.discipline/hooks/pre-commit -> worktree-isolation-hook.mjs
  - mechanism: PreToolUse skill-gate belt
    catches: a git branch/checkout/switch/merge/rebase/worktree-add Bash op in the MAIN session
    action: ASK (surface the doctrine for conscious confirmation)
    fires_in: MAIN session ONLY (PreToolUse is session-scoped; does NOT fire in subagents — the
              known limit this belt honestly documents; the git hooks are the suspenders that do)
    source: fsi-app/.discipline/governance/pretooluse-skill-gate.mjs (isBranchingGitCommand)
detection_signals:
  where: main-checkout vs linked-worktree — git rev-parse --git-dir differs from --git-common-dir
         (a linked worktree's git-dir is under <common>/worktrees/<name>). Zero-false-positive, no env.
  who:   CLAUDE_CODE_CHILD_SESSION env marker — set truthy by the harness for sub-agent sessions,
         absent for the orchestrator. AI_AGENT is present in BOTH and does NOT discriminate (not used).
single_home: fsi-app/.discipline/governance/worktree-isolation.mjs (pure decision logic)
proof: fsi-app/.discipline/governance/worktree-isolation.test.mjs (red-then-green + wiring assertion)
install: node fsi-app/.discipline/install-hooks.mjs   # orchestrator runs this in the MAIN checkout
residual: >
  post-checkout is detection+alarm only (git already moved HEAD); pre-commit is the real block. The WHO
  signal rests on the harness naming CLAUDE_CODE_CHILD_SESSION for sub-agents only — the pre-commit
  branch-name belt is the env-independent backstop, and the WHERE signal is zero-false-positive. The
  hooks fire only after the operator runs install-hooks (out-of-repo boundary, same as pre-push /
  commit-msg); the meta-gate proves the SOURCE + logic are wired, not that the operator installed them.
```

## Incident this prevents

During a multi-agent build program a sub-agent ran `git checkout -b <branch>` in the MAIN checkout
(`C:/Users/jason/dotfiles`) instead of its assigned worktree under `.claude/worktrees/`. That moved the
main checkout's HEAD onto the agent's branch; subsequent orchestrator commits landed on the wrong label
and had to be manually untangled. The action-time skill-gate did not catch it because PreToolUse is
session-scoped and does not fire inside subagents/workflows (verified 2026-06-07).

## Related

- Invariant: `RD-19-worktree-isolation` in `fsi-app/.discipline/governance/invariants.mjs`
- Skill: `remediation-discipline` SKILL.md — Section 4 category 14 (Worktree isolation)
- Boundary class: `fsi-app/.discipline/governance/OUT-OF-REPO-BOUNDARY.md` (why the install is operator-run)
