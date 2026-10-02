# Lane L5: Research surface - dissent panel, signposts list, assessment-history ledger (narrowed)

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full, including the
UX contract section (you touch `.tsx`); `docs/design/ux-laws.md` and `docs/design/design-principles.md`
DP-2 IN FULL before writing any component; `docs/plans/complete-build-plan-2026-10-01.md` section 1.3
and its L5 entry in section 2; `docs/specs/03-research.md` section 7 ("Required components") items 6, 8,
11 in full; then, on your branch, `docs/decisions/ADR-038-research-built-now.md`.

Lane id: `l5`. Branch: cut from `origin/lane/w2r-research-assessment` (PR #887; confirm merge state
first - see L3's brief for the same note, not repeated here). Branch name: `lane/l5-research-detail-
panels-2026-10-02`. Model: Sonnet. You execute exactly this brief; a wrong statement here is a STOP, not
something to quietly correct and continue past.

## Objective and requirement IDs

Spec 03S7 components 6 (dissent panel), 8 (machine-watchable signposts list), 11 (assessment history
ledger). The maturity triple / horizon rail / credibility rendering (components 2-5) are `lane/w2r-
research-assessment`'s own scope and are explicitly NOT rebuilt here - mount beside that rail card, never
replace or restyle it.

## Operator rulings that bind you

- **ADR-038**: Research is built now; these three components are the plan's own "narrowed" slice of
  that build, sequenced after the in-flight branch's rail card.
- **Spec 03 section 7, component 6**: "Dissent panel, first-class, never collapsed... surfacing only
  consensus manufactures false confidence." Your panel renders uncollapsed by construction (no toggle
  that defaults to hidden), not merely "expanded by default" with a collapse control a later change could
  flip.
- **Spec 03 section 7, component 11**: "A horizon assessment must be able to be wrong in public and be
  seen to have been wrong. A card that silently rewrites its own history is a marketing artifact." Your
  ledger renders every prior value from the `supersedes` chain migration 344 already carries, with
  timestamp and (where recorded) cause - append-only, visible, never a single "last updated" line.
- **CLAUDE.md rule 20** (artboards govern look, not system): if the current artboard for `/research/
  [slug]` has no slot for a third/fourth rail card, build to the spec's need anyway and record the
  divergence on a DESIGN CHANGES OWED list in your session-log file, cited by artboard number; do not
  silently omit the component to fit the artboard.

## Exact write set

- `fsi-app/src/components/research/DissentPanel.tsx` (new)
- `fsi-app/src/components/research/SignpostList.tsx` (new)
- `fsi-app/src/components/research/AssessmentHistoryLedger.tsx` (new)
- `fsi-app/src/components/research/DissentPanel.npmtest.mjs`, `SignpostList.npmtest.mjs`,
  `AssessmentHistoryLedger.npmtest.mjs` (new, following the existing `ResearchLedger.npmtest.mjs`
  pattern - read it first)
- `fsi-app/src/components/research/ResearchFindingDetailSurface.tsx` - a one-line mount addition per
  component, per this brief's own description; NOT a rewrite. If mounting any one of the three requires
  touching more than a few lines of this file, STOP and report why before proceeding.
- `docs/ops/session-log.d/2026-10-02-l5.md` (new, with the UX compliance section the lane contract
  requires).

## READ FIRST (write-set files, importers/imports, migrations, generated inventories)

1. `fsi-app/src/components/research/ResearchFindingDetailSurface.tsx`, IN FULL, on your branch (it is
   already extended there by `lane/w2r-research-assessment` with the new rail card) - this is the file
   you mount into; read what the branch already added before adding your own three lines.
2. `grep -n "ResearchFindingDetailSurface" fsi-app/src/app/research/[slug]/page.tsx` - confirm the
   page-level import path is unaffected by your change (you are not touching the page).
3. `fsi-app/src/components/research/ResearchLedger.tsx` and its `.npmtest.mjs` - the house pattern for a
   row/panel component in this surface; reuse its data-fetch and absence-state conventions rather than
   inventing new ones (lane common contract's "Prior art" rule).
4. `fsi-app/src/lib/research/read-assessments.mjs` (read on the branch, IN FULL) - the view-model and
   absence/refusal wording your three panels consume; confirm the exact shape of `credibility_authority_
   score`, the `supersedes`-chain history shape, and whether a signposts reader exists yet (it does not -
   L6 builds it; your `SignpostList` renders an honest "no signposts watched yet" absence state until L6
   lands, never a fabricated list).
5. `fsi-app/supabase/migrations/344_research_assessments.sql` (on the branch, IN FULL) - the `supersedes`
   self-FK and `is_current` flip mechanism your history ledger renders.
6. `docs/design/ux-laws.md`, `docs/design/design-principles.md` DP-2, IN FULL, before writing any `.tsx`
   (lane common contract UX section, binding).
7. `fsi-app/.discipline/rendering/ux-smoke-specs.mjs` and one existing smoke spec under `fsi-app/
   .discipline/rendering/smoke/` - the registration pattern your components may need if they qualify as
   row/ledger/card components under F35 (`ROW_COMPONENTS`). Note: per lane W2-R's own precedent,
   `ResearchAssessmentCard` was judged a rail/section card, not a list row, and was NOT added to F35.
   Your `AssessmentHistoryLedger` likely renders a list of rows (one per history entry) and may need F35
   registration where `ResearchAssessmentCard` did not - make this judgment explicitly in your report,
   do not default either way without stating the reasoning.

Report "read and reused" naming each file above.

## Migration number

None requested; none needed. This lane writes no schema.

## Harness and flywheel wiring (rule 17)

These are pure rendering components with no harness family. Reachability (lane common contract's six-
item definition of done): each component is reachable only once mounted into
`ResearchFindingDetailSurface.tsx` (your own write-set item) - confirm in your report that the mount is
live on the detail page for at least one fixture item, not merely unit-tested in isolation.

## R14 compliance

N/A - no data population, no DB write, no `--apply` path. Pure rendering from props/fetched data already
produced by other lanes' pipelines.

## Tests and the fire-once requirement

- `node --test` for all three `.npmtest.mjs` files: fixture data only.
- Acceptance tests named in the complete-build-plan's own L5 row: a live (or fixture-seeded) research_
  finding item carrying a dissenting source renders the dissent panel uncollapsed; a seeded signpost
  renders in the list once L6 exists (until then, the honest absence state); the history ledger renders
  at least one prior value after one re-score, append-only and visible.
- `npx playwright` smoke on one detail page, per the plan's own acceptance test for this lane - run it
  for real against your worktree's dev build, not only asserted in a unit test; paste the result.

## UX compliance (required section in your report, per the lane contract)

For each of the three components: primary goal, the path in steps (expect zero or near-zero - these are
read-only rail additions, no new async action introduced beyond what L3/L6's data sources already
provide), the one primary action if any, and the feedback state for the absence case (no dissent, no
signposts yet, no history yet) - each must render a distinct, legible absence state, never a blank gap
or a loading spinner that never resolves.

## Dependencies

`lane/w2r-research-assessment` merged (rail card to mount beside). L3 (a real authority distribution for
the dissent panel to render dissent from - until L3 lands, render the panel against `assess.mjs`'s
placeholder distribution and say so in the report, do not block on L3). L6 (signposts data - until L6
lands, `SignpostList` renders the absence state, as stated above).

## Report format

Per the lane common contract. Include the UX compliance section above as its own heading. State plainly
which of the three components could mount live versus which rendered only the absence state because
their upstream dependency (L3, L6) had not yet landed at the time this lane ran.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No new F35/allowlist entry without stating the judgment in your report (the coordinator
adds the registry line, per lane W2-R's own precedent: "the coordinator adds it"). No DB credential, no
live write.
