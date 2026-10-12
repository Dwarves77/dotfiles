# 2026-10-12, lane P1-12 (part1-runtimes-a): the runtimes-a Keep/Refactor/Trash register

Branch coord/part1-runtimes-a from origin/master a0749713, fast-forwarded to 09093a20 before the commit. Cloud session (no database, no operator machine). Brief from the coordinator session: read the first part of fsi-app/scripts/turns whole, write one register with its build-plan section, change no code.

## Accomplished

- `docs/plans/rebuild/part1/runtimes-a.md`: module verdict REFACTOR AND PORT; 5,330 code lines today, about 2,950 clean (755 TRASH outright, the remaining 4,575 folded into a turn kit and one adapter per kind); bloat ranked (eight rows); dead code (17 rows, all CONFIRMED by grep: four emitters, two shell landers, the unwired structured-actions preview, the retired last-turn marker, dead branches and dead files); duplicates (14 rows, including two forward-event identity keys that disagree and two copies of the synthetic frontmatter builder); file register (41 rows); build plan: per-runtime does, reads, writes, trigger and chain; every LLM and network call site with its free replacement; the ONE turn runtime (planned by P1-13) and what folds into it; 15 planned file rows with source line ranges; data model; interface by module id; invariants; rulings; proof; port order; 29 features each with a new home; gaps for the coordinator.
- `docs/plans/rebuild/data-invariants.md`: INV-175 (pool-hash staleness refuses a batch entry), INV-176 (answers are inferences; quotation-only CONFIRMED), INV-177 (a batch names a source, never a tier), INV-178 (whole-file versus per-entry refusal, read-back, idempotent re-apply), INV-179 (the record-briefs pre-write refusals), INV-180 (corpus-turn ticket consumption); count line updated to 180.
- `docs/audits/2026-10-11-complete-audit/BACKLOG-2026-10-11.md`: the STATUS cell of all 30 in-scope rows: 18 CONFIRMED-P1, 12 TRASH, 0 REFUTED, 0 CLOSED.
- Not touched: `docs/INDEX.md` (coordinator-only under the lane contract), PROGRAM-BOARD.

## Coverage (every file read whole with the Read tool)

41 files, 9,253 raw lines, 43 Read calls: apply-record-briefs.mjs and record-briefs/schema.mjs in two calls each, every other file in one call. The scope was corrected by the coordinator mid-lane from "the first 21 files" to files 1 to 41 of `git ls-files fsi-app/scripts/turns | sort`; P1-13 holds files 42 to 53. Registers read whole: B1-scripts-runtimes (8 calls plus 2 refused for size), B1a-part1, B1a-part2. Rows for scope paths across all other registers by `grep -rn`.

## Decisions

- Every workflow the prior registers name as a caller of this scope is gone (only ci.yml and live-smoke.yml exist), so the trigger column states the tree as it is: manual CLI, spawned by a P1-13 runtime, or live-smoke.yml. The four env-shim emitters and the two shell landers are TRASH; live-smoke's landing moves in process before deliver-artifact-branch.sh is removed (port order step 6).
- The brief-apply path's metered reach was traced into canonical-pipeline.ts: callSonnet is skipped on the injected ledger (:1937), but the Haiku slot judge (:1979) and the direct-then-Browserless fetch (:1793) remain reachable in principle; the new tree makes both unreachable by refusal rather than by the validator's prior refusal alone.
- .ts imports from .mjs (apply-question-answers, needs-search/schema, record-briefs/schema) load under plain node v22.22.0 [CONFIRMED: dynamic import of each module]; the loader concern in my notes is REFUTED.
- The ONE turn runtime is P1-13's to name; this register supplies the kit and adapters and states that P1-13's name wins.
- Commit trailer: the session's attribution instruction.

## Verification

- `wc -l` and the awk code-line count over the 41 files (register section 1).
- File-level consumer scan (import, spawn and run lines only) and `grep -rlw` per exported symbol (185) over fsi-app/src, scripts, supabase and .github/workflows.
- `git ls-files` for the deleted tests and the absent section-list-drift.npmtest.mjs; `ls .github/workflows`.
- Migration 307:86-91 read for the forward-event unique index; flywheel-steps.mjs:9-16 read for the disagreeing key.
- grep of source-growth.ts and src/lib/{connections,forward-events,entities} for spendStream and browserlessFetch: none.

## Blockers and next steps

- None blocking. Gaps for the coordinator are listed at the end of section 8 of the register (rule 17 gaps in four appliers, brief_apply_runs retirement, migration 334, the brief-export queue carrying pool text in harness_runs, the flywheel-steps forward-event key, the drain's deleted apply workflows).
