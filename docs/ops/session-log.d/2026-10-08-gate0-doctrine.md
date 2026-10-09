# 2026-10-08, coordinator docs lane GATE-0: ADR-046, the gate doctrine

## Accomplished

- Wrote `docs/decisions/ADR-046-gate-doctrine.md` (accepted, 2026-10-08): the seven doctrine points from the
  gate plan, each with its evidence line from registers A and B; a disposition table (KEEP / REPAIR /
  REPLACE / DELETE, lane, one-line reason) covering the 10 commit rules, the trailers and markers, the git
  hooks and pre-push steps, C3/C4/C5, the Claude Code hooks, all 60 fitness functions, the governance
  gates, the rendering guard and the discipline.yml job set; the lane map (GATE-1 to GATE-4, DEAD-1 to
  DEAD-3, GATE-0); the scoreboard rule.
- Added the ADR-046 line to `docs/INDEX.md`.

## Read and reused

- Read in full: the lane brief, COMMON.md, the gate plan, registers A and B (fsi-app/scripts/tmp, gitignored
  in the main checkout), briefs GATE-1 to GATE-4 and DEAD-2/DEAD-3 (to state the lanes and avoid
  contradicting their write sets), ADR-040, ADR-045 and ADR-009 frontmatter, `docs/dispatches/lane-common-contract.md`.
- Reused: register counts and their status tokens as written (not re-verified here); the existing ADR
  frontmatter shape; the existing session-log.d format.

## Confirmed facts

- Coverage check run by script on the ADR file: all 60 fitness function ids (F2 to F69 as registered) and all
  10 rule ids appear as table rows; zero dash or section-sign glyphs; zero user-home paths.
- Disposition counts over the F and rule rows: KEEP 45, REPAIR 12, DELETE 12, REPLACE 1.

## Decisions made while writing (for coordinator review)

- Gates the plan does not name (F6, F10 to F12, F14, F18, F24, F27, F30, F33, F34, F36, F38, F41, F43, F44,
  F46, F47, F49, F50, F52, F59, F66, F67, F69, C3/C5, the SessionStart/PreCompact/SessionEnd hooks) are
  KEEP, following the GATE-3 brief's "keep unchanged" list; those with zero firings carry the word
  "scoreboard" so their first review is under the 90-day rule.
- F25 is marked REPAIR with lane DEAD-1 (allowlist cleared by wiring or deleting). The plan's "dated expiry
  for PROVEN_BUT_UNWIRED entries" appears in no GATE-3 or GATE-4 brief; the DEAD-1 brief was not available
  to this lane.
- The scoreboard window opens when the gate-firings artifact first carries a gate's firings (no firing log
  exists before that); this sentence is the ADR's own, not in the plan.
- F39 bound: the plan says a slice cap of N <= 200, the GATE-3 brief says N <= 500; the ADR states the rule
  without a number.

## Coordinator rulings applied (PR 994)

- F25 dated expiry recorded in the ADR as owed to DEAD-1. F39 bound stated as N <= 500 (GATE-3 brief governs).
  Added the missing ADR-045 INDEX line (write-set expansion granted for that one line).

## NOT done

- No change to CLAUDE.md (outside the write set); its self-annealing line "every failure becomes an edit to
  the system" is read per ADR-046 and is not edited. [NOT-WORK: fact, no action]
- The two registers are not landed here (DEAD-3 lands them under docs/audits); the ADR cites them by their
  future path in plain code text, not as links. [CLOSED: PR 1033]
- `docs/runbooks/gate-evaluation.md` is GATE-4's file; the ADR cites it in plain code text. [NOT-WORK: fact, no action]
