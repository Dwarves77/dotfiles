# Caro's Ledge — MASTER EXECUTION PLAN v2 (schema-verified)

**Written 2026-08-18 against `origin/master` `2b59d47e` and the LIVE database (`kwrsbpiseruzbfwjpvsp`).
Supersedes the 2026-08-17 v1 plan. v1 contained schema claims that were written from the specs and the
gap register without reading the tables; every table this plan touches has now been read with
`information_schema.columns` plus live row counts, and Appendix A is that record. Where v1 was wrong,
the Corrections Registry (Part 0B) says so explicitly — an executor who read v1 must read 0B.**

Vault landing path: `docs/plans/master-execution-plan-2026-08-17.md` (v2 replaces the uncommitted v1;
the file must ride in the next PR — as of this writing the plan exists only as a chat deliverable).

---

# PART 0 — RULES FOR THE EXECUTING MODEL

Rules 0.1–0.14 of v1 carry forward unchanged (ledger first; one WO per unit; worktree+PR only, never
`--no-verify`; read consumers + search `docs/decisions/` AND `docs/doctrine/` before changing any
producer; label claims; test capability limits; verification is execution; browser uploads verified by
empty `git diff` + per-file md5; guarded DB path with prior-state snapshots; $0 default, priced STOP
before any metered call; ⛔ OPERATOR-GATE rows are hard stops; do-not-start list: doctrine seed,
Assistant spend cap, T9 re-spec, flywheel U6; memory files in the same PR; no internal vocabulary on
customer surfaces).

**0.15 (NEW, and the reason v2 exists): before starting ANY work order, re-read the schema of every
table it touches — `information_schema.columns` plus a live row count plus relevant CHECK constraints —
and diff what you find against Appendix A. Treat every data claim in this plan as `[PLAN-STATED]`
until you have re-confirmed it in your own session. A WO whose observed schema differs from Appendix A
STOPS and reports before writing code.** v1 planned a component against a column that did not exist and
promised builds for structures that already existed; both directions of that error are prevented by one
query that costs seconds.

# PART 0B — CORRECTIONS REGISTRY (v1 claims that did not survive reading the tables)

| # | v1 claimed | Measured truth | Consequence |
|---|---|---|---|
| C1 | WO-12 must "design the number envelope as a shared type" from scratch | **The envelope already exists in production schema.** `emission_factors` (migration 258, applied) carries numeric values, `quantity_basis`, a 9-value `derivation` CHECK (`statutory_fixed … estimated`), a 7-value `origin_class` CHECK (`community … official`), 5-dimension pedigree scores, `method_version`, `as_at_date`, `valid_from/valid_to`, `n_observations`, `source_key`+`source_ref`, and supersession linkage | WO-12 is now **adopt-and-extend**, not invent. The vocabulary homes are `src/lib/contracts/factor-tier.mjs` + `source-licence.mjs` (they GENERATE the 258 DDL). Inventing a second envelope would be the two-scoring-homes defect all over again, in the data layer |
| C2 | WO-19 must create the `origin_class` vocabulary | **The vocabulary exists as a live CHECK on `emission_factors`** with 7 values. What does NOT exist: any `origin_class` column on `intelligence_items` (confirmed absent from its 80-column list) or on `regional_data_facts`/`state_cost_facts` | WO-19 = extend the EXISTING vocabulary from its existing contracts home to the item/fact tables. The clock argument (unclassifiable retroactively) stands unchanged |
| C3 | "No price/series table exists; nowhere to write, nowhere to read" and "PriceBoard is bound to `item.marketData?.currentPrice`, a shell wired to nothing" | **`published_price_statistics` exists** (13 cols: `item_id`, `label`, `value_display:text`, `unit?`, `released_at?`, `next_release_at?`, `source_tier?`, …) with **4 live rows, all carrying `next_release_at`**, and **PriceBoard reads THIS table** via `app/market/[slug]/page.tsx:149-168`. The `marketData.currentPrice` orphan is a DIFFERENT binding: the list-page key figure in `MarketIntelLedger.tsx:805-809` | Market has a real, small numeric channel already: table → fetch → PriceBoard. WO-16's series table must RECONCILE with it (see corrected WO-16); the orphan-field work (WO-5) targets the ledger key figure specifically, not PriceBoard |
| C4 | (implication) nothing in the fact stores carries units or provenance columns | **`state_cost_facts` is properly enveloped at small scale**: 13/13 rows carry `unit` AND `source_id`, plus `statute_citation` and `effective_date` columns | The by-state list has a working precedent for enveloped facts. The free-text problem is specific to `regional_data_facts` (0/75 with `source_id`, no unit/currency/period columns) — v1's claim was right for that table and wrongly generalisable in tone |
| C5 | Corridor entity is pure greenfield | No corridor TABLE exists, but **`emission_factors.corridor_id:text` exists with a minted-ID convention** (`cl:corridor:…`, JS/SQL parity verified in migration 263's applied record: `cl:corridor:f5bf8ebf91e1298c` for CNSHA→NLRTM ocean via Suez) | The corridor entity work (Stage 8 / spine) must ADOPT the `cl:corridor:` id convention and its minting parity, not invent a new key |
| C6 | Watchlist wiring for Market series is speculative | **`org_watchlist` exists** (`item_type:text, item_id:text` — deliberately generic), with 5 code readers including `/api/watchlist` and `DashboardWatchlist`; 0 rows live | WO-23's "wire series into the existing watchlist" is concrete: a new `item_type` value, no new table |
| C7 | Market gap table: "trajectory_points not instructed; panel is a hardcoded pending frame" treated as absent producer AND absent field | Column `trajectory_points:jsonb` EXISTS on `intelligence_items`; **0 of 1,062 rows populate it**. Similarly present-but-mostly-unread: `instrument_identifier` (675 rows), `signal_band` (60 rows) | The WO-5 orphan enumeration has a measurable starting inventory: columns with rows and no reader, and columns with readers and no rows, are different dispositions |
| C8 | WO-9 could deliver spec 04 component 2 in full (dual-layer cells with index-vs-base) | `regional_data_facts.value` is free text; no numeric/unit/currency/period columns; `source_id` NULL on all 75 rows | Already corrected during the build: WO-9 shipped layer 1 + honest deferral; layer 2 formally moves to WO-12's migration (below) |

| C9 | WO-4 must "add an automated check that runs both classifiers and fails if they disagree" | **That guard already exists and runs in CI.** `vocab-drift-guard.test.mjs` regenerates migration 148's `surface_of()` CASE from `SURFACE_RULES` via `renderSurfaceOfSql()` and asserts the migration embeds it byte-for-byte; the SQL is GENERATED, never hand-edited. Additionally `intelligence_items.domain` is NOT NULL with CHECK 1-7 at the DB (verified live), so the write-time guard v1 asked for also exists | WO-4 reduced to the mapper-coalesce removal: `row.domain || 1` -> `?? undefined` at 3 sites, so "column not selected" reads as unclassified, never as Regulations. Locked by `domain-laundering.test.mjs`. EXECUTED 2026-08-18 |

The common mechanism, named so it is not repeated: v1 was planned from `docs/specs/` + the gap
register, both of which describe intent and gaps at component level, and neither of which is a schema.
The register's "the data is already keyed correctly" is true of keys and silent about payloads; the
specs' "absent" rows sometimes meant *absent producer*, sometimes *absent column*, sometimes *absent
reader* — three different work items. Appendix A is the payload-level record v1 lacked.

---

# PART 1 — SEQUENCE (unchanged shape, corrected content)

| Stage | WOs | State |
|---|---|---|
| 1. Close open work | WO-1 ✅ (PR #467 merged) · WO-2 ✅ (mig 265 applied + verified) | DONE |
| 2. Renderer + guards | WO-3 ✅ (PR #470, open) · WO-4 ✅ (this PR) · WO-5 | WO-5 next |
| 3. Flywheel enrichment | WO-6 → ⛔ → WO-7 · WO-8 | not started |
| 4. Operations build-out | WO-9 ✅ (PR #471, open) · WO-10 · WO-11 · WO-21 · WO-22 | WO-9 awaiting review |
| 5. Market build-out | WO-13 · WO-14 · WO-23 · WO-24 | after WO-12/16 |
| 6. Research build-out | WO-15 · WO-25 | after WO-3 merges |
| 7. Producers ($0 APIs) | WO-16 · WO-17 · WO-18 | ⛔ gated by WO-19 |
| 8. Spine minimum | WO-19 (CLOCK) · WO-20 · WO-12 | WO-12 moved here — see below |

**Ordering change from v1:** WO-12 moves into Stage 8 alongside WO-19, and both precede Stage 7,
because the reads showed they are the SAME kind of work on the SAME existing vocabulary homes: WO-19
extends the `origin_class` CHECK outward from `emission_factors`; WO-12 extends the rest of the 258
envelope pattern the same way. One contracts-module edit family, one migration family, one PR each.

---

# PART 2 — CORRECTED WORK ORDERS (only those that changed; v1 text governs the rest)

### WO-5 (orphan fields) — now with a measured starting inventory
Two distinct dispositions, enumerated separately:
(a) **Columns with data and no reader** — e.g. `instrument_identifier` (675 rows), `signal_band`
    (60 rows): candidate wiring wins, cheap.
(b) **Columns/readers with no producer** — e.g. `trajectory_points` (column exists, 0 rows, panel
    hardcoded "pending"); `MarketIntelLedger`'s `marketData.currentPrice` key figure (reader exists,
    no producer, renders dashes). PriceBoard is EXCLUDED from this list (C3 — it has a real table).
⛔ OPERATOR-GATE on the disposition table before any deletion, unchanged.

### WO-12 — Extend the migration-258 envelope; create no second one
1. Read `src/lib/contracts/factor-tier.mjs` + `source-licence.mjs` END TO END first — they are the
   generating source of the 258 DDL and the single vocabulary home (their F25 history proves the repo
   treats them as such).
2. Extract the REUSABLE envelope columns into the contracts module as a named shape:
   `{value_numeric, unit, currency?, derivation (9-value CHECK), origin_class (7-value CHECK),
   source_key/source_ref, n_observations?, method_version, as_at_date, reference_period}` —
   generated the 258 way (codegen'd CHECKs, never hand-copied literals; the duplicated-CHECK defect
   263 fixed is the cautionary case).
3. **Migration (numbered next-in-sequence): add envelope columns to `regional_data_facts`** —
   nullable, additive, no backfill in the same migration. The 75 legacy free-text rows keep `value`
   as display text; ⛔ OPERATOR-GATE: backfill choice (re-key from each `source_note` URL vs
   grandfather as prose facts).
4. Render rule (unchanged from v1): a numeric component receiving a bare number renders nothing and
   logs. The matrix's index-vs-base layer (WO-9's deferred half) turns on ONLY for rows whose
   envelope columns are populated — mixed tables render enveloped rows indexed and legacy rows as
   labelled prose.
5. Two-track policy applies: DDL via the sanctioned lane BEFORE dependent code merges.

### WO-16 — Market series producers, reconciled with the table that already exists
1. New table `market_series` (envelope-carrying, from WO-12's shape) keyed
   `(series_key, reference_period)`: EU Weekly Oil Bulletin, EEX EUA auctions, ECB FX, EIA v2.
   One producer per PR, fixture-tested parser, idempotent upsert, kill-switched, default off.
2. **`published_price_statistics` reconciliation, decided not discovered later:** it is per-ITEM
   display statistics (4 live rows, text values, hand-maintained, `next_release_at` populated).
   Options: (a) keep as the item-page display cache, FED from `market_series` by a small refresher —
   recommended, preserves its reader (PriceBoard) unchanged; (b) retire it into `market_series`
   views. ⛔ OPERATOR-GATE, one ruling, before the first producer merges. Never both unreconciled —
   that is the detect_intersections shape again.

### WO-17 — Operations facts for EU + US: envelope-first
Producers write `regional_data_facts` **envelope columns** (post-WO-12), never new free text.
Eurostat `nrg_pc_205` / `lc_lci_lev` / `lc_ncost_r2`, BLS OEWS/QCEW. The matrix's dual-layer cells
light up for exactly these rows — EU and US become the FIRST indexed columns, which is the visible
payoff of doing WO-12 before WO-17.

### WO-18 — Emission factors: seeding, not schema
The table is applied, empty, licence-gated (`licence_clear_sources` = 14 clear sources), and already
carries the full envelope INCLUDING per-kind CHECKs that forbid malformed rows (a modal default
physically cannot store an operator). Work = seeders via `scripts/gen/` conventions for UK DESNZ +
US EPA modal defaults and THETIS-MRV operator tier, THROUGH the guarded path, plus the first reader
(WO-24's carbon overlay consumes it; until then `/admin` gets a minimal factors view so the table is
never again populated-but-invisible). Do NOT touch `factor-tier.mjs`/`source-licence.mjs` except via
their own generation flow.

### WO-19 — origin_class: extension of an existing vocabulary (the CLOCK item, unchanged urgency)
1. Vocabulary home stays the contracts module; the 7 values are live in production
   (`community, community-corroborated, modelled, derived, partner, verified, official`).
   ⛔ OPERATOR-GATE only if the item-level taxonomy needs values the factor-level one lacks
   (e.g. `regulatory_text`, `official_statistic`) — propose additions against the existing set,
   never a parallel enum.
2. Migration: `origin_class` on `intelligence_items` (+ fact tables if WO-12's migration has not
   already carried it), nullable → backfill → NOT NULL. Backfill for the existing 1,062 items is
   derivable $0 from `item_type` + source tier (regulations/directives from official registers →
   `official`, etc.) — the mapping table itself is ⛔ operator-ratified before it runs.
3. Still gates Stage 7. Every producer row lands with `origin_class` from day one.

### WO-23 — Watchlist wiring (now concrete)
`org_watchlist.item_type` gains a `market_series` value; the 5 existing readers are the consumer
checklist (`/api/watchlist`, `DashboardWatchlist`, `WatchButton`, archive-impact, ArchiveDialog —
each read before the change per rule 0.4). 0 live rows = no data migration.

### Unchanged in scope (v1 text governs): WO-4, WO-6/7/8 (flywheel, rulings B1/B2/B4 as given),
WO-10/11, WO-13/14/15, WO-21/22/24/25, WO-20 (assumption register — confirmed NO existing table),
corridor entity (adopts `cl:corridor:` per C5).

---

# APPENDIX A — SCHEMA TRUTH, READ 2026-08-18 (the record v1 lacked)

Every row below is `[CONFIRMED]` from `information_schema` + live counts this session. Re-verify per
rule 0.15 before relying on it — the database moves.

**`regional_data_facts` — 75 rows (ASIA/UAE/UK × 5 dims × 5; EU=0, US=0)**
`id, region_id→regions, dimension (CHECK: regulatory_feasibility|regional_resources|labor_markets|
materials_sourcing|infrastructure|operational_cost), fact_label, value:TEXT, status?, trend?,
source_id? (NULL on all 75), source_note? (free text incl. URL — only provenance), last_updated,
created_at`. No numeric/unit/currency/reference-period columns. NOTE: the CHECK includes
`regulatory_feasibility` but the table holds 0 such rows — D1 is cross-reference-derived.

**`regions` — 5 rows** `id, code (ASIA|EU|UAE|UK|US), label, severity?, iso_codes[], display_order, …`

**`region_dimension_coverage`** `id, region_id, dimension, state, notes?, fact_count, …` — now
reconciled (not just logged) by WO-9's grid module.

**`state_cost_facts` — 13 rows, 13/13 with `unit` AND `source_id`**
`…, state_code, state_label, dimension, fact_label, value, unit?, trend?, source_id?,
statute_citation?, effective_date?, last_updated, …` — the enveloped-facts precedent at small scale.

**`emission_factors` — 0 rows; THE ENVELOPE PRECEDENT (mig 258, applied)**
`factor_id, tier, scope_kind, mode, vehicle_class?, energy_carrier?, jurisdiction?, grid_region?,
operator_key?, corridor_id? (cl:corridor:* convention, JS/SQL mint parity), movement_ref?,
quantity_basis, wtt/ttw/wtw_co2e?, co2_fossil/biogenic?, ch4?, n2o?, gwp_basis,
load_factor_pct?, empty_running_pct?, source_key→licence register, source_ref?, donor?,
n_observations?, derivation (CHECK 9 values), origin_class (CHECK 7 values), pedigree ×6 (smallint),
method_version, as_at_date, valid_from, valid_to?, superseded_by?, created_at`
+ per-scope_kind CHECKs (a kind's forbidden dimensions cannot be stored). Canonical mode token:
`ocean` (mig 263).

**`published_price_statistics` — 4 rows, 4/4 with `next_release_at`; reader: PriceBoard via
`app/market/[slug]/page.tsx`** `id, item_id→intelligence_items, label, value_display:TEXT, unit?,
context_line?, severity_tone?, source_tier?, released_at?, next_release_at?, next_release_label?,
sort_order, created_at`. Display-shaped, per-item; not a time series.

**`data_sources` — 26 rows** (licence register; `source_key` PK, `redistribution`, `licence?`, …)
→ **`licence_clear_sources` view — 14 rows.**

**`org_watchlist` — 0 rows** `id, org_id, added_by_user_id?, item_type:text, item_id:text, note?, …`
Readers: `/api/watchlist`, `DashboardWatchlist`, `WatchButton`, archive-impact, `ArchiveDialog`.

**`intelligence_items` — 1,062 rows (826 verified, 806 live-verified)** — 80 columns; the ones this
plan turns on: `domain:int (NOT NULL live — the `||1` coalesce is a trap, not damage)`, `item_type`,
`added_date`, `operational_scenario_tags[]? (161 items)`, `compliance_object_tags[]?`,
`canonical_instrument_key? (644 distinct, 0 shared)`, `instrument_identifier? (675 rows)`,
`instrument_type?`, `signal_band? (60 rows)`, `trajectory_points:jsonb? (0 rows)`,
`intersection_summary? (25 rows)`, `related_items[]?`, `provenance_status`, `full_brief?`,
**NO `origin_class` column**.

**`intelligence_item_sections`** `id, item_id, section_key, section_order, content_md, is_conditional,
source_ids[], …` — 7,430 rows / 1,000 items; 978 sections contain GFM tables (the WO-3 evidence).

**Confirmed ABSENT (searched name patterns over `information_schema.tables`):** any corridor / entity /
assumption-register / portfolio / obligation / envelope table; any time-series table beyond
`published_price_statistics`. The spine remains unbuilt; `market_series` must be created by WO-16.

**Flywheel tables (for completeness):** `item_cross_references` 1,826 (1,765 pd + 51 manual +
10 entity; no timestamps by design), `connection_themes` 4, `connection_theme_runs` 2,
`integrity_flags` open `flywheel-gap:*` = 3.

---

# PART 3 — OPERATOR DECISIONS THIS PLAN WAITS ON (updated)

1. Review/merge PRs **#470** (WO-3 renderer) and **#471** (WO-9 matrix).
2. WO-5 disposition table (wire / build / delete, per field) — after I produce it.
3. WO-6 tag-gap ruling (+ price if metered).
4. WO-12.3 backfill choice for the 75 free-text rows: re-key vs grandfather.
5. WO-16.2 `published_price_statistics` reconciliation: feed it (recommended) vs retire it.
6. WO-19 vocabulary additions (only if item-level needs values beyond the live 7) + the $0 backfill
   mapping ratification.
7. Standing untouched: doctrine seed wording · Assistant spend cap · T9 re-spec · flywheel U6 ·
   pair-view `.npmtest` misclassification ruling · U0 snapshot-parity ruling (decision-ready on the
   board).
