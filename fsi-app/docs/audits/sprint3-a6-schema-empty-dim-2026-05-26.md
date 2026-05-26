# A6 — Schema Completeness Audit (Sprint 3, empty-dim primitive)

**Date:** 2026-05-26
**Status:** READ-ONLY schema audit. A6 backfill BLOCKED on schema decision below.
**Scope:** Verify whether `regional_data_facts` + `regions` can express the three coverage
states the Operations mockup requires, and assess whether existing in-corpus sources
suffice for the Asia/UK/UAE D2–D6 backfill A6 proposes.

---

## 1. What the operations mockup actually requires

Source: `C:/Users/jason/dotfiles/design_handoff_2026-05/operations.html` and the README's
"Operations" section.

The mockup defines an `.empty-dim` CSS treatment specifically for empty-state cells:

```css
.empty-dim {
  font-size: 12.5px;
  color: var(--color-text-muted);
  font-style: italic;
  padding: 4px 0;
}
.empty-dim a {
  color: var(--color-primary);
  text-decoration: underline;
  font-style: normal;
}
```

The class name (`empty-dim`) and the embedded `<a>` selector make the operator's intent
unambiguous: empty cells are intended to render a sentence-form, muted-italic block with
an inline action link (the orange CTA per the design tokens).

### 1.1 What the mockup fully renders

Only the **EU** region is fully expanded in `operations.html`. Every other region is
referenced via the comment:

```html
<!-- US, Asia, UK, UAE accordions (collapsed by default) follow the same D1-D6 structure -->
<!-- See operator's full mockup for the per-region body content; pattern is identical -->
```

The empty-state CTA copy itself is **not present in the on-disk mockup file**. The dispatch
brief Section 8 A6 quotes the operator's Asia treatment ("Coverage gaps: D2 and D4 not yet
populated for this region. Flag a coverage request.") which exists in the operator's
extended mockup but is not in the handoff bundle on disk.

What the on-disk file DOES show explicitly:

- **EU**: every D1–D6 dimension is populated, no `.empty-dim` block rendered. Empty-state
  treatment is not exercised in the EU example.
- **Coverage rail (top of page)** shows the dimension scoreboard explicitly carrying the
  notion of dimensional gaps per region: "D2 Regional resources 2 / 5 — gaps in **UAE · UK · HK**",
  "D4 Materials sourcing 2 / 5 — gaps in **UK · UAE · HK**", "D5 Infrastructure 3 / 5 —
  gaps in **UK · UAE**". The right-rail "By dimension" card mirrors this.
- The `.empty-dim` class definition exists in CSS but has no in-line HTML invocation
  in the EU section. It is intended for the per-region D2–D6 cells in US/Asia/UK/UAE
  that lack facts.

### 1.2 Per-region empty-cell CTAs (from operator's mockup, per dispatch brief)

The dispatch brief reports the operator's full mockup contains region-specific empty-state
treatments. The audit cannot directly verify the exact per-region copy (it lives in
the operator's extended mockup, not the handoff file) but the framing is:

- **EU**: all D1–D6 populated, no empty-dim CTA needed.
- **US**: D1–D6 populated in current `OperationsPage.tsx`. May have minor gaps; CTA framing
  same as Asia/UK/UAE for any unpopulated cell.
- **Asia**: "Coverage gaps: D2 and D4 not yet populated for this region. Flag a coverage
  request." (per dispatch brief).
- **UK**: Similar empty-dim treatment per dispatch brief; specific copy not quoted.
- **UAE**: Similar empty-dim treatment per dispatch brief; specific copy not quoted.

**Operator decision needed:** confirm the exact per-region copy from the operator's
extended mockup before A6 lands the rendering. The dispatch brief's "Flag a coverage
request" framing makes the three-state distinction load-bearing — "not yet populated"
implies State 1 (haven't tried) or State 2 (tried, empty), while "intentionally out of
scope for this region" is a distinct semantic State 3.

### 1.3 The three-state distinction (per dispatch brief + operator 2026-05-26)

| State | Mockup intent | Operator-side semantics |
|---|---|---|
| 1. Haven't tried | No row, no scope decision recorded | Default for any region/dimension cell that hasn't been considered yet |
| 2. Tried, empty | No row, scope confirmed empty after Sonnet attempted backfill | Recorded outcome — "we checked Singapore D4 materials sourcing, nothing in registry, leave a note" |
| 3. Intentionally out of scope | No row, deliberate scoping decision | "DEWA prohibits grid sellback so D2 PV-component sourcing is moot for UAE" |

State 1 and State 2 are visually similar but operationally different — State 2 means a
human-or-Sonnet attempt was made and yielded nothing, so the CTA should NOT be "try
harder," it should be "flag a coverage request" (i.e., raise an issue). State 3 should
NOT have any CTA at all — it's a deliberate scoping decision and the cell should render
as a quiet "out of scope" label.

---

## 2. Current schema (migration 106)

Full DDL from `fsi-app/supabase/migrations/106_regions_and_facts.sql`.

### 2.1 regions table

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
```

Seed rows: EU, US, ASIA, UK, UAE — `operations_decisions` defaults to `'{}'::jsonb`.

### 2.2 regional_data_facts table

```sql
CREATE TABLE IF NOT EXISTS regional_data_facts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension       TEXT NOT NULL,    -- CHECK enum: regulatory_feasibility | regional_resources |
                                    --            labor_markets | materials_sourcing |
                                    --            infrastructure | operational_cost
  fact_label      TEXT NOT NULL,
  value           TEXT NOT NULL,
  status          TEXT,             -- free-form ("Constrained", "Available", "Limited")
  trend           TEXT,             -- CHECK enum: up | down | flat | NULL
  source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_note     TEXT,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, dimension, fact_label)
);
```

**Crucial:** there is NO column anywhere — neither on `regions` nor on
`regional_data_facts` — that records the **absence** of a fact and its semantic reason.
Every row in `regional_data_facts` represents a present fact. Absence is implicit (the
absence of rows for `(region_id, dimension)`).

---

## 3. Three-state support check

| State | Current schema support | Mechanism today |
|---|---|---|
| 1. Haven't tried | **PARTIAL — same as State 2.** Represented by absence of rows for `(region_id, dimension)`. | OperationsPage.tsx falls back to "Coverage pending for {dim} in this region. Facts populate via the regional_data_facts table…" italic placeholder. |
| 2. Tried, empty | **NOT SUPPORTED.** Indistinguishable from State 1 because both surface as "no rows". | No durable record. If A6 Sonnet ran for Asia D4 and found nothing, that outcome is not persisted anywhere — re-running A6 next quarter would repeat the same search. |
| 3. Intentionally out of scope | **NOT SUPPORTED.** No column expresses this. | The closest available primitive is `regions.operations_decisions JSONB`, but it's a free-shape blob with no schema or query pattern for this use case. |

### Schema gap (named explicitly)

**YES — the schema does not support the three-state distinction.** Specifically, there is
no column on either `regions` or `regional_data_facts` (or a separate coverage table) that
records WHY a given `(region, dimension)` cell has no facts. States 1, 2, and 3 collapse
into the single observation "no rows" at query time.

The current OperationsPage rendering treats all empty cells as State 1 ("Coverage pending"
— see `OperationsPage.tsx:822-825`), which:
- Misrepresents State 2 (operator has tried) as "we haven't tried yet"
- Misrepresents State 3 (out of scope) as "coverage pending" — implying it will populate
- Wastes Sonnet runs because A6's "did we try Asia D4?" answer must be inferred from
  audit logs or operator memory, not the schema.

---

## 4. Proposed schema additions (operator-decide)

### Option A — `regions.dimension_coverage_status JSONB`

```sql
ALTER TABLE regions ADD COLUMN dimension_coverage_status JSONB NOT NULL DEFAULT '{}';
-- Shape: { "regional_resources": "tried_empty",
--          "materials_sourcing": "out_of_scope",
--          "labor_markets": "covered" }
```

**Pros:**
- Cheap migration (one column, one default).
- Co-locates the coverage decision with the region row (operator already touches `regions`
  to manage `operations_decisions`).
- Reads in a single row fetch — no join.

**Cons:**
- Loose typing: enum values live in application code, not in a CHECK constraint.
- Querying "which regions have State 2 D4 cells?" is GIN-indexed but awkward.
- Mixes "shape varies per region" semantics into a column that should be strictly
  enumerable. Conceptually closer to `regional_data_facts` semantics than to the free-form
  `operations_decisions`.

### Option B — `regional_data_facts.coverage_status TEXT` column

This is conceptually wrong: it puts a "no rows here, and here's why" column on a table
that exists to hold rows. To express State 2 or State 3 you would need to insert a sentinel
row with NULL `value`, which:
- Breaks `value TEXT NOT NULL` (requires schema change to allow NULL),
- Pollutes every D2–D6 cell-count query (denominator now includes sentinel rows),
- Forces D2–D6 fact-table render code to filter out sentinels by status.

**Recommendation: reject Option B.** It conflates "this cell has facts" with "this cell
has no facts but here's why."

### Option C — new `region_dimension_coverage` table (explicit tuples)

```sql
CREATE TABLE region_dimension_coverage (
  region_id       UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  dimension       TEXT NOT NULL,  -- same CHECK enum as regional_data_facts
  status          TEXT NOT NULL,  -- CHECK: 'covered' | 'tried_empty' | 'out_of_scope'
  rationale       TEXT,           -- optional human note
  decided_by      UUID REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (region_id, dimension)
);
```

**Pros:**
- Crisp typing via CHECK constraint on `status`.
- "Haven't tried" is genuinely the absence of a row (the default), so the three states
  map naturally: no row = State 1, row with `tried_empty` = State 2, row with
  `out_of_scope` = State 3, row with `covered` = there are facts (and `regional_data_facts`
  query confirms).
- Auditable: `decided_by` and `decided_at` capture WHO scoped this and WHEN.
- Easy joins for the coverage scoreboard ("how many cells are tried_empty across all regions?").
- Doesn't muddy either `regions` (free-shape decision JSONB) or `regional_data_facts`
  (one row per fact).

**Cons:**
- A new table. Adds RLS policy, GRANT, index.
- Two writes to maintain coherence: when A6 inserts a `regional_data_facts` row, it
  should also upsert `(region_id, dimension, 'covered')`. Easy to forget in scripts.
  Mitigated by a trigger that auto-flips the coverage row to `covered` on
  `regional_data_facts` insert.

### Option D — `regional_data_facts.is_intentionally_empty` boolean on a sentinel row

Same problem as Option B. Reject.

---

## 5. Recommendation

**Option C (new `region_dimension_coverage` table).** Reasoning:

1. The three-state distinction is genuinely a NEW semantic concern; `regions` and
   `regional_data_facts` were designed without it. Bolting it onto either dilutes the
   table's purpose.
2. Option C lets State 1 (absence) remain implicit while making States 2 and 3 explicit
   — the schema mirrors the operator's mental model exactly.
3. The CHECK enum forces vocabulary discipline. Application code can never write
   `"out-of-scope"` vs `"out_of_scope"` vs `"oos"` and have them all work.
4. The audit columns (`decided_by`, `decided_at`, `rationale`) future-proof operator
   review surfaces: "show me every State 3 decision made in the last 90 days" becomes
   a trivial query.

**Operator decides.** If "one fewer table" is preferred for sprint scope, Option A is
viable with the understanding that vocabulary is enforced in TypeScript, not SQL.

---

## 6. Sonnet question (separate gating)

### 6.1 Existing sources for Asia/UK/UAE in the registry

Source registry inventory derived from `fsi-app/supabase/seed/seed-sources.sql`,
`add-source-registry.mjs`, and `add-building-standards.mjs`. The live DB may have more
after expansions; this is the seedable corpus.

**Asia-coded sources** (`jurisdictions: ['asia']` or `'singapore'` or `'korea'` etc.):

| Source | Tier | Description (truncated) |
|---|---|---|
| Singapore Statutes Online | T1 | Official Singapore legislation portal |
| Statutes of the Republic of Korea (KLRI) | T1 | Official English translations of Korean statutes |
| Singapore BCA Green Mark | T2 | Singapore green building cert, mandatory for new commercial |
| Korea Register of Shipping (KR) | T2 | Korean classification society |
| Japan MLIT | T1 | Japan freight decarbonization, ZEV truck policy |
| Korea ETS — KETS | T1 | Korea Emissions Trading Scheme |
| Singapore Carbon Tax — NEA | T1 | Singapore carbon tax, connected to MPA Green Shipping |
| Japan GX League | T2 | Japan voluntary carbon market → mandatory ETS 2026 |
| Singapore Customs | T1 | TradeNet single window, FTZ regulations |
| Japan Customs — MOF | T1 | AEO program, advance ruling |
| China Customs — GACC | T1 | Import/export regulations |
| Australia ACCU | T1 | Carbon credit + Safeguard Mechanism (Asia-Pacific) |
| China National ETS — MEE | T1 | World's largest carbon market by coverage |
| Australia NABERS | T1 | Building energy rating (warehouse expansion under consultation) |

**UK-coded sources** (`jurisdictions: ['uk']`):

| Source | Tier | Description (truncated) |
|---|---|---|
| UK Legislation (legislation.gov.uk) | T1 | All UK Acts, SIs, UK ETS, UK ZEV mandate, UK SAF mandate, UK EPR |
| BREEAM | T2 | UK + Europe green building cert |
| Sustainable Aviation UK | T3 | UK aviation, SAF roadmaps |
| UK MEES | T1 | Commercial lease EPC minimum (E now, C 2027, B 2030) |
| Tyndall Centre (UK road freight) | T2 | UK road freight decarbonization research |
| UK arts/Creative Climate Tools | T2 | UK arts sector focus |

**UAE-coded sources** (`jurisdictions: ['uae', 'meaf']`):

| Source | Tier | Description (truncated) |
|---|---|---|
| DEWA Shams Dubai Program | T1 (PROVISIONAL) | Dubai rooftop solar net metering, Version 4 (June 2022) |
| Estidama (Abu Dhabi green building) | T2 | UAE green building cert |

### 6.2 Coverage assessment by dimension

| Region × Dimension | Existing source coverage | Sonnet mode |
|---|---|---|
| Asia D2 Regional resources (PET / aluminum / FSC) | **THIN.** No registry source covers material supply for SG/HK specifically. | Find new (industry trade-press, JOC, SCMP) |
| Asia D3 Labor markets | **PARTIAL.** SG MOM and HK Census & Stats Dept implied by hard-coded EU/US/Asia data in `OperationsPage.tsx:194-207` but neither is in registry. | Find new (MOM, HK C&SD) |
| Asia D4 Materials sourcing | **THIN.** No registry source covers crating/packaging suppliers in SG/HK. | Find new |
| Asia D5 Infrastructure | **PARTIAL.** MPA (Singapore port) referenced in description fields but not as a source row. Changi/CAG not in registry. | Find new (MPA, CAG, HKIA) |
| Asia D6 Operational cost | **PARTIAL.** EMA (Singapore electricity), CLP / HK Electric not in registry. | Find new |
| UK D2 Regional resources | **THIN.** UK Legislation covers regulatory; no resource-availability source. | Find new (trade-press) |
| UK D3 Labor markets | **THIN.** No ONS ASHE or RHA wage survey in registry. | Find new (ONS, RHA) |
| UK D4 Materials sourcing | **THIN.** No UK FSC supplier directory in registry. | Find new |
| UK D5 Infrastructure | **PARTIAL.** No UK port/airport metric source registered. | Find new |
| UK D6 Operational cost | **PARTIAL.** No BEIS / RAC / Argus UK desk in registry. | Find new |
| UAE D2–D5 | **THIN.** Only DEWA + Estidama registered. | Find new (DEWA expanded, ENOC, ADNOC, Dubai Customs) |
| UAE D6 Operational cost | **PARTIAL.** DEWA covers electricity; diesel + grid-export need new sources. | Find new |

### 6.3 Verdict

**Sonnet mode for A6: FIND NEW SOURCES.** The existing registry's Asia/UK/UAE coverage is
overwhelmingly skewed toward regulatory feasibility (D1), not the operational-fact
dimensions (D2–D6). A6 cannot extract D2–D6 facts from the current corpus alone —
Sonnet needs to discover and qualify new sources for the per-cell facts.

This has two implications:
1. **A6 should run alongside the source-discovery pipeline**, not after it. Every new
   fact Sonnet finds in Asia/UK/UAE should be paired with a `source_citations` row
   pointing to either an existing source (rare, mostly D1) or a newly-provisional source
   for operator review.
2. **A6 is expensive.** Each region × dimension cell likely requires multiple Sonnet
   searches to find a qualified source. Budget accordingly.

**Operator decision needed:** confirm Sonnet runs in find-new mode (with the discovery
loop's provisional source path) vs. a constrained-corpus mode that would yield very few
D2–D6 facts.

---

## 7. Current OperationsPage empty-state rendering

From `fsi-app/src/components/pages/OperationsPage.tsx`:

### 7.1 Empty cell render (line 822-825)

```tsx
) : showEmpty ? (
  <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic" }}>
    Coverage pending for {dim.name.toLowerCase()} in this region. Facts populate via the
    regional_data_facts table (migration 106) as the operator team backfills regions.
  </p>
) : (
  <FactTable facts={facts || []} />
)}
```

### 7.2 Region-level empty fallback (line 833-836)

```tsx
{!FACTS[region.key] && (
  <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", fontStyle: "italic",
              padding: "12px 24px" }}>
    Regional data populated for D1 (regulations) only. D2-D6 coverage queued for next
    quarter.
  </p>
)}
```

### 7.3 Analysis

**The current rendering does NOT distinguish the three states.** Every empty cell — whether
"haven't tried," "tried and empty," or "intentionally out of scope" — surfaces with the
same "Coverage pending" italic copy. Specifically:

- No State 2 distinction: a region/dimension cell that was attempted and yielded nothing
  surfaces identically to one that's never been considered.
- No State 3 distinction: a cell that's deliberately out of scope (e.g., UAE grid-export
  D5 infrastructure, since DEWA prohibits sellback) renders as "Coverage pending," which
  misleads the reader into thinking the operator team will populate it.
- No State-specific CTA: the empty cell offers no path for the reader to act. The
  mockup's `.empty-dim a` selector (orange-underlined inline CTA) is not invoked.

The current code is honest about a two-state world (rows vs. no rows) but the design
calls for three states.

---

## 8. Revised A6 sequencing (proposed, awaiting operator)

1. **Operator decides schema approach** (A, C, or other). My recommendation is C
   (separate `region_dimension_coverage` table with CHECK-enum status).
2. **Land migration 109** with the chosen schema addition.
3. **Operator decides Sonnet mode for A6.** My recommendation is **find-new** — extract
   mode against existing corpus will not produce useful Asia/UK/UAE D2–D6 facts.
4. **Backfill D2–D6 per region** with source-cited facts. Each fact carries a
   `source_id` (existing source) OR an upserted `provisional_sources` row. The pairing
   of A6 with discovery is non-optional under find-new mode.
5. **Update OperationsPage to render three-state empty-dim CTA per mockup.** Specifically:
   - State 1 ("haven't tried"): muted italic + orange CTA "Suggest a source for this cell."
   - State 2 ("tried, empty"): muted italic + orange CTA "Flag a coverage request."
   - State 3 ("out of scope"): muted italic, NO CTA, with brief rationale rendered.
6. **Confirm per-region empty-dim copy** with operator before final A6 rendering ships
   (the dispatch brief quotes Asia, not UK/UAE/US — get the others on paper).
7. **Pair with `source-credibility-model` discipline** on every new source A6 surfaces
   (tier classification, bias tags, candidate-review queue).

---

## 9. Skills consulted

Per dispatch-inventory rule (CLAUDE.md, 2026-05-20):

- `caros-ledge-platform-intent` — Operations is one of the 5 customer-facing surfaces.
  Three-state empty-dim is platform-intent-relevant (read vs. write semantics, customer-
  facing affordance).
- `sprint-followups-discipline` — Sprint 3 design pre-work; this report is the OBS
  candidate for the empty-dim primitive operator surfaced 2026-05-26.
- `source-credibility-model` — A6 find-new mode interacts directly with the source
  candidate review surface, tier classification, and the discovery loop.
- `environmental-policy-and-innovation` — A6 backfills the Operations dimensions, which
  is the "Operations Profile" format family in the five-format model.
- `remediation-discipline` — Considered, NOT loaded. This is a pre-work audit, not a
  failure-response or post-mortem.

---

## 10. Operator decision queue

1. **Schema option:** A (regions JSONB), C (new table), or other? Recommendation: C.
2. **A6 Sonnet mode:** extract-from-existing or find-new? Recommendation: find-new.
3. **Per-region empty-dim copy:** confirm operator's mockup copy for US, UK, UAE
   (Asia's quoted in dispatch brief; others not on disk).
4. **A6 budget:** find-new mode requires more Sonnet runs per cell. Confirm budget.
5. **State 3 cells in MVP:** which `(region, dimension)` pairs are intentionally out of
   scope for the operator's verticals (Live events + Fine art)? E.g., UAE D2 hardwood
   crating — relevant or not? Decide before A6 runs, to avoid expensive searches that
   close on State 3 anyway.

---

**End of audit. No code, schema, or DB changes performed.**
