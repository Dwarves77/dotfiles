# 2026-10-08 lane rulemerge1-merge-commit-baseline (RULE-MERGE-1): a proposed merge commit is charged only for lines in neither parent

## The observed refusal
- Lane S8-E6 (PR 1031), 2026-10-08: merging origin/master (4ee8bbee) into lane/s8e6-grid-queue was refused by rule 022 for glyphs in master's own `docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md` and `fsi-app/.discipline/rendering/audit/results.json`; the lane aborted the merge and stopped.
- Cause confirmed by reading the code: `buildContextForProposedCommit` took the one diff as `git diff --cached <merge base with origin/master>` (GATE-5), and for a merge in progress that base is the fork point, so every line master added since the fork read as introduced by the lane. CI already judged an existing merge commit correctly; only the pre-commit path did not.

## Accomplished
- `fsi-app/.discipline/lib/baseline.mjs`: `resolveBaseline` (the one decider) returns `{ ref: 'HEAD+MERGE_HEAD', source: 'merge-parents', label: 'merge commit: lines in neither parent' }` for a staged context while `MERGE_HEAD` resolves (`git rev-parse -q --verify MERGE_HEAD`, per worktree). Decided before the merge-base lookup, so it holds with no origin/master too. Commit contexts and non-merge staged contexts are unchanged.
- `fsi-app/.discipline/lib/context.mjs`: `loadDiff` takes the `merge-parents` branch (`loadMergeParentsDiff`): `git diff --cached -U0 HEAD` and `git diff --cached -U0 MERGE_HEAD` are parsed with the existing `parseUnifiedDiff`; an added line is kept only when both diffs add it at the same line of the index (so identical text by construction, and a duplicated text elsewhere cannot be mistaken for it). Removed lines, `oldStart`, status, rename and binary flags come from the HEAD side; a file only the MERGE_HEAD side reports is kept in the staged list (union) with no added lines. The result is rendered back to unified-diff text with the existing `fixtureDiff` and read by the same parser and the same `introducedLines` view; no rule changed. Contiguous kept lines stay one hunk, a gap splits the hunk, so `pair.line` stays the line number in the merged file.
- Tests: `context.test.mjs` (four RULE-MERGE-1 tests on a real temp repo: master adds glyph lines to a generated file, a new glyph file and a shared file after the lane forks, `git merge --no-commit --no-ff master`) and `baseline.test.mjs` (two tests).

## Red then green
- Before the change, `node --test fsi-app/.discipline/lib/context.test.mjs`: 3 of 26 failed, the S8-E6 case first: `ctx.baseline.source` was `merge-base`, expected `merge-parents` (the glyph assertions behind it were not reached). After: `context.test.mjs` + `baseline.test.mjs` 39 of 39 pass; with `context.range.test.mjs`, `runner.test.mjs` and `rules/022-no-dash-glyphs.test.mjs` 113 of 113 pass.
- Negative test (conflict resolution): a line `resolved <glyph> by the lane` staged on top of the merge makes rule 022 FAIL with exactly one location (`shared.txt`, line 5) and the remediation names that line and not master's `master <glyph> tail` line.
- Regression guard: a non-merge proposed commit reports `merge-base` and rule 022 still fails its new glyph line.

## Read and reused
- Read in full: CLAUDE.md, lane contract, `lib/context.mjs`, `lib/baseline.mjs`, `lib/baseline.test.mjs`, `lib/context.test.mjs`, `rules/022-no-dash-glyphs.mjs` and its test head; consumers found by grep (`runner.mjs` prints `ctx.baseline.label`, `lib/firing-log.mjs` records it; nothing reads `baseline.ref` outside context.mjs).
- Reused, not rebuilt: `parseUnifiedDiff`, `fixtureDiff` (the existing diff renderer), `introducedLines`/`introducedMatches`, `DIFF_FLAGS`, the `resolveBaseline` decider.

## Decisions
- The intersection is keyed by line number in the index plus text, not text alone: both diffs are taken against the same index, so a line number names the same line in both, which is stricter than text matching when a text repeats within a file.
- `isMergeCommit` stays false for a proposed merge, so rule 022 (which skips `isMergeCommit`) still judges the conflict-resolution lines, as the brief requires.
- `_diffLoadCount` counts the merge case as two loads (two git processes).

## NOT done
- No rule, hook or workflow edited. `buildContextForExistingCommit` (CI) is unchanged. A merge with unresolved conflicts is not a commit; `git diff --cached` shows only resolved entries.

## Open items
- None.
