# `source_type` Taxonomy Column — Design Proposal

**Status:** Design proposal · doc-only PR (no schema changes, no code edits)
**Author:** Track E architecture agent · 2026-05-08
**Master HEAD:** `1340978`
**Related:** `docs/MONITORING-STATUS-2026-05-08.md` (the gap evidence) · `fsi-app/src/lib/coverage-gaps.ts` (the regex stopgap to be replaced) · `fsi-app/supabase/migrations/004_source_trust_framework.sql` (the schema this extends)

---

## 1. Problem statement

The Map · Coverage gaps card and any future Research / Admin coverage surface depend on classifying every active source as either an **environmental body** or a **legislature** in order to compute per-jurisdiction `covered` / `partial` / `gap` counts. Today the classifier is a **regex matcher** that pattern-matches on the concatenated `name + url` blob (`fsi-app/src/lib/coverage-gaps.ts`, lines 57–87).

The matcher set is intentionally broad but biased toward Anglo regulator naming. The result is documented in `docs/MONITORING-STATUS-2026-05-08.md` § 1:

> 28 of the 129 Tier 1 priority jurisdictions are flagged `partial` largely because the matcher misses non-Anglo regulator naming.

Concrete false-flag examples already documented in monitoring status:

| ISO | False-flag | Why the regex misses |
|---|---|---|
| FR | missing `leg` | "Assemblée Nationale" / "Sénat" don't match `legis|parliament|assembly|senate|congress|bundestag|duma|diet` (assembly is Anglo-only — Assemblée loses the diacritic) |
| DE | missing `leg` (sometimes) | "Bundestag" matches, but state-level Landtag / Bundesrat don't |
| ES, PT, IT, NL, PL, AT, BE, CZ, HR, LV, LT, LU, RO, SK, SI | missing `env` | MITECO / IPMA / ISPRA / RIVM / GIOŚ / Umweltbundesamt AT / SPF Santé / Český hydrometeorologický ústav / DZS / Aplinkos ministerija / Administration de l'environnement / ANPM / SAŽP / ARSO — none match `epa|environment|ecology|climate|defra|eea|natural-resources|conservation` because the regex assumes English roots |
| JP | missing `leg` | "Diet" matches, but Japanese-language source URLs (e.g. shugiin.go.jp / sangiin.go.jp) don't |
| CA-QC | missing `env` | Provincial environment ministry MELCCFP doesn't match any pattern |

Because the regex is a stopgap that lives in the read path, **fixing it correctly for every jurisdiction in scope is not a regex problem**. The durable fix is a **structured classification tag** populated once at write time and queried with a simple `IN (...)` filter on the read path. Adding more regex patterns is the same architectural debt with more lines.

This proposal extends the `sources` table with a `source_type` taxonomy column, derives values for the ~718 existing rows, sets values explicitly on new inserts, and refactors `coverage-gaps.ts` to query the structured tag.

---

## 2. Current schema

`sources` table (migration 004, lines 28–96 in `fsi-app/supabase/migrations/004_source_trust_framework.sql`):

| Column | Type | Role |
|---|---|---|
| `id` | UUID PK | identity |
| `name` | TEXT | display name (e.g., "Federal Register", "Assemblée Nationale") |
| `url` | TEXT | canonical URL |
| `description` | TEXT | human-readable description (often hints at category but unstructured) |
| `tier` | INT 1–7 | trust tier — orthogonal to type. T1 is "official legal text"; many env bodies and legislatures both qualify as T1 |
| `intelligence_types` | TEXT[] | content tags: `REG`, `STD`, `MKT`, `IND`, `RES`, `INN`, `SUP`. **Not the same axis as type-of-body.** A regulator publishes REG; a research institute also publishes REG sometimes |
| `domains` | INT[] | which of the 7 platform domains this source feeds |
| `jurisdictions` (deprecated free-text) | TEXT[] | `'us'`, `'eu'`, `'global'`, etc. — superseded by `jurisdiction_iso` per migration 033 |
| `jurisdiction_iso` | TEXT[] | ISO codes (`'US-CA'`, `'DE'`, `'GB'`) — added migration 033 |
| `transport_modes` | TEXT[] | `air|road|ocean|rail` |
| `access_method` | TEXT | how the worker fetches: `api|rss|scrape|gazette|manual` — **structurally close to `source_type` but different axis**: a gazette is an access pattern (PDF/HTML polling), not a type of body |
| `tier`, `tier_at_creation` | INT 1–7 | trust tier |
| `status` | TEXT | `active|stale|inaccessible|provisional|suspended` |
| `admin_only` | BOOLEAN | gate workspace-facing reads (migration 017) |
| `paywalled` | BOOLEAN | content access |
| trust metrics | numeric | computed over time |

**Confirmation: there is no `source_type` column today.** `intelligence_types`, `access_method`, `tier`, and `domains` are the columns adjacent to type-of-body but none of them encode it. The `coverage-gaps.ts` regex is currently the only place where "is this an environmental body?" is decided, and it decides at read time on every cache miss.

---

## 3. Proposed enum values

Eleven values. Each carries a one-line definition, example sources from the existing registry, and example regex patterns the current matcher uses (where applicable) so the mapping back to `coverage-gaps.ts` is explicit.

| Value | Definition | Examples (real registry rows) | Maps to current matcher |
|---|---|---|---|
| `environmental_body` | Government environmental regulator or environment ministry/agency. Issues environmental rules, enforces environmental law, publishes air-quality / emissions / inventory data. | US EPA, Defra, EEA, Umweltbundesamt (DE), MITECO (ES), Naturvårdsverket (SE), CARB, ECCC, MELCCFP (CA-QC), RIVM (NL), Brussels Environment, EPA Ireland, Miljøministeriet (DK) | yes — `ENV_BODY_PATTERNS` |
| `legislature` | National, sub-national, or supra-national legislative body. Passes laws (acts/statutes/directives). The body, not the gazette. | Bundestag, Assemblée Nationale, Sénat, US Congress, California State Legislature, UK Parliament, Diet (JP), Folketinget (DK), Eduskunta (FI), Riksdag (SE), Tweede Kamer (NL), Oireachtas (IE), Sejm (PL) | yes — `LEGISLATURE_PATTERNS` |
| `gazette` | Official publication of legal text (regulations, decrees, notices). The journal, not the body. Federal Register, Diário Oficial, EUR-Lex, Gazette of India. | Federal Register, Regulations.gov, EUR-Lex, Diário Oficial da União, eGazette India, NPC China law database, Singapore Statutes Online, Statutes of Korea, Ley Chile, UK Legislation | implicit (current matcher conflates with legislature; should be its own type) |
| `regulatory_executive` | Executive-branch regulator that is NOT environmental: customs, transport, energy, aviation, maritime, occupational safety. Issues binding rules outside the environmental remit. | US DOT, FAA, FMCSA, US Customs (CBP), CARB (also `environmental_body` — see § 3.1), EU EMSA, EU EASA, IMO Secretariat, ICAO, FERC, US EIA | partial — currently slips through both matchers |
| `judiciary` | Courts and tribunals issuing binding rulings on environmental / freight regulation. Mostly relevant for high-impact precedent (CJEU, US Supreme Court CBAM cases). | CJEU (EU Court of Justice), US Supreme Court, EU General Court | not currently matched |
| `standards_body` | Standards organizations (de jure or de facto) that publish technical standards relevant to freight emissions accounting / vehicle / fuel / packaging. | ISO (14083), IEC, IMO MEPC outputs, GHG Protocol, GLEC Framework / Smart Freight Centre, ICAO CORSIA standards | not currently matched (sometimes overlaps with `treaty_org`) |
| `industry_assoc` | Industry / trade associations representing operators (forwarders, airlines, shippers, road carriers). Positions, interpretation, sometimes voluntary standards. | FIATA, IATA, CLECAT, IRU, TIACA, ESPO, AAPA, CDP Supply Chain (industry-driven disclosure platform) | not currently matched |
| `treaty_org` | Intergovernmental organizations created by treaty: UN system, OECD, EU institutions when acting in non-regulatory capacity. Multilateral coordination, not direct rulemaking. | UNFCCC, ITF (OECD transport arm), World Bank Carbon Pricing Dashboard, IEA, IRENA, UNEP, WMO | partial — currently treated as legislatures sometimes via name match |
| `research_institute` | Universities, national labs, think tanks publishing primary research and policy analysis. Tier 4–5 sources. | MIT Climate Machine, NREL, ICCT, Sabin Center for Climate Change Law, Stockholm Environment Institute, Tyndall Centre, ECOLEX, Climate Change Laws of the World | not currently matched |
| `news` | Trade press and journalism. Tier 6 sources. | FreightWaves, Lloyd's List, The Loadstar, Splash247, JOC, TradeWinds, Reuters Sustainable Business | not currently matched |
| `data_aggregator` | Aggregators / datasets that index across primary sources. Closer to "tooling" than a primary source. | World Bank Carbon Pricing Dashboard, Climate Change Laws of the World, ECOLEX, IEA Policies and Measures Database, EIA Open Data API, EUR-Lex SPARQL endpoint | not currently matched |

### 3.1 Overlap cases

A small set of sources legitimately belong to two categories. The most common overlap pattern is **"executive agency that is also the environmental regulator"**:

| Source | Categories |
|---|---|
| US EPA | `environmental_body`, `regulatory_executive` |
| CARB (California Air Resources Board) | `environmental_body`, `regulatory_executive` |
| ECCC (Environment and Climate Change Canada) | `environmental_body`, `regulatory_executive` |
| Defra (UK) | `environmental_body`, `regulatory_executive` |
| EU DG CLIMA | `environmental_body`, `treaty_org` (it's a Commission directorate) |
| EMSA (THETIS-MRV) | `regulatory_executive`, `data_aggregator` |
| World Bank Carbon Pricing Dashboard | `treaty_org`, `data_aggregator` |
| IMO MEPC | `treaty_org`, `standards_body` |
| ICAO CORSIA | `treaty_org`, `standards_body` |
| ECOLEX | `treaty_org`, `data_aggregator`, `research_institute` |
| World Bank | `treaty_org`, `data_aggregator` |
| CDP Supply Chain | `industry_assoc`, `data_aggregator` |
| Smart Freight Centre / GLEC | `industry_assoc`, `standards_body` |

Coverage-gaps semantics for overlap: **a source counts as `environmental_body` for coverage purposes if it carries that tag in its `source_type` array, regardless of what other tags it carries.** Same for `legislature`. Multi-type is the norm, not the exception, especially for T1–T2 institutional sources.

---

## 4. How `source_type` is set

Three populating mechanisms, applied in order.

### 4.1 At insert time (the durable mechanism)

Every Tier 1 wave script in `fsi-app/scripts/tier1-*-execute.mjs` already groups its inserts by category in code comments. For example, `tier1-eu-western-nordic-execute.mjs` lines 26–35:

```
DE: Umweltbundesamt + Bundestag (2)
FR: MITECO + Assemblée Nationale + Sénat (3)
NL: RIVM + Tweede Kamer (2)
…
```

The category is implicit in the script's structure. Making it explicit in the payload is a one-line change per source:

```javascript
// Today
const COMMON = {
  tier: 1, tier_at_creation: 1, status: "active", admin_only: false,
  jurisdictions: [], domains: [1], access_method: "scrape",
  update_frequency: "weekly",
};

// After
const COMMON = { /* same as today */ };
const ENV_BODY = { ...COMMON, source_type: ["environmental_body"] };
const LEGISLATURE = { ...COMMON, source_type: ["legislature"] };
// …per-source overrides for overlap cases
```

Each insert call then references the appropriate constant. The scripts already group source rows by category in comments — making the grouping a payload field instead of a comment is rote.

### 4.2 Retroactive backfill (one-shot)

For the ~718 existing active sources, derive `source_type` from URL/name patterns. **The same heuristics as `coverage-gaps.ts` today, plus the wider matcher set § 5.2 below — but resolved exactly once at write time and stored.** A backfill script (proposed `fsi-app/scripts/source-type-backfill.mjs`, NOT delivered in this PR) walks every active row, derives a source_type array, writes it, and reads it back.

The investigation script delivered in this PR (§ 6.4) classifies the registry against a draft heuristic and reports per-row confidence. The backfill script consumes that output.

### 4.3 Manual review queue

Sources where heuristic confidence is `low` (≈120 rows estimated — see § 6) get flagged for human review via a `platform_flags` row (category `data_quality`, subject_type `source`). The flag carries `recommended_actions` as a JSONB array of candidate `source_type` arrays, picked from the AI-recommended classification cache that already exists at `provisional_sources.recommended_classification` (migration 015). Resolver picks one in `/admin → Platform flags`.

### 4.4 Multi-type vs single-type

**Recommendation: TEXT[] (multi-type).** Rationale:

1. **Reality favors it.** § 3.1 documents 13 unambiguous overlap cases out of just the seed file's ~30 institutional sources. At 718-source scale the overlap rate looks like 8–15%.
2. **Coverage-gaps semantics are set-membership, not equality.** The current regex returns "is the env-body pattern present?" — multi-type with `'environmental_body' = ANY(source_type)` is the same shape.
3. **Existing array columns set the precedent.** `intelligence_types`, `domains`, `jurisdictions`, `jurisdiction_iso`, `transport_modes` are all TEXT[] / INT[] in the schema. A scalar enum would be an outlier.
4. **GIN index works.** Existing `jurisdictions` / `transport_modes` already use GIN; query patterns are identical.
5. **Reversibility.** If the platform ever decides to flatten to a primary `source_type`, the migration is trivial (`source_type[1]` → scalar). Going the other direction is a schema rewrite.

A single-type enum would force CARB / EPA / Defra / EMSA into one bucket and lose the "is it an environmental body?" signal whenever the row's primary classification is `regulatory_executive`. The current regex is a multi-axis OR query (env OR legislature on the same row blob) — single-type breaks that.

---

## 5. Schema migration design

Proposed migration 049, full SQL:

```sql
-- ══════════════════════════════════════════════════════════════
-- Migration 049: source_type taxonomy column
-- ══════════════════════════════════════════════════════════════
--
-- Replaces the regex-based env_body / legislature matcher in
-- `lib/coverage-gaps.ts` with a structured tag populated once
-- at write time. See docs/SOURCE-TYPE-TAXONOMY-PROPOSAL.md for
-- the full design rationale.
-- ══════════════════════════════════════════════════════════════

-- 1. Add the column with empty default (rows are populated by
--    the backfill script in step 2, after this migration applies).

ALTER TABLE sources
  ADD COLUMN source_type TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- 2. Validity check via CHECK constraint. The 11 values match
--    docs/SOURCE-TYPE-TAXONOMY-PROPOSAL.md § 3 exactly. Multi-
--    type (overlap cases) is allowed by design — see § 3.1.

ALTER TABLE sources
  ADD CONSTRAINT sources_source_type_valid CHECK (
    source_type <@ ARRAY[
      'environmental_body',
      'legislature',
      'gazette',
      'regulatory_executive',
      'judiciary',
      'standards_body',
      'industry_assoc',
      'treaty_org',
      'research_institute',
      'news',
      'data_aggregator'
    ]::TEXT[]
  );

-- 3. GIN index for the ANY() query pattern that
--    coverage-gaps.ts will use after refactor.

CREATE INDEX idx_sources_source_type ON sources USING GIN(source_type);

-- 4. Documentation comment.

COMMENT ON COLUMN sources.source_type IS
  'Type-of-body taxonomy. Multi-valued because many T1-T2 sources legitimately fit two categories (e.g. EPA = environmental_body + regulatory_executive). Populated at insert time via Tier 1 dispatch scripts. Backfilled retroactively for pre-049 rows by scripts/source-type-backfill.mjs. See docs/SOURCE-TYPE-TAXONOMY-PROPOSAL.md.';
```

### 5.1 Why `TEXT[]` with CHECK rather than a Postgres ENUM

Three reasons:

1. **ENUM additions are awkward.** Adding a value to a Postgres ENUM requires `ALTER TYPE … ADD VALUE` which can't run inside a transaction (`ALTER TYPE … ADD VALUE` semantics). New categories will surface — the discipline cost of ENUM evolution is higher than CHECK constraint evolution.
2. **Multi-type requirement.** ENUMs work with scalar columns. `ENUM[]` is supported but rarely seen, and the tooling story (Supabase types codegen, RLS predicates, JSON serialization) is better-trodden for `TEXT[] CHECK <@`.
3. **Consistency with other taxonomy columns.** `intelligence_types`, `jurisdictions`, `transport_modes` all use TEXT[] without ENUM. Future maintainers walking the schema see one pattern.

### 5.2 Why GIN, not B-tree

The query pattern is `'environmental_body' = ANY(source_type)`. GIN supports this directly via the `&&` (overlap) and `@>` (contains) operators, which Postgres rewrites `ANY` into. B-tree on a TEXT[] column would only support equality on the whole array, which is the wrong operation. The existing `idx_sources_jurisdictions` and `idx_sources_transport` GIN indexes set the precedent.

---

## 6. Backfill approach

### 6.1 Script structure

Per the dispatch-discipline rule in `fsi-app/.claude/CLAUDE.md`, the backfill is two phases:

**Phase A — read-only investigation** (`fsi-app/scripts/source-type-categories-investigate.mjs`, **delivered in this PR** — see § 6.4): walk every active source, derive a candidate `source_type` from URL+name+description+notes, classify confidence as `high` / `medium` / `low`, write findings to `docs/source-type-backfill-investigation.json`. No DB writes. Output drives Phase B's authorized scope.

**Phase B — authorized write** (`fsi-app/scripts/source-type-backfill.mjs`, NOT in this PR — to be authored after migration 049 lands): consume the investigation JSON, write `source_type` to every `high` / `medium` confidence row, leave `low` rows empty, file a `platform_flags` row per `low` row. Per-step verification per the CLAUDE.md dispatch-discipline rule: read row, derive, write, read-back, halt on mismatch. Idempotent — re-running on rows that already have a non-empty `source_type` is a no-op.

### 6.2 Heuristic specification

The investigation script in § 6.4 implements this heuristic in code. Summarized here:

| Source signal | Confidence | Derivation |
|---|---|---|
| URL host matches `epa.gov`, `defra.gov.uk`, `eea.europa.eu`, `umweltbundesamt.*`, `ecologie.gouv.*`, `environment.*`, `*.miljoministeriet.*`, ECCC pattern | `high` | `environmental_body` |
| Name contains "EPA", "Environment Agency", "Environmental Protection", "Ministry of Environment", "Environment Ministry", "Naturvårdsverket", "Umweltbundesamt", "Defra" | `high` | `environmental_body` |
| URL host matches `parliament.*`, `congress.gov`, `bundestag.de`, `assemblee-nationale.fr`, `senat.fr`, `riksdagen.se`, `legislature.*` | `high` | `legislature` |
| Name contains "Parliament", "Congress", "Bundestag", "Assemblée", "Sénat", "Diet", "Riksdag", "Folketinget", "Sejm", "Tweede Kamer", "Eduskunta", "Oireachtas", "Knesset" | `high` | `legislature` |
| URL host matches `federalregister.gov`, `eur-lex.europa.eu`, `egazette.gov.in`, `gov.br/...diario-oficial`, `flk.npc.gov.cn`, `legislation.gov.uk`, `sso.agc.gov.sg`, `bcn.cl/leychile` | `high` | `gazette` |
| Name contains "Gazette", "Federal Register", "Official Journal", "Diário Oficial", "Statutes", "Legislation" | `high` | `gazette` |
| URL host matches `imo.org`, `icao.int`, `unfccc.int`, `oecd.org`, `worldbank.org`, `iea.org`, `irena.org`, `unece.org`, `unep.org` | `high` | `treaty_org` |
| URL host matches `iso.org`, `iec.ch`, `ghgprotocol.org`, `smartfreightcentre.org` | `high` | `standards_body` |
| URL host matches `fiata.org`, `iata.org`, `clecat.org`, `iru.org`, `tiaca.org`, `cdp.net` | `high` | `industry_assoc` |
| URL host matches `theicct.org`, `climate.law.columbia.edu`, `tyndall.ac.uk`, `mit.edu`, `nrel.gov`, `lse.ac.uk`, `climate-laws.org`, `ecolex.org` | `high` | `research_institute` |
| URL host matches `freightwaves.com`, `lloydslist.com`, `theloadstar.com`, `splash247.com`, `joc.com`, `tradewindsnews.com`, `reuters.com` | `high` | `news` |
| URL host matches `regintel-content.thomsonreuters.com`, `cdp.net`, `carbonpricingdashboard.worldbank.org`, `iea.org/policies` | `high` | `data_aggregator` (often co-tagged) |
| Tier == 1 AND URL is `*.gov.*` AND name contains "Department of Transport", "Customs", "Aviation Administration", "Maritime", "Coast Guard", "Energy" | `medium` | `regulatory_executive` |
| Tier 4–5, "research", "centre", "institute", "lab", "council on" in name | `medium` | `research_institute` |
| Tier == 6 | `medium` | `news` (default for that tier) |
| Nothing matches | `low` | leave empty, file platform_flag |

### 6.3 Estimated backfill scope

Anchoring on the monitoring-status doc (`docs/MONITORING-STATUS-2026-05-08.md`):

- Active non-admin sources: **718**
- Sources successfully matched by today's `coverage-gaps.ts` regex (env_body OR legislature): roughly **540** (the 84 covered + 28 partial × proportional source counts, plus all upstream T1-T6 institutional rows that the regex picks up). Order of magnitude.
- Sources the heuristic in § 6.2 should derive `high` confidence on: **~600** — adds the gazette / standards_body / treaty_org / news / industry_assoc / research_institute hosts that are deterministically identifiable by URL host (the ~80 institutional T1–T6 rows from the seed file) plus the ~520 Tier 1 wave rows whose insert scripts already grouped them by category.
- Sources requiring manual review (`low` confidence): **~120**. Mostly: provisional sources promoted recently, sub-national rows where the URL host is ambiguous (state-info portals, country-info aggregator subdomains), non-English regulator rows where the name doesn't contain any matched English token AND the URL host isn't on the deterministic list.

The investigation script in § 6.4 produces the exact count once run against live DB. Numbers above are estimates from sampling the seed file and the monitoring-status doc.

### 6.4 Investigation script (delivered in this PR)

`fsi-app/scripts/source-type-categories-investigate.mjs` — read-only. Output: `docs/source-type-backfill-investigation.json`.

The script does NOT write to the DB. It connects with the service role key (or anon key if service role is missing — read-only is safe), pulls every active+non-admin source row, derives a candidate `source_type` array via the heuristic in § 6.2, classifies confidence, and emits a JSON summary. Operators run it before authorizing migration 049 to confirm the sample-size estimates above hold against live data.

---

## 7. Coverage-gaps.ts refactor

Current shape (`fsi-app/src/lib/coverage-gaps.ts` lines 57–94, 134–183):

```typescript
const ENV_BODY_PATTERNS: ReadonlyArray<RegExp> = [
  /\bepa\b/i,
  /environment(al)?/i,
  /ecology/i,
  // … 12 more patterns
];

const LEGISLATURE_PATTERNS: ReadonlyArray<RegExp> = [
  /legis/i,
  /parliament/i,
  // … 7 more patterns
];

function rollupRegions(rows: SourceRow[]): RegionCoverage[] {
  for (const row of rows) {
    const text = `${row.name || ""} ${row.url || ""}`;
    const isEnv = matchesAny(text, ENV_BODY_PATTERNS);
    const isLeg = matchesAny(text, LEGISLATURE_PATTERNS);
    // …
  }
}
```

After refactor (sketch — this PR does NOT deliver it):

```typescript
// Pull source_type from the DB instead of regex-matching name+url.

interface SourceRow {
  source_type: string[] | null;   // ← new: replaces text-blob match
  jurisdictions: string[] | null;
}

async function fetchActiveSourceRows(): Promise<SourceRow[]> {
  const { data, error } = await supabase
    .from("sources")
    .select("source_type, jurisdictions")
    .eq("status", "active")
    .eq("admin_only", false);
  // …
}

function rollupRegions(rows: SourceRow[]): RegionCoverage[] {
  for (const row of rows) {
    const types = Array.isArray(row.source_type) ? row.source_type : [];
    const isEnv = types.includes("environmental_body");
    const isLeg = types.includes("legislature");
    // … rest unchanged
  }
}
```

**Net change:** ~50 lines deleted (the two regex pattern lists + `matchesAny`), ~5 lines added. The `rollupRegions` function shape is identical except it reads a structured field instead of regex-matching text. Per-row work goes from ~22 regex evaluations to two array `includes` calls — measurably faster, though that's incidental; correctness is the gain.

The 28 false-flag partials documented in `docs/MONITORING-STATUS-2026-05-08.md` § 1 collapse once `source_type` is populated correctly. The 16 hard gaps (MENA / Latam / Africa) remain as gaps — those are real registry holes, not classifier failures.

---

## 8. Implementation order

Strictly sequential. Each step verifies before the next runs.

1. **Migration 049 — schema.** Apply via Supabase SQL editor or `npx supabase migration up --linked`. Verifies via `\d sources` showing the new column + CHECK + GIN index. **Cost: XS.**
2. **Investigation script run** (delivered in this PR). Run from a worktree with `.env.local`. Output goes to `docs/source-type-backfill-investigation.json`. Operator reviews the `low` confidence rows manually before Phase B. **Cost: XS (already delivered).**
3. **Backfill script** (`fsi-app/scripts/source-type-backfill.mjs`, NOT in this PR — separate PR after 049 lands). Per-step verification: read row → derive → write → read-back. Halts on first mismatch. Idempotent. **Cost: S** (~150 lines, mirrors `pr-a1-execute.mjs` pattern).
4. **Refactor `coverage-gaps.ts`** to query `source_type` instead of regex. ~50 lines deleted, ~5 added. Verify by snapshot-comparing the per-region rollup before and after — `covered` and `partial` numbers shift toward `covered` for the 28 false-flagged jurisdictions. **Cost: XS.**
5. **Update Tier 1 wave scripts** (`fsi-app/scripts/tier1-*-execute.mjs`) to pass `source_type` on every insert. ~10 scripts, ~1 line each — the `COMMON` constant grows a `source_type` field, and per-call payloads pass an array of values. **Cost: XS.**
6. **Document the agent contract.** Add a CLAUDE.md section: "Every new source insert MUST include `source_type`. Provisional source promotion (`/api/admin/sources/promote`) MUST set `source_type` from `recommended_classification` or operator input." **Cost: XS.**

Steps 1–3 must run before step 4 (refactor depends on populated data). Step 5 can run in parallel with 3–4. Step 6 can run any time after step 1.

---

## 9. Effort estimate

**Total: M** (1–2 working days end-to-end including investigation + manual review of the ~120 low-confidence rows + Tier 1 script updates).

| Step | Effort | Notes |
|---|---|---|
| Migration 049 | XS | ~30 lines SQL, follows existing migration patterns |
| Investigation script run + review | XS | already delivered in this PR; running it on live DB is one command |
| Backfill script | S | ~150 lines, clones `pr-a1-execute.mjs` shape; per-step verify |
| Coverage-gaps refactor | XS | net deletion |
| Tier 1 wave script updates | XS | ~10 files × 1–3 lines each |
| Manual review of low-confidence rows | M (operator time) | ~120 platform-flag rows; one operator pass at ~30s/row = ~1h |
| CLAUDE.md contract update | XS | one paragraph |

Net engineering effort: **M.** Net operator review effort: **~1h.** No regenerations, no DB rewrites, no data migrations — purely additive metadata.

---

## 10. Risks and what this proposal does NOT solve

- **The 16 hard gaps stay hard gaps.** MENA × 5, Latam × 6, Africa × 5 ISOs have no source rows at all. `source_type` doesn't conjure registry entries. Tier 2 dispatch (per `docs/MONITORING-STATUS-2026-05-08.md` recommendation 2) is the parallel track.
- **The 577 zero-ingestion sources stay zero-ingestion.** `source_type` is a coverage-classification fix, not a worker-cadence fix. Recommendation 1 in MONITORING-STATUS-2026-05-08 is the parallel track.
- **A new institutional category we haven't enumerated.** If `coast_guard`, `port_authority`, or `customs_broker_association` emerge as needed types, the CHECK constraint requires an `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …` migration. Cost: XS, but it's a migration not a code change. The 11-value list was chosen to cover everything in the seed registry plus the monitoring-status anomalies; future expansion is expected to be incremental, not redesign.
- **Multi-type ambiguity at query time.** A consumer asking "is this source an environmental body OR a regulatory executive?" gets a true positive on rows with both. That's the right answer for the coverage-gaps consumer (where overlap counts as covered for env-body purposes). Other consumers may want "primary type only" — that's an additional column, not this one.

---

## Appendix A — File scope of this PR

**Delivered:**
- `docs/SOURCE-TYPE-TAXONOMY-PROPOSAL.md` (this document)
- `fsi-app/scripts/source-type-categories-investigate.mjs` (read-only investigation script, no DB writes)

**NOT delivered (deliberate):**
- Migration 049 SQL file — design only, schema lands in a separate PR
- `fsi-app/scripts/source-type-backfill.mjs` — separate PR after 049
- `fsi-app/src/lib/coverage-gaps.ts` refactor — separate PR after backfill
- Tier 1 wave script updates — separate PR
- CLAUDE.md update — separate PR

This is doc-only. Read-only investigation + design. No schema changes. No code changes. No DB writes.
