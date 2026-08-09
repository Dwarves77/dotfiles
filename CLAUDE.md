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
8. **`.obsidian/` is UI state**: gitignored, never edited by agents. Doc filenames are link targets; renaming a doc requires updating its inbound markdown relative links (ADR-010 amendment 2026-07-13; wikilinks retired).
9. **No credentials in the repo.** `.env` stays untracked; see .gitignore history for the perftoken incident.
10. **Dates in filenames** for anything point-in-time. Undated facts become landmines when the project changes its mind.
11. **Context is a metered resource.** In a long agentic session the dominant cost is not what gets generated, it is context re-read: every turn re-bills the whole conversation, so cost is context size multiplied by turn count, not the sum of the work. Measured 2026-08-07: one 17-day session reached 1.34B cache-read tokens against 856k tokens of actual product. Therefore: never call a list endpoint to answer a metadata question when a targeted query exists (`list_triggers` returns every charter body, roughly 300k tokens per call); route unavoidably large or noisy tool output through a subagent with an explicit do-not-echo contract so the payload lands in its context and only the conclusion returns; prefer `get_page_text` over screenshots, which are permanent context residents; and when a session passes roughly 200k of context on finished work, say so and recommend a fresh session rather than carrying the history forward. Scheduled workers pay a fixed startup cost per firing, so fewer firings with larger batches beat frequent small ones, and every recurring worker must check a kill switch before doing work (see `docs/runbooks/fleet-budget-control.md`).
12. **PDFs are never opened with the Read tool.** An interactive session that Reads a PDF renders its pages as images, and images are permanent context residents that re-bill on every subsequent turn (rule 11's cost model at its worst). Convert to text first (`pdftotext`, `pymupdf`) and read the text; open an actual page image only when layout itself is the question, and route it through a subagent when possible. The ingestion side already complies — capture-worker v1.3 extracts PDF text server-side as a declared transform — this rule covers interactive reading.
13. **A flag is a commitment, not a comment.** (Operator-ratified 2026-08-08.) Anything a session labels a problem, landmine, edge, or debt is WORK: fix it in the same motion, or deliver it decision-ready (mechanism built, investigation done, exact commands staged) where a ruling, a live worktree, or missing access blocks execution. "Flagged for later" without either is the anti-pattern this rule retires. The bar is best-possible engineering, not adequate. Corollary: investigating a flag can refute it — a flag that dissolves under evidence gets a same-session correction wherever it was recorded, never a quiet drop.

14. **A finding is a hypothesis until it is verified, and it is labeled either way.** (Operator-directed 2026-08-09, after eight retractions in one session: a "truncation defect" that was real treaty text, a "no RLS" table that had RLS, an escalation scope that was already gated, "EUR-Lex is capture-dead" against 645 live captures, a per-item cost off by ~10x.) The failure was structural, not careless: findings were produced by a read-then-report pass and entered the operator's view as CONCLUSIONS while still being PATTERN MATCHES. That is worse than no audit, because it burns operator attention on phantoms and makes the real findings unbelievable.
    Binding, and mechanically checkable: every finding in an audit, register, or report carries an explicit status token, and no finding may be stated to the operator without one.
    - `[CONFIRMED]` — independently re-verified against the live system or a written repro, by a method named in the finding.
    - `[HYPOTHESIS]` — read from code/docs and plausible, NOT yet verified. Must be spoken as a hypothesis in prose too ("this looks like X; unverified").
    - `[REFUTED]` — investigated and found false. Refuted findings are corrected IN PLACE, never silently deleted (rule 13's corollary).
    Severity (P0/P1/P2) is orthogonal to status: a `[HYPOTHESIS]` P0 is a thing to go verify, not a thing to report as broken. Enforced by `scripts/verify/audit-finding-status.mjs`; a docs/audits file with unlabeled findings fails the check.
## Memory conventions

- INDEX.md gains a line for every new living doc, same commit. **Prior-art before creation:** before creating a doc, check INDEX.md for an existing one that serves the role and extend it, rather than creating a duplicate (reuse-before-construction, for docs).
- Docs cross-link with **markdown relative links** (`[text](../dir/file.md)`): 2 to 5 real relationships, no keyword spam; new docs are born-linked, orphans get reported not force-linked. Real-doc links are markdown; conceptual anchors (rule-*, vocabulary-*) stay plain text, never `[[wikilinks]]`. (ADR-010 amendment 2026-07-13 — supersedes the earlier wikilink convention.)
- Contradiction audit: periodically (align with the monthly spot-check lane) scan living docs for statements that disagree; flag for operator ruling.
- Cross-project and personal memory live in the private brain repo, not here. This repo is Caro's Ledge only.

## Self-annealing protocol (session close)

1. Dated entry to `docs/ops/session-log.md`: accomplished, decisions, blockers, next steps.
2. New decision → new ADR. Changed approach → update the plan or skill. Fixed breakage → update the runbook.
3. New living doc → INDEX line. New debt → `docs/tech-debt-log.md`.

Nothing breaks the same way twice; every failure becomes an edit to the system.
