# Sprint 1 Phase 3: Jurisdiction Vocabulary Extension

**Date:** 2026-05-16
**Phase:** 3 of 11 (READ-ONLY)
**Status:** classification + architecture proposal; awaiting operator decisions before Phase 4
**Branch:** feat/sprint-1-chrome-remediation
**Introspection:** `fsi-app/scripts/tmp/phase-3-jurisdiction-introspect.mjs` + `phase-3-classify.py` + outputs

## 1. Current state

### Migration 072 trigger

`fsi-app/supabase/migrations/072_jurisdiction_normalizer.sql:28-272` installs `_normalize_jurisdictions(TEXT[])` and a BEFORE INSERT OR UPDATE trigger on `intelligence_items`. The CASE table covers ~70 country/region tokens plus 50 US state names (full + 2-letter codes via disambiguation logic) plus 4 UK devolved nations. Unmapped tokens are uppercased and preserved (not dropped).

### App-layer helper

`fsi-app/src/lib/jurisdictions/iso.ts:38-52` defines `LEGACY_TO_ISO_MAP` with 13 entries and `legacyToIso()` consumer. Audit-confirmed: zero callers in `src/`. The trigger does the work; the helper is dead code.

### Live distribution (655 rows touched)

- 195 rows have at least one `jurisdiction_iso` value
- 21 rows have empty `jurisdictions`
- 460 rows have empty `jurisdiction_iso` (the column was added in migration 033 but never backfilled for 70% of rows; the trigger only fires on writes after 072 lands, so older rows still missing ISO data)

### `intelligence_items.jurisdictions`: 342 distinct values, 1,168 total occurrences

### `intelligence_items.jurisdiction_iso`: 29 distinct values, 195 rows

### `sources.jurisdictions`: 16 distinct values

## 2. Classification of all 342 distinct `intelligence_items.jurisdictions` values

| Bucket | Distinct | Occurrences | Treatment |
|---|---|---|---|
| **ALREADY CANONICAL (98 distinct, 779 occurrences = 67%)** | | | |
| iso_3166_1_canonical (US, GB, CA, DE, etc.) | 43 | 346 | No action |
| iso_3166_2_canonical (US-CA, GB-ENG, etc.) | 50 | 165 | No action |
| us_subnational_non_iso (US-NYC, US-LAX) | 2 | 2 | **DECIDE:** keep as platform-extension OR map to US-NY/US-CA parent only |
| known_free_text (EU, GLOBAL, IMO) | 3 | 268 | No action (already in trigger) |
| **MAP via CASE extension (~90 distinct, ~250 occurrences)** | | | |
| us_federal_variant | 5 | 23 | **CASE add:** all 5 → `US` (FEDERAL, UNITED_STATES, US_FEDERAL, UNITED STATES FEDERAL, UNITED STATES - FEDERAL) |
| state_name_uppercased | 15 | 21 | **CASE add:** NEW YORK STATE / NEW_YORK_STATE → `US-NY`; other "MEMBER STATES" patterns are org-group, not jurisdictional (see ambiguous bucket) |
| subnational_county_city (NEW YORK CITY, ONTARIO, etc.) | 25 | 44 | **CASE add or table:** city-level mappings (LOS ANGELES → US-CA, ONTARIO → CA-ON, etc.). 25 entries. |
| continent (ASIA, EUROPE, AFRICA, NORTH AMERICA) | 4 | 48 | **DECIDE:** keep as canonical continent values, OR reject (continents are not jurisdictions; rows tagged ASIA need re-classification to a specific country) |
| Most "other_unmapped" entries: country names (BANGLADESH, ETHIOPIA, etc.), Canadian provinces (ALBERTA, MANITOBA, etc.), Australian states (NSW, QUEENSLAND, etc.), country aliases (UNITED_KINGDOM, REPUBLIC OF KOREA) | ~50 | ~70 | **CASE add:** straightforward country/sub-national mappings. ~50 entries. |
| **AMBIGUOUS (operator decision; 18 distinct, 36 occurrences)** | | | |
| ambiguous_or_org_group (OECD, ASEAN, DEVELOPING COUNTRIES, G7, etc.) | 9 | 12 | **DECIDE:** (a) reject; (b) accept as KNOWN_FREE_TEXT entries; (c) map to a member-state list at ingest |
| region_bucket (LATAM, LATIN AMERICA, MEAF, MIDDLE EAST, ASIA-PACIFIC, etc.) | 9 | 24 | **DECIDE:** same options as above |
| **RC-7 FRAGMENTS (49 distinct, 50 occurrences) — recommended REJECT at ingest** | | | |
| hydrological_or_natural_feature (CARSON_RIVER_WATERSHED, BLACKSTONE RIVER, GULF_OF_OMAN, etc.) | 17 | 18 | **REJECT at ingest** (per RC-7) — these are not jurisdictions |
| agency_or_org_name (MINISTRY OF CLIMATE, EPA, ARIZONA DEPT OF TRANSPORTATION, EAST COURTHOUSE ROAD, etc.) | 15 | 16 | **REJECT at ingest** — these are agency names, not jurisdictions |
| Sub-jurisdictional counties (LAKE COUNTY, BOULDER COUNTY, CONEJOS COUNTY, EAGLE COUNTY, etc., in "other_unmapped") | ~17 | ~17 | **REJECT at ingest** — county-level granularity below platform's intended scope |
| **TRULY UNMAPPED LONG-TAIL (~85 distinct, ~85 occurrences)** | | | |
| Cities outside top tier (ANTWERP, BRUGES, DIEST, BILOXI, ARBOLETES, etc.) | ~50 | ~50 | **DECIDE:** reject as below-granularity, OR map each to country parent |
| Real but uncommon country names (DEMOCRATIC REPUBLIC OF THE CONGO, ETHIOPIA, CYPRUS, ESTONIA, LATVIA, etc.) | ~35 | ~35 | **CASE add:** straightforward country mappings |

### Top RC-7 instances cited in the Chrome audit (verified in live data)

| Audit-cited value | Occurrences | Recommended treatment |
|---|---|---|
| CZECH_REPUBLIC | 1 | CASE add: → `CZ`. Also CZECH REPUBLIC (1 occurrence) → `CZ`. |
| US_FEDERAL, UNITED_STATES, UNITED STATES FEDERAL, UNITED STATES - FEDERAL, FEDERAL | 23 | CASE add: all → `US` |
| ASIA-PACIFIC, ASIA_PACIFIC | 3 | DECIDE per region_bucket question above |
| DEVELOPING COUNTRIES, DEVELOPING_COUNTRIES | 2 | DECIDE per ambiguous question above |
| NEW YORK STATE / NEW_YORK_STATE / NEW YORK CITY | 13 | CASE add: → `US-NY` (state form), → `US-NYC` if platform extension kept, OR → `US-NY` if collapsing |
| ASIAN DEVELOPMENT BANK MEMBERS | 1 | DECIDE per ambiguous question above |
| SAN FRANCISCO, SAN_FRANCISCO | 2 | CASE add: → `US-CA` (collapse to state) or platform extension → `US-CA-SF` |
| CARSON_RIVER_WATERSHED, BLACKSTONE RIVER, BEAR RIVER BASIN, BIHOR COUNTY | 4 | REJECT at ingest |

## 3. Architecture decision: extend trigger CASE vs standalone jurisdictions table

### Option A: Extend the migration 072 CASE table (recommended for Sprint 1)

Add ~140 CASE entries to cover:
- 5 US federal variants → `US`
- 15 state-name-uppercased patterns (NEW YORK STATE etc.) → ISO 3166-2
- 25 city/sub-national patterns (where collapse to parent makes sense) → ISO 3166-1 or 3166-2 parent
- 50 country names not in current CASE (BANGLADESH → `BD`, ETHIOPIA → `ET`, etc.)
- 30 Canadian provinces (ALBERTA → `CA-AB`, ONTARIO → `CA-ON`, etc. — 13 provinces + variants)
- 15 Australian states (NSW → `AU-NSW`, QUEENSLAND → `AU-QLD`, etc.)
- ~10 country aliases (UNITED_KINGDOM → `GB`, REPUBLIC OF KOREA → `KR`, etc.)

**Net CASE size after extension: ~210 entries** (current ~70 + ~140 additions). Well under the 500-entry threshold the operator's brief named as the cheap/scaffolding boundary.

**Plus:** trigger ELSE branch changed from "uppercase and preserve" to "raise notice + write to `ingest_rejections` table" for rows where the value matches none of the canonical patterns AND none of the new CASE entries. This implements RC-7 fragment rejection at ingest (per the operator's brief Phase 6 task 2).

**Pros:**
- Single migration; rollback is dropping the new constraint
- Continues to use the existing trigger pattern (zero new code surface)
- Performance is identical (CASE statement evaluated at INSERT/UPDATE time; ~milliseconds per row)
- The standalone jurisdictions table is already named as a future dispatch (multi-tenant-foundation-followups-2026-05-15.md item 4); Sprint 1's RC-7 closure does not preempt that work

**Cons:**
- Adding new countries in the future requires a migration (the standalone table makes this an UPDATE)
- The CASE pattern is verbose for human review (each new entry is 1 line)
- No FK enforcement (the values are accepted by the trigger; no constraint says "only these values allowed")

### Option B: Create standalone jurisdictions table now

Define a `jurisdictions` table per the `reference-jurisdictions` skill spec (11 entity types per Dispatch 2.5 PR #118). Add FK from `intelligence_items.jurisdiction_iso[]` somehow (Postgres arrays cannot have per-element FKs, so the constraint enforces against a function-based check, or splits jurisdiction_iso into a junction table).

**Pros:**
- Single source of truth; lookup-table semantics
- Adding new jurisdictions is a row INSERT, not a migration
- Aligns with the existing multi-tenant followups roadmap

**Cons:**
- Significantly larger Sprint 1 footprint (per-row FK enforcement on array columns is non-trivial; either function-based CHECK constraint or junction-table migration with backfill)
- Junction-table refactor touches every read path for `intelligence_items.jurisdiction_iso`
- The 11-entity-type model in `reference-jurisdictions` skill is broader than Sprint 1 needs; that work belongs in its own dispatch with proper prework
- Duplicates the future jurisdictions-table dispatch's work

### Recommendation: Option A for Sprint 1; Option B as the named follow-up dispatch

Operator's brief explicitly suggests Option A "if the controlled vocabulary is under ~500 entries." Post-extension count: ~210 entries. Comfortably under. The standalone table dispatch is already on the queue (multi-tenant-followups item 4 + `reference-jurisdictions` skill spec from PR #118); Sprint 1's RC-7 work uses Option A and that dispatch picks up the more-complete entity-table architecture later.

## 4. Proposed migration 079 (sketch only; NOT written until Phase 4)

```sql
-- Migration 079: extend _normalize_jurisdictions CASE table to close
-- RC-7 (uncontrolled jurisdiction vocabulary). Closes the gap where
-- 244 of 342 distinct values either go unmapped (preserved as uppercase)
-- or pollute the operator surface with sub-jurisdictional fragments.

-- 4a. CASE additions
CREATE OR REPLACE FUNCTION public._normalize_jurisdictions(input TEXT[])
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
-- ... existing logic ...
  -- Add to CASE:
  -- US federal variants
  WHEN 'federal' THEN 'US'
  WHEN 'united_states' THEN 'US'
  WHEN 'us_federal' THEN 'US'
  WHEN 'united states federal' THEN 'US'
  WHEN 'united states - federal' THEN 'US'
  -- State variants
  WHEN 'new york state' THEN 'US-NY'
  WHEN 'new_york_state' THEN 'US-NY'
  WHEN 'new york city' THEN 'US-NY'  -- collapse city to state; operator may prefer US-NYC platform extension
  WHEN 'new_york_city' THEN 'US-NY'
  -- ... (additional CASE branches for ~140 more entries; see /tmp/phase-3-jurisdiction-vocabulary.md § 2)
  ELSE NULL
END;
-- ... rest of function unchanged
$$;

-- 4b. ingest_rejections table (per operator brief Phase 6 task 2)
CREATE TABLE IF NOT EXISTS public.ingest_rejections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rejected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT NOT NULL CHECK (reason IN (
    'unmapped_jurisdiction',
    'unmapped_compliance_object',
    -- future reasons added here
    'unknown'
  )),
  original_value  TEXT NOT NULL,
  source_path     TEXT,  -- which ingest pipe (rss-fetch, api-fetch, browserless, etc.)
  source_id       UUID,  -- if known; FK to sources(id) optional
  context         JSONB,  -- arbitrary additional context (source url, raw fragment, etc.)
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID    -- profiles(id) when operator triages
);

CREATE INDEX idx_ingest_rejections_reason ON ingest_rejections(reason);
CREATE INDEX idx_ingest_rejections_unreviewed ON ingest_rejections(rejected_at DESC)
  WHERE reviewed_at IS NULL;

COMMENT ON TABLE ingest_rejections IS
  'Per-ingest rejection log. Phase 6 writes here when classifier-source-onboarding or jurisdiction normalization rejects a value. Operator triages via /admin queue.';

-- 4c. Trigger update: when ELSE branch hits, write to ingest_rejections
-- (separate migration if RAISE NOTICE pattern doesn't work in IMMUTABLE function)
```

Phase 4 finalizes this sketch; Phase 5 runs the backfill that re-normalizes existing rows under the new CASE.

## 5. Open items for operator decision

| # | Decision | Audit recommendation |
|---|---|---|
| 1 | Platform extensions (US-NYC, US-LAX) — keep as canonical platform-extensions OR collapse to ISO 3166-2 parent (US-NY, US-CA)? | Keep as platform extensions; city-level rules need distinct ISO. Add CASE entries that map alternate-spelling forms to the canonical platform extension. |
| 2 | Continents (ASIA 18, EUROPE 18, AFRICA 8, NORTH AMERICA 4 occurrences) — accept as KNOWN_FREE_TEXT extensions OR reject? | Reject. Continents are not jurisdictions; rows tagged ASIA need re-classification by a separate Phase 5 backfill (or accept the cost of leaving 48 rows untagged at ISO level). |
| 3 | Region buckets (LATAM 6, LATIN AMERICA 6, MEAF 3, MIDDLE EAST 3, ASIA-PACIFIC 3, etc.) — accept as KNOWN_FREE_TEXT, reject, or map to member-state lists? | Map to member-state lists at ingest. The reference-jurisdictions skill spec named supranational blocs as a first-class entity type; for Sprint 1, do the simplest thing: accept the bucket value as canonical (LATAM stays LATAM in the canonical column), and the standalone table dispatch later defines the bloc→members fan-out. |
| 4 | Ambiguous org-groups (OECD 3, ASEAN 2, DEVELOPING COUNTRIES 2, EUROPEAN_UNION 1, etc.) | EUROPEAN_UNION → `EU` is mechanical; OECD/ASEAN/DEVELOPING COUNTRIES are real entities without ISO codes. Same treatment as region_bucket: accept as canonical, table-dispatch defines members. |
| 5 | RC-7 fragments (hydrological features, agency names, sub-jurisdictional counties) — reject at ingest? | **YES, reject.** 49 distinct fragments, 50 occurrences. The ingest_rejections table queues them for operator review. |
| 6 | Long-tail city names (ANTWERP, DIEST, BILOXI, ARBOLETES, etc.; ~50 distinct, ~50 occurrences) — reject or map to country parent? | **Map to country parent.** ANTWERP → `BE`, DIEST → `BE`, BILOXI → `US`, etc. The country-level granularity preserves the jurisdictional information without polluting the controlled vocabulary with city-level entries the platform does not surface at city level. |
| 7 | Backfill scope: just `intelligence_items.jurisdictions`, or also `intelligence_items.jurisdiction_iso` (which is empty on 460 rows)? | **Both.** The 460 empty-ISO rows can be backfilled by passing their `jurisdictions` through the extended CASE; rows where the CASE returns nothing stay empty (Phase 5 surfaces these for operator review). |
| 8 | Should we also extend `sources.jurisdictions` normalization in this migration, or scope strictly to `intelligence_items`? | Scope strictly to `intelligence_items` for Sprint 1. `sources.jurisdictions` has only 16 distinct values (much cleaner); the same trigger can be added to `sources` in a separate dispatch if needed. |

## 6. Cost frame (per rule-cost-weighted-recommendations)

- **One-time agent work:** Low ($20-50). ~140 CASE entries are mechanical translations from existing live values to ISO codes. Operator-decision items (continents, region buckets, ambiguous org groups) are content judgment; ~30 minutes of operator review.
- **Ongoing runtime:** Zero. The trigger fires at INSERT/UPDATE time at microsecond cost.
- **Ongoing infrastructure:** None. The `ingest_rejections` table is small (expected hundreds of rows/year at current ingest pace).
- **Inheritance:** Medium-High. The extended CASE becomes the contract every future ingest enforces. RC-7 closes by construction once Phase 6 wires the trigger.
- **Value frame:** Revenue-accelerating. The Chrome audit's most operator-visible integrity failure (the 342/166/165/82/72/43 jurisdiction count disagreement across surfaces) traces directly to RC-7. Phase 3 + Phase 4 + Phase 5 close the failure at the ingest boundary; future surfaces compute their counts off a controlled vocabulary.
- **Manual gate:** Not applicable for the schema-only work. Phase 5 backfill operator-reviews the still-NULL-after-extension list before the trigger's ELSE branch starts rejecting.

## 7. Phase 3 deliverable summary

- 342 distinct `intelligence_items.jurisdictions` values classified
- 98 already canonical (67% of occurrences) — no action
- ~140 should-map values identified for CASE extension (covers 250+ occurrences)
- 49 RC-7 fragments identified for ingest rejection (50 occurrences)
- 18 ambiguous/region values flagged for operator decision (36 occurrences)
- ~85 long-tail values needing simple country-parent mapping or rejection
- Architecture: extend CASE (Option A), not standalone table. Final CASE size ~210 entries, comfortably under the 500 threshold operator named
- `ingest_rejections` table sketched for Phase 4
- 8 decision points listed for operator

**Operator action required before Phase 4:**

1. Resolve the 8 decision points in § 5
2. Confirm extend-CASE architecture (Option A) vs go-now-to-standalone-table (Option B)
3. Confirm "proceed to Phase 4" or amend Phase 4 scope

No code modified. No migrations written. No PR opened. Sprint 1 branch holds Phase 1 + Phase 2 + Phase 3 deliverables only.
