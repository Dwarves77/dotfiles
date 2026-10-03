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

Not applicable. This lane touches no `.tsx`/`.css` file.

## Open items / COORDINATOR ACTION NEEDED

1. **Live state-distribution run.** This worktree has no DB credentials; the coordinator (or a lane with
   credentials) should run `resolveItemCorridor()` against every live `market_signal` item's real
   `jurisdictionIso`/`modes` and `candidatesFromCorridorEntities()` against a live `entities
   WHERE kind='corridor'` read, to get the actual count. Expected (per this lane's fixture proof against
   the real `FALLBACK_CORRIDOR_SEEDS`): most items resolve `no_corridor_identity`, and any item carrying
   `jurisdictionIso` set exactly `{CN,US}` with a single `ocean` mode resolves `ambiguous` (not
   `resolved`) because of the finding above.
2. **UI wiring is a separate, future lane's scope** (named above, per the brief) - not built here.
3. No INDEX.md entry needed (this file lives in `session-log.d/`, exempted per that directory's own
   README).
4. Branch name divergence: the parent dispatch set up this worktree on branch
   `lane/l-corridor-resolver` (the exact command given to this lane), while the brief text itself names
   `lane/l-corridor-item-match-2026-10-03`. Followed the explicit setup instruction given to this lane
   session over the brief's suggested name; flagging the mismatch rather than silently picking one.
