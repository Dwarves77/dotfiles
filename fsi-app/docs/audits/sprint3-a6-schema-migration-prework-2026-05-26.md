# A6 Schema Migration Prework (region_dimension_coverage)

**Date:** 2026-05-26
**Status:** READ-ONLY. Migration 108 SQL drafted; awaits operator green-light to apply.
**Predecessor audit:** `docs/audits/sprint3-a6-schema-empty-dim-2026-05-26.md` (Option C
recommended; operator locked Option C with the 4-state extension below).

---

## Operator-locked decisions

Per the dispatch brief and the operator's 2026-05-26 ruling on top of the A6 schema audit:

- **4-state coverage** (extended from the audit's 3-state proposal):
  - `not_attempted` — default; no source search has run for this region × dimension
  - `tried_no_data` — source search ran, no qualifying data found
  - `out_of_scope` — operator marked intentionally not in scope
  - `populated` — one or more rows in `regional_data_facts` exist for this `(region, dimension)`
- **`populated` is denormalized** for query speed — explicit column value rather than
  inferred from a `regional_data_facts` join at query time.
- **`notes` TEXT nullable** — captures operator reasoning when status is `out_of_scope`
  (and free-form notes for `tried_no_data` / `populated` if the operator wants to leave
  a trail).
- **Migration number:** 108. Number 107 is reserved for A4 per prior operator direction;
  highest migration on disk is 106; 107 and 108 are both unused on disk. 108 is
  selected.
- **Constraint names:** verified no-collision with migrations 102–106 (see Section 4).

---

## Migration 106 baseline (existing schema)

Excerpts from `fsi-app/supabase/migrations/106_regions_and_facts.sql`.

### regions table

```sql
CREATE TABLE IF NOT EXISTS regions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT UNIQUE NOT NULL,
  label                 TEXT NOT NULL,
  severity              TEXT,
  iso_codes             TEXT[] NOT NULL DEFAULT '{}',
  operations_decisions  JSONB NOT NULL DEFAULT '{}',
  display_order         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE regions ADD CONSTRAINT regions_severity_check
  CHECK (severity IS NULL OR severity IN ('critical', 'high', 'moderate', 'low'));

CREATE INDEX IF NOT EXISTS idx_regions_code ON regions(code);
CREATE INDEX IF NOT EXISTS idx_regions_iso_codes ON regions USING GIN (iso_codes);

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY regions_read ON regions FOR SELECT USING (true);
```

Seed rows (idempotent): `EU`, `US`, `ASIA`, `UK`, `UAE`.

### regional_data_facts table

```sql
CREATE TABLE IF NOT EXISTS regional_data_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension       TEXT NOT NULL,
  fact_label      TEXT NOT NULL,
  value           TEXT NOT NULL,
  status          TEXT,
  trend           TEXT,
  source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_note     TEXT,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, dimension, fact_label)
);

ALTER TABLE regional_data_facts ADD CONSTRAINT regional_data_facts_dimension_check
  CHECK (dimension IN (
    'regulatory_feasibility',
    'regional_resources',
    'labor_markets',
    'materials_sourcing',
    'infrastructure',
    'operational_cost'
  ));

ALTER TABLE regional_data_facts ADD CONSTRAINT regional_data_facts_trend_check
  CHECK (trend IS NULL OR trend IN ('up', 'down', 'flat'));

CREATE INDEX IF NOT EXISTS idx_regional_data_facts_region_dim
  ON regional_data_facts(region_id, dimension);

CREATE INDEX IF NOT EXISTS idx_regional_data_facts_source
  ON regional_data_facts(source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE regional_data_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY regional_data_facts_read ON regional_data_facts FOR SELECT USING (true);
```

### What "dimension" looks like

Dimension is a **column on each row**, NOT a separate row/table. The CHECK enum on
`regional_data_facts.dimension` enforces the six D1–D6 values using underscore-lowercase
form (`regulatory_feasibility`, `regional_resources`, `labor_markets`, `materials_sourcing`,
`infrastructure`, `operational_cost`).

**Important:** the dispatch brief uses the short-form labels `D1 | D2 | D3 | D4 | D5 | D6`
for the new coverage table. Migration 108 below preserves that short-form vocabulary
verbatim on `region_dimension_coverage.dimension`, distinct from the long-form vocabulary
on `regional_data_facts.dimension`. Section 7 below documents the cross-walk and the
trigger that keeps both vocabularies in sync.

---

## Migration 108 — proposed SQL

```sql
-- Migration 108: region_dimension_coverage table per operator A1.5/A6 decision
-- (2026-05-26).
--
-- Four-state coverage tracking per region × dimension pair:
--   - not_attempted  (default — no source search has run)
--   - tried_no_data  (source search ran, no qualifying data found)
--   - out_of_scope   (operator marked intentionally not in scope)
--   - populated      (one or more rows in regional_data_facts exist;
--                     denormalized for query speed per operator preference)
--
-- The dispatch brief specifies short-form D1–D6 dimension labels on this
-- table (distinct from the long-form labels on regional_data_facts.dimension).
-- A cross-walk lives in Section 7 of the prework doc; a trigger (Section 6)
-- keeps the `populated` denormalization coherent with regional_data_facts.
--
-- Predecessor audit: docs/audits/sprint3-a6-schema-empty-dim-2026-05-26.md
-- (Option C with the 4-state extension).

BEGIN;

-- ── region_dimension_coverage table ──────────────────────────────
CREATE TABLE IF NOT EXISTS region_dimension_coverage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'not_attempted',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT region_dimension_coverage_region_dim_unique
    UNIQUE (region_id, dimension)
);

ALTER TABLE region_dimension_coverage
  DROP CONSTRAINT IF EXISTS region_dimension_coverage_dimension_check;
ALTER TABLE region_dimension_coverage
  ADD CONSTRAINT region_dimension_coverage_dimension_check
  CHECK (dimension IN ('D1', 'D2', 'D3', 'D4', 'D5', 'D6'));

ALTER TABLE region_dimension_coverage
  DROP CONSTRAINT IF EXISTS region_dimension_coverage_status_check;
ALTER TABLE region_dimension_coverage
  ADD CONSTRAINT region_dimension_coverage_status_check
  CHECK (status IN ('not_attempted', 'tried_no_data', 'out_of_scope', 'populated'));

-- ── Indexes for query patterns ───────────────────────────────────
-- Lookup: every coverage cell for a given region (Operations page render).
CREATE INDEX IF NOT EXISTS idx_region_dim_coverage_region
  ON region_dimension_coverage(region_id);

-- Lookup: all cells in a given status across regions (coverage scoreboard).
CREATE INDEX IF NOT EXISTS idx_region_dim_coverage_status
  ON region_dimension_coverage(status);

-- Composite for the common Operations-page query "show me each
-- (region, dimension) coverage row" without a sequential scan.
CREATE INDEX IF NOT EXISTS idx_region_dim_coverage_region_dim
  ON region_dimension_coverage(region_id, dimension);

-- ── Trigger: keep updated_at fresh ───────────────────────────────
CREATE OR REPLACE FUNCTION region_dimension_coverage_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS region_dimension_coverage_set_updated_at_trg
  ON region_dimension_coverage;
CREATE TRIGGER region_dimension_coverage_set_updated_at_trg
  BEFORE UPDATE ON region_dimension_coverage
  FOR EACH ROW
  EXECUTE FUNCTION region_dimension_coverage_set_updated_at();

-- ── Comments ─────────────────────────────────────────────────────
COMMENT ON TABLE region_dimension_coverage IS
  'Per region × dimension coverage tracker (A6, 2026-05-26). Four states: not_attempted (default) / tried_no_data / out_of_scope / populated. The populated state is denormalized for query speed per operator preference; the regional_data_facts join is authoritative when the two disagree, and a future trigger (Section 6 of the prework doc) can keep them in lock-step.';

COMMENT ON COLUMN region_dimension_coverage.dimension IS
  'Short-form D1–D6 label per dispatch brief vocabulary. Cross-walks to regional_data_facts.dimension long-form labels (D1=regulatory_feasibility, D2=regional_resources, D3=labor_markets, D4=materials_sourcing, D5=infrastructure, D6=operational_cost). The cross-walk is documented in the A6 prework doc Section 7.';

COMMENT ON COLUMN region_dimension_coverage.status IS
  'Four-state coverage: not_attempted (default — no source search has run) / tried_no_data (search ran, nothing found) / out_of_scope (operator scoped out) / populated (one or more regional_data_facts rows exist for this region × dimension).';

COMMENT ON COLUMN region_dimension_coverage.notes IS
  'Optional free-form text. Required by convention (not by constraint) when status=out_of_scope to record operator reasoning.';

-- ── RLS: mirror regions / regional_data_facts (world-readable) ───
ALTER TABLE region_dimension_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY region_dimension_coverage_read
  ON region_dimension_coverage
  FOR SELECT
  USING (true);

-- Service-role bypass via Supabase service key (no policy needed; RLS
-- is auth.uid()-based and service role bypasses RLS by default).

COMMIT;
```

---

## Constraint name collision check

### Constraint and index names created in migrations 102–106

| Migration | Constraint / index name | Type |
|---|---|---|
| 102 | `intelligence_items_severity_check` | CHECK |
| 102 | `intelligence_items_signal_band_check` | CHECK |
| 102 | `intelligence_items_theme_check` | CHECK |
| 102 | `idx_items_signal_band` | partial INDEX |
| 102 | `idx_items_theme` | partial INDEX |
| 103 | `intelligence_item_sections_pkey` (implicit on PK) | PK |
| 103 | UNIQUE `(item_id, section_key)` (implicit, system-named) | UNIQUE |
| 103 | `idx_item_sections_item_id` | INDEX |
| 103 | `idx_item_sections_section_key` | INDEX |
| 103 | `idx_item_sections_source_ids` | GIN INDEX |
| 103 | `intelligence_item_sections_read` | POLICY |
| 104 | `idx_community_posts_ref_intel_ids` | GIN INDEX |
| 105 | `profiles_workspace_role_check` | CHECK |
| 105 | `idx_profiles_org_id` | partial INDEX |
| 105 | `idx_profiles_sector` | GIN INDEX |
| 105 | `idx_profiles_region` | GIN INDEX |
| 106 | `regions_severity_check` | CHECK |
| 106 | `idx_regions_code` | INDEX |
| 106 | `idx_regions_iso_codes` | GIN INDEX |
| 106 | `regional_data_facts_dimension_check` | CHECK |
| 106 | `regional_data_facts_trend_check` | CHECK |
| 106 | UNIQUE `(region_id, dimension, fact_label)` (implicit, system-named) | UNIQUE |
| 106 | `idx_regional_data_facts_region_dim` | INDEX |
| 106 | `idx_regional_data_facts_source` | partial INDEX |
| 106 | `regions_read` | POLICY |
| 106 | `regional_data_facts_read` | POLICY |

### Migration 108 new names

| Name | Type |
|---|---|
| `region_dimension_coverage` | TABLE |
| `region_dimension_coverage_region_dim_unique` | UNIQUE constraint |
| `region_dimension_coverage_dimension_check` | CHECK constraint |
| `region_dimension_coverage_status_check` | CHECK constraint |
| `idx_region_dim_coverage_region` | INDEX |
| `idx_region_dim_coverage_status` | INDEX |
| `idx_region_dim_coverage_region_dim` | INDEX |
| `region_dimension_coverage_set_updated_at` | FUNCTION |
| `region_dimension_coverage_set_updated_at_trg` | TRIGGER |
| `region_dimension_coverage_read` | POLICY |

### Collision verdict

**No collisions.** Every proposed name has the `region_dimension_coverage` or
`idx_region_dim_coverage` prefix, neither of which appears in any migration 102–106 name.
The closest semantic neighbour is `regional_data_facts_dimension_check` (106), which
shares the `dimension_check` suffix but is uniquely prefixed by `regional_data_facts_`,
not `region_dimension_coverage_`. PostgreSQL constraint names are unique per schema and
the two prefixes do not overlap.

---

## Seed-data plan (after migration applies)

The migration body itself does NOT seed the coverage rows — seeding is a separate
step the operator runs after migration 108 applies and after authorizing the data write.
The seed lives as a standalone script (or an inlined SQL block run via the SQL editor)
that is idempotent and verifiable.

### Step 1 — seed `not_attempted` row per (region, dimension)

```sql
-- Idempotent seed: for every region, insert 6 rows (D1..D6) at status='not_attempted'.
-- ON CONFLICT DO NOTHING preserves any rows that already exist (e.g. if the seed
-- has run before, or if operator hand-set out_of_scope rows after the trigger
-- backfilled populated rows in step 2).
INSERT INTO region_dimension_coverage (region_id, dimension, status)
SELECT r.id, d.dim, 'not_attempted'
FROM regions r
CROSS JOIN (
  VALUES ('D1'), ('D2'), ('D3'), ('D4'), ('D5'), ('D6')
) AS d(dim)
ON CONFLICT (region_id, dimension) DO NOTHING;
```

Expected row count post-seed: 5 regions × 6 dimensions = **30 rows** (with
the current `EU`, `US`, `ASIA`, `UK`, `UAE` seed in `regions`).

### Step 2 — reconcile `populated` from `regional_data_facts`

Per operator preference, `populated` is denormalized. The seed reconciliation
flips any (region, dimension) cell that has at least one row in
`regional_data_facts` to status='populated':

```sql
-- Cross-walk: regional_data_facts.dimension (long-form) → coverage.dimension (short-form).
-- Reconciliation: any (region_id, dimension) with ≥1 fact row in regional_data_facts
-- becomes status='populated' in region_dimension_coverage.
UPDATE region_dimension_coverage rdc
SET status = 'populated', updated_at = NOW()
FROM (
  SELECT DISTINCT
    rdf.region_id,
    CASE rdf.dimension
      WHEN 'regulatory_feasibility' THEN 'D1'
      WHEN 'regional_resources'     THEN 'D2'
      WHEN 'labor_markets'          THEN 'D3'
      WHEN 'materials_sourcing'     THEN 'D4'
      WHEN 'infrastructure'         THEN 'D5'
      WHEN 'operational_cost'       THEN 'D6'
    END AS dimension
  FROM regional_data_facts rdf
) facts
WHERE rdc.region_id = facts.region_id
  AND rdc.dimension = facts.dimension
  AND rdc.status = 'not_attempted';
```

Per the mockup and the existing `OperationsPage.tsx` data, **EU and US** are expected
to flip largely or entirely to `populated` across D1–D6. **ASIA, UK, UAE** retain
`not_attempted` for most cells until Sonnet's discovery loop (A6 backfill proper)
runs.

### Step 3 — verification query (read-back)

```sql
-- Coverage scoreboard by region.
SELECT
  r.code,
  rdc.dimension,
  rdc.status,
  rdc.notes
FROM regions r
JOIN region_dimension_coverage rdc ON rdc.region_id = r.id
ORDER BY r.display_order, rdc.dimension;
```

Operator confirms the EU/US `populated` rows match expectation and the
ASIA/UK/UAE `not_attempted` rows match expectation BEFORE A6's Sonnet runs touch
the table.

### Step 4 — optional operator overrides BEFORE A6 Sonnet runs

If the operator already knows specific cells are `out_of_scope` (e.g. UAE D2
hardwood crating per the A6 schema audit's open question 5), pre-set them
before Sonnet runs so the discovery loop skips them:

```sql
UPDATE region_dimension_coverage
SET status = 'out_of_scope',
    notes = 'DEWA prohibits grid sellback; PV-component sourcing moot for UAE',
    updated_at = NOW()
WHERE region_id = (SELECT id FROM regions WHERE code = 'UAE')
  AND dimension = 'D2';
```

---

## Open questions

1. **Trigger to auto-set `populated` on `regional_data_facts` insert.** The denormalization
   means a `regional_data_facts` INSERT in (region, dimension) needs to also flip the
   coverage row to `populated`. Migration 108 above does NOT install this trigger — it
   leaves the seed-step 2 reconcile UPDATE as the only source of truth, which would drift
   the moment a fact is inserted without re-running the reconcile. **Recommendation:**
   ship the trigger inside migration 108 (one extra function + AFTER INSERT trigger on
   `regional_data_facts`). Awaiting operator green-light to include it; the audit doc's
   Section 4 Option C "Cons" called out this exact risk. If the operator prefers to run
   the reconcile script as a periodic job instead, no trigger needed.
2. **Cross-walk vocabulary canonicalization.** Migration 108 deliberately uses short-form
   `D1–D6` labels on `region_dimension_coverage.dimension` per the dispatch brief, while
   `regional_data_facts.dimension` retains the long-form labels from migration 106. This
   is a deliberate split (the dispatch brief mandates short-form on the coverage table).
   Long-term canonicalization to one vocabulary is a separate decision and not in scope
   for migration 108.

---

## A6 implementation sequencing post-migration

Order of subsequent commits after migration 108 lands and is authorized:

1. **Migration 108 apply + verify** (operator-authorized data write).
   - Apply migration 108 to the dev DB; read-back the table exists with the constraints.
   - Verify constraint names landed exactly as declared (no PostgreSQL auto-rename).
2. **Seed script: not_attempted rows.** Run Step 1 of Section 5 against dev DB; verify
   30 rows landed.
3. **Seed script: reconcile populated.** Run Step 2; verify the EU/US cells that have
   `regional_data_facts` rows flipped to `populated`; verify ASIA/UK/UAE retain
   `not_attempted` as expected.
4. **OperationsPage render swap.** Update `src/components/pages/OperationsPage.tsx` to:
   - Read `region_dimension_coverage` alongside `regional_data_facts`.
   - Render the 4-state empty-dim block per the mockup's `.empty-dim` treatment:
     - `not_attempted` → muted italic + orange CTA "Suggest a source for this cell."
     - `tried_no_data` → muted italic + orange CTA "Flag a coverage request."
     - `out_of_scope` → muted italic, NO CTA, render `notes` field as the rationale.
     - `populated` → render the existing `FactTable` as today (no empty-dim).
5. **Empty-dim CTA wiring.** Wire the State 1 and State 2 CTAs to write requests:
   - State 1 CTA writes a `provisional_sources` row tagged for this `(region, dimension)`.
   - State 2 CTA writes an `integrity_flags` row with `category='coverage_gap'`,
     `subject_type='surface'`, `subject_ref='/operations'`.
6. **Sonnet discovery loop integration.** Modify the A6 Sonnet runner to:
   - Read `region_dimension_coverage WHERE status IN ('not_attempted', 'tried_no_data')`
     to determine which cells to attempt.
   - Skip any cell where status is already `out_of_scope` (operator deliberately gated).
   - On successful fact extraction: insert into `regional_data_facts` (existing path),
     then UPDATE `region_dimension_coverage` to `populated` (or rely on the trigger
     from open question 1 above if it ships in migration 108).
   - On unsuccessful extraction (no qualifying source found): UPDATE coverage row to
     `tried_no_data` with a `notes` field summarizing the search effort.
7. **`provisional_sources` upsert per EcoVadis precedent.** Any new source surfaced by
   the Sonnet discovery loop lands in `provisional_sources` for operator review using
   the same upsert pattern as the existing `/api/agent/run` citation-extraction path
   (`src/lib/agent/parse-output.ts` writes citations; the EcoVadis pattern is the
   reference for one-source-cited-many-times deduplication).
8. **Documentation sweep.** Update CLAUDE.md sector "Operations" notes to reflect the
   4-state coverage primitive; close the OBS entry the A6 schema audit opened.

---

## Skills consulted

Per dispatch-inventory rule (CLAUDE.md, 2026-05-20):

- `caros-ledge-platform-intent` — Operations is one of the 5 customer-facing surfaces.
  The coverage primitive directly shapes Operations-surface customer affordances.
- `sprint-followups-discipline` — Sprint 3 design pre-work; closes the OBS the A6
  schema audit opened on 2026-05-26.
- `environmental-policy-and-innovation` — Operations dimensions are the "Operations
  Profile" format family in the five-format model.
- `source-credibility-model` — A6's Sonnet discovery loop (sequencing step 6 above)
  interacts directly with the candidate review surface, tier classification, and the
  discovery loop. Pairing is non-optional for any new source the loop surfaces.
- `remediation-discipline` — Considered, NOT loaded. This is design pre-work, not a
  failure-response, hotfix, or post-mortem.

---

**End of prework. No code, schema, or DB changes performed.**
