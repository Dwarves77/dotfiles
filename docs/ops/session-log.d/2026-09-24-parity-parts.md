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

## Addendum 2026-09-24 (later same day): gate 6 fixes, local 12-route harness, resolved

Gate 6's first run failed at step 3b (invariant-coverage meta-gate): RD-84's `enforcedBy` cited the
rendering-guard smoke MODULE (`parity-checks-smoke.mjs`) directly; the execution-wiring resolver only
recognizes the guard ENTRYPOINT (`run-rendering-guard.mjs`) as wired for a smoke spec (Surface 6,
SF-10's own precedent). Corrected the citation to the entrypoint. Also added the skill-ack the
skill-drift gate required for this lane's addition to `remediation-discipline/SKILL.md` (commit
`48d78caf` had landed without one). Both fixes: commits `148404dc`, `13219f93`. Gate 6 then PASSed
clean.

Per coordinator ruling, built a LOCAL copy of the outer dotfiles repo's `fsi-app/scripts/tmp/
artboard-parity.mjs` at this worktree's own gitignored `fsi-app/scripts/tmp/artboard-parity-local.mjs`:
`BASE` overridable via `ARTBOARD_PARITY_BASE` env var (default stays production, unchanged behavior),
the operator's storageState cookies rewritten to the `localhost` domain IN MEMORY ONLY (never written,
printed, or copied - the rewrite happens inside `loadStorageStateForBase()` and the result is handed
directly to `browser.newContext()`), ROOT/SRC repointed at this worktree so FAIL source-locations
resolve to this lane's own files, and PROOF writing to `proof-local/` instead of `proof/` so a local
run never collides with the outer repo's production proof set.

Ran `npm run build` then `npx next start -p 3000` in this worktree, confirmed localhost auth held (HTTP
200 on `/`, no login redirect) with the rewritten cookies, then ran all 12 routes:
`ARTBOARD_PARITY_BASE=http://localhost:3000 node scripts/tmp/artboard-parity-local.mjs`.

First full run surfaced two real findings, both investigated and fixed, not just reported:

1. **[CONFIRMED, this lane, by direct read]** the copied harness's own check-1 logic still had the
   PRE-ruling bug (`if (!strip) reasons.push('no ACTION strip')`) that the coordinator's option-(c)
   ruling this same session had already superseded ("an ACTION strip renders only when the item has a
   real structured action; a group with none is not a failure"). The outer file this was copied from
   had apparently never actually received that fix (or it did not persist) - a finding worth flagging
   back, out of this lane's write set to correct upstream. Fixed in this lane's own copy only
   (`artboard-parity-local.mjs`): removed the always-fail line, kept the tint-only-if-a-strip-exists
   check. This was a HARNESS defect, not a product defect - every item-group in the live tree was
   already correctly tinted both before and after this fix; only the false-FAIL disappeared.
2. **Real product defect, regulations-detail only**: check 2 failed with "2 cards above the section
   index." `UpcomingObligationsStrip` (`variant="detail"`) was rendering as its own white-bordered block
   between `DetailMasthead` and `SectionIndex` - exactly the sibling-card shape check 2 forbids. Its own
   file header already documented the detail variant as "a small optional rail card"; it had simply
   never been moved there. Artboard 03's rail draws no distinct card for it either. Fixed: moved into
   `DetailRail`'s `designed` slot alongside `OwnerTeamCard`/`InThisListStat`. Commit `fdca8dce`.
   Re-verified: `tsc --noEmit` clean, no-npm suite 1588/1588, npm-dep suite 1494/1494, fitness 48
   functions/0 violations, gate 6 re-run PASS.

Second full harness run after both fixes: **every applicable check PASSes on every one of the 12
routes** (regulations, regulations-detail, market, market-detail, research, research-detail,
operations, operations-detail, watchlist, community, admin, dashboard). No route 404'd, no route
redirected to `/login` (session held for the full run), the Summary\|Full switch sits at the identical
position (`fromRight:5, dy:11`) on all four detail pages. Proof images and `results.json` written to
this worktree's `fsi-app/scripts/tmp/proof-local/` (gitignored).

## Open items / next steps

- Gate 5 re-checked clean after the later commits (`coverage-report.json` shows no diff against HEAD).
- PR body staged at the coordinator-specified scratchpad path, not yet opened; no push performed from
  this lane in this session (per explicit coordinator instruction, a separate agent was pushing a
  different lane's branch and this lane's push was deferred to the coordinator's own sequencing).
- The data finding above (items with "do now" prose but empty `recommended_actions`) remains
  unquantified (no live DB query run this session) and is still the coordinator's to route, not this
  lane's to fix.
