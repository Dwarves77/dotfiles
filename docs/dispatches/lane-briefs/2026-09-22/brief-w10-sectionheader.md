# Lane W10-SectionHeader: ItemGroup call sites complete, and the SectionHeader part (coordinator, 2026-09-22)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911` (node_modules and Playwright present). Branch: `lane/w10-sectionheader`, cut from `origin/master` (at or past `bfde1be8`). Read `docs/dispatches/lane-common-contract.md`, `docs/design/ux-laws.md`, `docs/design/design-principles.md`, parts-brief sections 1, 2.2 (ITEM GROUP) and 2.3 (SECTION HEADER), the bundle README's ruling 1 of 2026-09-20 ("no rule under the section TITLE ... the rule under the whole header block"), and artboards 3 and 21c (Read tool). The bundle is the standard; a case not drawn is ASKED. STOP on anything not covered. Do NOT touch `FactCard.tsx`, `fact-card-model.ts` or `/admin/parts/fact-card` (lane FactCard-e is editing them in parallel); coordinate through ItemGroup's props only.

## Operator rulings that bind

- 2026-09-22: "Next lane (ItemGroup + SectionHeader) may start."
- 2026-09-22 fixture rule, verbatim: "Fixtures read from a frozen real record, never from invented strings. Rule applies to every part lane from here: a fixture with placeholder text is not reviewable." Lane FactCard-e is freezing the two panel-21c records to a fixture file under `src/components/ui/__fixtures__/` (or the existing fixtures home); if it has not merged when you need it, freeze the same records yourself to the same path and shape (SELECT only; STOP if not found), and the merge resolves to one file.
- 2026-09-22: no analysis text is ever cut to fit a layout; the layout adapts.

## Build

1. ItemGroup [CONFIRMED gap on production `bfde1be8`]: the record-grade regulation page (`/regulations/f8268063-0e07-4562-82da-a1373d6dd797`) renders 4 fact cards with ZERO `[data-part="item-group"]`. Find the record-grade render path (grep the four detail surfaces and what they delegate to) and make every fact card on every surface, both grades, render inside ItemGroup; one home. Group title, band and ACTION sentence stay unset where the data has none (FactCard-d's documented STOP); never invented. Presence report: every ItemGroup call site (route, file, line) and the sentence "no fact card renders outside ItemGroup", proven by a test that mounts each surface's record-grade and full-brief fixtures and asserts every `[data-part="fact-card"]` has an `[data-part="item-group"]` ancestor.
2. SectionHeader (`data-part="section-header"`), one file: index plus Anton title plus right meta, with the 1px rule under the whole header block (ruling 1), never under the title alone; used by every S-section on every detail surface and everywhere else the parts inventory (`docs/design/parts-inventory.md`) lists an equivalent header; no page retypes it (F49). The section's FULL name is the header text (SectionIndex shows the short name; part A of ActionCard built that table; reuse `section-index-data.ts`, do not duplicate the names).
3. Fixture pages `/admin/parts/item-group` (exists; extend) and `/admin/parts/section-header` (new), from the frozen real record, no placeholder text; both in the parts index. Each measured by the guard at 375 and 1440 (no overflow; title never wraps one word per line, F35's title marker on the title).
4. Presence report for both parts and the "UX compliance" block in `docs/ops/session-log.d/2026-09-22-w10-sectionheader.md`.

## Gates

Real guard locally to PASS twice before the gate; every npm suite with CI's shared script; `tsc`; the FULL fitness runner to 0 violations; restore `coverage-report.json` if dirtied; the locked push gate once as one background task (silence normal; `signal 9` is contention, wait and retry once). First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, then `remediation-discipline`. Never `git stash`, never `git add -A`, never `--no-verify`. Trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. F42, F45, F49, F43, F36 bind. No workaround. You do not push. Past about 400k tokens, commit what is green and report which items are done.

## Report

ONE final report, six lines maximum, sent once: commit sha(s); ItemGroup call-site count and the record-grade fix file:line; SectionHeader call-site count; the guard's two results quoted; npm totals, fitness violations, gate exit code; any STOP. Write `pr-w10-sectionheader.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/`: first line `## Lane W10-SectionHeader: every fact card inside ItemGroup on both grades; the SectionHeader part`, `## Summary`, `## Evidence`, `## UX compliance`, last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
