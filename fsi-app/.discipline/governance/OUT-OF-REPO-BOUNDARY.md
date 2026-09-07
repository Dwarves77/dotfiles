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

## Operator-CLI register (human-invoked, out-of-workflow)

A second boundary class: tools invoked by neither a workflow, a package.json script, nor another
in-repo mechanism — a person runs them from a terminal, per their own documented usage line. F25's
import graph and dispatch-root scan cannot see a human typing a command, so this table IS the
reachability evidence (`F25-module-liveness.mjs`'s `findDispatchRoots` Source 7 parses every backticked
path below, the same way it already parses the boundary-dependency table above). A row naming a file
that no longer exists is a rotted registry entry — `F25-module-liveness.test.mjs` asserts every parsed
path resolves against the real tree, so this table cannot drift silently.

| Operator CLI | Usage (its own header) | Who runs it, and when | Documented at |
|---|---|---|---|
| `install-hooks.mjs` | `node fsi-app/.discipline/install-hooks.mjs [--force\|--dry-run\|--hooks-dir=]` | Operator, once per fresh checkout (or after a hook source file changes) — installs/refreshes the tracked hook family into `.git/hooks/` | `.discipline/INSTALL.md`, `docs/doctrine/worktree-isolation.md` |
| `dispatch/start.mjs` | `node fsi-app/.discipline/dispatch/start.mjs <slug>` | Operator, at the start of a dispatch — mints a `Dispatch-UUID` recorded in every commit body during that dispatch | `.discipline/dispatch/README.md` |
| `dispatch/audit.mjs` | `node fsi-app/.discipline/dispatch/audit.mjs <uuid>\|--list-recent\|--aggregate-by-skill` | Operator, any time after a dispatch — reports its commits, claimed skills, and outcomes | `.discipline/dispatch/README.md` |

**The `_reground/` promotion-lane drain toolkit** (registered lane F25-WAVE52, 2026-09-07 —
`docs/audits/f25-wave52-dispositions-2026-09-07.md`; operator ruling / amendment 2026-07-16). Six
hand-run, per-item CLI tools serving the still-ACTIVE Unit-3 quarantine drain (`docs/PROGRAM-BOARD.md`
§2, "62-quarantine → recover-or-delete", deferred to 2026-10-31). Each takes item-specific positional
args (an item id, a lease holder, a proposed identifier) that do not fit a scheduled or CI-fanned-out
shape, so — like `install-hooks.mjs`/`dispatch/*.mjs` above — the registry row itself is the
reachability evidence, not a workflow line.

| Operator CLI | Usage (its own header) | Who runs it, and when | Documented at |
|---|---|---|---|
| `_reground/executor-ground.mjs` | `node scripts/_reground/executor-ground.mjs <itemId> <ledger.json>` | Operator (Claude Code executor), per item — the $0 hand-supplied-ledger grounding path (bypasses fetch/Sonnet; the system's own mint gates still run) | `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |
| `_reground/free-pass-run.mjs` | `node scripts/_reground/free-pass-run.mjs [--apply] [--limit=N] [--only=key,key]` | Operator, per drain batch — $0 re-attribution of failing FACT claims to already-held floor-qualifying captures | `docs/dispatches/free-chrome-acquisition-brief-2026-07-16.md`, `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |
| `_reground/id-stamp.mjs` | `node scripts/_reground/id-stamp.mjs <itemKey> <proposedId> <holder> [--apply]` | Operator, per item, under an already-held mutation lease — verify-before-write promotion to id-confirmed | `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |
| `_reground/lease.mjs` | `node scripts/_reground/lease.mjs <itemKey> <acquire\|heartbeat\|release> <holder> [lane]` | Operator, around an `id-stamp.mjs`/`tombstone-delete.mjs` call — acquires/releases the per-item mutation lease those tools require | `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |
| `_reground/target-match-probe.mjs` | `node scripts/_reground/target-match-probe.mjs` | Operator, ad hoc — read-only `verifyTargetMatch` report over the current drain worklist, no writes | `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |
| `_reground/tombstone-delete.mjs` | `node scripts/_reground/tombstone-delete.mjs <itemId\|key>... --disposition=<reason> [--merged-into=<id>] [--holder=] [--apply]` | Operator, per archive-endgame bucket or duplicate merge — tombstone-then-delete, fail-closed ordering | `docs/audits/full-read-2026-08-31/L14-scripts-B.md` |

`scripts/_reground/restore-overclear.mjs` is NOT listed here: DELETED lane F25-WAVE52 (2026-09-07) —
DEAD-HISTORICAL, scoped precisely to a single named 2026-07-16 drain-clear incident already resolved,
not reusable machinery (`docs/audits/full-read-2026-08-31/L14-scripts-B.md`).

`.discipline/consistency/runner.mjs` is NOT listed here: it is spawned as a real child process by
`consistency/override-check.mjs` (`const RUNNER = resolve(HERE, 'runner.mjs'); spawnSync(process.execPath,
[RUNNER], ...)`), and override-check.mjs's own path is a literal dispatch-root match in
`.github/workflows/discipline.yml` (the "Consistency backstop" job) and `.discipline/hooks/pre-push`. That
makes it a plain wired module by subprocess dispatch, not an operator-CLI exemption — `findDispatchRoots`
Source 8 mechanizes the `resolve(HERE, 'x.mjs')` + `spawnSync` shape so this stays true without a registry
row that could go stale.

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
