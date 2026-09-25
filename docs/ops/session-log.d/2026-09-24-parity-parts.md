# Lane PARITY-PARTS session log (2026-09-24)

Worktree: `C:/Users/jason/dotfiles/.claude/worktrees/agent-a5509a6c592b1ef4d`, branch
`lane/parity-parts`, cut from `origin/master`. Scope: make the live shared detail parts (masthead,
action card, section index, item groups, state notes, rail) match the approved artboards
(`docs/design/handoff-2026-09-07/README.md` + `screens/`) on eight operator checks, layout and design
only, no redesign. `Masthead.tsx`/auth frame, `AuthProvider`, `Sidebar`, `bootstrap-seed`,
`app-shell-banner`, `src/lib/auth/**`, the `[slug]/page.tsx` redirect blocks, and Community were out of
scope by dispatch (one additive prop later authorized on `Masthead.tsx` by the coordinator for check 2).

## Accomplished

The eight operator checks, each traced to one shared part and fixed once rather than per-surface:

1. **Band tints** on every rendering group/state note/ACTION strip. `src/components/ui/band-context.tsx`
   (new): `BandProvider`/`useBandContext`; `ItemGroup.tsx`, `StateNote.tsx`,
   `list-surface/ListSurfaceShell.tsx` consume it when the caller passes neither prop directly. Per
   coordinator ruling, the ACTION strip renders (and is tinted) only where the item has a real structured
   action; the harness/guard require the tint on every group but the strip only where one exists.
2. **One masthead card** holding the action row, exposure, and timeline. `Masthead.tsx` gained an
   additive `actionSlot?: ReactNode` prop (coordinator-authorized, additive-only, to the otherwise
   DO-NOT-TOUCH file); `DetailMasthead`/`DetailPageWrapper` (`DetailShell.tsx`) thread `band`/`action`
   through `BandProvider` and render `ActionCard` (now `bare`-capable, no its own card chrome) inside the
   masthead's own `SectionCard` via that slot, on all four detail surfaces.
3. **One stepped meter out of 12**, no four-bar block, no "four scored dimensions" text. `RailLegend`
   reworded; `DashboardBrief.tsx` legend text reworded; new fitness function `F57` statically forbids any
   `<ImpactMeter variant="full">` mount outside `ImpactMeter.tsx` itself.
4. **Row type check**, no regression, still passing (verified, not touched).
5. **No "PENDING"/"NOT IN PRIMARY SOURCE"/"Connect shipment data"/"UNSCORED" literal strings.**
   `Absence.tsx`'s default `variant="reason"` now renders `null` (was rendering the reason text);
   `yourLanes` on all four surfaces now uses `{ value: null, absenceReason: "connect data" }` through the
   new `commonActionCardProps()` helper instead of a literal `<span>Connect shipment data</span>`;
   `ListSurfaceRailCards.tsx` "N inputs pending" -> "N inputs missing"; `ProvisionalReviewTable.tsx`
   "N pending" -> "N awaiting review".
6. **Three fact-card forms, 3px edge**, verified already correct, no change needed.
7. **No truncated tabs; Summary\|Full switch inside the index bar at the same position everywhere.**
   `SectionIndex.tsx` restructured: outer `data-guard-strip` wrapper carries the border/bg/radius, an
   inner `.cl-section-index-tabs` div (also `data-guard-strip`, `overflowX:auto`) holds the tab strip, and
   `SummaryDepthSwitch` is a fixed sibling flex child (`flexShrink:0`) at the same position on every
   detail page. `REGULATION_SECTION_INDEX` gained a trailing `related` entry (8 -> 9), and market/
   research/operations now build explicit `ord` values for the ruled S-order (01 Summary, 02 Substantive/
   Series/Findings, 05 Sources, 06 Related; ruling 2 scoped these three surfaces only, regulations keeps
   its own index).
8. **Rail never repeats masthead fields; Connections is not a rail card.** `ItemConnectionsCard` moved
   out of the rail slot into a `Related` main-content `DetailSection` on all four surfaces (check 8
   explicitly proceeded on regulations per coordinator go-ahead).

Plus the ruled S-order restructuring (coordinator ruling 2, scoped to market/research/operations only):
content sections collapsed into one `Substantive findings` `DetailSection` using a new
`DetailSubSection` wrapper per sub-topic; Operations gained a `Summary` section it previously lacked.
Regulations' `HeroPriorityDropdown` moved above the masthead per the coordinator's flagged layout
question (checked against artboard 03 during the render pass below).

F45 (duplicate-code fitness) regression introduced by this restructuring (base 5995, peaked at 6023)
cleared to 0 violations via two real extractions: `src/components/ui/DetailSubSection.tsx` and
`src/lib/detail/action-card-common-props.tsx` (`commonActionCardProps()`, the byte-identical ActionCard
prop tail four surfaces had each retyped).

One new invariant, per coordinator ruling ("don't create six, register one"): **RD-84** ("artboard
parity: the shared parts render the approved artboard rules"), one remediation-discipline skill section,
enforced by **F57** (static, no-full-variant-ImpactMeter) and the new rendering-guard smoke spec
`.discipline/rendering/smoke/parity-checks-smoke.mjs` (checks 1, 2, 5, 7, 8 measured against a live
mounted fixture; checks 3, 4, 6 covered by F57 / existing coverage / no-change-needed respectively).

## Decisions (coordinator rulings, applied as stated)

- Check 1: ACTION strip required only where a structured action exists; tint required on every group
  regardless. Data finding (items with "do now" prose but empty `recommended_actions`) reported below,
  separately, per the ruling; this is a data-management gap for the coordinator's plan, not this lane's
  fix.
- Ruling 2: Operations' content sections nest under one `02 Substantive/Series/Findings` index entry as
  sub-sections, not top-level tabs; scoped to market/research/operations only, regulations keeps its own
  index (confirmed explicitly on request).
- Ruling (a): Exposure and Timeline live inside the one masthead card only; no standalone section, no
  tab, on any of the four surfaces.
- RD-84: one invariant, not six; F-ids taken from F57 upward, only F57 justified (a static code rule),
  the other seven checks enforced via the rendering-guard smoke spec or already-passing coverage.
- Node contention: this lane's own long-running processes (dev server, watchers, builds) were stopped on
  request while three sibling lanes ran their locked gates; work continued on non-node edits (guard
  rules, invariant authoring) in the interim per the coordinator's explicit sequencing.

## Data finding (read-only, reported per ruling, NOT this lane's fix)

Investigated via a throwaway debug read (reverted) and a standalone read-only script: items whose brief
contains "do now" prose in `full_brief` but have an empty `recommended_actions` array render no ACTION
strip under the corrected check-1 rule (expected, working as ruled) while still showing "do now" guidance
in prose. `[HYPOTHESIS]`: this is a data-management gap (agent generation writing prose guidance without
populating the structured `recommended_actions` field) rather than a rendering defect; an exact corpus
count was not captured in this pass (no live DB query was run in this render segment) and is left for the
coordinator's data-plan investigation, per the ruling that this is out of this lane's scope.

## Gate outputs

- No-npm suite (`sh .discipline/run-test-suite.sh`): 1588/1588 pass.
- npm-dep suite (`sh fsi-app/.discipline/hooks/lib/run-npmtest-suites.sh`, run from repo root): 1494/1494
  pass.
- `npx tsc --noEmit` (fsi-app): clean.
- `node .discipline/fitness/runner.mjs`: 0 violations (F45 cleared to base 5995; F57 new, passing).
- Rendering guard (`node .discipline/rendering/run-rendering-guard.mjs`), run twice: PASS both times, 14
  fixtures / 861 checks / 14 SM specs / 19 UX specs (including the new `parity-checks` spec) /
  layout-guard 0 findings.
- Gate 5 (`coverage-report.json`): checked clean against HEAD, nothing to restore.
- Gate 6 (locked pre-push script): run after this addendum is committed (memory-gate/UX-compliance-gate
  dependency on this very file).

## UX compliance

- **Regulation / Market signal / Research finding / Operations detail pages** (`/regulations/[slug]`,
  `/market/[slug]`, `/research/[slug]`, `/operations/[slug]`), primary goal: review one intelligence
  item's full grounded brief, its action recommendation, and its exposure/timeline in one place. Path:
  unchanged (nav from the surface's list page, one click). One primary action: the item's structured
  recommended action inside the ActionCard (watch/share/tag/export remain secondary row actions,
  unchanged). Feedback state: unchanged from prior (WatchButton's existing pending/success/failure states,
  export's existing disabled-when-no-brief state via `exportDisabled`); this lane changed layout and
  literal strings only, no new async action was introduced. Accessibility: the restructured
  `SectionIndex` keeps its tab strip horizontally scrollable (`overflow-x:auto` on the same
  `data-guard-strip` element carrying the strip, satisfying the guard's clipped-content check at 375px)
  instead of truncating; the Summary\|Full switch stays a fixed, non-scrolling sibling so it never
  disappears off-screen on narrow viewports.
- **Regulations detail, HeroPriorityDropdown placement**: moved above `DetailMasthead` (a layout choice
  flagged by the coordinator for artboard verification). Checked against `docs/design/handoff-2026-09-07/
  screens/03-regulation-detail.png` during this render pass: the artboard places the priority/urgency
  control above the masthead card, matching the change made; no further adjustment needed.
- **Rail (all four detail surfaces)**: the rail's `ItemConnectionsCard` was removed (moved into main
  content as a `Related` section) so the rail no longer duplicates a masthead-adjacent card; no new user
  action added to the rail, no feedback-state change.

## Open items / next steps

- Gate 6 (locked pre-push script) needs a clean re-run once this addendum lands (its first run failed
  only on the memory-gate / UX-compliance-gate step 2b, which this file resolves).
- The full 12-route harness run (`next build`/`next start` + `artboard-parity.mjs` against
  `localhost:3000`, operator storageState, visual compare images) had not completed as of this addendum;
  the rendering-guard's own smoke/fixture layer (above) is a different, already-passing verification
  layer from the live-server harness compare, which follows this gate.
- PR body staged at the coordinator-specified scratchpad path, not yet opened; no push performed from
  this lane in this session (per explicit coordinator instruction, a separate agent was pushing a
  different lane's branch and this lane's push was deferred to the coordinator's own sequencing).
