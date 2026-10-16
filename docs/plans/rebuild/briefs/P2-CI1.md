SLICE P2-CI1 the recurring review misses, fixed at the cause (Sonnet). BRANCH slice/p2-ci1. BUDGET 250 code lines under scripts/ci
plus one workflow step. Rules: WAVE-2-COMMON.md (read WHY-2026-10-16.md section 6 first: "a new rule per incident" is the failure;
this slice removes three manual steps rather than adding rules). Imports nothing under src. Runs now, parallel with P2-08, P2-09,
P2-S3; takes IMP-034, IMP-035 and IMP-050 off P2-08's list.

WHAT KEPT HAPPENING (eight slices reviewed, 2026-10-15/16): (1) every slice shipped one or two `Ported from` ranges a line or two
past the old file's length (lanes count lines with tools that differ on the trailing newline); each was caught by a separate Haiku
audit after the PR, costing a fix commit and a second CI run. (2) Lanes left PR body line 9 (the CI run id) unfilled, or their
`gh pr edit` was refused. (3) Two shared files, scripts/ci/new-files.txt and tests/core/structure.test.ts, conflicted on every
parallel merge, forcing a merge commit and a second run per slice.

DELIVER
1. scripts/ci/old-tree-lines.json: a manifest {path: lineCount} for every file under fsi-app/ at the old repo's master commit
   646fb098c (generated once by scripts/gen/old-tree-lines.mjs from a local checkout: `git -C <old> ls-tree -r --name-only
   646fb098c -- fsi-app | while read f; do git show 646fb098c:$f | wc -l; done`, written sorted; the generator is committed and the
   manifest header names the commit). Line counts are `wc -l` counts (newline-terminated lines); state that convention in the
   file and in README so a lane counts the same way. About 5,000 entries; data, not code.
2. scripts/ci/tree-checks.mjs: every `// Ported from old_repo/<path> (lines a-b[, c-d ...])` header is parsed with comma-separated
   ranges (IMP-035); each range must satisfy 1 <= a <= b <= manifest[path]; a path absent from the manifest fails ("not in the old
   tree at 646fb098c"); the check runs over the WORKING TREE (git ls-files plus untracked, minus ignored), so an untracked headerless
   file fails locally exactly as on the PR (IMP-050); `npm run tree-checks` prints the first ten failures with file:line.
3. scripts/ci/new-files/ : one allow-file per slice (`<slice>.txt`, same `path | reason` lines); tree-checks reads the directory;
   the existing new-files.txt is split by the slice that owns each line (the reason text names it) and removed. Document in README.
4. tests/core/structure.test.ts: the route-count assertion and the guard regex that every slice edited become data-driven: the test
   reads the list of route files from the tree and asserts every handler imports a guard; no per-slice literal remains to conflict.
5. .github/workflows/ci.yml: a final step in the `ci` job, on pull_request only, that posts or updates ONE comment on the PR
   with the run id, the per-job conclusions and the loc table from the job summary (GITHUB_TOKEN with pull-requests: write; the
   step uses `gh api` and an HTML marker so it updates rather than appends). Lanes no longer edit line 9 by hand; the brief's line 9
   becomes "see the CI comment" and the coordinator reads it there. Keep it the ONE workflow.
6. Prove each by attack in the PR itself: a planted header with a range one past the file, a planted header with an unknown path,
   an untracked headerless file, a route file without a guard; each must fail locally; remove the plants before pushing and list
   them in the report.

LANDING: PR "P2-CI1 header ranges in CI, per-slice allow-files, CI comment (<LOC> lines)"; one CI run; report the manifest size,
the plants and their failures, and the first run's comment URL.
