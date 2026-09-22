# Lane W10-ActionCard-a session log (2026-09-21)

Part A of 2 (`docs/dispatches/lane-briefs/2026-09-21/brief-w10-actioncard-a.md`): the ActionCard,
Timeline and SectionIndex parts to panels 21a/21b of the site-wide parts brief. Built as new files
only; no edits to the forbidden-adjacent detail surfaces or FactCard files lane W10-FactCard-d owns.

## Enumeration (component, file, which surfaces use it)

- Band-pill strip / EXPOSURE grid: `DetailExposure` in `src/components/detail/DetailShell.tsx`,
  called by `RegulationDetailSurface.tsx`, `MarketSignalDetailSurface.tsx`,
  `ResearchFindingDetailSurface.tsx`, `OperationsDetailSurface.tsx` (all four forbidden today). No
  merged one-card ActionCard existed anywhere pre-lane.
- Header chip row (band + tier): `DetailHeader` in `DetailShell.tsx`, same four callers.
- Timeline: `DetailTimeline` (composite header+track+callout) in `DetailShell.tsx`, wrapping
  `MilestoneTimeline` (`src/components/ui/MilestoneTimeline.tsx`, `variant="full"`) which never drew
  milestone labels; same four callers.
- Section index: `SectionIndex` in `DetailShell.tsx`, same four callers; truncates each tab to a
  150px max-width with ellipsis, the review's item 4 defect.
- Summary/Full brief switch: `SummaryDepthSwitch` in `DetailShell.tsx`, rendered as `SectionIndex`'s
  `trailing` slot today (a standalone row per the artboard capture, review item 6).

None of the above are edited by this lane (`DetailShell.tsx`'s public API/behavior for its existing
exports is unchanged apart from one safe internal refactor, see Corrections). This lane's parts are
net-new: `ActionCard`, `Timeline`, `SectionIndex` under `src/components/ui/`.

## Build (part A)

- `src/components/ui/ActionCard.tsx` (`data-part="action-card"`): one `SectionCard`, pill row (band
  pill with window text + kind tag + tier square left, meta right, no overflow control), applied-tags
  row (hidden entirely when empty), `ActionRow` (reused), a 1px rule, EXPOSURE (WHERE / WHO PAYS /
  YOUR LANES / NEXT MILESTONE, each 3-line clamped, Absence convention on empty), a 1px rule, `Timeline`.
- `src/components/ui/Timeline.tsx` (`data-part="timeline"`): header ("N milestones . M passed . next
  <date>"), a labelled dot track (date above, label below, ellipsised, full label on `title` AND on a
  keyboard-focusable span), passed/next/ahead dot states (shared `timeline-dot-styles.ts`), track
  green-to-today, the >8-milestone collapse rule (next-three plus "+N"), and the `StateNote` callout
  ("Next: <label> . <date> . in N days", "Full schedule" link) or the all-passed variant.
- `src/components/ui/SectionIndex.tsx` (`data-part="section-index"`): `REGULATION_SECTION_INDEX` (8
  short names, review item 5's order, each <= 14 chars, enforced by
  `section-index-data.test.mjs`), never-truncating tabs (the strip scrolls, not the page), and the
  Summary|Full brief switch reused from `DetailShell.tsx`'s existing `SummaryDepthSwitch` at the
  bar's right end (no standalone row).
- Pure logic: `src/lib/detail/timeline-math.ts` (date math, collapse rule, next-milestone clause; F36
  never calls `toLocaleDateString`/`Intl.DateTimeFormat`, all dates hand-formatted from parsed
  `YYYY-MM-DD` components) and `src/lib/detail/section-index-data.ts` (the short-name table).
- Fixtures: `src/app/admin/parts/action-card/page.tsx` and `.../section-index/page.tsx` (new route
  folders only, `src/app/admin/parts/page.tsx` untouched), platform-admin gated
  (`requirePlatformAdmin`), static data only (`src/lib/detail/action-card-fixtures.ts`,
  `section-index-fixtures.ts`) covering: the review's own worked example (7 milestones, 3 passed,
  next "Transition deadline" 2026-09-29, meta "4 sources . T1 primary . regenerated Sep 18"), no
  tags, an absent EXPOSURE cell, 9 milestones (collapse), 1 milestone, all-passed.

## Corrections (fixed honestly, not silently)

1. **F45 duplicate-code regression.** My first cut of `SectionIndex.tsx`/`Timeline.tsx` duplicated
   the scroll-spy observer, the dot styles, the track gradient, and (worst) the whole tab `<a>` and
   the Summary/Full brief control against `DetailShell.tsx`'s existing code (+164 lines at first
   measurement). Fixed by extraction, not by copy-paste: `src/lib/detail/use-section-scroll-spy.ts`
   (the IntersectionObserver hook, now used by both `DetailShell.tsx`'s `SectionIndex` and this
   lane's), `src/components/ui/timeline-dot-styles.ts` (dot + track style functions, used by both
   `MilestoneTimeline.tsx` and `Timeline.tsx`), `src/components/ui/section-index-styles.ts` +
   `SectionIndexLink.tsx` (the shared nav/strip/link chrome, used by both `SectionIndex`
   components), and reusing `DetailShell.tsx`'s own `SummaryDepthSwitch` instead of building a
   second segmented control. `DetailShell.tsx` was edited ONLY to consume these shared helpers
   internally; its exported component signatures and rendered behaviour for its own three existing
   callers (Market/Research/Operations, which still use the old, truncating `SectionIndex`) are
   unchanged. Net: fitness runner now reports 0 violations (was 1, F45).
2. **F41 dead-media-query-class**, a direct consequence of (1): moving the tab `<a>` into
   `SectionIndexLink.tsx` meant `DetailShell.tsx`'s own file text no longer carried the literal
   `cl-section-index-link` class its mobile `@media` rule targets. Registered
   `cl-section-index-link -> SectionIndexLink.tsx` in F41's `CROSS_COMPONENT_CLASSES` map (the
   gate's own sanctioned mechanism for exactly this case), not a blanket allowlist.

## Presence report

None yet. This lane builds the parts and their fixture pages only; no live surface renders
`ActionCard`/`Timeline`/`SectionIndex` yet. Part B (below) is what wires the regulation surface onto
them and produces the first real presence report.

## UX compliance

**ActionCard fixture (`/admin/parts/action-card`).** Primary goal: let the operator sign off the
merged action card and its EXPOSURE/TIMELINE content against the review's worked example and its
five named edge cases. Path: open the fixture page (platform-admin gated); no interaction required
to read every state, they render stacked. One primary action per card: none are wired to a live
mutation (`onExport`/`onShare` are no-ops on this fixture page by design, matching FactCard's own
gallery precedent of static, non-mutating fixtures). Feedback state: N/A, nothing async on this page.
Law 2: `ActionRow`'s buttons and the timeline dot's keyboard-focusable label all meet the 44px/24px
floor (reused chrome; the dot's focus target is a text span sized to its content, not a control, so
it is exempt from the target-size law the same way a plain link label is elsewhere in the app).

**SectionIndex fixture (`/admin/parts/section-index`).** Primary goal: verify the eight tabs never
truncate and the Summary|Full brief switch sits inside the bar. Path: open the fixture page, use the
switch (updates a visible "Current depth" line) or click a tab (scrolls to the anchored section,
scroll-spy highlights it). One primary action: the depth switch (two-state, `aria-pressed`). Feedback
state: the switch's pressed state is immediate (React state, no network); the active tab highlight
updates on scroll via `IntersectionObserver`, no lag.

## Part B's exact to-do list (for the coordinator to brief from)

1. Wire `ActionCard` into `RegulationDetailSurface.tsx`, replacing the three existing cards
   (`DetailHeader` + `DetailExposure` + `DetailTimeline`) with one `<ActionCard>` call.
2. Apply the review item 5 section order on every regulation via `REGULATION_SECTION_INDEX`
   (`src/lib/detail/section-index-data.ts`): Summary, Obligations, Requirements, Registration,
   Operations, Compliance, Penalties, Sources.
3. Summary mode shows S1 (Summary) plus the first card of S2 (Obligations) only; every other section
   is hidden while `depth === "summary"`.
4. The "WHAT CHANGED . record-briefs-007" block: find where `record-briefs-007` (or any
   `agent_run`/batch id) reaches the DOM in `RegulationDetailSurface.tsx`'s `BriefSummary`/changelog
   rendering and either show the real change sentence or omit the block. File and line: not
   identified by this lane (out of Part A's forbidden-file scope to inspect further); Part B greps
   `RegulationDetailSurface.tsx` for the changelog-summary literal first.
5. Route the trajectory sentence (`renderRequirementTrajectory`, currently the fourth EXPOSURE cell
   in `RegulationDetailSurface.tsx`) to S1 Summary; `ActionCard`'s EXPOSURE fourth cell is now NEXT
   MILESTONE, computed internally from the `timeline` prop, so Part B stops passing a trajectory
   value into that slot.
6. Add `/admin/parts/action-card` and `/admin/parts/section-index` links to
   `src/app/admin/parts/page.tsx` (this lane did not touch that file per the write-set boundary).
7. Register `action-card-smoke.mjs` and `section-index-smoke.mjs` permanently in
   `.discipline/rendering/smoke/ux-smoke-specs.mjs` (this lane registered them only temporarily, to
   self-check locally, then reverted per the lane contract) and add both parts to F35's
   `ROW_COMPONENTS` if the coordinator judges them row/card-shaped enough to require it.
8. Find the exact record the operator reviewed (next milestone "Transition deadline" on
   2026-09-29, 7 milestones) by a read-only `SELECT` against `intelligence_items`/`item_timelines`
   so the fixed page can be re-sent for the operator's re-review. Not run by this lane: no DB access
   in this part per the brief ("No database access in this part").
