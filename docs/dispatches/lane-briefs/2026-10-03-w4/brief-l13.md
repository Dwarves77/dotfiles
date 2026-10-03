# Lane L13: Fully-loaded labour chain component

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/plans/
complete-build-plan-2026-10-01.md` section 1.4 (row 04S5) and its L13 entry in section 2; `docs/specs/
04-operations.md` sections 5, 6 (component 5), 9 (acceptance criteria 3, 9) in full; then this dispatch's
README (`docs/dispatches/lane-briefs/2026-10-03-w4/README.md`) in full, especially open question 1.

Lane id: `l13`. Branch: cut from `origin/master`. Branch name: `lane/l13-labour-chain-2026-10-03`. Model:
Sonnet. You execute exactly this brief. Anything it does not cover, or any statement here that is wrong
against the code, is a STOP: report it, do not solve it.

## Objective and requirement IDs

Spec 04S5 ("the fully-loaded labour chain") and S6 component 5. Decisions 1 and 5 of spec 04 both depend
on the fully-loaded rate, not the headline wage, and both are named in the spec as routinely wrong when
someone uses the headline. Render the chain, not a single number:

base wage (BLS OEWS / Eurostat SES, occupation level) -> + employer social contributions (`lc_ncost_r2` /
OECD) -> + leave and absence -> + turnover and recruitment -> + shift premium / productive hours = EUR
(or USD) per productive hour.

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): a term in the chain with no live data for the selected region
  renders as an explicit gap state for that term, never a zero, never an invented multiplier. Zero
  imputed values in cost cells (spec 04 acceptance criterion 3).
- **CLAUDE.md rule 14**: this brief's own open question 1 (README) states the EU/US labour producer may
  not have landed live rows yet. State plainly in your report whether `regional_data_facts` (or
  `state_cost_facts`) carries live labour-dimension rows for at least one region when you build this; if
  not, your acceptance test is fixture-based and you say so, not "built-and-proven."
- **Spec 04 acceptance criterion 9**: one assumption register, one discount rate, stamped on every
  derived output - this chain's productive-hours convention and any escalation assumption must read from
  the single existing assumption source your consumer check finds (see READ FIRST item 6), never a second,
  local constant.

## Exact write set

- `fsi-app/src/lib/operations/labour-chain.ts` - pure chain-math module. Input: per-term values each
  carrying its own provenance (source, dataset code, reference period, derivation) matching the envelope
  pattern spec 04 acceptance criterion 2 requires everywhere else in Operations; a term with no value
  returns an explicit gap marker for that term, and the chain's final roll-up suppresses (does not compute
  a partial total) when any upstream term is missing, per acceptance criterion 5 ("derived cells suppress
  above the imputation threshold and show components instead" - here, the threshold is any missing term).
- `fsi-app/src/lib/operations/labour-chain.test.mjs` (new) - fixture-based, no network, no DB credential.
  Covers: all five terms present (full chain computes); one term missing (suppresses with named gap, does
  not silently zero-fill); the productive-hours divisor at zero or missing (explicit gap, never a
  divide-by-zero or an invented default).
- `fsi-app/src/components/operations/LabourChain.tsx` (new) - renders the chain as a chain (each term
  visible, running subtotal, final EUR/hour), wired into `RegionDimensionMatrix.tsx` as a drill-down
  panel addition for the labour dimension's selected-cell panel, not a new page and not a new top-level
  route.
- `fsi-app/src/components/operations/LabourChain.test.mjs` or matching test-file convention used by
  `RegionDimensionMatrix.npmtest.mjs` (check which convention this directory actually uses before
  choosing the extension).
- `fsi-app/.discipline/rendering/smoke/labour-chain-smoke.mjs` (new, UX smoke spec per the lane common
  contract's UX contract - a drill-down panel addition still counts as a row/card component for this
  rule) plus its registration line in `ux-smoke-specs.mjs` and F35's `ROW_COMPONENTS` list (report the
  line; the coordinator adds it).
- `docs/ops/session-log.d/2026-10-03-l13.md` (new).

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. `fsi-app/src/components/operations/RegionDimensionMatrix.tsx`, IN FULL - confirm the exact
   selected-cell panel mechanism (its own header names a 2026-09-08 redesign: table is a scoreboard,
   panel below holds one cell's facts at full width) your drill-down must extend, not replace.
2. `fsi-app/supabase/migrations/152_state_cost_facts.sql` and `332_state_cost_facts_value_numeric.sql` -
   confirm the live column shape (`region_id`, `dimension`, `fact_label`, value, provenance columns) your
   module's input type must match, not invent a parallel shape.
3. `grep -rn "state_cost_facts\|regional_data_facts" fsi-app/src fsi-app/scripts` - name every consumer of
   either table in your report; confirm whether any already reads a labour-dimension row and what shape
   it expects.
4. `docs/plans/remediation-plan-2026-09-30.md`'s state-cost producer lane (search for `STATE-COST-DAG` and
   `#811`/`#817`) and `docs/PROGRAM-BOARD.md`'s own current state for it - confirm live-row count (or its
   absence) before writing your acceptance test's claim.
5. The existing assumption source for Operations (spec 04 acceptance criterion 9's "one assumption
   register" - `grep -rn "assumption" fsi-app/src/lib/operations fsi-app/src/lib/entities` to find it, e.g.
   `src/lib/entities/decisions.mjs`'s confidence floors or a dedicated Operations assumptions module) -
   your productive-hours convention must read from it, never a new local constant, per rule 2 and the
   lane common contract's prior-art rule.
6. `fsi-app/src/components/operations/AutomateVsHireCalculator.tsx` (spec 08 S6's shipped pattern, named
   in the plan as component 6's precedent) - the existing EstimatedFigure-based rendering convention this
   new component should match, not reinvent.
7. `docs/design/ux-laws.md` and `docs/design/design-principles.md` DP-2, IN FULL, before writing
   `LabourChain.tsx` (lane common contract UX section).
8. `docs/inventories/migrations.md` - confirm no schema change is implied by your module (you touch no
   migration).

Report "read and reused" naming each file above and what you reused rather than reimplemented.

## Migration number

None requested; none needed. This lane reads existing/fixture data and adds no table or column.

## Harness and flywheel wiring (rule 17: nothing runs alone)

`LabourChain.tsx` and `labour-chain.ts` are pure read-time renders/computations over props the region
matrix already assembles server-side, the same posture as `AutomateVsHireCalculator.tsx` - no harness
family of its own. State explicitly in your report: once the EU/US labour producer (open question 1,
README) lands live `regional_data_facts`/`state_cost_facts` rows carrying labour-dimension data, this
component becomes that producer's downstream consumer automatically, because it reads the same table the
producer writes - name the exact table and column names your module reads, so that wiring is explicit
rather than assumed when the producer lands.

## R14 compliance

No data-population run, no `--apply` path, no live DB write. $0: no network call, no LLM call. If live
labour-dimension rows do not exist yet for any region when you build this, your acceptance test is
fixture-based and you say so explicitly - that is the honest state per the plan's own framing, not a
blocker to building the component and chain-math module themselves.

## Tests, and the fire-once requirement

- `node --test fsi-app/src/lib/operations/labour-chain.test.mjs` - paste the pass count, including the
  missing-term suppression case and the divide-by-zero/missing-divisor case.
- `node --test` (or the project's `.tsx` test runner) for `LabourChain.test.*` - paste the pass count.
- `cd fsi-app && node .discipline/rendering/run-rendering-guard.mjs` with the new smoke spec temporarily
  registered, paste the "UX smoke specs:" line, then revert the registry edit before commit.
- "Test what you build": mount `LabourChain.tsx` with a fixture carrying all five terms and confirm the
  rendered final EUR/hour matches a hand-computed check value (paste both numbers); mount it again with
  one term missing and paste the exact gap text rendered, not a description of it.

## UX compliance

Per the lane common contract's UX contract section: primary goal (see the fully-loaded rate and every
term that built it, not just a headline number); shortest path (the chain is visible the moment the
labour-dimension cell is selected in the existing matrix, no extra click); one primary action (none - this
is a read-only content panel); feedback state for async actions (none added - synchronous render from
props already on the page, same as `AutomateVsHireCalculator.tsx`).

## Dependencies

None structurally for building the component and module (fixture-provable today). The acceptance test's
upgrade from fixture-proven to live-proven depends on the EU/US labour producer lane (open question 1,
README) landing live rows - name this dependency explicitly in your report rather than silently treating
a fixture pass as a live-data proof.

## Report format

Per the lane common contract's "Report" section: git log, file-by-file build, consumers checked (named),
ADRs/specs checked (named), the hand-computed check value and the missing-term gap text (verbatim), gate
output lines, corrections, open items. State "the push gate ran clean" or name the exact failing step.

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file. No DB credential, no live write. No fabricated chain term where live
data is absent - the gap state is mandatory, not optional polish. No em dashes, en dashes or the
section-sign glyph in added prose (rule 022).
