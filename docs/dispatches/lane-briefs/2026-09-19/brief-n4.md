# Lane N4: no gate stores a measurement; the merge-base is the baseline (plan 6.8, Rule B)

Read first, in this order: `docs/dispatches/lane-briefs/2026-09-18/brief-common-cloud.md` (binds you; the gate
is the repo wrapper `LANE_GATE_SP=<your scratchpad> bash fsi-app/scripts/coordinator/lane-gate-cloud.sh <worktree>`,
run once, last, as one background task), then `docs/plans/complete-system-build-plan-2026-09-04.md` section
6.8 (your row is N4), then `docs/dispatches/lane-common-contract.md`, then
`fsi-app/.discipline/lib/change-range.mjs` (N0) and `fsi-app/.discipline/governance/invariants.d/` (N5's
split registry; the shared constants' home is named in its README).

Lane id: `n4`. Model: Sonnet. Worktree and branch named in your dispatch (cut from a master carrying N0 and
N5). Exactly this brief; anything not covered is a STOP. This is the ONE lane allowed to edit the F45 ceiling
line, because it deletes it.

## The problem, measured [CONFIRMED by the coordinator's survey]

- `F45-duplicate-code.mjs`: `DUPLICATED_LINES_CEILING = 6121` (line 43) with a growing trailing comment; the
  live test asserts the tree measures EXACTLY the ceiling; the runner fails above and demands a re-seed
  below. Every lane that removes duplication rewrites that one line; two such lanes always conflict, and a
  coordinator script (`reseed-f45.mjs`, local only) re-stamps it after each rebase (a proof by presence).
- `skill-contract-map.mjs`: `PINNED_MANIFEST` (line 161) stores per skill a `contentHash` (SHA-256 of the
  skill file, EOL-normalised) and a `citingFiles` list; `--check` (lines 516 to 530) compares live to stored;
  6 skills pinned. `SKILL_MARKER_BASELINE` (invariants, now under N5's home) stores per-skill marker counts.
  There is no re-pin script in the repo; the header describes a one-liner in git history.

## What you build

1. **F45 against the merge-base.** Delete `DUPLICATED_LINES_CEILING`. `scanTree()` stays the measurement.
   New `measureAtBase(base)` reads every in-scope file's content at `base` through ONE `git cat-file --batch`
   process (paths from `git ls-tree -r --name-only <base>` filtered by the same scope and ignore rules),
   runs `detectClones` on it, and caches the result as `fsi-app/scripts/tmp/f45-base/<sha>.json` (gitignored
   scratch; a cache hit skips git). The check: `resolveRange()`; when `source` is `unavailable`, print the
   standing number and PASS (no baseline to compare; say so on the line). Otherwise HEAD's `duplicatedLines`
   must be `<=` the base's; above is a violation naming the delta and the clone pairs among changed files
   (keep today's pair-naming). The standing number is printed on every run as `F45 duplicated lines: N
   (base: M)`. The live test: HEAD `<=` base on this tree, and a fixture proof: a throwaway repo where two
   branches each remove a different duplicated block from a shared base merge clean and both pass against
   their base. Delete the exact-equality test and every "re-seed" message.
2. **Skill contract by acknowledgment file.** Delete `contentHash` and `citingFiles` from `PINNED_MANIFEST`
   (keep `skillPath`); derive citing files by the existing `scanCitations`. New rule, range-based via
   `change-range.mjs`: if the range changes a pinned `SKILL.md`, or adds, removes or moves a
   `GOVERNING SKILL(S)` citation of it (compare `scanCitations` on HEAD with the same scan on the base tree
   read through `gitFileAtBase`), the range must add `fsi-app/.discipline/governance/skill-acks/<YYYY-MM-DD>-<lane>.md`
   naming the skill and listing the citing files reviewed (shape: `## Skill`, `## Citing files reviewed`).
   `--check` becomes: every pinned skill file exists; every citation resolves; and the range rule above when a
   range is available. Acks are never deleted by a lane; the coordinator's close lane prunes them. Tests:
   red for a changed skill file without an ack, red for a moved citation without an ack, green with the ack;
   the no-range case passes and says so.
3. **Marker counts against the merge-base.** Wherever `SKILL_MARKER_BASELINE` is consumed (grep; the
   invariant-coverage meta-gate), replace "count on HEAD must be at least the stored baseline" with "count
   on HEAD must be at least the count on the merge-base tree" (scan the base through `gitFileAtBase` over
   `MARKER_SOURCE`'s file set at base), skipped with a printed note when no range. Delete the constant.
4. `reseed-f45.mjs` and `repin-skills.mjs` are local coordinator scripts, not in the repo; say so. If a copy
   exists under `fsi-app/scripts/coordinator/`, STOP and report.

## Write set (exact)

- `F45-duplicate-code.mjs` and its test; `skill-contract-map.mjs` and its test; the invariant-coverage
  meta-gate file (marker-count rule only) and its test; the constants home N5 named (delete
  `SKILL_MARKER_BASELINE` only); `fsi-app/.gitignore` if `scripts/tmp/` is not already ignored (it is, per
  CLAUDE.md rule 5; verify).
- The invariants for F45 and for the skill contract (find by `fitness:F45` and by the skill-contract
  selftest citation): `text` and `residual` only.
- `docs/dispatches/lane-common-contract.md`: the F45 re-seed bullet and the skill re-pin bullet become the
  merge-base rule and the ack file.
- `docs/ops/session-log.d/2026-09-19-n4.md` (new; heading `## 2026-09-19, lane N4: <one line>`; ends with
  `### UX compliance (N4)`: Not a UI change; no customer surface touched by this branch.)

## Acceptance (paste the evidence)

- `node --test` on the three test files: all pass; each red test shown RED first.
- `node fsi-app/.discipline/fitness/runner.mjs --function=F45`: the standing number and the base number
  printed, PASS.
- `grep -rn "DUPLICATED_LINES_CEILING\|contentHash\|SKILL_MARKER_BASELINE" fsi-app/.discipline`: only history
  comments, no live use.
- `node fsi-app/.discipline/governance/skill-contract-map.mjs --check`: OK on your branch (your range changes
  no skill file).
- The push gate through the wrapper, once, last.
