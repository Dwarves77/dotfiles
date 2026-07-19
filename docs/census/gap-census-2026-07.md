# Gap Census, 2026-07

**Status: SKELETON.** This document converges as Session A (intake, Chrome) and Session C (discovery,
fetch-light) enumerate sources against `census_worklist` (migration 221). Session B maintains this
structure and the standing rollup/dedup/flag-back duties; it does not enumerate or fetch. Structure only
until the lanes fill it. Rank fields are present, left empty; final prioritization by the FSI lens
(competitive edge, cost alert, window closing, monitoring, action required, per
`environmental-policy-and-innovation`) happens at operator review, not here.

## How to read this document

Per surface, four populations:

- **Enumerated**: documents `census_worklist` has recorded for this surface, any `enumeration_status`.
- **Held**: enumerated documents whose `dryrun_disposition = 'dedup_hit'` (already a corpus item, the
  census confirms coverage, does not duplicate it).
- **Missing from held sources** (Session A, intake lane): enumerated documents on a source the corpus
  already tracks, with `dryrun_disposition = 'would_mint'` (a genuine gap on ground we already stand on).
- **Missing from the world** (Session C, discovery lane): gaps identified by discovery outside the
  corpus's current source set entirely (no `census_worklist` row yet; the discovery lane's own findings,
  the `coverage_gap_candidates` table, mig 214, is the precedent shape for this population until a
  worklist row exists).

A row appears in exactly one of Held / Missing-from-held-sources at any time; Missing-from-the-world is
disjoint by construction (no source_id to key a `census_worklist` row on yet).

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

Maintained per source and per surface (Task 2, standing duty). Recomputed at each Session B activation
against live `census_worklist` state, not hand-tallied.

### Per surface

| Surface | Enumerated | Relevant (would_mint or dedup_hit) | Held (dedup_hit) | Missing (would_mint) |
|---|---|---|---|---|
| Regulations | 0 | 0 | 0 | 0 |
| Operations | 0 | 0 | 0 | 0 |
| Market Intel | 0 | 0 | 0 | 0 |
| Research | 0 | 0 | 0 | 0 |

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
