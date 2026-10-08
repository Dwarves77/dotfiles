# 2026-10-08, lane AUDIT-CAT (audit-catalogue): the audit dimension catalogue and the audit-of-audits matrix

Coordinator docs lane, branch `coord/audit-catalogue-2026-10-08`, worktree `.claude/worktrees/audit-catalogue` from origin/master (fast-forwarded to f706ee09, which carries ADR-046, before any edit). Docs only.

## Accomplished

- `docs/runbooks/audit-catalogue.md` (new): section 1 the ten lenses (question, method, applicability, evidence shape each); section 2 the 18 subsystems with the unit one audit enumerates and where the members are listed; section 3 the matrix (two tables, 18 subsystems by 10 lenses), the counts, the facts found while filling it, the index of every file and folder under `docs/audits/` plus the four scratch registers, and the owed audits in priority order; section 4 the rules of an audit, the incident-to-lens ledger (I-1 to I-4, the four surprises of 2026-10-08) and three imported checklists (privilege-escalation census, standard dead-code tool run, standard database hygiene); section 5 the one-page fact-lane brief template.
- `docs/INDEX.md`: one line under runbooks.
- This file.
- Matrix, generated from one table of audit-to-cell assignments and counted mechanically from the rendered tables: 180 cells, 89 filled, 31 partial only, 47 empty, 13 not applicable (167 applicable cells, 78 of them owing an audit). 118 audit IDs cover all 115 top-level files and the 4 folders under `docs/audits/` (checked by looking up each `ls docs/audits` name in the runbook text: none missing).

## Read and reused

- Brief `audit-catalogue.md` and `COMMON.md` (scratchpad `briefs-2026-10-04`); CLAUDE.md rules 14 and 15.
- `docs/INDEX.md` audits section; the header, opening lines and a method or scope passage of every file under `docs/audits/` (basis M or O per row in the index); the full method, summary and inventory sections of `gate-evaluation-A-rules-hooks-2026-10-08.md`, `gate-evaluation-B-fitness-governance-2026-10-08.md`, the summary and section 11 of `dead-code-census-2026-10-08.md`, and the header and summary of `remaining-build-register-2026-10-06.md` (all under `fsi-app/scripts/tmp/`, gitignored).
- ADR-045 and ADR-046 (reused as sources of the incident evidence); `docs/ops/session-log.d/2026-10-08-sec2-profile-status-columns.md` (I-3 evidence); `docs/runbooks/layout-guard-baseline-renewal.md` (runbook header convention).
- Reused instead of building: the registers' own status-token vocabulary and unit counts; the F25, F14 and F47 graph definitions for the CALLED lens; `prov-guard-adversarial-audit.mjs` as the ATTACKED template. No script or file was created in the repo or the scratchpad; the matrix tables and owed list were rendered by one-off node commands run from standard input.

## Decisions

- Date: the session clock read 2026-10-07 at start; the branch name, the registers and existing session-log.d files carry 2026-10-08, so 2026-10-08 is used throughout.
- Subsystem list: the coordinator's 18 are kept unchanged. Three definitional extensions are stated in section 2 of the runbook: row 15 also holds `fsi-app/src/lib`, row 13 holds `page.tsx` as well as `route.ts`, row 18 holds the dispatch contracts.
- A cell is filled only when the audit's method matches the lens's method; code reading fills EXISTS only. A `~` marks a partial run. Lenses that do not apply are `n/a` with reasons in section 1 (ATTACKED on rows 14 and 17; FIRED-TRUE on rows 8, 10 to 15, 17, 18; MODE on rows 14 and 17).
- Priority of the owed list: ATTACKED and RECORD-VS-REALITY first, then RUNS, FIRED-TRUE, CALLED, MODE, OPERATOR-SEAT, COSTS, OVERLAPS, EXISTS. RECORD-VS-REALITY has no empty cell (9 partial only), so its entries are P entries.
- The template's "no proposals" clause: the copy of COMMON.md read for this lane carries the "create nothing" clause in rule 4 but no "no proposals" clause; the clause is taken from the registers' own convention ("No recommendations are made in this file").

## Facts found (each [CONFIRMED] by the method named)

- ADR-046 says the gate registers "are landed as `docs/audits/gate-evaluation-2026-10-08.md`"; `git ls-files docs/audits` at f706ee09 returns no file matching gate-eval. The registers are scratch-only. Recorded in the runbook section 3c.
- No privilege-census file exists in `docs/audits/` at f706ee09 (`git ls-files` pattern match returned nothing).
- ATTACKED has no full entry for any subsystem; its only entry is the partial GA run on PreToolUse gates.
- The audit DLC (2026-08-11) states that RLS policies "were read as a reference surface, not audited as policies".

## NOT done

- No audit was re-run and no finding inside an audit was re-verified. The basis column marks 66 of the 118 rows M (a method or scope passage read) and 52 O (opening lines only); a lens assignment that depends on text beyond that is [HYPOTHESIS].
- The three 2026-10-08 registers, the 2026-10-06 register and the privilege census are not landed under `docs/audits/`; their cells cite scratch names until a docs pass lands them.
- `docs/audits/gate-evaluation-2026-10-08.md` (named by ADR-046) was not created: it is outside this lane's write set.
- No CI result yet at the time of writing this entry; see the PR.

## Open items

- Owed: 47 empty cells and 31 partial-only cells, listed in section 3e of the runbook as O-001 to O-047 and P-001 to P-031.
- Decision for the coordinator: whether the ADR-046 reference to `docs/audits/gate-evaluation-2026-10-08.md` is satisfied by landing the registers or by correcting the ADR.
