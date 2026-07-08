# Blind-CI-Window Audit — 2026-07-08

**Trigger.** The branch-protection proof (PR #257) forced the question the hand-maintained test
list had been hiding: `run-test-suite.sh`'s `src/**` section was an explicit file list that
silently omitted several red-then-green suites, so those guards did **not** run in CI (nor pre-push)
for some window. PR #256 replaced the hand list with directory globs (join-by-construction) and
moved npm-dep tests to a `*.npmtest.mjs` CI step. This audit answers: **what shipped unverified
during the dark window, and is any of it broken?**

Fix landed at #256 (`fa8ff3f`, merged `2a07500`). "Window end" = `fa8ff3f` below.

## (a) Dark suites and window length

Set subtraction: test files present in the now-globbed dirs at `fa8ff3f^` **minus** the pre-#256
explicit list = the suites CI never ran. Eight found. First-add commit = window start.

| Suite | Guarded module | Window start | Length (to #256) |
|-------|----------------|--------------|------------------|
| `src/__tests__/leakage-fix-classifier.test.mjs` | `src/lib/domains.ts` | bebec9f · 2026-05-23 | **~46 days** |
| `src/lib/agent/parse-output-blocklist.test.mjs`¹ | `src/lib/agent/parse-output.ts` | acc5356 · 2026-06-25 | ~13 days |
| `src/lib/sources/host-authority.test.mjs`¹ | `src/lib/sources/host-authority.ts` | 743594a · 2026-06-25 | ~13 days |
| `src/lib/agent/prompt-cache.test.mjs` | `prompt-cache.mjs` | d994a92 · 2026-07-07 | < 1 day |
| `src/lib/agent/timeline-harvest.test.mjs` | `timeline-harvest.mjs` | c0f1622 · 2026-07-07 | < 1 day |
| `src/lib/sources/cited-host-gate.test.mjs` | `cited-host-gate.mjs` | d32c7e0 · 2026-07-07 | < 1 day |
| `src/lib/sources/content-change.test.mjs` | `content-change.mjs` | cd9b63d · 2026-07-08 | < 1 day |
| `src/lib/sources/portal-links.test.mjs` | `portal-links.mjs` | 55d5745 · 2026-07-08 | < 1 day |

¹ renamed to `*.npmtest.mjs` at #256 (they import via jiti); they ran in **no** CI job before #256.

Root cause is the two-homes defect one layer up: the src section of the test list was a
hand-maintained enumeration, so any new `*.test.mjs` was dark until someone remembered to list it.
`credibility/*.test.mjs` was already a glob (so `chip-selection` was covered); every other dir was
a hand list. #256 makes all of them globs.

## (b) All eight pass in isolation (not green-only-because-unrun)

Ran each dark suite on its own on current master:

- 6 no-npm suites: **52 tests, 52 pass, 0 fail.**
- 2 `*.npmtest.mjs` suites (with `node_modules`): **10 tests, 10 pass, 0 fail.**

All 62 assertions are real test bodies (not empty/skipped shells). None was passing merely by never
executing.

## (c) Window-merge walk — nothing a dark guard would have caught shipped

Method: a dark suite can only have missed a regression if the code it guards **changed** while it
was dark. For each guarded module, `git log <window> -- <module>`:

- **`domains.ts`** (46-day window): **0 in-window changes.** For scale: **81 merges** landed on
  master during that window; **0** touched `domains.ts`, `parse-output.ts`, or `host-authority.ts`.
- **`parse-output.ts`** (13 days): **0 in-window changes.**
- **`host-authority.ts`** (13 days): **0 in-window changes.**
- The 5 same-session modules: each is **exactly 1 commit** (created with its test, atomically), and
  the module has **never been modified since**. Their dark window is the few hours between their
  merge and #256, during which their own code did not change.

A dark guard over code that never changed catches nothing — there was no transient red and no
shipped-broken state. Confirmed independently by (b): every suite is green on current master, which
is the accumulation of all 81 window merges.

## (d) Fix-forward

**None required.** No red surfaced: guarded code was static through every dark window, and all eight
suites are green on master now (and, post-#256, run in CI + pre-push by construction so they cannot
go dark again).

## Verdict

The blind window was **real** (CI coverage gap, up to 46 days for one suite) but **inconsequential**
(zero regressions possible — guarded modules unchanged in-window; all suites green). The class defect
(hand-list) is closed by #256's globs; the guarantee is closed by branch protection (proven at #257).
**This audit clears; flip-readiness is not blocked by unverified merges.**
