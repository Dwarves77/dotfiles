# Lane L14: Feasibility gates (not scored) + materials-PPWR join

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.4 (row 04S6 #8-9) and its L14 entry in section 2; `docs/
specs/04-operations.md` sections 1, 6 (components 8, 9), 8, 9 (acceptance criterion 7), 10 (the
"Feasibility gates" and "Materials/PPWR join" gap rows) in full; then this dispatch's README (`docs/
dispatches/lane-briefs/2026-10-03-w4/README.md`) in full, especially open question 2.

Lane id: `l14`. Branch: cut from `origin/master`. Branch name: `lane/l14-feasibility-ppwr-2026-10-03`.
Model: Sonnet. You execute exactly this brief. Anything it does not cover, or any statement here that is
wrong against the code, is a STOP: report it, do not solve it.

## Objective and requirement IDs

Spec 04S6 #8 (feasibility gate layer: PPWR thresholds, EPR registration and authorised-representative
requirements, PFAS limits, national permitting, ETS2 - rendered as gates, blocked/conditional/clear,
NEVER as points added to a score) and #9 (materials supply <-> PPWR compliance join: recyclate
availability by material by region placed directly against the PPWR recycled-content threshold for that
material and year). Spec 04's own section 10 gap table: "Feasibility gates - Absent. Regulatory
feasibility (D1) is faked from regulation counts by hand-written regex, and reports 5/5 coverage while
`region_dimension_coverage` reports 0 rows for the same dimension. Two contradictory truths for D1 on one
surface." and "Materials <-> PPWR join - Absent. D1 emits regulation links, D4 emits an unrelated fact
list, nothing joins them."

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): this lane's own first step is confirming the PPWR numeric
  inputs (recycled-content percentages for 2030/2040, empty-space ratio, transport-packaging reuse
  targets) against Regulation (EU) 2025/40's text directly - spec 04 section 8 states these are
  UNCONFIRMED and the DG ENV page did not carry them. If you cannot reach or confirm the Regulation text,
  STOP and report the exact gap rather than using a placeholder number.
- **Spec 04 acceptance criterion 7** ("Feasibility renders as gates, never as score contributions"): the
  gate component's type must have NO numeric field capable of being summed, averaged, or otherwise folded
  into a score - enforced structurally, not by convention, mirroring the type-level-barrier pattern spec
  08 section 4 already shipped for statutory/estimate isolation.
- **CLAUDE.md rule 14**: the "two contradictory truths for D1" finding (regex-faked feasibility vs. zero
  `region_dimension_coverage` rows) is a named defect in the CURRENT code. Your fix is additive (a new
  gate layer alongside, or replacing, the regex-faked D1 feasibility render) - state explicitly in your
  report whether you removed the regex-faked path or left it in place pending a separate lane, and why.

## Exact write set

- `fsi-app/src/components/operations/FeasibilityGateStrip.tsx` (new) - renders each gate
  (`blocked`/`conditional`/`clear`) per spec 04S6 #8's named gate classes (PPWR thresholds, EPR
  registration/authorised-representative, PFAS limits, national permitting, ETS2). The component's prop
  type carries a gate-state enum per gate class and NO numeric score field anywhere in that type (a
  TypeScript type that has no numeric member for this purpose, confirmed by a negative test that a score
  cannot be constructed).
- `fsi-app/src/components/operations/FeasibilityGateStrip.test.mjs` or matching convention - fixture-based.
  Negative test: constructing the gate-state type with a numeric field is a type error (confirmed via a
  `// @ts-expect-error` proof, same pattern migration 286's `assert_statutory_purity` type barrier uses)
  or, if TypeScript alone cannot enforce it at this layer, a runtime assertion test that no code path sums
  gate states into a number.
- `fsi-app/src/lib/operations/materials-ppwr-join.ts` (new) - one read-only query joining existing
  `regional_data_facts` materials-sourcing rows (recyclate availability by material by region) against the
  confirmed PPWR recycled-content threshold for that material and year (from step 1, the Regulation-text
  confirmation). Returns one joined read per region+material ("recycled PET available: thin; PPWR 2030
  threshold: X%"), never two unrelated lists.
- `fsi-app/src/lib/operations/materials-ppwr-join.test.mjs` (new) - fixture-based. Covers: a region with
  both a materials fact and a confirmed threshold (joined read); a region with only one side present
  (explicit gap, never a fabricated join); the PPWR numbers used in fixtures are the ones confirmed in
  step 1, cited by Regulation article/annex, never invented.
- `fsi-app/.discipline/rendering/smoke/feasibility-gate-strip-smoke.mjs` (new, UX smoke spec per the lane
  common contract's UX contract) plus its registration line in `ux-smoke-specs.mjs` and F35's
  `ROW_COMPONENTS` list (report the line; the coordinator adds it).
- `docs/ops/session-log.d/2026-10-03-l14.md` (new) - must record the PPWR numeric confirmation (or its
  failure) with citations to the Regulation text, per CLAUDE.md rule 2.

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. **Regulation (EU) 2025/40 text directly** (not the DG ENV summary page, which spec 04 section 8
   already states does not carry the numbers) - confirm the recycled-content percentages for 2030 and
   2040, the empty-space ratio, and the transport-packaging reuse targets, by article/annex citation. This
   is step 1, before any code is written; if it fails, STOP per rule 2.
2. The current regex-faked D1 feasibility render (`grep -rn "regulatory_feasibility" fsi-app/src` to find
   it) - IN FULL, to understand the "two contradictory truths" defect named in spec 04 section 10 before
   deciding whether your gate layer replaces or sits beside it.
3. `fsi-app/supabase/migrations/106_*.sql` (or wherever `regional_data_facts`'s `dimension` CHECK
   constraint lives - `grep -rn "regulatory_feasibility\|materials_sourcing" fsi-app/supabase/migrations`)
   - confirm the six-dimension closed vocabulary your join and gate layer both key off.
4. `region_dimension_coverage` (`grep -rn "region_dimension_coverage" fsi-app/src fsi-app/scripts`) - the
   table/view spec 04 section 10 names as reporting 0 rows while the regex path reports 5/5; confirm this
   contradiction still exists live before citing it as current.
5. `fsi-app/src/components/operations/RegionDimensionMatrix.tsx` IN FULL - confirm where the gate strip
   mounts relative to the existing scoreboard/panel split (same drill-down posture as L13's labour chain,
   read L13's brief for the shared mounting precedent if that lane has already landed; if not, make the
   same judgment call independently and state it).
6. `fsi-app/src/lib/contracts/decisions.mjs` or wherever migration 286's type-level-barrier pattern for
   statutory/estimate isolation lives (spec 08 section 4) - the exact pattern your gate-type's
   no-numeric-field enforcement must mirror, not reinvent.
7. `docs/decisions/` - `grep -ril ppwr docs/decisions/` (confirmed empty this session; re-check, it may
   have changed) and `grep -ril "materials.*ppwr\|regional_data_facts" docs/decisions/` - any ADR naming
   this join or these thresholds is binding; cite it if found.
8. `docs/design/ux-laws.md` and `docs/design/design-principles.md` DP-2, IN FULL, before writing
   `FeasibilityGateStrip.tsx`.
9. `docs/inventories/migrations.md` - confirm no schema change is implied (you touch no migration; this
   is a read-only join over existing tables).

Report "read and reused" naming each file above and what you reused rather than reimplemented.

## Migration number

None requested; none needed. The join is read-only over existing tables; the gate layer is a pure
rendering component.

## Harness and flywheel wiring (rule 17: nothing runs alone)

Both the gate strip and the materials-PPWR join are read-time, computed from data already populated in
`regional_data_facts` (once live) or fixtures (today) - no harness family, no write path, no population
run. State explicitly in your report whether `regional_data_facts` carries live materials-sourcing rows
for any region when you build this (same honesty requirement as L13's open question 1), and name the
exact table/column shape your join reads.

## R14 compliance

No data-population run, no `--apply` path, no live DB write. $0: no LLM call; confirming the Regulation
text is a research step (reading the published Regulation), not a paid API call.

## Tests, and the fire-once requirement

- `node --test fsi-app/src/components/operations/FeasibilityGateStrip.test.mjs` and `fsi-app/src/lib/
  operations/materials-ppwr-join.test.mjs` - paste the pass counts.
- `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` with the new smoke spec temporarily
  registered, paste the "UX smoke specs:" line, then revert the registry edit before commit.
- "Test what you build": mount `FeasibilityGateStrip.tsx` with a fixture carrying one `blocked`, one
  `conditional`, one `clear` gate and paste the rendered output verbatim; run `materials-ppwr-join.ts`
  against a fixture region with both a materials fact and the confirmed threshold, and paste the exact
  joined-read sentence produced.

## UX compliance

Per the lane common contract's UX contract section: primary goal (see, before cost, whether a region is
even eligible - gates evaluated BEFORE cost per spec 04 section 1); shortest path (gates render at the top
of the region's panel, ahead of any cost figure, no extra click); one primary action (none - read-only);
feedback state for async actions (none added - synchronous render from props already assembled
server-side).

## Dependencies

PPWR numeric confirmation (this lane's own first step, S-sized on its own per the plan's own framing - not
a separate lane). No dependency on L13, though both mount into the same `RegionDimensionMatrix.tsx` panel
and should be sequenced to avoid a trivial merge conflict on that file if both land close together (report
this to the coordinator if you see L13 has already landed when you start).

## Report format

Per the lane common contract's "Report" section: git log, file-by-file build, consumers checked (named),
ADRs/specs checked (named), the confirmed PPWR numbers with their Regulation citations (or the exact
failure to confirm them), the fixture gate-strip render and joined-read sentence (verbatim), gate output
lines, corrections, open items. State "the push gate ran clean" or name the exact failing step.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential, no live write. No fabricated PPWR number - the
Regulation-text confirmation is mandatory before any fixture or join uses a percentage. No gate-strip
numeric score field under any framing. No em dashes, en dashes or the section-sign glyph in added prose
(rule 022).
