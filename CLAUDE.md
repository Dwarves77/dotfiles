# Caro's Ledge — Operating Manual

This repo is the source of truth for the Caro's Ledge product (Freight Sustainability Intelligence) and its project memory. Read this file first, every session. It is the constitution: stable rules, not session state. Session state lives in the files listed under Loading Priority.

## What lives where

| Location | Purpose |
|---|---|
| `fsi-app/` | The product: Next.js app, Supabase schema + migrations, workers, discipline engine |
| `fsi-app/STATUS.md` | Live build state and session-resume recipe for the active lane |
| `docs/` | Project memory (the brain). Read in Obsidian; maintained by agents |
| `docs/INDEX.md` | One line per living doc. Read before opening anything else in docs/ |
| `docs/decisions/` | ADRs (ADR-NNN-kebab.md, frontmatter per ADR-009). Decisions with reasoning |
| `docs/inventories/` | Living inventories: components, discipline, migrations, worktrees |
| `docs/runbooks/` | Procedures and playbooks that get re-executed |
| `docs/plans/` | Specs, prework, proposals, frameworks |
| `docs/audits/` | Dated audits, investigations, verifications |
| `docs/ops/` | Followups, session-log.md, operational logs |
| `docs/sprint-1/`, `docs/sprint-2/` | Sprint-scoped working sets |
| `docs/archive/` | Superseded working notes; `archive/logs/` machine evidence. Not indexed, not loaded |
| `docs/design/` + `design_handoff_2026-05/` | Design system, redesign references |
| `.claude/` | Commands, settings, agent worktrees (transient) |
| `.worktrees/` | Parallel work checkouts (never tracked) |
| Root `.bashrc`, `install.sh` | Legacy dotfiles; not part of the product |

## Loading priority

1. This file.
2. `docs/INDEX.md` — then open only what the task needs.
3. `fsi-app/STATUS.md` — current lane state.
4. `docs/ops/` followups + tail of `docs/ops/session-log.md`.
5. Task-relevant ADRs and runbooks.
6. Code.

Load narrowly. Reference material constrains you; working artifacts are input. Do not bulk-load docs/.

## Standing rules

1. **Facts live in Supabase.** Regulatory facts, spans, tiers, and their integrity are owned by the database, validators, and quarantine lanes. Docs cite record IDs and migration numbers; they never restate published facts. Never hand-edit published rows; changes go through migrations and lanes.
2. **Never fabricate** numbers, results, sources, or client names. Placeholders plus a question beat confident fiction.
3. **Migration two-track policy** (see STATUS.md): schema DDL applies via Supabase CLI before the dependent code commits; data migrations commit with consumer code and run after merge.
4. **Decisions become ADRs** at the moment they are made: `docs/decisions/ADR-NNN-kebab.md`, frontmatter id/title/status/date/scope/supersedes/related. Enforcement trailer is deprecated (ADR-009 postscript); the convention is binding.
5. **Machine evidence never lands in docs/ top level.** Execute logs, runlogs, snapshots, raw JSON → `docs/archive/logs/` if worth keeping, gitignored scratch (`fsi-app/scripts/tmp/`, `_snapshots/`, `_plans/`) if regenerable.
6. **Session logs** go to `docs/ops/session-log.md` as dated appended entries. Never into this file.
7. **Worktree discipline**: parallel agent work runs in worktrees. Never restructure shared paths (docs/, migrations, discipline rules) while another agent's worktree is live or locked.
8. **`.obsidian/` is UI state**: gitignored, never edited by agents. Doc filenames are link targets; renaming a doc requires updating its [[wikilinks]].
9. **No credentials in the repo.** `.env` stays untracked; see .gitignore history for the perftoken incident.
10. **Dates in filenames** for anything point-in-time. Undated facts become landmines when the project changes its mind.

## Memory conventions

- INDEX.md gains a line for every new living doc, same commit.
- Docs link with [[wikilinks]]: 2 to 5 real relationships, no keyword spam. Orphans get reported, not force-linked.
- Contradiction audit: periodically (align with the monthly spot-check lane) scan living docs for statements that disagree; flag for operator ruling.
- Cross-project and personal memory live in the private brain repo, not here. This repo is Caro's Ledge only.

## Self-annealing protocol (session close)

1. Dated entry to `docs/ops/session-log.md`: accomplished, decisions, blockers, next steps.
2. New decision → new ADR. Changed approach → update the plan or skill. Fixed breakage → update the runbook.
3. New living doc → INDEX line. New debt → `docs/tech-debt-log.md`.

Nothing breaks the same way twice; every failure becomes an edit to the system.
