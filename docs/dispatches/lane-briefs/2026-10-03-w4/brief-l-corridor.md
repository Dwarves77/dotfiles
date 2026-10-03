# Lane L-CORRIDOR: item-to-corridor resolver for carbon-cost-per-FEU

Read first, in this order: this file; `docs/dispatches/lane-common-contract.md` in full; `docs/ops/
session-log.d/2026-10-03-l12.md` in full (the addendum, "COORDINATOR ACTION NEEDED" and "2026-10-03
coordinator update" sections name this exact gap and its exact required inputs - this brief is built from
that text directly, cite it in your own report); `fsi-app/src/lib/market/carbon-cost-per-feu.mjs` IN FULL
(the consumer this resolver feeds, never a second implementation of its cost math); `fsi-app/src/lib/
market/select-modal-factor.mjs` IN FULL (the WO-24 ruling this lane must honour - do not skim it, the
three-state design and the "never invent a corridor from a jurisdiction array" rule are the load-bearing
part of this brief); `fsi-app/scripts/entities/seed-corridors.mjs` IN FULL (the existing corridor-entity
seeding this resolver matches AGAINST, never re-derives); then this dispatch's README (`docs/dispatches/
lane-briefs/2026-10-03-w4/README.md`) in full, especially open question 3.

Lane id: `l-corridor`. Branch: cut from `origin/master`. Branch name: `lane/l-corridor-item-match-
2026-10-03`. Model: Sonnet. You execute exactly this brief. Anything it does not cover, or any statement
here that is wrong against the code, is a STOP: report it, do not solve it.

## Why this lane exists (not in the plan; closes a named gap)

`docs/ops/session-log.d/2026-10-03-l12.md`'s addendum, verification lane L12, found that the Market
detail page's "carbon cost overlay" block actually rendered a different metric (carbon intensity, not
cost-per-FEU) and that the REAL spec 02S6 row 3 figure (`carbonCostPerFeu()`) cannot reach any item detail
page because a `market_signal` item carries `jurisdictionIso` (a country-code array with no origin/
destination role), never a `corridor` object. The coordinator ruled this a decision-ready gap for "a
dedicated WO/lane" and, in a later update in the same file, scoped it "into the next wave as its own
lane" and named the exact fields the next lane must supply, citing `carbonCostPerFeu()`'s own signature
directly. This lane IS that scoped-in lane.

## Objective and requirement IDs

Not a numbered spec-02/04 requirement; it is the prerequisite `carbonCostPerFeu()`'s own `input.corridor
= { origin, dest, mode }` (required, throws if absent - confirmed this session, `carbon-cost-per-feu.mjs`
line 162-164) needs before any lane can wire the real per-FEU figure onto an item detail page. This lane
builds ONLY the `corridor` resolution - origin, destination, mode - for a `market_signal` item. It does
NOT attempt distanceKm, payloadTonnesPerFeu, or carbonPrice: `docs/ops/session-log.d/2026-10-03-l12.md`'s
own coordinator update names those three as existing, already-named, product-wide gaps that
`carbonCostPerFeu()` already renders honestly as GAP text wherever it is called - out of this lane's
write set, by the same file's own scoping instruction.

## The WO-24 ruling you must honour (read `select-modal-factor.mjs` in full before writing any code)

`select-modal-factor.mjs`'s header states the binding rule verbatim: no corridor identity exists anywhere
on a Market item, this module does NOT build corridor identity and does NOT invent a `cl:corridor:` id for
a live item, and collapsing a multi-country `jurisdiction_iso` array to "pick one element" is fabricating
a corridor out of a jurisdiction list - exactly the class of invented claim CLAUDE.md rule 2 forbids.
`seed-corridors.mjs`'s own `deriveCorridorCandidatesFromItemJurisdictions()` function, read in full this
session, independently reaches the same conclusion and documents it: the jurisdiction array "names the
jurisdictions an item CONCERNS, with no order and no origin/destination role... picking element 0 as
'origin' and element 1 as 'dest' would invent a direction the data never asserted - this function always
returns [], on principle, not as a gap."

**This lane does not reverse that ruling.** It never assigns origin/dest roles to array elements and
never mints a new `cl:corridor:*` id. The only resolution this lane may perform:

- Read the EXISTING seeded corridor entities (`entities` table, `kind='corridor'`, written by
  `seed-corridors.mjs` - today, per that script's own header, the ADR-024 example set,
  `ADR_EXAMPLE_CORRIDORS`, e.g. CNSHA/NLRTM/ocean, since the live-data-derived candidate functions all
  return `[]` today).
- For a given item, compute its `jurisdiction_iso` array as an UNORDERED SET.
- `resolved`: the item's jurisdiction set, as a set, exactly equals one existing seeded corridor's
  `{origin country, dest country}` set (also read as a set), AND the item's own recorded transport mode
  (if the item carries one - confirm the exact field name by reading `MarketSignalDetailSurface.tsx` and
  the `market_signal` item shape) exactly matches that corridor's `mode`. In this case the resolver
  returns that corridor's `{origin, dest, mode}` AS ALREADY MINTED - direction is read from the existing
  entity, never assigned by this lane, so this is a lookup, not an invention.
- `ambiguous`: the item's jurisdiction set matches MORE THAN ONE seeded corridor's endpoint set (today,
  with one seeded corridor, this cannot fire - name this in your test as a forward-looking case, not a
  dead branch to delete).
- `no_corridor_identity`: everything else - a single-jurisdiction item, an empty array, a `GLOBAL` entry,
  a multi-country set that matches no seeded corridor's endpoint set, or a mode mismatch. This is the
  expected, honest result for essentially all live items today, since only one corridor is seeded and no
  live item is known to carry exactly that pair - state this plainly in your report, it is not a lane
  failure.

Never a fourth, softer state. Never a partial match (one country matches, mode does not - still
`no_corridor_identity`, not `resolved`).

## Operator rulings that bind you

- **CLAUDE.md rule 2** (never fabricate): no corridor direction, mode, or identity is ever assigned by
  guessing; the three-state result above is exhaustive and the default is always the honest gap.
- **WO-24 / `select-modal-factor.mjs`'s ruling** (above): binding, cited by name in your module's own
  header, the same way `select-modal-factor.mjs` and `seed-corridors.mjs` each cite it in theirs.
- **`docs/ops/session-log.d/2026-10-03-l12.md`'s own scoping** (above): this lane supplies ONLY
  `corridor`; it does not attempt distance, payload, or carbon-price resolution.
- **Lane common contract's prior-art rule**: this resolver reuses `seed-corridors.mjs`'s existing
  `entities`/`kind='corridor'` rows and `ADR_EXAMPLE_CORRIDORS` as its candidate set; it never re-derives
  or duplicates corridor-candidate logic that script already owns.

## Exact write set

- `fsi-app/src/lib/market/resolve-item-corridor.mjs` (new) - the three-state resolver described above.
  Exports a pure function taking an item's `jurisdictionIso` array and recorded mode (field name confirmed
  by your own read of the item shape) plus the candidate corridor-entity set (injected, not fetched
  inside the module, per the lane common contract's `deps`-injection pattern so tests run with no
  database), and returning `{ state: 'resolved' | 'ambiguous' | 'no_corridor_identity', corridor: {
  origin, dest, mode } | null, matchedCandidateIds: string[] }`.
- `fsi-app/src/lib/market/resolve-item-corridor.test.mjs` (new) - fixture-based, no network, no DB
  credential. Covers at minimum: (a) single-jurisdiction item -> `no_corridor_identity`; (b) empty array
  -> `no_corridor_identity`; (c) `["GLOBAL"]` -> `no_corridor_identity`; (d) two-country set exactly
  matching the seeded CNSHA/NLRTM corridor's countries AND matching mode -> `resolved`, with the returned
  `corridor` object identical to the seeded entity's own origin/dest/mode (assert this equality
  explicitly, proving no direction was invented); (e) same two countries, mode mismatch ->
  `no_corridor_identity`; (f) same two countries, no mode on the item at all -> `no_corridor_identity`
  (never an implicit match); (g) a fixture with two candidate corridors whose endpoint sets both match the
  item's jurisdiction set -> `ambiguous` (forward-looking case per the ruling above, exercised with an
  injected fixture candidate set larger than today's live one).
- A small integration test (can live in the same test file) feeding a `resolved` result's `corridor`
  object directly into `carbonCostPerFeu()`'s own `input.corridor` parameter against a fixture `factor`,
  confirming it does not throw the `corridor = { origin, dest, mode }` required-field error - proving the
  shape contract between this resolver and its consumer without wiring any UI (UI wiring is a separate,
  future lane's scope, not this one's).
- `docs/ops/session-log.d/2026-10-03-l-corridor.md` (new) - must state plainly whether any live
  `market_signal` item resolves today (expected: no, per the open question in the README) and must cite
  `docs/ops/session-log.d/2026-10-03-l12.md` as the gap this lane closes.

## READ FIRST (every write-set file's importers/imports, migrations, generated inventories)

1. `fsi-app/src/lib/market/carbon-cost-per-feu.mjs`, IN FULL - the consumer; confirm the exact `corridor`
   shape (`{origin, dest, mode}`, all three required, throws otherwise) your resolver's output must match
   exactly, by line number.
2. `fsi-app/src/lib/market/select-modal-factor.mjs`, IN FULL - the WO-24 ruling, verbatim, cited above;
   confirm your own module's header cites it the same way this file and `seed-corridors.mjs` do.
3. `fsi-app/scripts/entities/seed-corridors.mjs`, IN FULL - `ADR_EXAMPLE_CORRIDORS` and the three
   `deriveCorridorCandidatesFrom*()` functions; confirm your resolver's candidate set is sourced from this
   script's own output (read the `entities` table rows it writes, or import `ADR_EXAMPLE_CORRIDORS`
   directly for the fixture/dry case - decide which and state why) rather than re-deriving candidates.
4. `fsi-app/src/components/pages/MarketSignalDetailSurface.tsx` - confirm the exact field name a
   `market_signal` item uses for its recorded transport mode (the README's open question 3 and this
   brief both assume one exists, e.g. `r.modes`/`signalBand` per `docs/ops/session-log.d/2026-10-03-
   l12.md`'s own "partially available today" note on this exact point) - if no such field exists on the
   live item shape, STOP and report that the mode half of the match cannot be built at all, rather than
   guessing a field name.
5. `docs/ops/session-log.d/2026-10-03-l12.md`'s "2026-10-03 coordinator update" section, IN FULL (already
   read per the top-of-brief instruction, re-read here specifically for the five named input fields) -
   confirm your resolver supplies exactly the first three (`corridor.origin`, `corridor.dest`,
   `corridor.mode`) and explicitly does not attempt the other three.
6. `fsi-app/supabase/migrations/282_*.sql` (the `entities`/`entity_kind` migration naming `corridor` as a
   kind, per `seed-corridors.mjs`'s own header citation) - confirm the live column shape for a corridor
   entity row (how origin/dest/mode are actually stored) your resolver reads.
7. `docs/decisions/` - `grep -ril "wo-24\|corridor" docs/decisions/` - any ADR naming this ruling by
   number is binding; cite it if found (the ruling itself lives in `docs/plans/unblocking-the-five-
   2026-08-30.md` per `select-modal-factor.mjs`'s own citation - confirm that plan file still states the
   same ruling, unchanged, before relying on it).
8. `docs/inventories/migrations.md` - confirm whether migration 366 (reserved by this dispatch's README,
   provisionally) is actually needed; if your read of `entities`/`seed-corridors.mjs` output is sufficient
   with no new table, report "366 not consumed."

Report "read and reused" naming each file above and what you reused rather than reimplemented.

## Migration number

**366 is reserved, provisionally, by this dispatch's README** - only in case this lane's own fixture test
needs a narrow lookup table for seeded-corridor candidate sets distinct from querying `entities` directly.
Check first (READ FIRST item 8). If `entities`/`seed-corridors.mjs`'s existing output is sufficient, do
not write a migration file; report "366 not consumed" explicitly. If you find you genuinely need a
different migration, STOP and ask the coordinator by name before writing one.

## Harness and flywheel wiring (rule 17: nothing runs alone)

Pure function, no DB write, no harness family of its own - a read-time resolver. State explicitly in your
report that this lane does NOT wire `resolve-item-corridor.mjs` into `MarketSignalDetailSurface.tsx` or
any other UI - that wiring, and the resulting UI treatment of a `resolved` vs `no_corridor_identity`
state, is a separate, future lane's scope (name it as an open item for the coordinator), because wiring it
without also resolving the distance/payload/carbon-price gaps `docs/ops/session-log.d/2026-10-03-l12.md`
already named would produce dead GAP-state UI with no behavioural change, per that file's own finding.

## R14 compliance

No data-population run, no `--apply` path, no live DB write. $0: no network call, no LLM call. The
resolver's candidate corridor set is either read from the live `entities` table (read-only) or injected
as a fixture for tests - either way, no write path exists in this lane's write set.

## Tests, and the fire-once requirement

- `node --test fsi-app/src/lib/market/resolve-item-corridor.test.mjs` - paste the pass count, naming each
  of the seven cases (a-g above) and its result.
- "Test what you build": run the resolver once against every live `market_signal` item's real
  `jurisdictionIso` array (read-only query, no write) and paste the actual state distribution (expected:
  100% `no_corridor_identity` today, per the open question in the README - if even one item resolves,
  name it explicitly and double-check the match is not a false positive from an incomplete mode field).

## UX compliance

Not applicable - this lane touches no `.tsx`/`.css` file.

## Dependencies

None structurally. Independent of L13 and L14. Downstream of L12's own finding (already landed, per the
session-log file this brief is built from) and upstream of whichever future lane wires the real
cost-per-FEU figure onto the detail page (not this lane's scope).

## Report format

Per the lane common contract's "Report" section: git log, file-by-file build, consumers checked (named -
there are none yet, by design, see Harness section), ADRs/rulings checked (named, especially WO-24), the
seven test cases and their results, the live state-distribution run's actual output, whether migration
366 was consumed, gate output lines, corrections, open items (explicitly naming the future UI-wiring lane
as not-this-lane's-scope).

## Standing prohibitions

No nested agents. No `--no-verify`. No edit to `docs/ops/session-log.md`, `docs/PROGRAM-BOARD.md`, or
`docs/INDEX.md`. No migration file unless genuinely needed (check first). No DB credential, no live write.
No invented corridor direction, no invented `cl:corridor:*` id, no partial match treated as resolved. No
UI wiring in this lane. No em dashes, en dashes or the section-sign glyph in added prose (rule 022).
