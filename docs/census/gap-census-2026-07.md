# Gap Census, 2026-07

**Status: FLOW WALK EXHAUSTED (2026-07-20).** Session A (intake, Chrome lane) has written 1,331 rows
across 39 sources to `census_worklist`; the exhaustion pass proved every source is MEASURED (walked to
exhaustion under the R2 no-cap rule) or carries an honest R2 stop-reason, with no floors-by-policy
remaining (`cap_hit` cleared to `false` on every row). Every `candidate` row carries either a census
disposition or a named fetch-failure class (109 ncleg js_shell PDFs + a small nav/404 residue remain
re-walkable, see the Final per-source measurement section). The STOCK universe (in-force law predating the
flow window) is a separate mandate now in progress (Tasks 4-6); flow measures what held sources currently
publish, not the standing body of law. Session C (discovery, fetch-light lane) ran its
three-sweep mandate to completion (81 rows in `coverage_gap_census_findings`) and is now idle; per-surface
counts are live below via `census_rollup_by_surface` (migration 222). Session B maintains this structure
and the standing rollup/dedup/flag-back duties; it does not enumerate or fetch. The per-item rank tables
below stay unpopulated by design: rank fields are present, left empty; final prioritization by the FSI
lens (competitive edge, cost alert, window closing, monitoring, action required, per
`environmental-policy-and-innovation`) happens at operator review, not here.

## Schema reference (so no consumer needs to introspect `pg_catalog` for shape)

Two tables, deliberately not merged, a structural grain mismatch (Session C's schema-stitch finding,
2026-07-19): `census_worklist` requires an already-registered `source_id`; `coverage_gap_census_findings`
models candidate sources not yet held. `census_rollup_by_surface` (view) stitches both at the per-surface
reporting level only. Full column-by-column detail lives in `docs/inventories/migrations.md` rows 221 and
222; this is the quick-scan version.

**`census_worklist`** (migration 221, Session B, one row per source+document already held):
`id`, `source_id` (FK sources, NOT NULL), `document_url` (UNIQUE with source_id), `lane` ('A'|'C'),
`created_by`, `created_at`, `shape_class` (instrument_page|index_page|pdf_direct|feed_entry|unknown),
`enumeration_status` (discovered→classified→dry_run_complete→reconciled, plus `flagged`, guarded
forward-only), `cap_hit` (bool), `dryrun_disposition` (would_mint|dedup_hit|congruence_reject|
invariant_reject|hold), `hold_reason`, `surface_tags` (text[], four surfaces), `instrument_identifier`,
`resolved_into_id` (dedup, self-FK), `flagged_reason`, `flagged_at`, `notes`, `updated_at`. Append-only
(DELETE blocked). Lease discipline: the existing `mutation_leases` table (migration 211,
`acquire_mutation_lease`/`heartbeat_mutation_lease`/`release_mutation_lease` RPCs), keyed on
`census_worklist.id`; no dedicated lease columns on this table, no schema change needed there.

**`coverage_gap_census_findings`** (Session C, candidate sources not yet held, retroactively captured into
migration 222 for reproducibility): `id`, `lane` (default 'C'), `sweep` (sweep1_existing_feed_audit|
sweep2_adjacent_universes|sweep3_research_feedstock), `subject_type` (existing_feed|candidate_source|
candidate_catalog), `subject_ref`, `instrument`, `jurisdiction`, `url`, `fetch_method` (plain_http|api|
feed_xml|browser_required|not_applicable), `fetch_result`, `four_contract_classification` (jsonb, keyed
by surface with `{verdict: 'IN'|'OUT', reason}`, Community correctly absent), `dry_run_disposition`
(would_mint|would_decline|would_park|browser_required_undetermined|not_applicable), `dry_run_reason`,
`entity_confirmed`, `notes`, `created_at`, `pending_dependency` (session_a_chrome_render|
session_a_register_walk|NULL, visibility marker, non-NULL means the finding is provisional pending
Session A's queue). No lease columns; this lane runs read-only sweeps, not per-item mutation.

**`census_rollup_by_surface`** (view, migration 222): one row per surface (regulations/operations/
market_intel/research), columns `enumerated_held_sources`, `held`, `missing_from_held_sources`,
`other_dispositioned_held_sources`, `undispositioned_held_sources` (all from `census_worklist`) and
`enumerated_world`, `missing_from_world`, `pending_on_session_a`, `declined_or_parked_world` (all from
`coverage_gap_census_findings`). Recomputed live on every `SELECT`, never hand-tallied.

## Universe scope per source (Session A enumeration method)

**Finding (2026-07-19, calibration check mid-walk on Federal Register).** The candidate ledger
(`portal_link_candidates`) that Session A's census walk reads from is populated by `extractPortalLinks`
(`src/lib/sources/portal-links.mjs`): same-host anchor links from a source's rendered page whose URL path
OR anchor text matches a generic legal-instrument-genre regex (`rule|rules|regulation|notice|docket|
amendment|act|law|standard|guidance|...`). This is a **true unfiltered walk** — no agency filter, no
docket-class filter, no date window beyond whatever the source's own page/feed lists. For a rulemaking
aggregator (Federal Register, EUR-Lex), nearly every published document trivially matches this genre
vocabulary regardless of subject matter, because the site's entire output IS "rules" and "notices" by
definition. **Gap counts (`would_mint`) from these sources must not be read as domain-relevant-gap counts**
— they are "passed the mechanical mint gates" counts.

The domain-relevance discriminator lives one layer downstream, at the mint chokepoint (`mint-item.ts`,
Fork-4 relevance floor, D3 ruling 2026-07-12): **fail-open by design** — an item scoring below the floor
(40/100) still returns `would_mint` but is tagged `low-relevance` in `notes` and would open a
`data_quality` integrity flag on a real mint. Sampled verification (Federal Register, 25 rows): the
`low-relevance`-flagged 90% split correctly off-vertical (medical device classifications, DHS civil-rights
rescission, stablecoin KYC, aviation route amendments); the un-flagged 10% split correctly on-vertical
(de-minimis customs exemption suspension for freight/mail entry, Tanker Security Program, lithium-ion
battery safety standard, JFK air-freight slot limitations). The classifier is not over-admitting; the
`would_mint` headline number is simply not the right column to read as "relevant gaps" for an unfiltered
register source. **Any rollup or report over `census_worklist` for a register-class source should filter
`would_mint AND notes NOT ILIKE '%low-relevance%'` to get the domain-relevant subset**, or carry both
numbers labeled separately.

| Source | Enumeration method | Scoped? | Relevant-gap column to use |
|---|---|---|---|
| EUR-Lex (register API) | `extractPortalLinks`, genre-regex, unfiltered | No | `would_mint AND notes NOT ILIKE '%low-relevance%'` |
| Federal Register (register API) | `extractPortalLinks`, genre-regex, unfiltered | No | `would_mint AND notes NOT ILIKE '%low-relevance%'` |
| All other walked sources (2026-07-19/20 sweep) | same, root-page or registered-page harvest | No | same split |

**Sweep-wide extractor caveats (both filed as `integrity_flags`, subject_type=system):**
1. **Language class:** `INSTRUMENT_RE` is English-only. Non-English sources (GIOS Poland, Mexico DOF,
   Brazil Transportes, MLIT-PRI Japan) enumerate to zero as an extractor artifact, not evidence of empty
   sources.
2. **Research-genre class:** `INSTRUMENT_RE` is legal-instrument-genre only. Research/MI sources publish
   "report/publication/paper/study/outlook" links that cannot match, so research institutes (Lloyd's
   Register, MIT, CSRF, IEA, Tyndall, ADB, and most of the Research surface) enumerate to zero
   structurally. The Research/MI rollup carries this caveat until the extractor is genre-aware.
3. **Enumeration caps ABOLISHED for free harvest (R2 standing rule, operator 2026-07-20).** Free
   enumeration is never capped. Every source walks to exhaustion. The only legitimate stop conditions are
   (a) a crawl trap (the walk cycling or self-referencing, report the shape), (b) a fetch path that costs
   metered money (a pricing question for the operator, not a cap), (c) a technical block (403, JS-shell,
   dead URL, recorded as such). If a single source exceeds a full day of foreground chunks, report the
   shape of the problem, never an arbitrary count. `extractPortalLinks` still defaults to `DEFAULT_CAP=40`
   for a bare call, but every free-harvest caller now lifts it: `run-portal-harvest --cap N` and the
   register walker `walkEurlexOj` default uncapped (the 40 default remains only for an explicit probe).
   The exhaustion-pass ledger audit (2026-07-20) confirmed no source and no single page sits at a harvest
   ceiling. See the "Final per-source measurement" section below.
4. **Cross-host instrument boundary:** same-host-only extraction means institutional index sites whose
   instruments live on a national register (MPA → Singapore Statutes Online; Australia Infrastructure →
   legislation.gov.au) enumerate as all-holds honestly; the registers themselves are missing-from-the-world
   leads (routed to Session C via flags).

`census_worklist` has no dedicated `universe_scope` column (routes to Session B, same class as the earlier
undocumented-shape finding) — this table is the durable record until/unless one lands.

## How to read the per-item tables below

Per surface, four populations:

- **Enumerated**: documents `census_worklist` has recorded for this surface, any `enumeration_status`.
- **Held**: enumerated documents whose `dryrun_disposition = 'dedup_hit'` (already a corpus item, the
  census confirms coverage, does not duplicate it).
- **Missing from held sources** (Session A, intake lane): enumerated documents on a source the corpus
  already tracks, with `dryrun_disposition = 'would_mint'` (a genuine gap on ground we already stand on).
- **Missing from the world** (Session C, discovery lane): candidates in `coverage_gap_census_findings`
  with `dry_run_disposition = 'would_mint'` and `pending_dependency IS NULL` (a clean, unblocked gap; rows
  with a non-NULL `pending_dependency` are blocked on Session A's chrome-render or register-walk queue and
  are counted separately, never folded silently into "missing").

A row appears in exactly one of Held / Missing-from-held-sources at any time; Missing-from-the-world is
disjoint by construction (no `source_id` to key a `census_worklist` row on yet).

## Regulations

### Enumerated

*(none yet)*

### Held

*(none yet)*

### Missing from held sources (Session A)

| Rank | Instrument | Jurisdiction | Source | `census_worklist.id` | Notes |
|---|---|---|---|---|---|
| | | | | | |

### Missing from the world (Session C)

| Rank | Instrument | Jurisdiction | Lead / URL | Notes |
|---|---|---|---|---|
| | | | | |

## Operations

### Enumerated

*(none yet)*

### Held

*(none yet)*

### Missing from held sources (Session A)

| Rank | Instrument | Jurisdiction | Source | `census_worklist.id` | Notes |
|---|---|---|---|---|---|
| | | | | | |

### Missing from the world (Session C)

| Rank | Instrument | Jurisdiction | Lead / URL | Notes |
|---|---|---|---|---|
| | | | | |

## Market Intel

### Enumerated

*(none yet)*

### Held

*(none yet)*

### Missing from held sources (Session A)

| Rank | Instrument | Jurisdiction | Source | `census_worklist.id` | Notes |
|---|---|---|---|---|---|
| | | | | | |

### Missing from the world (Session C)

| Rank | Instrument | Jurisdiction | Lead / URL | Notes |
|---|---|---|---|---|
| | | | | |

## Research

### Enumerated

*(none yet)*

### Held

*(none yet)*

### Missing from held sources (Session A)

| Rank | Instrument | Jurisdiction | Source | `census_worklist.id` | Notes |
|---|---|---|---|---|---|
| | | | | | |

### Missing from the world (Session C)

| Rank | Instrument | Jurisdiction | Lead / URL | Notes |
|---|---|---|---|---|
| | | | | |

## Final per-source measurement (exhaustion pass, 2026-07-20)

Under the R2 no-cap rule, every source is either MEASURED (walked to exhaustion, count below any cap) or
carries an honest stop-reason from the R2 list (crawl trap / metered path / technical block). The
exhaustion-pass ledger audit found NO source and NO single page sitting at a harvest ceiling: `cap_hit`
is now `false` on every `census_worklist` row (the four formerly-flagged Tier B sources were re-harvested
uncapped and proven measured; the stale flags were cleared, cause "exhaustion proven, flag satisfied").
There are no floors-by-policy anywhere in the census.

| Source | Method | True universe | State | Note |
|---|---|---|---|---|
| NSW EPA | single-page harvest, uncapped | 220 | MEASURED | re-harvested at no cap 2026-07-20 → 220 (below ceiling); supersedes the prior "200 AT CAP" floor |
| SC DES Bureau of Air Quality | single-page harvest, uncapped | 164 | MEASURED | 164 below cap |
| NC General Assembly (ncleg Ch. 136) | single-page harvest, uncapped | 145 | MEASURED (cap); 109 fetch-blocked | 145 below cap. 109 per-section /PDF/ candidates all fail direct fetch (js_shell) — R2(c) technical block, deferred as a re-walkable gap (needs the Browserless render path, operator decision) |
| Australian Government Infrastructure | single-page harvest, uncapped | 128 | MEASURED | 128 below cap |
| Federal Register / DOT | register JSON API, unbounded pagination | 278 RULE (window 2026-06-22..07-17) | MEASURED / EXHAUSTED | API paginated to exhaustion (3 pages, 0 dropped); the FR API is not subject to the 40-link cap. All 278 already accounted (275 censused + 3 promoted). The census's 435 dispositioned FR rows superset this window |
| EUR-Lex OJ daily-view | per-day HTML walk | not measurable via plain HTTP now | R2(c) technical block; superseded_by_stock_walk | plain-HTTP daily-view returns HTTP 202 + a 2035-char JS-shell stub for every probed day (2026-07-20); the 157 flow candidates were captured 2026-07-19 before the wall and are dispositioned. `render_path_available = true` (a Chrome-rendered fetch of the 17 Jul L-series view returned the full instrument list). True EUR-Lex exhaustion is delivered by the stock walk (Task 4, CELEX API, not governed by the page-level wall), not by re-walking the daily view |

**Small residue, all R2(c) or nav-chrome (recorded, re-walkable, no forced disposition):** 8 fetch-failed
candidates across 7 sources (Alaska 2 http_404, Melbourne http_404, Nova Scotia http_404, EC DG-Env empty,
EP Legislative Train empty, NYC empty, MPA error_body) written off per operator ruling R4; 6 Federal
Register site-chrome pages (reader-aids, statistics, a `/d/` shortlink) that the genre-regex admitted as
non-instrument nav.

**Finding (routes to Session B, tooling):** the `--census-exclude` anti-join fails at ~435 dispositioned
rows for a single source (an empty-message ledger read error — the client-built `NOT IN (…435 URLs…)`
list overflows the PostgREST query). It works at the small per-source counts the flow census used, but the
stock walk (Task 4 onward) will exceed this against large held sets; that lane needs a server-side
anti-join (a `NOT EXISTS` RPC), not a client-assembled URL list. Recorded, not this pass's to fix.

## Rollup tallies

Maintained per source and per surface (Task 2, standing duty). Source: `SELECT * FROM
census_rollup_by_surface` (migration 222), recomputed live on every read, never hand-tallied. Snapshot
below dated 2026-07-20, at exhaustion-pass close; re-query for current numbers. The world-side (right four
columns) is moving as Session C lands its sweep4 found-then-lost recovery rows into
`coverage_gap_census_findings`, so treat the world columns as a live-as-of-query reading, not a fixed
total.

### Per surface

Left four columns from `census_worklist` (Session A/B, held sources); right four from
`coverage_gap_census_findings` (Session C, the world). `pending_on_session_a` is carried visibly, not
folded into `missing_from_world`.

| Surface | Held: enumerated | Held: held | Held: missing | Held: other/undispositioned | World: enumerated | World: missing | World: pending on A | World: declined/parked |
|---|---|---|---|---|---|---|---|---|
| Regulations | 302 | 2 | 300 | 0 | 20 | 18 | 1 | 1 |
| Operations | 161 | 2 | 159 | 0 | 18 | 18 | 0 | 0 |
| Market Intel | 38 | 0 | 38 | 0 | 5 | 3 | 0 | 2 |
| Research | 8 | 1 | 7 | 0 | 3 | 3 | 0 | 0 |

`census_worklist` totals at this snapshot: 1,331 rows / 39 sources / 619 would_mint / 112 relevant
would-mints (the `would_mint AND notes NOT ILIKE '%low-relevance%'` split from the universe-scope section
above) / 710 hold / 2 dedup_hit. Per-surface sums differ from row totals because rows can carry more than
one surface tag, or none (a portal/uncertain classifier verdict tags no surface). The "Held: missing"
column counts ALL would_mint rows including low-relevance ones; read the relevant-gap split for
register-class sources per the universe-scope section. `coverage_gap_census_findings` reflects Session C's
completed three-sweep mandate (81 rows total; sums per surface differ from 81 because rows can classify IN
on more than one surface, or OUT on all four).

### Per source

*(none yet, populates once `census_worklist` has rows grouped by `source_id`)*

| Source | Lane | Rows | Would-mint | Dedup-hit | Congruence-reject | Invariant-reject | Hold | Cap-hit |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## Flagged rows (malformed or incomplete, routed back to the producing lane)

Never silently fixed by a different lane (Task 2). One row per flag; cleared when the producing lane
resubmits (`enumeration_status: flagged -> discovered`) and the row reprocesses clean.

| `census_worklist.id` | Lane | `flagged_reason` | `flagged_at` | Status |
|---|---|---|---|---|
| | | | | |

## Cross-source dedup log

Rows resolved via `resolved_into_id` (Task 2, `matchExistingSubject`-style resolution: the same
instrument enumerated at two registers collapses to one census identity). Never by title similarity alone.

| Canonical `census_worklist.id` | Resolved-away id(s) | Match basis | Date |
|---|---|---|---|
| | | | |
