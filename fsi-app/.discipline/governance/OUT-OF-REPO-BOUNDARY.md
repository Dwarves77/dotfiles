# Out-of-repo boundary manifest

Some platform behavior is governed by configuration that lives **outside this repository**. In-repo
governance (rules, fitness, consistency, the invariant meta-gate) cannot see or enforce it. This file
is the registry of those boundary dependencies and the in-repo mechanism that proves each one.

The prevention pattern for every entry: **in-repo source-of-truth + thin pointer + boundary check**.
The logic lives in the repo; the out-of-repo file holds only a thin pointer to it; an in-repo checker
asserts the pointer is actually present (run in pre-push, where the operator's environment exists).

| Boundary dependency | In-repo source-of-truth | Applier (idempotent) | Boundary check | Where enforced |
|---|---|---|---|---|
| `~/.claude/settings.json` → `hooks.PreToolUse` must route **Bash, Edit, Write, MultiEdit, NotebookEdit, Agent, Task, Workflow, and every `mcp__*`** to the action-time skill gate (matcher `^(Bash\|Edit\|Write\|MultiEdit\|NotebookEdit\|Agent\|Task\|Workflow\|mcp__.+)$`) | `governance/pretooluse-skill-gate.mjs` (decision logic) + `governance/skill-map.mjs` (skill↔file/op map) | `governance/wire-pretooluse-settings.mjs --apply` (backs up, preserves all other keys incl. credentials) | `governance/check-pretooluse-wired.mjs` | pre-push **step 3c** (SKIPs in CI/headless where settings.json is absent) |

## The action-time skill gate (why it exists)

Before this gate, skills/rules were enforced at **commit-time** (commit-msg hook), in **CI**
(discipline.yml), and by the **invariant meta-gate**. But direct prod-writes — `node scripts/x.mjs
--apply`, destructive Bash, file edits to governed surfaces — happen *before* a commit exists, so none
of those layers see them. That is the gap that produced the work that "didn't go through the skills."

The gate closes it: on every `PreToolUse`, it names the governing skill for the touched file/op and
returns `permissionDecision: "ask"`, so the skill is in context at the decision point and the action
cannot proceed un-acknowledged. It **fails closed** — any error, empty/unparseable payload, or a
skill-map that won't load returns `ask`.

## Coverage limit: subagents and workflows (platform constraint)

**PreToolUse hooks are session-scoped and do NOT fire inside subagents or workflow-spawned agents.**
Verified empirically 2026-06-07: a subagent dispatched via the Agent tool ran `node x --apply`
unimpeded — no gate interception, no entry in `.gate-audit.log`. The Claude Code docs confirm the
subagent/workflow hook scope is undocumented (workflows inherit the tool *allowlist* but make no
parallel claim for hooks). So a subagent/workflow is a structural bypass for code/data writes — this
cannot be closed by the hook itself.

Compensating controls (mechanical where possible):

1. **The dispatch tools (Agent / Task / Workflow) are themselves gated** at the main-session call (those
   calls DO fire the hook). The gate `ask`s on every dispatch and states the rule, so the bypass cannot
   be taken silently.
2. **Binding rule:** mutations — `--apply` data writes, governed-file edits, MCP/repo/deploy writes —
   execute in the **main session**, where the gate fires. Subagents and workflows are for **read-only
   investigation** and returning findings; any subagent reasoning about governed content must invoke the
   Skill tool itself.
3. **Defense in depth still applies to anything that lands as a commit:** guarded `db.mjs`
   (cite + snapshot), commit-msg rules, CI, and the invariant meta-gate all still catch mutations that
   reach the repo, regardless of which session produced them.

This is the one place "completely wired" has a platform floor: the main session is hard-gated; the
subagent interior is governed by rule + dispatch-gate + downstream review, not by the PreToolUse hook.

## Correctness vs wiring (two separate proofs)

- **Correctness** of the gate is proven in-repo and CI-side by `governance/pretooluse-skill-gate.test.mjs`
  (run under `node --test` in pre-push step 3 + CI). It asserts *efficacy*, not existence: governed
  files/ops → `ask`, ungoverned → `allow`, and that the Bash reason names the *real* per-op skill
  (catching the two silent-no-op regressions: absolute-path match failure, and the Windows
  `import(C:\...)` ESM-scheme error swallowed by the fail-soft catch).
- **Wiring** (that settings.json actually invokes the gate for all five tools) is proven by
  `check-pretooluse-wired.mjs` in pre-push step 3c. It FAILs on partial wiring and SKIPs when
  settings.json is absent — so CI never blocks on a file it doesn't have, but a real machine cannot
  push with the gate half-wired.
