# Gap Census, 2026-07

**Status: STRUCTURE + ROLLUP VIEW LIVE, per-item tables still empty.** Session A (intake, Chrome lane)
has not yet written rows to `census_worklist`. Session C (discovery, fetch-light lane) ran its three-sweep
mandate to completion (81 rows in `coverage_gap_census_findings`) and is now idle; its per-surface counts
are live below via `census_rollup_by_surface` (migration 222). Session B maintains this structure and the
standing rollup/dedup/flag-back duties; it does not enumerate or fetch. Rank fields are present, left
empty; final prioritization by the FSI lens (competitive edge, cost alert, window closing, monitoring,
action required, per `environmental-policy-and-innovation`) happens at operator review, not here.

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

## Cap-hit sources

Sources where a producing lane's enumeration was stopped at the per-source cap (`census_worklist.cap_hit
= true`). More documents may exist on these sources beyond what the census captured.

| Source | Lane | Rows captured | Cap-hit date | Notes |
|---|---|---|---|---|
| | | | | |

## Rollup tallies

Maintained per source and per surface (Task 2, standing duty). Source: `SELECT * FROM
census_rollup_by_surface` (migration 222), recomputed live on every read, never hand-tallied. Snapshot
below dated 2026-07-19, taken right after the view landed; re-query for current numbers.

### Per surface

Left four columns from `census_worklist` (Session A/B, held sources); right four from
`coverage_gap_census_findings` (Session C, the world). `pending_on_session_a` is carried visibly, not
folded into `missing_from_world`.

| Surface | Held: enumerated | Held: held | Held: missing | Held: other/undispositioned | World: enumerated | World: missing | World: pending on A | World: declined/parked |
|---|---|---|---|---|---|---|---|---|
| Regulations | 0 | 0 | 0 | 0 | 20 | 18 | 1 | 1 |
| Operations | 0 | 0 | 0 | 0 | 18 | 18 | 0 | 0 |
| Market Intel | 0 | 0 | 0 | 0 | 5 | 3 | 0 | 2 |
| Research | 0 | 0 | 0 | 0 | 3 | 3 | 0 | 0 |

All `census_worklist`-side columns are 0: Session A has not yet written rows. `coverage_gap_census_
findings` reflects Session C's completed three-sweep mandate (81 rows total; sums per surface differ from
81 because rows can classify IN on more than one surface, or OUT on all four).

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
