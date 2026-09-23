# Lane W10-StateNote (remaining coordinator checks) session log (2026-09-23)

Replacement agent finishing the four checked items on top of the already-accepted StateNote
sign-off page + Masthead one-home fix (commit `07eb614f`). Worktree:
`C:/Users/jason/dotfiles/.worktrees/wt-landdocs-0911`, branch `lane/w10-statenote`, rebased on
master `c4b017be`, tree clean at start.

Skills loaded: `fsi-app:environmental-policy-and-innovation` (COMMON BLOCK first call), `frontend-design`
(COMMON BLOCK, UI work), `remediation-discipline` (COMMON BLOCK).

## Item 1, `data-part="state-note"` [CONFIRMED missing, fixed]

Grep for `data-part="state-note"` across `src/` found no matches. `StateNote.tsx`'s root `<div>`
carried no `data-part` attribute at all (every sibling part, Timeline, CommandBar, Masthead, does).
Fixed at the part: added `data-part="state-note"` to the root div in
`src/components/ui/StateNote.tsx`. One-line change, no visual effect. Re-ran the rendering guard
(below): PASS.

## Item 2, Timeline callout ONE home [REFUTED as literally stated]

Checked `MilestoneTimeline.tsx`: it is the dot-strip only (row 76px / full variant), by its own
header comment it renders no callout at all, callouts are added by its two callers. Checked both
callers:

- `src/components/ui/Timeline.tsx` (the ActionCard TIMELINE block, mounted on the regulation
  surface via `ActionCard.tsx`): renders `Next: {clause}` through `<StateNote band={band} ...>`,
  band-tinted, at line ~124-135. Already correct.
- `src/components/detail/DetailShell.tsx`'s `DetailTimeline` (mounted on Operations, Market Signal,
  and Research detail surfaces): renders `Next: {next.label} · {next.date}` through
  `<StateNote band={band}>`, band-tinted, at line ~318-324. Already correct.

Grepped the whole tree for a raw `Next:` string outside a `StateNote` wrap
(`grep -rn "Next:" src --include=*.tsx`): the only other hit is an inline day-count line inside
`DetailShell.tsx`'s mobile vertical stack (line ~439), which is a secondary line under the label,
not a second callout box, and its own comment states it deliberately reuses "the SAME wording the
desktop StateNote callout already renders."

Finding: the coordinator's premise ("MilestoneTimeline.tsx does not render its callout through
StateNote") is REFUTED, every live "Next: ..." callout on every surface already renders through the
StateNote part in the item's band tint. What is real, and NOT fixed by this lane: there are two
separate timeline+callout implementations (`Timeline.tsx` for ActionCard/regulation, `DetailTimeline`
+ `MilestoneTimeline` for Operations/Market/Research) rather than one part. `Timeline.tsx`'s own
header already documents this as a deliberate, explicitly out-of-scope deferral ("NOT an edit to
DetailShell.tsx's existing DetailTimeline ... Part B's job"). Consolidating them would touch three
customer surfaces this dispatch was told to keep "rendering identically otherwise," so it was left
as a named, correctly-scoped-out gap rather than an unauthorized rewrite. No code changed for this
item.

## Item 3, Watchlist re-check column [STOP, artboard does not draw it]

Read `docs/design/handoff-2026-09-07/screens/11-watchlist.png` (Read tool) and zoomed the header row
(290,255)-(1080,335). The screen's own caption text claims "watched items get a re-check column
because that is why they were watched," but the drawn header row is
`JURIS. / TITLE · TYPE · MODES / IMPACT / NEXT DATE / TIMELINE / TIER / ⋯`, no re-check field
anywhere in the header or the one drawn row. Also checked `docs/design/parts-brief-2026-09-18.md`
and `docs/design/parts-inventory.md` for any mention of "re-check"/"recheck": zero matches in either.

Per the coordinator's own instruction ("If the artboard does not draw it, STOP on this item with
that finding"): STOPPED. No column built. The caption and the drawing disagree; that disagreement is
reported here for an operator ruling, not resolved by this lane guessing which one is authoritative.

## Item 4, Research legend "Not scored" [CONFIRMED by render, not by reading code]

Located the research legend: `src/app/research/page.tsx` (the "Split-credibility legend," foot of
the content column) mounts `<CredibilityChipEvidence biasTags={[]} />` and
`<CredibilityChipAuthority />` with no scoring props. Rather than trust the source read (the prior
agent's REFUTED-for-reading-code mistake this item exists to avoid), rendered the two components for
real: `renderToStaticMarkup` via `npx tsx` against the actual `.tsx` files with the exact props
`app/research/page.tsx` passes. Output:

```
EVIDENCE: Evidence × agreement: Not scored
AUTHORITY: Source authority: Not scored
```

[CONFIRMED, by actual React render]: the research legend's two credibility chips literally render
"Not scored" for both scores. This is the component's documented, intended behavior (both files'
headers: no evidence-synthesis or authority-distribution pipeline exists yet), not a defect. No
code change. Status token: the 2026-09-20 note is CONFIRMED true, not refuted, and not a bug to fix.

## Gates run (verbatim summary lines)

- `tasklist | grep -ic node.exe` checked before every gate below: 3 each time, no contention wait
  needed.
- `node .discipline/rendering/run-rendering-guard.mjs` run TWICE: both runs **14 fixtures / 846
  checks, 14 SM smoke specs / 294 checks, 18 UX smoke specs / 348 ux checks, layout guard 36
  route×width measurements / 0 findings**, `=== rendering guard PASS ===`.
- `bash .discipline/run-test-suite.sh`: **tests 1531, suites 36, pass 1527, fail 0, cancelled 0,
  skipped 4, todo 0**, script exit 0. The `audit-finding-status` step's 607 unlabeled findings are
  pre-existing debt across `docs/audits/*.md` this lane never touched (`git status` confirms).
- `npx tsc --noEmit`: clean, exit 0.
- `node .discipline/fitness/runner.mjs`: **47 functions checked, 0 violations.**
- `coverage-report.json`: not dirtied by this lane (`git status --porcelain` shows only
  `src/components/ui/StateNote.tsx`); nothing to restore.

## Value Delivery Check

=== Value Delivery Check ===

This dispatch's work does NOT directly advance customer-facing value delivery on its own; it closes
out platform-parts sign-off debt (one missing `data-part` attribute) and produces verified findings
(two REFUTED/confirmed, one STOP) on claims the coordinator needed checked before the parts program
can proceed to its next lane. The StateNote part itself is customer-facing (every empty/loading/
error/action-strip state on every surface) and unaffected in appearance by this lane's one-line fix.

## UX compliance

No customer-visible UI changed. `StateNote.tsx`'s only edit is a `data-part` DOM attribute (no style,
no layout, no text change), the rendering guard's two full PASS runs (846+348 checks each) confirm
no regression. No new fixture, no new route, no new interactive state.

## Open items

- Item 3 (watchlist re-check column) needs an operator ruling: the artboard's own caption text and
  its own drawn header row disagree. Left un-built per the coordinator's explicit STOP instruction.
- Item 2's real gap (two timeline+callout implementations instead of one part) is pre-existing,
  named in `Timeline.tsx`'s own header as deferred to a future "Part B" lane; not undertaken here
  because it would touch Operations/Market/Research surfaces outside this dispatch's "render
  identically otherwise" instruction.
