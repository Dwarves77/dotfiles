# 2026-10-03 - Lane L-CORRIDOR (item-to-corridor resolver for carbon-cost-per-FEU)

## Why this lane exists

Closes the gap `docs/ops/session-log.d/2026-10-03-l12.md`'s addendum named: the real per-FEU figure
(`carbonCostPerFeu()`, spec 02S6 row 3) cannot reach any Market item detail page because a `market_signal`
item carries `jurisdictionIso` (an unordered country-code array), never a `corridor` object, and
`carbonCostPerFeu()` throws without one. That file's "2026-10-03 coordinator update" named the exact
fields the next lane must supply (`corridor.origin`, `corridor.dest`, `corridor.mode`) and scoped item 1
into its own lane - this lane is that lane.

## What was built

- `fsi-app/src/lib/market/resolve-item-corridor.mjs` (new) - the three-state resolver
  (`resolved` / `ambiguous` / `no_corridor_identity`), pure, no I/O, no DB. Matches an item's
  `jurisdictionIso` (read as an unordered set, never an ordered origin/dest pair) against an EXISTING,
  already-minted seeded corridor entity's own `{origin country, dest country}` set (country derived from
  the UN/LOCODE prefix, the same UN/ECE Rec 16 convention `write-entity-scope.mjs` already uses live),
  plus an exact match on the item's own single recorded `modes` entry against the corridor's `mode`.
  Never assigns a direction, never mints a `cl:corridor:*` id (WO-24, honoured not reversed). Exports:
  `resolveItemCorridor()` (the core function), `candidatesFromCorridorEntities()` (adapter for a live
  `entities WHERE kind='corridor'` read), `candidatesFromSeeds()` (adapter for `seed-corridors.mjs`'s
  `FALLBACK_CORRIDOR_SEEDS`, reusing `entityId()`/`corridorSeed()` to mint the same id that script would),
  `parseCorridorCanonicalName()`, `STATES`.
- `fsi-app/src/lib/market/resolve-item-corridor.test.mjs` (new) - 17 `node --test` cases, all pass: the
  seven required cases (a-g) plus a correction case, a mode-gating case, a no-match case, a
  malformed-input case, and two integration cases against `carbonCostPerFeu()`.

## Finding, corrected against the brief/README's own premise (CLAUDE.md rule 14)

**[CONFIRMED]** The README's open question 3 states "today, with one seeded corridor, [ambiguous] cannot
fire". Reading `seed-corridors.mjs` in full (READ FIRST item 3) found this is no longer true: lane W4.2
(2026-09-05) added `NAMED_CORRIDOR_SEEDS` (three more WCI-named lanes) to the fallback set, so
`FALLBACK_CORRIDOR_SEEDS` now holds four corridors, not one - `CNSHA-NLRTM:ocean`, `CNSHA-ITGOA:ocean`,
`CNSHA-USNYC:ocean`, `CNSHA-USLAX:ocean`. Two of those four, `CNSHA-USNYC` and `CNSHA-USLAX`, share the
exact same country-set `{CN,US}` (both US ports). A live `market_signal` item carrying
`jurisdictionIso=["CN","US"]` and a single recorded `modes=["ocean"]` resolves `ambiguous` against the
REAL live fallback set today, not only in a forward-looking fixture - proven by this lane's own test
`"[CONFIRMED] the ambiguous case is ALREADY LIVE today..."` (`resolve-item-corridor.test.mjs`), which
matches `ALL_FALLBACK_CANDIDATES` (the real `seed-corridors.mjs` exports, not an invented fixture) with no
mock data. This does not change the resolver's design (ambiguous was already specified and tested per the
brief's own forward-looking framing for case g); it corrects the premise that the case is hypothetical.

## Read and reused (per lane-common-contract "Read before you build")

- `fsi-app/src/lib/market/carbon-cost-per-feu.mjs`, full read - confirmed `input.corridor = {origin, dest,
  mode}` (all three required, throws at line 162-164 otherwise) is the exact shape this resolver's
  `resolved` output matches; reused directly in the integration test, no second cost-math implementation.
- `fsi-app/src/lib/market/select-modal-factor.mjs`, full read - the WO-24 ruling (verbatim, cited in this
  lane's module header): never assign a jurisdiction-array element an origin/dest role, three-state design
  (not two), never guess among several candidates when more than one basis exists. This resolver applies
  the identical discipline to BOTH axes (jurisdiction set AND the item's `modes` array).
- `fsi-app/scripts/entities/seed-corridors.mjs`, full read - reused `ADR_EXAMPLE_CORRIDORS`,
  `NAMED_CORRIDOR_SEEDS`, `FALLBACK_CORRIDOR_SEEDS` directly in the test file (not re-typed); reused the
  `corridorSeed()`/`entityId()` id-minting convention in `candidatesFromSeeds()` rather than hand-rolling a
  second id builder; reused `deriveCorridorCandidatesFromItemJurisdictions()`'s own documented conclusion
  (jurisdiction_iso has no origin/destination role) as this lane's own binding premise, not re-derived.
- `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` - grepped for the item's transport-mode
  field; confirmed (with `src/types/resource.ts:141` and every live consumer: `MarketIntelLedger.tsx`,
  `OperationsDetailSurface.tsx`, `AffectedLanesCard.tsx`, `ResearchFindingDetailSurface.tsx`,
  `list-surface-helpers.ts`) the field is `modes: string[]` (plural, an array), never a single scalar - the
  resolver's mode-match therefore requires exactly one element, never guessing among several, the same
  discipline WO-24 applies to jurisdictions.
- `fsi-app/scripts/entities/write-entity-scope.mjs`, full read - reused its exact UN/LOCODE-prefix-is-
  ISO-3166-1-country-code derivation (`locode.slice(0,2)`, UN/ECE Rec 16 SS I.4.b) for `countriesOfCorridor()`
  rather than inventing a second country-extraction rule; reused its `CORRIDOR_NAME_RE` convention /
  `parseCorridorCanonicalName()` shape (duplicated, not imported, for the same documented directory-
  boundary reason that file and `corridor-scope.ts` already give each other - `scripts/` vs `src/lib/`,
  and this module is a third, `node --test`-only location that cannot load a `.ts` file).
- `fsi-app/src/lib/entities/corridor-scope.ts` - read in full; confirmed its `parseCorridorCanonicalName`/
  `CORRIDOR_NAME_RE` is the same convention, not imported (TypeScript, cannot load under the no-npm
  `node --test` resolver this lane's test file runs under).
- `fsi-app/supabase/migrations/282_entities.sql` - read; confirmed the live `entities` table has exactly 6
  columns at this migration (`entity_id, kind, canonical_name, status, merged_into, created_at`) -
  `canonical_name` (the `corridorSeed()` string, "ORIGIN-DEST:mode") is the only place origin/dest/mode are
  stored at this layer, confirming `candidatesFromCorridorEntities()`'s parse-from-canonical_name approach
  is correct against the live schema, not an assumption.
- `docs/decisions/` - `grep -ril "wo-24\|corridor"` found no ADR naming WO-24 by number; the ruling lives
  in `docs/plans/unblocking-the-five-2026-08-30.md` SS2, re-read in full this session and confirmed
  unchanged (still rules the three-state design, still defers corridor-identity-building to "its own
  future WO" - this lane IS that future WO, scoped narrowly as a lookup, never a builder).
- `docs/inventories/migrations.md` - grepped for "366"; zero hits, confirming nothing has claimed it.
  `fsi-app/supabase/migrations/` highest file is `346_*`, matching the README.

## Migration decision

**366 not consumed.** The live `entities` table (kind='corridor') plus `seed-corridors.mjs`'s own exported
candidate sets are sufficient as the resolver's injected candidate input - no new table, no migration
file written.

## Tests

`node --test src/lib/market/resolve-item-corridor.test.mjs` - 17/17 pass:
(a) single-jurisdiction -> no_corridor_identity; (b) empty array -> no_corridor_identity; (c) `["GLOBAL"]`
-> no_corridor_identity; (d) CNSHA/NLRTM two-country match + mode match -> resolved, corridor identical to
the seeded entity (explicit equality assertion, reverse-order input array proves no direction invented);
(e) same countries, mode mismatch -> no_corridor_identity; (f) same countries, no mode / multiple modes ->
no_corridor_identity; (g) injected fixture, two candidates sharing a country-set -> ambiguous; plus the
live-ambiguous correction case, a country-set-unambiguous-but-mode-gated case, a no-match case, a
malformed-input case, and two `carbonCostPerFeu()` integration cases (resolved corridor does not throw;
no_corridor_identity's null corridor correctly still throws the required-field error, proving this lane
never papers over that gate).

"Test what you build" against live data: **NOT RUN.** This worktree holds no DB credentials (confirmed:
no `.env`/`.env.local`, no `SUPABASE_*` env vars set) - the same wall `docs/ops/session-log.d/
2026-10-03-l12.md` hit for its own live-render check. The resolver's three states ARE proven against the
REAL live `seed-corridors.mjs` candidate set (not a mock) via the `[CONFIRMED]` ambiguous test above, which
is the strongest proof available without database read access. **COORDINATOR ACTION NEEDED**: run
`resolveItemCorridor()` once against every live `market_signal` item's real `jurisdictionIso`/`modes`
with DB credentials, to get the actual state-distribution count this lane could not produce.

## Gates

Per coordinator instruction (2026-10-03, mid-lane): commit now rather than hold behind the full suite
(the pre-push hook runs that); touched test + fitness runner + tsc (N/A, no `.ts`/`.tsx` touched) run
directly. See this lane's final report for the actual command output lines.

## Harness and flywheel wiring (rule 17)

Pure function, no DB write, no harness family of its own - a read-time resolver with zero existing
callers by design. This lane does NOT wire `resolve-item-corridor.mjs` into
`MarketSignalDetailSurface.tsx` or any other UI - per the brief, that wiring (and the UI treatment of a
`resolved` vs `no_corridor_identity` state) is a separate, future lane's scope, named here as an open item
for the coordinator, because wiring it now, without also resolving the distance/payload/carbon-price gaps
`2026-10-03-l12.md` already named, would add dead GAP-state UI with no behavioural change.

## R14 compliance

No DB credentials in this worktree (confirmed). No `--apply` path exists in this lane's write set - every
exported function is pure. No network call, no LLM call, $0.

## UX compliance

Not applicable at first landing. This lane touched no `.tsx`/`.css` file. Superseded below - the
coordinator overrode the brief's UI-wiring hold the same session; see the addendum.

## Open items / COORDINATOR ACTION NEEDED (as first landed - partially superseded below)

1. **Live state-distribution run.** This worktree has no DB credentials; the coordinator (or a lane with
   credentials) should run `resolveItemCorridor()` against every live `market_signal` item's real
   `jurisdictionIso`/`modes` and `candidatesFromCorridorEntities()` against a live `entities
   WHERE kind='corridor'` read, to get the actual count. Expected (per this lane's fixture proof against
   the real `FALLBACK_CORRIDOR_SEEDS`): most items resolve `no_corridor_identity`, and any item carrying
   `jurisdictionIso` set exactly `{CN,US}` with a single `ocean` mode resolves `ambiguous` (not
   `resolved`) because of the finding above. STILL OPEN - the read-only SQL was sent to the coordinator
   separately per their own request; this worktree still holds no credentials to run it.
2. ~~UI wiring is a separate, future lane's scope~~ - SUPERSEDED, see addendum (coordinator overrode this
   same session, rule 17: no half slice).
3. No INDEX.md entry needed (this file lives in `session-log.d/`, exempted per that directory's own
   README).
4. Branch name divergence: the parent dispatch set up this worktree on branch
   `lane/l-corridor-resolver` (the exact command given to this lane), while the brief text itself names
   `lane/l-corridor-item-match-2026-10-03`. Followed the explicit setup instruction given to this lane
   session over the brief's suggested name; flagging the mismatch rather than silently picking one.

## Addendum: UI wiring (coordinator override, 2026-10-03, rule 13 correction in place)

The coordinator overrode the brief's own UI-wiring hold mid-session: "wire the UI now (rule 17, no half
slice, no F25 allowlist entry)." Write set extended to `MarketSignalDetailSurface.tsx`,
`carbon-overlay-view.mjs`, `src/app/market/[slug]/page.tsx`, and their tests.

### What was built (this addendum)

- `fsi-app/src/lib/market/carbon-overlay-view.mjs` - new export `buildCarbonCostPerFeuView()`, the
  composition seam between `resolveItemCorridor()` and `carbonCostPerFeu()`, same posture as the
  existing `buildCarbonOverlayView()`/`selectModalFactor()` seam. `no_corridor_identity` composes to
  `null` (nothing extra beyond the carbon-intensity block); `ambiguous` composes to an honest note
  naming no corridor identity; `resolved` composes a real `carbonCostPerFeu()` call (factor selected by
  mode only, never tied to a jurisdiction - see `selectFactorForCorridorMode()`'s own header), rendering
  its own GAP states when distance/payload/carbon-price are absent (today: always).
- `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` - new `CorridorCandidate` type, new
  `corridorCandidates` prop, new `corridorCostView` computation (gated on `hasCarbonOverlay`, same gate
  as the existing carbon-intensity block), new `CorridorCostPerFeuBlock` render component mounted
  directly below the existing carbon-intensity figure in BOTH the non-record and record-grade branches.
  `showFindings` extended with `|| !!corridorCostView`: a resolved corridor match always requires a
  2-country jurisdiction set, which `selectModalFactor`'s own 3-state design always calls "ambiguous"
  for the intensity figure - without this OR, a record-grade item with a resolved corridor match would
  show no Findings section at all, a gap this lane found and fixed in the same motion (rule 13).
- `fsi-app/src/app/market/[slug]/page.tsx` - new `corridorCandidatesPromise` (reads `entities
  WHERE kind='corridor' AND status='active'`, parsed via `candidatesFromCorridorEntities()`) added to
  the SAME `Promise.all` batch as `carbonFactorsPromise` - no second fetch pattern, per the coordinator's
  own instruction. Passed through `result.itemScoped.corridorCandidates` to the component.
- Tests: `src/__tests__/market-carbon-overlay-composition.test.mjs` gained 4 new cases for
  `buildCarbonCostPerFeuView()` (no_corridor_identity -> null, ambiguous -> honest note naming nothing
  invented, resolved -> real `carbonCostPerFeu()` call with GAP states, and a mode-ambiguous-factor
  case). 27/27 pass across both touched test files.

### Correction found and fixed while wiring (rule 13)

**[CONFIRMED]** Removing the F25 `PROVEN_BUT_UNWIRED` allowlist entry added at first landing works
correctly without a new violation: `resolve-item-corridor.mjs` now has a real production importer
(`carbon-overlay-view.mjs`), confirmed by `node .discipline/fitness/runner.mjs` - `0 violation(s)`.

**[CONFIRMED, caught by the rendering guard, fixed in the same motion]** The first wiring attempt left
`resolve-item-corridor.mjs` importing `entityId`/`corridorSeed` from `../entities/entity-id.mjs` (for a
`candidatesFromSeeds()` helper) at module top level. `entity-id.mjs` imports `node:crypto`.
`MarketSignalDetailSurface.tsx` is a `"use client"` component, so this module is now reachable from an
esbuild browser bundle (the rendering guard's own smoke harness) - `node:crypto` cannot resolve there,
and `detail-surfaces`/`market-detail-raw-dump`/two `layout-guard` checks failed with a build error.
Fixed by removing `candidatesFromSeeds()` and the `entity-id.mjs` import from the production module
entirely (it was only ever used by two test files, never by `carbon-overlay-view.mjs` or the detail
surface); each test file now mints its own fixture ids directly via `entity-id.mjs`, which is never
bundled since test files are not part of the client chain. Re-ran: `npx tsc --noEmit` clean,
`node .discipline/rendering/run-rendering-guard.mjs` -> `=== rendering guard PASS ===`.

### Gates (full command + result, this addendum's range)

- `node --test src/lib/market/resolve-item-corridor.test.mjs src/__tests__/market-carbon-overlay-composition.test.mjs`
  - 27/27 pass.
- `npx tsc --noEmit` - clean, no output, exit 0.
- `node .discipline/fitness/runner.mjs` - `Fitness summary: 60 function(s) checked, 0 violation(s).`
- `node .discipline/rendering/run-rendering-guard.mjs` - `=== rendering guard PASS ===`; `fixtures: 14
  viewports: 380,420,480,560,640,767,768,900,960,1100,1200,1440 checks: 884`; `UX smoke specs: 21 (...
  detail-surfaces ... market-detail-raw-dump ...) ux checks: 386`; `layout guard: 36 route x width
  measurement(s), 0 finding(s)`.

### UX compliance (lane-common-contract "UX contract" section; `ux-laws.md` + `design-principles.md`
DP-2 read in full before this edit)

**Screen**: `/market/[slug]` detail page, "Substantive findings" (S2) section, both the non-record and
record-grade branches, directly below the existing carbon-intensity sub-block.

- **Reader's primary goal**: see the real per-FEU carbon cost for this signal's corridor when one can be
  identified, or an honest reason why not, without a second page or a tab switch (law 3, Jakob's Law -
  the block sits exactly where the related carbon-intensity figure already sits).
- **Shortest path**: zero clicks - the block renders inline in the already-open Findings section exactly
  when there is something honest to show (a resolved corridor's GAP states/figure, or an ambiguous
  note); it renders nothing at all for `no_corridor_identity`, never a dead placeholder (law 14,
  Postel's Law - never imply work that was never going to complete).
- **One primary action**: none added - read-only content, no new control, no button, same posture as the
  existing carbon-intensity block it sits beside.
- **Feedback state for every asynchronous action**: none added - `corridorCostView` is computed
  synchronously from props already assembled server-side (`corridorCandidates`, same cached bundle as
  `carbonFactors`), same as `carbonOverlay`/`intensityFigure` before this lane.
- **Law 2 (Fitts) / RD-60 floor**: no new interactive target added; confirmed by the rendering guard's
  UX smoke pass (386 checks green, including `detail-surfaces` and `market-detail-raw-dump` at the
  guard's full viewport sweep 380px through 1440px) - no overflow, no undersized target introduced.
- **Law 16 (Similarity) / Law 3 (Jakob)**: the block reuses the SAME typography tokens, badge-free prose
  style, and `StateNote`/GAP-list idiom the existing carbon-intensity block and `CarbonCostOverlay.tsx`
  (the `/market` index page's own per-FEU card) already establish - no new visual treatment invented for
  the same class of figure.
- **Law 12 (Prägnanz)**: the ambiguous state renders ONE honest sentence, never a list of the matched
  corridor identities (naming nothing invented, per the coordinator's own instruction) - the simplest
  structure that is still truthful.

This change touches no row/ledger/card component in `ROW_COMPONENTS` (F35) - `CorridorCostPerFeuBlock`
is a sub-block inside an existing `DetailSubSection`, not a standalone row/card; the existing
`detail-surfaces`/`market-detail-raw-dump` UX smoke spec registrations already cover this file per
RD-60, confirmed by the rendering guard run above (no new registration needed).

### Open items (superseding the earlier list above)

1. **Live state-distribution run** - STILL OPEN, no DB credentials in this worktree. Originally sent as
   pasted read-only SQL; superseded again below by a committed script per the coordinator's follow-up.
2. UI wiring - DONE, this addendum. No longer an open item.
3. No INDEX.md entry needed (unchanged).
4. Branch-name divergence - unchanged, still flagged.

## Addendum 2: committed state-distribution script (coordinator follow-up, 2026-10-03)

The coordinator asked for a committed script in place of the pasted SQL, so the executor runs it
directly rather than hand-assembling a Node snippet around two SELECTs.

- `fsi-app/scripts/market/corridor-state-distribution.mjs` (new) - read-only, deps-injected
  (`export async function main(opts, deps)`, same COMMON lane-contract idiom as `seed-corridors.mjs`),
  no `--apply` flag at all (there is nothing to apply - it only ever reads). Reads
  `intelligence_items` (`item_type IN ('market_signal','initiative')`, `is_archived = false`) and
  `entities` (`kind='corridor'`, `status='active'`) once each, then calls
  `candidatesFromCorridorEntities()` + `resolveItemCorridor()` - the ONE home for the matching logic,
  never re-derived here. Exports `tallyCorridorStates()` (pure) for the test file. CLI entry checks for
  `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` and self-skips exit 2 without crashing when
  absent - confirmed this session (`NEXT_PUBLIC_SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= node
  scripts/market/corridor-state-distribution.mjs` -> `exit:2`).
- `fsi-app/scripts/market/corridor-state-distribution.test.mjs` (new) - 4 cases, injected fake
  `readAll`, no DB: resolved/ambiguous/no_corridor_identity all tally correctly against the REAL
  `seed-corridors.mjs`-shaped corridor rows (not a mock shape); an empty item list never throws;
  `main()` with an injected client makes exactly two reads (no second fetch pattern, confirmed by
  asserting on the recorded call list) and returns the real tally; an unparsable `canonical_name` row
  is skipped and reported, never crashes the run. `node --test
  scripts/market/corridor-state-distribution.test.mjs` - 4/4 pass.

### Gates (this addendum's range)

- `node --test scripts/market/corridor-state-distribution.test.mjs` - 4/4 pass.
- No `.ts`/`.tsx` touched - `tsc` not re-run for this addendum alone (already clean per addendum 1,
  unaffected by a new `.mjs` script).
- Fitness/rendering guard re-run before push, per the lane-common-contract preflight (see final report).

### Executor instructions (replaces the pasted SQL)

```
node scripts/market/corridor-state-distribution.mjs
```
Exit 0 on success (prints the tally and every resolved/ambiguous item's id); exit 2 if no DB creds are
set in the environment it runs in; exit 1 on an unexpected read failure.
