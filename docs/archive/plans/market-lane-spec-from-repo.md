# Market lane — corrected spec-from-repo (2026-08-30)

**Status: DRAFT, spec-from-repo pass.** Written per the vault gap named in
`docs/plans/connection-redesign-and-build-scope-2026-08-29.md` §4 ("Vault gap, named": the governing
texts for WO-13/14/23/24 exist only in the never-committed v1 plan, lost to chat) and executed under
that scope's §5 executor contract and §6a wave-4 lane model (Market lane WO-13→14→23→24, serialized
within the lane, parallel across the Market/Operations/Research lanes). This document is derived fresh
from the repository (worktree `c6c228ff`, matching the scope doc's baseline) and the live database
(project `kwrsbpiseruzbfwjpvsp`) — the lost v1 text is **not** reconstructed from memory anywhere below.

Every claim is labelled **FACT** (file+line or live query, this session), **INFERENCE** (a reasoned
conclusion from FACTs, not itself directly observed), or **UNCONFIRMED** (stated but not verified this
session), per CLAUDE.md standing rule 14. Per the governing HARD RULES for this lane, no git command
was run and nothing outside `docs/plans/market-lane-spec-from-repo.md` was written.

---

## Lane summary

| Order | WO | What it is | Status after this pass |
|---|---|---|---|
| 1 | **WO-13** | List + detail small wiring pass: WO-5 B4 re-point (`marketData.currentPrice` → a real numeric channel) + the WO-5 B1 identifier chip, decided here as **NO for Market specifically** | **Ready to execute**, scope corrected from the master plan's framing (§WO-13 below) |
| 2 | **WO-14** | Unlike every other WO in this program, **WO-14 has literally zero mentions anywhere in the vault outside one sequencing table row** (`grep -rn "WO-14"` over `docs/` returns exactly one hit: the Stage-5 table in the master plan). There is no lost text to recover — there was never a recorded text. This section is a full reconstruction from repo evidence, not a recovery, and is flagged accordingly | **Blocked on an operator ruling** confirming or replacing the reconstructed scope (§WO-14 Open ruling 1) before an executor starts |
| 3 | **WO-23** | Watchlist wiring: a new `market_series` value on the team watchlist | **Blocked on a migration** the master plan's phrasing ("gains a value") did not surface — both watchlist tables carry a live 5-value CHECK, and the widening touches four shared code files, not the five the plan named. Ready once the coordinator lands the CHECK widening (§WO-23 below) |
| 4 | **WO-24** | Carbon overlay on Market signals, fed by `emission_factors` | **Blocked on two independent gates**: `emission_factors` is 0 rows live and its one seeded-but-unapplied source (DESNZ) is `[UNCONFIRMED]` against the primary spreadsheet; and — a repo-wide finding this pass made, not previously recorded anywhere — **no column on `intelligence_items` or anywhere else links a market signal to a `corridor_id`**, so even a fully seeded `emission_factors` table has no join path to a Market item today. WO-24 can ship the honest-pending frame now; it cannot ship a real overlay until both gates clear |

**What is unblocked today:** WO-13, mechanically. **What is not:** WO-14 needs an operator ruling before
its write set can be trusted; WO-23 needs a coordinator-applied migration (two-track policy, CLAUDE.md
rule 3) before its code lands; WO-24 needs a primary-source verification pass on DESNZ *and* new corridor
identity work this document does not scope (named as an explicit gap, not solved here).

---

## WO-13 — List + detail wiring: the WO-5 B4 re-point, the B1 chip decided NO for Market

### 1. What the repo actually has today

**The dead `marketData` field.** `src/types/resource.ts:214-220` declares:

```ts
marketData?: {
  currentPrice?: string;
  previousPrice?: string;
  priceSource?: string;
  priceDate?: string;
  freightCostImpact?: string;
};
```
**FACT.** Repo-wide `grep -rn "marketData"` over `fsi-app/src` returns exactly three real sites: the type
declaration above, `src/components/market/MarketIntelLedger.tsx:807-809` (the reader), and two comments
in `src/__tests__/contracts-envelope.test.mjs:8,55` and `src/lib/contracts/envelope.mjs:9` that document
the defect rather than produce data. **No mapper anywhere writes `marketData`.** This matches the WO-5
orphan-disposition finding (`docs/ops/wo5-orphan-disposition-2026-08-20.md` row 4) verbatim, re-confirmed
this session.

`MarketIntelLedger.tsx:805-810`, the list-page key figure:
```tsx
const priceFigure = item.marketData?.currentPrice?.trim() || null;
const figLabel = priceFigure
  ? item.marketData?.priceDate || item.marketData?.priceSource || "current price"
  : "no price dimension";
const figHue = priceFigure ? def.hueVar : "var(--mi-fig-empty)";
```
Renders inside `SignalRow` at lines 864-884 as the Anton-numeral figure top-right of every card. Since
`marketData` is never populated, `priceFigure` is always `null` and every card always shows the honest
em-dash "no price dimension" — the exact behaviour WO-5 B4 diagnosed.

**The real numeric channel it should point at.** `published_price_statistics` (migration 151/152) is
read ONLY on the detail route, `src/app/market/[slug]/page.tsx:149-183`, service-role, filtered
`.eq("item_id", r.id)`, and rendered by `PriceBoard` in
`src/components/pages/MarketSignalDetailSurface.tsx:79-89` (the `PriceStat` shape) and `:587-646` (the
component). **FACT, live query this session:**

```sql
SELECT id, item_id, label, value_display, unit, released_at, next_release_at
FROM published_price_statistics ORDER BY sort_order;
```
→ 4 rows, attached to exactly **2 distinct `item_id`s** (`0980d468-79aa-4343-b353-7bd6d5b75c2b` — WTI
Crude/Brent Crude/Jet Fuel, 3 rows — and `b8da154a-149e-483a-9198-7039850006fc` — Henry Hub, 1 row).

**The gap the master plan's phrasing hides.** `published_price_statistics` is fetched **only inside the
single-item detail page**, never inside the list fetcher. `src/lib/supabase-server.ts:1274-1278`
(`fetchMarketIntelItems`) is a two-line wrapper over `runCategoryRpc(orgId, "get_market_intel_items")` —
no join, no decoration, no reference to `published_price_statistics` anywhere near it (**FACT**, grep
confirmed zero hits). So "re-point the key figure at `published_price_statistics`" (WO-5's B4
recommendation, `docs/ops/wo5-orphan-disposition-2026-08-20.md` row 4) is not a one-line swap on the list
page — the list page has never fetched this table at all. The repo already has the exact sanctioned
pattern for this shape of problem: `fetchSourceCitationStatsByIds`
(`src/lib/supabase-server.ts:1328-1333`, comment at 1308-1319) is "decorated onto the Resource list by
the caller (the /market route)" for a different Market-adjacent stat, keyed off a batch of ids resolved
after the RPC returns. WO-13's re-point should follow that exact precedent, not invent a new one.

**Quantified impact, live-verified this session.** Of 77 `item_type='market_signal'` rows (46 of them
`provenance_status='verified'`, the only population the ledger ever renders — `MarketIntelLedger`'s
comment at lines 34-35 states the RPC is verified-gated), only **2 of 46 verified rows** have any
`published_price_statistics` row to re-point to. A re-pointed key figure will show a real price on 2
cards and the same honest em-dash on the other 44 — which is correct and expected (WO-16/WO-16.2 is the
mechanism that grows this population later, not this WO), but the WO text should state the number rather
than imply the fix "lights up" the ledger.

**The WO-5 B1 identifier chip, re-measured for Market specifically.** WO-5's own table
(`docs/ops/wo5-orphan-disposition-2026-08-20.md` row 1) measured `instrument_identifier` population
**workspace-wide** (675/1,062) and recommended folding a display chip into "WO-13's detail-surface pass."
Re-measured this session **scoped to Market** (the population that actually matters for this WO):

```sql
SELECT id, title, domain, provenance_status, instrument_identifier
FROM intelligence_items WHERE item_type='market_signal' AND instrument_identifier IS NOT NULL;
```
→ **exactly 1 row**, out of 77. And that one row is `id fb86ee11…`, `instrument_identifier
"matrix-hudson-2br-lottery"`, title *"Matrix Hudson Unit Lottery Opening - 2BR Affordable Rental at 80%
AMI in Boston"* — a residential-lottery listing, not a freight/market-intel item, currently sitting
`provenance_status='verified'` under `item_type='market_signal'`. **This looks like a data-quality
misclassification, not a chip-worthy identifier** (a CELEX-style regulatory cite is what the chip was
designed for on Regulations, per WO-5's own row-1 rationale — "the data is CELEX-clean" — which does not
describe this row). Flagged here per CLAUDE.md rule 13 (a flag is a commitment): this is a genuine
anomaly worth a follow-up look at how a housing-lottery item entered the Market corpus, but fixing corpus
classification is outside this WO's write set and is not attempted here.

### 2. What WO-13 must do

1. **Re-point the ledger key figure.** In `src/lib/data.ts`'s `getMarketIntelItems()` (or a new decorator
   called from `src/app/market/page.tsx`, mirroring the citation-stats precedent above), after
   `fetchMarketIntelItems` returns, batch-fetch `published_price_statistics` for the returned item ids
   (`.select("item_id, label, value_display, unit, released_at").in("item_id", ids)`), take one row per
   item (lowest `sort_order`, matching `PriceBoard`'s own ordering convention at
   `MarketSignalDetailSurface.tsx:161-166`), and attach it to each `Resource` as a new field (e.g.
   `Resource.priceStat: { label, valueDisplay, unit, releasedAt } | null` — NOT a resurrection of the
   `marketData` shape, which never had a real backing query).
2. **Update `MarketIntelLedger.tsx:805-810`** to read the new field instead of `item.marketData`. Keep
   the exact honest-empty behaviour (em-dash + "no price dimension" muted label) for the 44/46 rows with
   no attached stat — this WO changes the binding, not the honesty contract.
3. **Delete the dead `marketData` type block** (`types/resource.ts:214-220`) in the same commit, per
   WO-5's own recommendation — nothing else references it after step 2 (re-grep before deleting, per the
   WO's own discipline).
4. **Do NOT build the identifier chip.** Per §1's re-measurement, Market's live population for this field
   is 1/77 and that one row is anomalous. Recommend closing WO-5 open ruling 1 as **NO for Market**
   (Regulations may still be a yes — out of scope for this document, which covers Market only).
5. **Sections 5 and 6 tabs already degrade honestly.** `MarketSignalDetailSurface.tsx`'s Cost tab (`:457-475`)
   and Sources tab (`:774-850`) already render `PendingFrame`s when no data exists — no change needed
   there; confirmed by reading both in full this session.

### 3. Named write set

- `src/lib/data.ts` (new decoration step in/near `getMarketIntelItems`)
- `src/app/market/page.tsx` (only if the decoration is called from the page rather than inside `data.ts`
  — pick one home, do not split the same fetch across both)
- `src/components/market/MarketIntelLedger.tsx` (key-figure read-path only, lines ~805-810 and the
  `Enriched`/`SignalRow` prop it flows through)
- `src/types/resource.ts` (delete `marketData` block, add the new `priceStat` field)

**Explicitly NOT written:** `src/app/market/[slug]/page.tsx` and `MarketSignalDetailSurface.tsx`'s
`PriceBoard` — the detail page's price fetch is already correct and untouched (WO-16 migration 268's own
header states `published_price_statistics` "is UNTOUCHED by this migration" and this WO does not touch
it either, it only ADDS a second, list-scoped reader of the same table).

### 4. Consumers and blast radius

- `MarketIntelLedger`'s `SignalRow` is the only renderer of the key figure (checked: `grep -n
  "marketData" src/components` returns only this file).
- `Resource` is a very wide type (used by every surface's fetchers). Adding one optional field is
  additive and safe; **deleting** `marketData` requires the re-grep in step 3 above to confirm zero other
  readers — this session's grep already found none, but the executor must re-run it fresh per rule 0.15
  (state can have moved since this pass).
- No test file references `marketData` as a live-data expectation — `contracts-envelope.test.mjs` and
  `envelope.mjs` mention it only in a comment describing the historical defect (**FACT**, read both this
  session); deleting the type does not break either.

### 5. Gates and anti-scope

**Does NOT:**
- Touch `market_series` (WO-16's table, 0 rows live — nothing to read yet) or wait on it. This WO reads
  only the already-populated `published_price_statistics`.
- Touch the detail page's own `PriceBoard` fetch, which already works correctly.
- Build the WO-5 B1 identifier chip (recommendation reversed to NO for Market, §1/§2).
- Fix the `matrix-hudson-2br-lottery` corpus anomaly (flagged, not fixed — outside this write set).
- Require any migration. `published_price_statistics` and `intelligence_items` are both live; this is a
  pure application-code change.

⛔ **No hard dependency.** This WO can start immediately.

### 6. Open rulings

1. **WO-5 B1 (identifier chip on Market): closed here as NO**, not deferred to the operator, because the
   live population (1/77, and that one row is anomalous) makes the WO-5 recommendation ("wire a small
   display… the data is CELEX-clean") factually inapplicable to Market as measured. Regulations' own
   population was not re-measured in this pass and is out of scope for this document.
2. **Where the batch-decoration helper lives** (`data.ts` vs. a new module vs. inline in `page.tsx`) —
   *recommendation: `data.ts`, next to `getMarketIntelItems`, following `fetchSourceCitationStatsByIds`'s
   placement precedent exactly.* Tradeoff: a new `src/lib/market/` module would be more discoverable but
   there is no other list-decoration helper anywhere else in `src/lib/market/`, so it would be a
   one-function module; not worth a new home for one function when a working precedent already exists in
   `data.ts`.

---

## WO-14 — reconstructed from repo evidence (the vault gap in full)

**This section is not a recovery. It is a reconstruction**, offered because leaving WO-14 fully blank
would stall the lane at position 2 of 4. `grep -rn "WO-14" docs/` returns exactly one line — the
Stage-5 sequencing row in `docs/plans/master-execution-plan-2026-08-17.md:63`
(`| 5. Market build-out | WO-13 · WO-14 · WO-23 · WO-24 | after WO-12/16 |`) — and nothing else,
anywhere, ever, names what WO-14 is. Unlike WO-13 (recoverable from the WO-5 disposition table's own
"executed in WO-13" language) or WO-23/WO-24 (both get their own named paragraphs in the master plan's
Part 2), **WO-14 was never given content in any document this session could find.** Everything below is
**INFERENCE**, built from what the surrounding WOs need and what the repo already half-built and left
orphaned. **Open ruling 1 below must be answered before an executor treats this as authoritative.**

### 1. What the repo actually has today (the candidate raw material)

Three pieces of already-built, currently-unused infrastructure sit between WO-13 (small wiring) and
WO-23 (watchlist wiring), and none of them has anywhere to attach without new UI:

**A. The market-series producer registry has no reader.** `src/lib/market/series-registry.mjs` (WO-16's
own artifact, plain ESM, zero DB dependency, importable today with no migration or data prerequisite)
exports `MARKET_SERIES_PRODUCERS`: 4 entries (EU Weekly Oil Bulletin — implemented — plus EEX EUA, ECB
FX, EIA v2 as documented stubs), each carrying `name`, `cadence`, `sourceUrl`, `implemented`. **FACT,
grep confirmed:** nothing in `src/components` or `src/app` imports `series-registry.mjs` — it is
consumed only by the producer script and its own test. Meanwhile `MarketIntelLedger.tsx:756-770` carries
a literal placeholder card:
```tsx
<p style={{ ...railLbl, marginBottom: 8 }}>Sources tracked</p>
<div style={{ border: "1px dashed rgba(0,0,0,0.25)", ... }}>
  <p>The price-data source roster populates here once the commodity-price feed is connected...</p>
</div>
```
This is a named, dashed-border "pending" card asking for exactly the content `series-registry.mjs`
already has in memory, at $0 cost, with zero DB dependency (WO-16's own header calls this file the
"registry, not four separate TODO comments" — it was built to be read by something).

**B. `market_series` has zero rows and no reader anywhere in `src/`.** **FACT, live query this session:**
`SELECT count(*) FROM market_series` → 0. `grep -rln "market_series" src/` returns only the two test
files and `src/lib/market/write-market-series.mjs` / `refresh-published-price-statistics.mjs` — no
component, no page, no fetcher in `src/app` or `src/components` reads this table. WO-16's producer ships
kill-switched off, so this is expected today; it will not stay expected once an operator arms the
producer, at which point there is currently nowhere for the resulting rows to render.

**C. The watchlist has no card to attach a watch button to.** WO-23 (below) is specced against "wiring
`market_series` into the existing watchlist," but nothing in `src/app` or `src/components` renders a
`market_series` row as a card, list item, or any other unit a `WatchButton` could sit beside — confirmed
by the same grep as (B). A watch affordance needs a thing to watch; today there is no Market UI surface
whose unit of display is a series rather than an `intelligence_items` row.

### 2. What WO-14 must do (reconstructed brief)

**Recommended scope, sized to what is buildable at $0 with today's data:**

1. **Light up the "Sources tracked" rail card** (`MarketIntelLedger.tsx:756-770`) from
   `MARKET_SERIES_PRODUCERS` — replace the static placeholder paragraph with the real registry: one row
   per producer (`name`, `cadence`, and an honest `implemented` badge distinguishing the one live producer
   from the three documented stubs). This requires no migration, no armed producer, and no live
   `market_series` row — the registry itself is the payload. Fetched server-side in `page.tsx` (plain
   import, no I/O) and passed down alongside `aggregates`.
2. **Add the minimum `market_series` reader** the next two WOs need: a small server-side fetch (mirroring
   the admin `/admin/factors` precedent — read-only, no mutation controls) that, for a given `series_key`
   prefix, returns the latest row per series (reusing `latestPerSeries` from
   `src/lib/market/refresh-published-price-statistics.mjs:73-80`, already pure and tested). With 0 live
   rows this renders the same honest-empty pattern every other Market surface already uses (`PendingFrame`
   / dashed-border card) — this WO ships the reader and the empty state, not fabricated data, matching
   WO-16's own "kill-switched off" posture.
3. **Do NOT build a per-series detail page or a corridor rate board / carbon overlay / lead-time chart.**
   `docs/specs/07-page-walkthrough.md:90-140` describes those (comparative ribbon, corridor rate board,
   carbon overlay, lead-time chart) as the aspirational Market Intel surface, but that spec document is
   DRAFT (per `docs/INDEX.md`'s specs section) and predates the redesign templates actually shipped
   (`MarketIntelLedger`/`MarketSignalDetailSurface`, both headed "Redesign TEMPLATE 04/05" — a different,
   later design language). None of the ribbon/rate-board/carbon-overlay/lead-time components exist in
   code today (**FACT**, grep for `corridor rate|comparative ribbon|lead-time` in `src/` returns zero).
   Building any of them is a substantially larger, un-costed effort this reconstruction does not assume
   into WO-14 without an operator decision (Open ruling 1).

### 3. Named write set (if Open ruling 1 confirms this scope)

- `src/components/market/MarketIntelLedger.tsx` ("Sources tracked" rail card only, lines ~756-770)
- `src/app/market/page.tsx` (pass `MARKET_SERIES_PRODUCERS` through, or import directly in the card if no
  server fetch is needed for part 1)
- One new file for the minimum reader in part 2, e.g. `src/lib/market/fetch-latest-series.mjs` (server
  read wrapper) — placed beside the existing `src/lib/market/*.mjs` modules, not inside `src/app`.

**Serialization note for the coordinator:** WO-14 and WO-13 both touch `MarketIntelLedger.tsx`, but at
disjoint line ranges (WO-13: ~805-810 key figure; WO-14: ~756-770 rail card) — safe to author in
parallel and merge, but land WO-13 first per the lane's stated serialization so WO-14 rebases onto a
clean file rather than the reverse.

### 4. Consumers and blast radius

- `MARKET_SERIES_PRODUCERS` has exactly one existing consumer (`producerFor`/`isImplementedSeriesKey`
  inside the same module, used by the producer script) — adding a UI import is additive, no existing
  caller changes.
- The new reader in part 2 has no existing consumers by construction (it does not exist yet); WO-23's
  eventual UI attachment point (§WO-23 Open ruling 2) would become its first real consumer, one WO later.

### 5. Gates and anti-scope

**Does NOT:**
- Build any of the spec-07 comparative ribbon / corridor rate board / carbon overlay / lead-time chart
  (WO-24 owns the carbon overlay specifically, and it is gated — see below).
- Require the EU Weekly Oil Bulletin producer to be armed. Ships correct against 0 rows.
- Touch `published_price_statistics`, `PriceBoard`, or anything WO-13 already owns.

⛔ **Hard stop: Open ruling 1.** Do not start an executor against this section until the operator
confirms, amends, or replaces this reconstruction. Unlike every other WO in this program, there is no
lost text to fall back to if this guess is wrong — getting it wrong here means inventing scope, which
CLAUDE.md rule 2 (never fabricate) counsels against doing silently.

### 6. Open rulings

1. **⛔ Is the reconstruction in §2 an acceptable stand-in for the lost WO-14, or does the operator
   remember/intend something else?** *No recommendation offered beyond "this is the most defensible,
   evidence-grounded, $0-buildable scope this session could construct from what WO-13/16/23 leave
   unattached" — a genuine unknown, not a tradeoff between two known options.* This is the single most
   important open item in this whole document.

---

## WO-23 — Watchlist wiring for `market_series`, corrected

### 1. What the repo actually has today

**The master plan's claim, re-read.** `master-execution-plan-2026-08-17.md:143-146`: *"`org_watchlist.item_type`
gains a `market_series` value; the 5 existing readers are the consumer checklist (`/api/watchlist`,
`DashboardWatchlist`, `WatchButton`, archive-impact, `ArchiveDialog` — each read before the change per
rule 0.4). 0 live rows = no data migration."* The 0-live-rows claim is correct
(**FACT**: `SELECT count(*) FROM org_watchlist` → 0 this session). **The rest undersells the change.**

**Both watchlist tables carry a live CHECK constraint that does not include `market_series`.** **FACT,
live query this session:**
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('org_watchlist'::regclass,'user_watchlist'::regclass) AND contype='c';
```
→
```
org_watchlist_item_type_check:  CHECK (item_type = ANY (ARRAY['source','reg','signal','research','operations']))
user_watchlist_item_type_check: CHECK (item_type = ANY (ARRAY['source','reg','signal','research','operations']))
```
Both migrations that shipped these (233 for `user_watchlist`, 236 for `org_watchlist`) are on disk
(**FACT**, `supabase/migrations/233_watchlist_type_expansion.sql`,
`supabase/migrations/236_dual_scope_watchlist.sql`). "Gains a value" is a CHECK-widening migration —
DDL, two-track policy (CLAUDE.md rule 3), coordinator-applied — not an application-code-only change.

**The application-level whitelist is a second, independent gate.** `src/app/api/watchlist/route.ts:36`:
```ts
const ITEM_TYPES = new Set(["source", "reg", "signal", "research", "operations"]);
```
This `Set` gates BOTH `GET`/`POST`/`DELETE` param validation, for BOTH `scope=personal` and
`scope=team` (`readParams`/`handlePOST`, lines 53-59, 151-161). The master plan's ruling is that only
`org_watchlist` (team scope) gets `market_series` — but this validation set is shared code with no
scope-conditional branch today. Widening it flatly would also permit a *personal* `market_series` watch,
which would then fail the (unwidened) `user_watchlist` CHECK with a raw 500 from Postgres rather than the
route's own clean 400. **This needs an explicit scope-conditional check, not a one-line Set edit.**

**The type is re-used, exhaustively, in three more files — none named in the master plan's "5 readers."**
`WatchlistItemType` (`src/lib/supabase-server.ts:2711-2716`) is a 5-value union type, and its own doc
comment explains why this matters: *"Landing B widened the DB CHECK and WatchButton to five values but
left this type at three, which silently labelled every watched research finding a 'Signal'... Both
tables were empty, so no user ever saw it."* This is the exact class of defect widening the type
carelessly would repeat. Three more sites are keyed off this exhaustive union:

- `src/lib/supabase-server.ts:3049-3055` — `SOURCE_FALLBACK: Record<WatchlistItemType, string>`, an
  exhaustive record (TypeScript will not compile a widened union against this literal without a new key).
- `src/lib/supabase-server.ts:3068-3096` (`fetchWatchlist`'s render branch) — `ITEM_BACKED_TYPES` (a
  3-value Set: `reg`/`research`/`operations`, all resolved by title lookup against `intelligence_items`)
  → else `item_type === "source"` (resolved against `sources`) → else falls through to a bare `type:
  "signal"` literal (line 3090-3095). **A `market_series` row would silently render mislabelled as
  `"signal"` today if the CHECK and the route Set were widened without touching this function** — the
  exact "silently labelled... a Signal" defect the file's own comment already describes happening once.
  `market_series` rows are identified by `id` (uuid), not by `legacy_id`/uuid against `intelligence_items`
  — a genuinely new branch is needed here, not a Set addition.
- `src/lib/watchlist-links.ts:26-32,52-69` — `WATCHLIST_TYPE_LABEL: Record<WatchlistItemType, string>`
  (exhaustive record) and `watchlistHref`'s `switch (item.type)` (TypeScript's exhaustiveness check flags
  a missing case here too, per the same file's own comment on why it is shaped this way: *"keyed by the
  FULL `WatchlistItemType` union, so a newly watchable type is a compile error here rather than a
  silently mislabelled row"*). A `market_series` row has no `intelligence_items` detail route to link to
  — `watchlistHref` needs a real answer (a new route, or `null` like the `source` case) before this
  compiles.

**No existing UI renders a `market_series` row to attach a `WatchButton` to.** Confirmed in WO-14 §1C
above — this is the same finding, cited once here because it directly gates this WO's UI half.

**The 5 named readers are otherwise accurate.** `DashboardWatchlist.tsx` and `WatchlistSurface.tsx` both
consume `WatchlistItem`/`WatchlistItemType`/`WATCHLIST_TYPE_LABEL`/`watchlistHref` from the shared
modules above rather than hand-typing their own union (**FACT**, grep confirmed neither file contains a
literal `"signal"`/`"reg"` type check) — so once the four files above are correctly updated, these two
need no direct edit. `archive-impact/route.ts:118-124` reads `org_watchlist` generically (`.select("id")`,
no `item_type` filter) and needs no change. `ArchiveDialog.tsx` was grepped and contains no `item_type`
literal either — it consumes the archive-impact API's response shape, not the watchlist type union
directly.

### 2. What WO-23 must do

1. **Migration (coordinator-applied, two-track policy):** widen `org_watchlist_item_type_check` only
   (NOT `user_watchlist_item_type_check` — per the standing ruling that this is a team-scope feature) to
   `ARRAY['source','reg','signal','research','operations','market_series']`. Numbered next-free by the
   coordinator at land time (268 is the highest file on disk in this worktree; WO-20's proposed 269 and
   WO-12/19's family may land first — the executor does not choose the number, per the scope doc's own
   "coordinator allocates migration numbers" rule).
2. **`src/app/api/watchlist/route.ts`:** add `market_series` to `ITEM_TYPES` (so GET/DELETE param parsing
   accepts it) but add an explicit scope guard in `handlePOST`/`handleDELETE`: `market_series` is
   rejected with 400 when `scope !== "team"`, mirroring the existing `noOrgError()` pattern for a
   different "this combination is not allowed" case. Do NOT widen `user_watchlist`'s CHECK to match —
   the guard is the enforcement point until/unless personal watching of series is separately ruled.
3. **`src/lib/supabase-server.ts`:** widen `WatchlistItemType` to include `"market_series"`; update
   `SOURCE_FALLBACK` with a `market_series` entry; add a real branch in `fetchWatchlist`'s render step —
   resolve title/label by `id` against `market_series` (batch `.select("id, label").in("id", ids)`,
   mirroring the existing `sourceIds`/`sourceLabels` block at lines 3008-3027), not the `intelligence_items`
   lookup `ITEM_BACKED_TYPES` uses.
4. **`src/lib/watchlist-links.ts`:** add `market_series: "Series"` to `WATCHLIST_TYPE_LABEL`; add a
   `case "market_series":` to `watchlistHref` — returning `null` (like `source`) unless WO-14 shipped a
   real per-series route/anchor by then, in which case point at that.
5. **`WatchButton`'s `itemType` prop union** (`WatchButton.tsx:47`) is currently `"source" | "reg" |
   "signal" | "research" | "operations"` — a DIFFERENT, narrower union than `WatchlistItemType`, hardcoded
   locally rather than imported. Widen it to include `"market_series"` and pass `scope="team"`-only usage
   at the call site (the personal toggle should not render for a `market_series` item per step 2's rule —
   `WatchButton`'s existing `teamAvailable` gate already hides the team pill when no org resolves, but
   nothing today hides the *personal* pill for a type that cannot legally use it; add that guard here).
6. **The UI attachment point.** This step is contingent on WO-14: a `WatchButton` needs a card to sit
   beside. If WO-14 ships the "Sources tracked" rail listing (§WO-14 part 1), mount a per-producer (not
   per-row, since `market_series` rows are per-period observations, not stable watchable entities until a
   `series_key` is chosen as the identity) `WatchButton` there, `itemId = producer.keyPrefix` or a chosen
   representative `series_key`. **This is itself an open ruling** (§6 below) — the WO-16 registry's
   natural key is `series_key` (per-observation-series, e.g. `eu-oil-bulletin:automotive-diesel`), not
   `keyPrefix` (per-producer, e.g. `eu-oil-bulletin`), and the two are genuinely different watch targets.

### 3. Named write set

- `src/app/api/watchlist/route.ts` (item-type Set + scope guard)
- `src/lib/supabase-server.ts` (`WatchlistItemType`, `SOURCE_FALLBACK`, `fetchWatchlist`'s render branch)
- `src/lib/watchlist-links.ts` (`WATCHLIST_TYPE_LABEL`, `watchlistHref`)
- `src/components/ui/WatchButton.tsx` (`itemType` union + scope-availability guard)
- One new UI attachment site, location contingent on WO-14 landing first (§2 step 6)

**Serialization note:** this write set is disjoint from WO-13's and (mostly) WO-14's, EXCEPT the UI
attachment point in step 6, which cannot be written until WO-14's rail-card shape is known — this is the
concrete reason the lane is serialized WO-13→14→23→24 rather than merely sequenced by number.

### 4. Consumers and blast radius

- `DashboardWatchlist.tsx`, `WatchlistSurface.tsx`: no direct edit (confirmed §1), but both will start
  rendering `market_series` rows once the shared modules are widened — re-verify both render correctly
  with a `market_series` fixture row before merging (their type filters (`TypeFilterValue = "all" |
  WatchlistItemType` in `WatchlistSurface.tsx:40`) will automatically pick up the new value; the
  executor should manually confirm the filter chip renders a sane label, not just trust the type-checker).
- `archive-impact/route.ts`, `ArchiveDialog.tsx`: no change (confirmed §1) — but note for completeness
  that archiving is `intelligence_items`-scoped (`workspace_item_overrides`) and `market_series` is a
  different table entirely, so a watched series can never be "archived" through today's archive dialog;
  this is a real, correct scope boundary, not a gap to close in this WO.

### 5. Gates and anti-scope

**Does NOT:**
- Widen `user_watchlist_item_type_check` — personal watching of a series is a separate, unruled question.
- Build a full `market_series` detail page (WO-14's territory, if ruled in).
- Change `org_watchlist`'s `item_id` column shape — it stays `text`, exactly as `source`/`reg`/etc. do
  today; a `market_series.id` (uuid) or `series_key` (text) both fit without a schema change.

⛔ **Hard dependency: the coordinator-applied CHECK-widening migration must land before this WO's
application code merges** (two-track policy). ⛔ **Soft dependency: step 6 (the UI attachment point)
cannot be written until WO-14 lands or is explicitly ruled out** — everything else in this WO's write set
can proceed in parallel with WO-14.

### 6. Open rulings

1. **Which identity does a `market_series` watch key on: `series_key` (per-observation-series, e.g.
   `eu-oil-bulletin:automotive-diesel`) or `keyPrefix` (per-producer, e.g. `eu-oil-bulletin`)?**
   *Recommendation: `series_key`* — it is the table's own natural key
   (`market_series_series_key_reference_period_key`, migration 268) and matches every other
   `org_watchlist.item_id` convention (a stable row identity, not a category). Tradeoff: with 0 live rows
   today there is no live `series_key` to watch until WO-16's producer is armed, so this WO ships correct
   against an empty state either way — the choice only matters once real series exist.
2. **Does the personal-scope guard in §2 step 2 belong in the route (application code, this WO) or as a
   second CHECK on `user_watchlist` that simply never gets a `market_series` value added?**
   *Recommendation: route-level guard, as specced* — a CHECK constraint can only allow or forbid a value
   for the whole table, it cannot express "forbidden for personal, permitted for team" within one shared
   `item_type` column across two tables with independent CHECKs; the application layer is the only place
   this cross-table rule can actually live.

---

## WO-24 — Carbon overlay on Market signals, gated on two independent findings

### 1. What the repo actually has today

**`emission_factors` is applied and empty.** **FACT, live query this session:** `SELECT count(*) FROM
emission_factors` → 0. Migration 258 is on disk and applied; the table carries the full envelope plus
per-`scope_kind` CHECKs (confirmed via `factor-tier.mjs` read in full).

**Two seeders exist, neither has been run with `--apply`.** `scripts/gen/emission-factors-desnz.mjs` and
`scripts/gen/emission-factors-epa.mjs`, both dry-run by default. **DESNZ's own fixture header
(`scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json:2-29`) states, in full, labelled
`[UNCONFIRMED]` per its own citation of CLAUDE.md rule 14:** the primary DESNZ spreadsheet could not be
fetched (403 from the sandboxed egress proxy) and cannot be parsed by the fetch tool (`.xlsx` binary)
even if it could be reached; the `ttw_co2e` values actually seeded come from a third-party GitHub
republication (`starrybodies/ghg-calculator`) that itself cites DEFRA 2025 as its source. The fixture's
own header says explicitly: *"ACTION BEFORE --apply: verify each ttw_co2e value against the DESNZ full-set
xlsx... before this fixture seeds production."* **This has not been done** — the seeder has never been
run with `--apply` (**FACT**: `emission_factors` is 0 rows).

**EPA's fixture is clean by contrast.** `emission-factors-epa.mjs:8-9`'s header states its two values were
read directly from Table 8 of the primary EPA PDF, confirmed twice, agreeing verbatim (per Addendum 36's
own record of this same finding from the WO-18 lane). Nothing in this pass contradicts that; EPA is ready
to arm, DESNZ is not.

**THETIS-MRV (the operator-tier factor source) is licence-blocked, not just unseeded.**
`src/lib/contracts/source-licence.mjs:171-180`: `emsa_thetis_mrv` carries `redistribution: "conditional"`,
and `LICENCE_STATUS.conditional.embeddable = false` (line 40). Per Addendum 36, the WO-18 lane correctly
refused to seed it. This governs `factor-tier.mjs`'s `verified_operator_avg` tier (rank 2,
`pedigreeFloor: 2`) — the second-best tier in the hierarchy stays structurally empty until this licence
question is resolved in writing, independent of anything WO-24 does.

**No corridor identity exists anywhere on a Market item — a finding this pass made, not previously
recorded.** `emission_factors.corridor_id` (text, `cl:corridor:*` minted-ID convention, per migration 263
and the master plan's Appendix A C5 correction) is the join key a corridor-scoped carbon factor would key
off. **FACT, live query this session:**
```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='intelligence_items' AND column_name ILIKE '%corridor%';
```
→ **0**. No column on `intelligence_items`, and no other table this session found, links a market signal
(or any `intelligence_items` row) to a `corridor_id`. The "corridor entity" work the redesign scope
document names (§4 order 8, C5's "adopts the `cl:corridor:` id convention") is itself unbuilt — there is
no corridor table, only the minted-string convention living inside `emission_factors` rows that do not
exist yet either.

**The natural attachment point exists in the UI, unpopulated.** `signalBand === "corridor"` (B3) is a
real, live-classified value: **FACT**, `SELECT signal_band, count(*) FROM intelligence_items WHERE
item_type='market_signal' GROUP BY signal_band` → `corridor: 15` (of 77; band classification is a sparse
honest partial per `MarketIntelLedger.tsx:414-422`'s own disclosure). B3 corridor signals are exactly
where a carbon overlay would attach conceptually (spec 07's own carbon-overlay mock is drawn "on the same
corridor" as a rate board), but nothing in `MarketSignalDetailSurface.tsx`'s `DriversTab`/`SourcesTab`
(the two tabs that render band-conditional content today, e.g. `TrajectoryBars` gated on `band ===
"price"`) has an equivalent gate for `band === "corridor"`.

### 2. What WO-24 must do (bounded to what is actually unblocked)

**This WO cannot ship a real, data-backed overlay today — both of its dependencies are open.** What it
CAN do, honestly, at $0:

1. **Build the honest-pending frame**, gated `band === "corridor"` in `MarketSignalDetailSurface.tsx`'s
   `DriversTab` (alongside the existing price-band `TrajectoryBars` gate), matching the exact pattern
   every other not-yet-fed slot on this surface already uses (`PendingFrame` component, already imported,
   already the house style) — e.g. *"Carbon cost overlay · not yet available — this signal's corridor has
   no linked emission-factor data yet."* This requires no schema, no seeded data, and no corridor
   identity to exist; it is purely the honest statement of the current gap, matching the discipline every
   other pending slot on this surface already follows (rule: never a faked number).
2. **Do NOT attempt to wire real numbers.** Both gates below must clear first. Building past the pending
   frame today would mean either fabricating a corridor↔item join (rule 2 violation) or shipping the
   overlay against DESNZ's unconfirmed numbers (rule 14 violation) — either is worse than the honest
   pending state this WO can ship instead.

### 3. Named write set

- `src/components/pages/MarketSignalDetailSurface.tsx` (`DriversTab`, corridor-band pending frame only)

**That is the entire write set this pass can responsibly specify.** A real overlay's write set (a new
corridor-identity join, a new fetch joining `emission_factors` by `corridor_id`, a rendering component)
cannot be named until Open rulings 1 and 2 below are answered — naming files against an unresolved join
key would be guessing, which this document's own governing rule (label FACT/INFERENCE/UNCONFIRMED, never
reconstruct from imagination) forbids.

### 4. Consumers and blast radius

- The pending-frame addition is purely additive inside an already-conditional render branch
  (`hasTrajectory` peer logic, `DriversTab`, lines 649-702) — no existing consumer of
  `MarketSignalDetailSurface` is affected.
- `/admin/factors` (WO-18's reader, `src/app/admin/factors/page.tsx`) already exists and will show any
  seeded `emission_factors` rows the moment DESNZ or EPA is armed — WO-24 does not need to build a second
  admin view; confirmed by reading that file's header, which explicitly scopes itself to the raw table,
  "not the eligibility view."

### 5. Gates and anti-scope

**Does NOT:**
- Seed `emission_factors` or touch the seeders (`scripts/gen/emission-factors-*.mjs`) — that is WO-18's
  write set, already landed per Addendum 36, and a DESNZ `--apply` run is explicitly gated on the primary
  spreadsheet check named in the fixture's own header, not on anything this WO does.
- Build a corridor entity table, a corridor↔item mapping, or invent a `cl:corridor:` id for any live
  Market item. That is unscoped, un-costed spine work (redesign scope §4 order 8) this document does not
  authorize.
- Resolve the THETIS-MRV licence question. That sits with `source-licence.mjs`'s own `askWhat` field
  (line 176) as a standing open item, outside every lane's write set per the redesign scope's own rule
  that no lane self-registers a licence.

⛔ **Gate 1 (data): `emission_factors` DESNZ rows are `[UNCONFIRMED]` against the primary spreadsheet.**
Current state: seeder authored, never `--apply`'d, blocked on someone with unrestricted network access
reading the actual DESNZ `.xlsx` (the sandboxed proxy 403s on `assets.publishing.service.gov.uk`, and the
fetch tool cannot parse `.xlsx` regardless). EPA's two values are clean and could arm independently, but
EPA alone does not cover ocean/corridor-relevant modal defaults the way DESNZ's freight table would.

⛔ **Gate 2 (join): no corridor identity exists anywhere from a Market item to `emission_factors.corridor_id`.**
Current state: not started, not scoped by any live WO, zero columns, zero rows. This is a NEW finding
this pass surfaced (the master plan's WO-24 line never mentions it) and is a harder, larger gate than
Gate 1 — Gate 1 is "verify a spreadsheet," Gate 2 is "design and build an entity that does not exist."

### 6. Open rulings

1. **⛔ Who verifies the DESNZ primary spreadsheet, and when?** This is not a code question — it needs a
   human (or an agent with unrestricted network egress) to open the actual `.xlsx` and check the fixture's
   `ttw_co2e` values against it. *No recommendation on timing; naming it as the literal blocking action
   is the finding.*
2. **⛔ Does the corridor-identity gap get its own WO (a genuine "WO-26-and-up" scale of work: a corridor
   entity, a minting/lookup path, and a Market-item↔corridor join), or does WO-24 get re-scoped to key
   off something cheaper than a corridor** — e.g. jurisdiction-level default factors keyed off
   `signalBand === "corridor"` plus `r.jurisdictionIso`, using `factor-tier.mjs`'s `modal_default` tier
   (mode + jurisdiction, no corridor needed) instead of waiting on corridor identity at all?
   *Recommendation: the jurisdiction-keyed fallback* — it uses data that already exists on every Market
   item (`jurisdictionIso`) and a tier that (once DESNZ/EPA are armed) will actually have rows, versus a
   corridor join that has neither the identity infrastructure nor, yet, any data to join against.
   Tradeoff: a jurisdiction-level default is a cruder, less precise number than a true corridor factor
   (spec 07's own pitch is corridor-specific precision), so this is a "ship something honest and useful
   sooner" tradeoff against "wait for the more precise thing the spec actually describes," and it is an
   operator call, not one this document makes unilaterally.

---

## Consolidated open rulings (all four WOs)

1. **⛔ WO-14's reconstructed scope** (§WO-14 ruling 1) — confirm, amend, or replace before any executor
   starts. The single highest-priority item in this document.
2. WO-5 B1 (identifier chip): **closed NO for Market** in this pass (§WO-13 ruling 1) — not escalated,
   stated as a finding with the live population that makes it moot.
3. WO-13's decoration-helper location (§WO-13 ruling 2) — recommendation given, low-stakes, informational.
4. WO-23's watch-identity key, `series_key` vs. `keyPrefix` (§WO-23 ruling 1) — recommendation given
   (`series_key`), moot until real rows exist but should be decided before the code ships either way.
5. WO-23's personal-vs-team scope enforcement mechanism (§WO-23 ruling 2) — recommendation given
   (route-level guard), effectively forced by the schema (a CHECK cannot express a cross-table
   conditional).
6. **⛔ WO-24 Gate 1: who verifies the DESNZ spreadsheet** (§WO-24 ruling 1) — a literal blocking action,
   not a tradeoff.
7. **⛔ WO-24 Gate 2: corridor-identity build vs. jurisdiction-keyed fallback** (§WO-24 ruling 2) —
   recommendation given (jurisdiction fallback), genuine scope-cost tradeoff, operator call.

**Flagged, not a ruling request — a corpus data-quality anomaly:** the single `market_signal` row
carrying `instrument_identifier` (`matrix-hudson-2br-lottery`) appears to be a misclassified residential
listing, not a market-intelligence item, currently live and `provenance_status='verified'` on the public
Market surface. Named here per CLAUDE.md rule 13 (a flag is a commitment); investigating and correcting
its classification is outside every WO in this document's write set and is not attempted here.
