# Lane W10-FactCard-e: the operator's sign-off corrections (coordinator, 2026-09-22)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-w10-factcard` (node_modules and Playwright present). Branch: `lane/w10-factcard-e`, cut from `origin/master` (at or past `bfde1be8`). Read `docs/dispatches/lane-common-contract.md`, `docs/design/ux-laws.md`, `docs/design/design-principles.md`, parts-brief section 2.1, and panel 21c (`docs/design/handoff-2026-09-07/screens/21-detail-parts.png`, Read tool). STOP on anything not covered.

## The operator's sign-off (2026-09-22), quoted in full; typography only in ASCII

```
CLAUDE DESIGN - 2026-09-22 - FACTCARD: SIGNED WITH TWO CORRECTIONS

Panel 21c fixture matches the artboard: card heights, kind bands, edges,
figure leads, item groups with band pills, ACTION strips. Sign-off stands
once these land; no re-review needed for them, include them in the lane PR.

1. PROVENANCE COLUMN CLIPS. "example.org" (link) is the third line and a fourth
   line is cut off under it on every default card. The column is overflow:
   hidden at the card body height. Fix: column is not clipped; it is at
   most FOUR lines, 10.5px / 1.45, gap 2px: (1) T-square + source name
   (2) organisation (3) link (4) accessed date. If the source name needs
   two lines, drop the organisation line, not the accessed date.

2. NO GENERIC TEXT IN ANY FIXTURE. "Example Regulation, Article 6",
   "Example Regulatory Body", "example.org", "10000 HKD / mo" fixtures with
   fake sources: replace with real records from the database, as the
   artboard does: Decision 1999/652/EC . European Commission . EUR-Lex .
   eur-lex.europa.eu . accessed 4 Sep 2026, and the Belgian figures in 21c
   (HKD 14,747 / mo, Indeed HK . 2025-09 for the matrix variant). Fixtures
   read from a frozen real record, never from invented strings. Rule
   applies to every part lane from here: a fixture with placeholder text
   is not reviewable.

3. Minor, same PR: "RECOVERY / RECYCLI..." truncates: the sub-label under
   the figure lead is nowrap but may use the full 132px; reduce
   letter-spacing to .04em before ellipsising. The "10 more facts below"
   line is fixture chrome, remove from the part.

Next lane (ItemGroup + SectionHeader) may start.
```

## Build

1. Provenance column: no `overflow: hidden` clip; at most four lines at 10.5px / 1.45 with 2px gap in the order the sign-off gives; when the source name wraps to two lines the ORGANISATION line is dropped, never the accessed date; the card grows if the column is taller than the claim (no clamp against body height). Test: the four-line case renders all four; the two-line-name case renders name, link, date and no organisation.
2. Frozen real fixtures. Read, SELECT only, the real records the artboard uses: the item whose instrument is Decision 1999/652/EC (European Commission, EUR-Lex source, accessed 2026-09-04 per the capture) and the Belgian labour-cost figures item behind panel 21c's matrix (HKD 14,747 per month, Indeed HK, 2025-09). Write their claims, provenance and figures to ONE frozen JSON fixture file under `src/components/ui/__fixtures__/` (or the existing fixtures home if one exists; grep first) with a header naming the item ids, the query and the date frozen. Every FactCard, ItemGroup and matrix fixture and `/admin/parts/fact-card` render from that file; every invented string ("Example Regulation", "Example Regulatory Body", "example.org", "10000 HKD / mo", and any other placeholder) is gone. A test fails if any fixture text matches /example\.(org|com)|Example (Regulation|Regulatory)/i. If either record cannot be found by SELECT, STOP with the query you ran.
3. Figure-lead sub-label: `letter-spacing: .04em` first, nowrap, full 132px, ellipsis only after that. "N more facts below" is removed from the part (the ItemGroup disclosure is the only overflow affordance).
4. Real guard locally to PASS twice (`node .discipline/rendering/run-rendering-guard.mjs` from `fsi-app`, output to file); the panel-21c acceptance spec still passes; add the four-line provenance and the two-line-name cases to the fixture page and the spec.
5. Presence report and "UX compliance" block in `docs/ops/session-log.d/2026-09-22-w10-factcard-e.md`.

## Gates

Every npm suite with CI's shared script, `tsc`, the FULL fitness runner (all functions) to 0 violations, restore `coverage-report.json` if dirtied, then the locked push gate once as one background task (silence normal; `signal 9` is contention, wait and retry once). First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, then `remediation-discipline`. Never `git stash`, never `git add -A`, never `--no-verify`. Trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. F42, F45, F49, F43 bind. No workaround. You do not push.

## Report

ONE final report, six lines maximum, sent once: commit sha; the two item ids frozen; the guard's two results quoted; npm totals, fitness violations, gate exit code; any STOP. Write `pr-w10-factcard-e.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (the coordinator's scratchpad): first line `## Lane W10-FactCard-e: the operator's sign-off corrections (provenance column, frozen real fixtures, sub-label)`, `## Summary`, `## Evidence`, `## UX compliance`, last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
