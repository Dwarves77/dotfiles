# Lane W10-FactCard-d: FactCard NOT SIGNED; rebuild to panel 21c, inside its ItemGroup (coordinator, 2026-09-21)

Model: Sonnet. Worktree: `C:/Users/jason/dotfiles/.worktrees/wt-w10-factcard` (has node_modules). Branch: `lane/w10-factcard-d`, cut from `origin/master` (at or past `6f3ebd42`). Read, in this order: `docs/dispatches/lane-common-contract.md`; `docs/design/ux-laws.md`; `docs/design/design-principles.md`; `docs/design/parts-brief-2026-09-18.md` section 1 and sections 2.1 (FACT CARD) and 2.2 (ITEM GROUP); the bundle README's FactCard and ItemGroup text; and the picture `docs/design/handoff-2026-09-07/screens/21-detail-parts.png` (open it with the Read tool: layout IS the question here; panel 21c is the standard). The operator's review below is the spec and wins over every earlier brief and over the current fixture. Where the review and the artboard disagree, the artboard wins and you say so in your report. A case not drawn is ASKED (STOP), never invented.

## The operator's review (2026-09-21), quoted in full; only typography differs from what was sent (multiplication signs, comparison signs and arrows are written in ASCII, some dashes as punctuation); no number, word or requirement is changed

```
CLAUDE DESIGN — 2026-09-21 — FACTCARD: NOT SIGNED <!-- glyph:verbatim -->

Measured against screens/21-detail-parts.png panel 21c. The fixture is a
gallery of 13 isolated cards; 21c is two ITEM GROUPS of 2–3 cards each with <!-- glyph:verbatim -->
an ACTION strip. Judge the part inside its group, not alone.

Defects, in order of size:

1. HEIGHT. 21c cards are 90–130px tall; yours are 180–220px. Causes: <!-- glyph:verbatim -->
   a. Card padding: spec is 12px 14px body, 6px 14px kind band. You have
      roughly 24px all round. Restore.
   b. Provenance column is stacking 5 lines at wide line-height. Spec:
      10.5px / 1.45, gap 2px, T-square inline with the source name, four
      lines max. Column 150px, left rule 1px, no padding-top.
   c. Empty figure-lead column. When there is no figure lead (Legal
      confirmation, Scope, Definition, Inference) the grid is 1fr 150px — <!-- glyph:verbatim -->
      the 132px column does not exist. Yours keeps a blank 132px column on
      every card.
   d. Line-height on the claim: 13px / 1.6, not 1.9.
   e. Min-height: none. A one-sentence Definition is one line tall.

2. COUNT. 21c never renders more than 3 cards in a group and never renders
   two cards of the same kind back to back. Your density fixture shows
   Scope x3, Definition x2, Inference x2. The rule is in the pipeline
   mapping, not the component: consecutive facts of the same kind in one
   item MERGE into one card with a stacked claim (each claim its own
   paragraph, its own provenance line). A group is <= 4 cards; overflow
   goes behind "N more facts" with an arrow, as on the operations panel.

3. WHITESPACE ABOVE EACH CARD. The kind label ("Deadline (no form)") is
   rendered as an external caption above every card. Nothing sits above a
   card. The kind word lives in the kind band only. Remove the captions:
   they were fixture labels and have leaked into the layout.

4. FIGURE LEAD. Correct type (Anton 22, coloured) but the sub-label is
   wrapping to two lines in 132px ("RECOVERY / RECYCLING" is fine, it is
   a deliberate slash pair; "BEFORE NEXT SHIPMENT" wrapping is not). The
   sub-label is 10px uppercase, nowrap, ellipsised if it must be.

5. GROUP CONTEXT MISSING. There is no ItemGroup in the fixture: no band
   pill header, no 1px group divider, no ACTION strip. FactCard cannot be
   signed without its group because the tint rhythm (band pill, then white
   or tinted cards, then tinted ACTION strip) is what makes the page
   scannable. Rebuild the fixture as 21c: two groups, five cards, two strips.

6. Tints are right. Edges are right. Kind vocabulary is right. Provenance
   link is right. Keep those.

Acceptance for re-review, measured at 1440:
- fixture = panel 21c, same content, <= 1100px total height for both groups
- every card <= 140px unless the claim exceeds 4 lines
- 0 external captions above cards; 0 empty 132px columns
- 0 adjacent cards of the same kind
- each group has band pill + ACTION strip
Then send the real /regulations/[slug] page for one 300-character record so
I can see it in flow, not in a gallery.
```

## Premises checked by the coordinator on `6f3ebd42`

- [CONFIRMED by grep] NO ItemGroup part exists under `src/` (no `ItemGroup`, no `data-part="item-group"`). You build it, as parts-brief 2.2 defines it, ONE file, `data-part="item-group"`, used on all four detail surfaces wherever fact cards render in S2. SectionHeader is NOT yours (its own lane).
- [CONFIRMED by window count] `FactCard.tsx` and `FactCard.npmtest.mjs` are at 3 master touches and already carry dated `HOTSPOT_ALLOWLIST` entries. `src/lib/detail/fact-card-model.ts` and `fact-card-model.test.mjs` are at 2: your edit is the third. Coordinator ruling, identical to the one made for `FactCard.tsx` today (serial lanes by one owner on the part's single home, no concurrent editor; lane F51c, owed, fixes the class): add TWO dated entries to `HOTSPOT_ALLOWLIST` in `F51-no-shared-append.mjs` for those two paths, `decidedOn: '2026-09-21'`, reason: "coordinator, lane W10-FactCard-d: serial part lanes by one owner (parts 1, 2, c, d) each edited the FactCard model's single home after the previous one merged; no concurrent editor. Delete once the file has left the 30-commit window." No other entry. Any OTHER file of yours at two master touches is a STOP with its name (count with `git log --first-parent -30 --format=%H origin/master` and per-commit `git diff-tree --no-commit-id --name-only -r`).

## Build

1. **The part (review items 1, 3, 4, 6).** Exact numbers from the review: body padding 12px 14px; kind band 6px 14px; claim 13px / 1.6; provenance column 150px, left rule 1px, no padding-top, 10.5px / 1.45, gap 2px, tier square inline with the source name, four lines max; figure-lead column 132px ONLY when a figure lead exists, otherwise the grid is `1fr 150px`; no min-height; lead sub-label 10px uppercase, nowrap, ellipsis (a deliberate slash pair may break at the slash only). Nothing renders above a card. Keep tints, edges, the kind vocabulary and the provenance link exactly as they are. `density="matrix"` keeps its own declared sizes; do not regress it (run its suite).
2. **The merge rule (review item 2), in the model, not the component.** In `fact-card-model.ts`: consecutive facts of the same kind within one item merge into ONE card with stacked claims, each claim its own paragraph with its own provenance line. Tests: no two adjacent cards of one kind for any input; order preserved; a merged card keeps every claim and every provenance; the no-lead and led cases merge only with their own kind.
3. **ItemGroup.** Band pill header, 1px group divider, the cards, the tinted ACTION strip, as 21c and parts-brief 2.2 draw them. At most 4 cards visible; the rest sit behind "N more facts" with an arrow, the same disclosure the operations panel uses (reuse that control; closed by default, F43). Where the ACTION strip's content comes from on a real item: read 2.2 and the artboard; if the data source for the strip is not stated there or in the model today, STOP and ask, do not invent a field.
4. **Call sites.** All four detail surfaces render fact cards through ItemGroup; no page hand-builds a group (F49). Presence report (route, file, line) for FactCard and ItemGroup in your `docs/ops/session-log.d/` file, with a "UX compliance" block.
5. **The fixture.** `/admin/parts/fact-card` is rebuilt AS panel 21c: two groups, five cards, two strips, the same content as the artboard, no captions. The variant gallery (kinds, no-lead, long claim, no provenance, matrix) moves BELOW it under one plain heading, each variant inside a group, never a caption above a card. Add `/admin/parts/item-group` to the index.
6. **Acceptance, measured, not read.** Add a rendered measurement for the fixture at 1440 to the UX smoke slot, asserting the operator's acceptance list: both 21c groups together at most 1100px tall; every card at most 140px unless its claim exceeds four lines; zero elements between a group's children above a card; zero cards with a lead column and no lead; zero adjacent same-kind cards; each group has a band pill and an ACTION strip. Playwright is not installed here by operator ruling: write the spec, prove the detector core red then green in the no-npm suite as `ux-assert.test.mjs` does, and the Rendering guard judges it on GitHub. Put the measured numbers you CAN get locally (computed from styles, or none) in the report, labelled.
7. For the operator's "real page" request: in your report name ONE regulation slug whose record is about 300 characters, found with a read-only SELECT through the repo's read client (SELECT only; never a length function over the capture text column; `full_brief` or the record field is fine), so the coordinator can send the link after deploy.

## Gates

- EVERY worktree needs `npm ci` before its gate now (lane G2): the push gate runs the npm suites and the goldens. Run every npm suite with CI's shared script, `tsc`, the FULL fitness runner (all functions) to 0 violations; restore `fsi-app/.discipline/governance/coverage-report.json` with `git checkout --` if dirtied; then the locked push gate once, last, as one background task (long silence is normal). A FAIL from your change is fixed at the cause and the gate runs once more; a second FAIL on the same step is a STOP with the failing line (grep the newest `/tmp/discipline-prepush.*/t.log` for lines starting with the cross mark).
- First tool calls: Skill tool, `fsi-app:environmental-policy-and-innovation`, then `frontend-design`, then `remediation-discipline`.
- NEVER `git stash` (an agent did today; clean master is `git worktree add --detach <scratch path> origin/master`). Never `git add -A`, never `--no-verify`. Never run `repin.mjs`, `reseed-f45.mjs`, `repin-skills.mjs`, `resolve-conflicts.mjs`. Commit trailer exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No em dash, en dash or section sign in new prose. F42, F45, F49, F40, F43 all bind. You do not push. No workaround of any kind. Past about 400k tokens, commit what is green and report exactly which numbered build items are done.

## Report

ONE final report, six lines maximum, sent once, no interim messages: commit sha(s); which build items are done; npm totals, fitness violations, push gate result; any place the artboard and the review disagree; the slug for item 7; any STOP with its measurement. Write the PR body `pr-w10-factcard-d.md` into `C:/Users/jason/AppData/Local/Temp/claude/C--Users-jason/fddbeade-7f79-480a-9254-e8fdb3278567/scratchpad/` (the coordinator's scratchpad, `C--Users-jason`, not your own): FIRST line is the title `## Lane W10-FactCard-d: FactCard rebuilt to panel 21c inside its ItemGroup (not signed 2026-09-21)`, then `## Summary`, `## Evidence`, `## UX compliance`, last line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
