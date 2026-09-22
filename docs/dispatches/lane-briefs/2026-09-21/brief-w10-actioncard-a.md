# Lane W10-ActionCard-a: the ActionCard, Timeline and SectionIndex parts, built to panels 21a and 21b (coordinator, 2026-09-21)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-l34-detail-admin-primitives` (has node_modules). Branch: `lane/w10-actioncard-a`, cut from `origin/master` (at or past `6f3ebd42`). Read, in this order: `docs/dispatches/lane-common-contract.md`; `docs/design/ux-laws.md`; `docs/design/design-principles.md`; `docs/design/parts-brief-2026-09-18.md` section 1 and sections 2.3 (SECTION HEADER), 2.4 (MASTHEAD) and 2.6 (ACTION CARD); the bundle README's text for those parts; the pictures `docs/design/handoff-2026-09-07/screens/21-detail-parts.png` (panels 21a, 21b) and the regulation detail artboard (artboard 3) in the same folder: open them with the Read tool before writing component code; layout IS the question. The operator's review below is the spec. Where the review and the artboard disagree, the artboard wins and you say so. A case not drawn is ASKED (STOP), never invented.

## THIS LANE IS PART A OF TWO, and its file boundary is hard

Lane W10-FactCard-d is editing, right now, in another worktree: the four detail surfaces (`RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx`, the research and operations detail surfaces), `FactCard.tsx`, `fact-card-model.ts`, their tests, `src/app/admin/parts/page.tsx` and `src/app/admin/parts/fact-card/`. You touch NONE of those. You build the PARTS as new files (or edit existing shared part files that lane does not touch; check `DetailShell.tsx` and `primitives.tsx` with `git log -3 --oneline -- <file>` and the window count before editing; if a part you must change lives inside one of the forbidden files, STOP and name it). Part B (after FactCard-d merges) wires your parts into the regulation surface, applies the section order and the Summary mode rule, and adds your fixture pages to the parts index. Write part B's exact to-do list in your report file so it can be briefed from it.

## The operator's review (2026-09-21), quoted in full; only typography differs (arrows, comparison signs and some dashes in ASCII); no number, word or requirement is changed

```
CLAUDE DESIGN - 2026-09-21 - /regulations/[slug] REVIEW: FAILS 2.4, 2.6,
2.3. Nothing below is new; it is 21a/21b applied to a real record.

1. ACTION CARD: three cards must be ONE (2.6, panel 21b)
   The band-pill strip, EXPOSURE and TIMELINE are one card:
   pill row, action row, 1px rule, EXPOSURE, 1px rule, TIMELINE, callout.
   Two 40px gaps and two card borders disappear; the page gets
   ~120px back above the fold.
   a. Remove the "workspace tags" label when there are no tags (21b note).
   b. Remove the overflow "..." after the band pill; the row's overflow
      lives on list rows, not here.
   c. Right half of the pill row is empty because the row is left-aligned
      in a 100% card. Meta ("4 sources . T1 primary . regenerated Sep 18")
      right-aligns; pill + kind + tier left. Same row, no dead space.

2. EXPOSURE: a 4-column grid with one 8-line cell and three 1-line cells
   is the empty space you circled. Rule: EXPOSURE cells are <= 3 lines
   (2.6, "3-line clamp"). Trajectory is not prose; it is the timeline.
   Cells are WHERE . WHO PAYS . YOUR LANES . NEXT MILESTONE ("Transition
   deadline . 29 Sep 2026 . in 8 days"). The trajectory sentence, when the
   pipeline produces one, goes in S1 Summary. Absence in a cell is the
   small-caps reason, not "NOT IN PRIMARY SOURCE" in caps as body text.

3. TIMELINE: dots without names is not a timeline (2.6, artboard 3).
   Each milestone: date above the track, LABEL below it, 10.5px, ellipsised
   to the segment width; hover shows the full label. Passed = filled green;
   next = larger dot in the band colour with a ring; ahead = hollow. Track
   green to today, grey beyond. Header right: "7 milestones . 3 passed .
   next 29 Sep". Below the track the callout StateNote in the band tint:
   "Next: Transition deadline . 2026-09-29 . in 8 days" with "Full schedule"
   and a down arrow. Seven dates on one line at 1440 is fine; more than
   eight collapses to the next-three plus "+N".

4. SECTION INDEX: labels are truncating mid-word ("S2 Obligations - issue").
   The index shows Sn + SHORT NAME only (<= 14 chars): Summary . Obligations
   . Compliance . Requirements . Registration . Operations . Penalties .
   Sources. Full name is the section header, not the tab.

5. SECTION ORDER for the regulation surface (rules for what a reader needs
   first): S1 Summary . S2 Obligations (what you must do) . S3 Substantive
   requirements (what the rule says) . S4 Registration & reporting . S5
   Operational requirements . S6 Compliance chain . S7 Penalties . S8
   Sources. Substantive requirements moves up; compliance chain moves down.
   Same order on every regulation.

6. SUMMARY | FULL BRIEF switch: it sits alone in a row under the index and
   costs 60px. Move it into the right end of the index bar as a two-state
   segmented control. Summary mode shows S1 only plus the first card of S2.

7. SUMMARY card "WHAT CHANGED . record-briefs-007": an internal id is not
   reader content. Show the change sentence or omit the block.

8. RAIL is correct (At a glance, Impact assessment). Keep.

Acceptance at 1440: masthead + one action card + index all visible above
1080px; 0 empty grid cells > 1 line tall in EXPOSURE; every timeline dot has
a visible label; index labels never truncate; no standalone switch row.
Re-send this exact record when done.
```

## Build (part A)

1. Enumerate first (grep, then read): which existing components draw today's band-pill strip, the EXPOSURE grid, the timeline, the section index and the Summary or Full brief switch on the regulation detail, and which of them are shared by the other three details. Put the list (component, file, which surfaces use it) at the top of your report file. Reuse before construction: a part that exists is corrected in place if it is outside the forbidden set; a part that does not exist is one new file under `src/components/ui/` or `src/components/detail/` following the existing parts' conventions.
2. **ActionCard** (`data-part="action-card"`), ONE card: pill row (pill, kind and tier left; meta right-aligned in the same row; no overflow control; no "workspace tags" label when there are no tags), action row, 1px rule, EXPOSURE, 1px rule, TIMELINE, callout. Props are plain data (no database read, no fetch inside the part).
3. **EXPOSURE** inside it: four cells WHERE, WHO PAYS, YOUR LANES, NEXT MILESTONE; every cell clamps at 3 lines; an absent value renders the existing Absence convention (the small-caps reason), never caps body text. The trajectory sentence is NOT a cell; part B routes it to S1.
4. **Timeline** (`data-part="timeline"`): review item 3 exactly, including the header-right count, the three dot states, the track colouring to today, the collapse rule above eight milestones (next three plus "+N"), the full label on hover AND reachable by keyboard focus (ux-laws), and the callout as the existing StateNote part in the band tint if StateNote exists; if it does not, STOP on that one item and build the rest. Date maths is pure, tested, and pins `timeZone: "UTC"` (F36).
5. **SectionIndex** (`data-part="section-index"`): shows Sn plus a SHORT NAME of at most 14 characters, from one table in one module (regulation surface: Summary, Obligations, Requirements, Registration, Operations, Compliance, Penalties, Sources, in the review's item 5 ORDER); labels never truncate at 1440 or 375 (at 375 the bar scrolls horizontally inside itself, the page never does); the right end carries the two-state segmented Summary or Full brief control. A test fails if any short name exceeds 14 characters.
6. **Fixtures:** `/admin/parts/action-card` and `/admin/parts/section-index` (new route folders only; do NOT edit `src/app/admin/parts/page.tsx`), platform-admin gated like `/admin/parts/fact-card`, static data taken from the review's own example (7 milestones, 3 passed, next "Transition deadline" 2026-09-29; meta "4 sources, T1 primary, regenerated Sep 18"), plus the edge cases: no tags, an absent EXPOSURE cell, 9 milestones (collapse), 1 milestone, all passed.
7. **Acceptance as a rendered measurement** in the UX smoke slot for the fixture at 1440 and 375: one card (one border box) containing pill row, EXPOSURE and timeline; no EXPOSURE cell taller than 3 lines; every rendered dot has a visible label; no index label with `scrollWidth > clientWidth`; no standalone switch row; no horizontal page overflow. Detector core proven red then green in the no-npm suite as `ux-assert.test.mjs` does. Playwright is not installed here by operator ruling; the Rendering guard judges it on GitHub.
8. Report file `docs/ops/session-log.d/<date>-w10-actioncard-a.md`: the enumeration, a "UX compliance" block, the presence report (none yet for new parts; say so), and PART B's exact to-do list: wire ActionCard into the regulation surface replacing the three cards; section order per review item 5 on every regulation; Summary mode shows S1 plus the first card of S2; the "WHAT CHANGED" block shows the change sentence or is omitted, never an internal batch id (review item 7: find where `record-briefs-007` reaches the DOM and name file and line); the trajectory sentence to S1; add the fixture links to the parts index; find the exact record the operator reviewed (next milestone "Transition deadline" on 2026-09-29, 7 milestones) by a read-only SELECT so it can be re-sent.

## Gates

- `npm ci` in your worktree's `fsi-app` if `node_modules` is missing (the push gate now runs the npm suites and the goldens, lane G2). Run every npm suite with CI's shared script, `tsc`, the FULL fitness runner (all functions) to 0 violations; restore `fsi-app/.discipline/governance/coverage-report.json` with `git checkout --` if dirtied; then the locked push gate once, last, as one background task (long silence is normal). A FAIL from your change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP with the failing line (grep the newest `/tmp/discipline-prepush.*/t.log` for lines starting with the cross mark).
- F51 check 5: count touches with `git log --first-parent -30 --format=%H origin/master` and per-commit `git diff-tree --no-commit-id --name-only -r`; a non-entry-directory file already at two is a STOP with its name. `ListRow.tsx` and its tests were touched today by lane CommandBar: do not edit them.
- First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, then `remediation-discipline`. NEVER `git stash`. Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. F42, F43, F45, F49, F36, F40 bind. A new component with no production importer fails F25: the fixture pages are its importers for part A; if F25 does not accept an admin fixture as a production importer, STOP with F25's message (do not allowlist). You do not push. No workaround of any kind. Past about 400k tokens, commit what is green and report exactly which build items are done.

## Report

ONE final report, six lines maximum, sent once, no interim messages: commit sha(s); build items done; npm totals, fitness violations, push gate result; any place the artboard and the review disagree; any STOP with its measurement. Write the PR body `pr-w10-actioncard-a.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (the coordinator's scratchpad, `C--Users-jason`, not your own): FIRST line is the title `## Lane W10-ActionCard-a: ActionCard, Timeline and SectionIndex parts to panels 21a and 21b (part A of 2)`, then `## Summary`, `## Evidence`, `## UX compliance`, last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
