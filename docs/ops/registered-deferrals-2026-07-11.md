# Registered deferrals — 2026-07-11 (Disposition dispatch)

Deferrals carried forward from the Disposition dispatch. Each is dispositioning-as-BLOCKED (a real
finding + an owner + a revisit trigger), never silencing (per RD-6 / the doctrine register's
`deferral-ceiling-30d-non-renewable-without-state-change`). They RIDE, they do not ROT.

| ID | Finding | Owner | Revisit trigger | Dwell |
|---|---|---|---|---|
| DEF-1 | **Redesign-remnants diff-audit.** 13 unmerged `feat/redesign-t01..t11` (+ `docs/redesign-t11-community-mapping`) worktrees/branches survive cleanup — a genuine unmerged redesign effort (ahead 1–4 each), NOT abandoned by default. Kept per "keep unmerged." Needs a diff-audit vs master to decide land / rebase / abandon per branch. | orchestrator | operator ruling on the redesign effort, OR the 30-day dwell below | **30-day** (created 2026-07-11 → **2026-08-10**). Past dwell with no decision = surface as a HARD backlog item (D-2 dwell doctrine). |
| DEF-2 | **Stash ruling (revisit-or-drop).** 10 stashes (all 2+ months old, May 2026 WIP on mostly-deleted `fix(ui)/*` branches). Not dropped — "nothing recoverable" is not cheaply provable per-stash and dropping is irreversible with low upside; they are inert (no C4/hygiene/downstream effect). | orchestrator | **Wave-β B1** (dev/prod split + fresh-DB replay repair) — the natural point to prove each stash's content is in master (nothing recoverable) or extract it, then drop. | rides to B1. |

## Why registered here (not just noted in chat)
The no-resting-state doctrine applies to DEFERRALS too: a deferral without a recorded blocker + owner +
revisit is the silent-backlog shape the discipline forbids. This file is the durable record so a future
session (or the disposition closeout) sees the assignment, not a dropped thread.

Related: [[ADR-012-intake-cadence-and-launch-exit-test]]; the doctrine register
(`fsi-app/.discipline/governance/doctrine-register.mjs`) entries `dwell-time-max-age-on-every-transitional-state`
and `deferral-ceiling-30d-non-renewable-without-state-change`.
