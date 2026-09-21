# Lane W10-CommandBar, Amendment 1 (coordinator, 2026-09-21): the Rendering guard's review of PR #769. Read after `brief-w10-commandbar.md`; this file wins.

State: PR #769, branch `lane/w10-commandbar`, pushed sha `89fc5671`, worktree `C:/Users/jason/dotfiles/.worktrees/wt-l34-detail-admin-primitives`. Every local gate passed. On GitHub the Rendering guard FAILED, on the new `/search` page only (fixtures 14, checks 746, 6 failures), verbatim:

```
✗ search-results:one-row@375: placeholder literal rendered — Tier <!-- glyph:verbatim -->
✗ search-results:extreme@375: placeholder literal rendered — Tier <!-- glyph:verbatim -->
✗ search-results:one-row@1280: placeholder literal rendered — Tier <!-- glyph:verbatim -->
✗ search-results:one-row@1280: 3 text run(s) clipped with no ellipsis, span[Juris.] +6px, span[Timeline] +21px, span[Tier] +7px
✗ search-results:extreme@1280: placeholder literal rendered — Tier <!-- glyph:verbatim -->
✗ search-results:extreme@1280: 3 text run(s) clipped with no ellipsis, span[Juris.] +6px, span[Timeline] +21px, span[Tier] +7px
```

You are a replacement agent (the lane ended at about 526k tokens). Do not redo the lane. Both failures are on the results page's column HEADER row (`Juris.`, `Timeline`, `Tier`).

Diagnose before fixing, and report what you found with a status token:
1. The existing list surfaces (start with `RegulationsLedger.tsx` and the shared list shell it uses) render the same column header words and PASS this guard on master. Find how: which shared part draws their header row, what grid and widths it uses, and how the word "Tier" there is not read as a placeholder literal (the detector is `src/lib/agent/source-entry-filter.mjs`, the table-header literal list near lines 17 to 26; the guard's placeholder leg and any slot or marker it honours live under `.discipline/rendering/`). [HYPOTHESIS, coordinator] `SearchResultsView.tsx` hand-built its own header row instead of using the shared header part, so it has neither the part's column widths (the clipping) nor the marker the guard honours (the literal).
2. Fix at the cause. If a shared header part exists, `/search` uses it, with the same grid as the rows beneath it (parts, not pages: no second header implementation, F45 and F49). If the existing surfaces pass only because their fixtures do not mount a header, or through an exemption that names them by path, STOP and report that with file and line: that is a guard defect for its own lane, and you do not add `/search` to any list. Never edit the detector's literal list, never add an exemption, never drop the header to pass.
3. The clipped runs: the header cells must fit their text at 1280 and at 375 without clipping (or carry a real ellipsis with the full word available, as the shared part does). Measure with the repo's own `ux-assert.mjs` detector core against your fixture if it runs without Playwright; do not install anything.
4. Run the npm suites you touched, `tsc`, the FULL fitness runner (all functions) to 0 violations, restore `coverage-report.json` if dirtied, then the locked push gate once as one background task (long silence is normal). Commit with the exact trailer. You do not push; the runner does, and the Rendering guard is judged again on GitHub.

Standing lines of the brief all still bind (no `git stash`, no `git add -A`, no `--no-verify`, no workaround, no dashes or section sign in new prose). First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`.

ONE final report, five lines maximum, no interim messages: commit sha; the cause with its status token and file:line; fitness violations and push gate result; whether the shared header part is now the only header implementation on `/search`; any STOP with its measurement.
