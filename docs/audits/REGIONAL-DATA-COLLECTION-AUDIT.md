# Regional Data Collection — Ground Truth Audit

Generated: 2026-05-05
Scope: 8 dimensions of regional / jurisdictional data state
Method: Read-only SELECTs against live Supabase via service role; cross-referenced with `docs/` runlogs and `fsi-app/src/lib/jurisdictions/tiers.ts`.

---

## Verdict Summary

| # | Dimension | State | Severity |
|---|-----------|-------|----------|
| 1 | Sub-national jurisdiction taxonomy completeness | **DONE** | low |
| 2 | Tier 1 source coverage by jurisdiction | **PARTIAL — severe sub-national gaps** | high |
| 3 | Operations surface intelligence (regional_data) | **PARTIAL — 11/118 Tier 1 covered** | high |
| 4 | Auto-approved sources awaiting spot-check | **GAP** | high |
| 5 | Tier 2 expansion status | **GAP — confirmed deferred (43 of 44 zero)** | medium |
| 6 | Non-English sources / `scan_enabled` schema | **GAP — schema column never added** | medium |
| 7 | 3 missing EU regulations status | **DONE** | low |
| 8 | Coverage matrix RPC populated | **DONE** | low |

---

## Dimension 1: Sub-national jurisdiction taxonomy

### Query results

```
Total intelligence_items:           194
With jurisdiction_iso populated:    194 (100.00%)
Missing jurisdiction_iso:             0
Defaulted to GLOBAL:                 86 (44.3%)
```

### Findings

- W4.1 ISO backfill landed cleanly. Zero rows with empty `jurisdiction_iso`.
- 44.3% of items (86/194) carry `jurisdiction_iso = ['GLOBAL']`. This is the legitimate fallback for IMO / ICAO / framework / cross-jurisdictional content (e.g., GHG Protocol, ISO 14083, IFRS S2). Cross-checked against `coverage_matrix()` which shows GLOBAL covering frameworks, technology, research_finding, market_signal, regulation, standard, regional_data, tool — consistent with supranational scope.
- The single largest non-GLOBAL bucket is EU (42 items), then US (20). Coverage is concentrated on the supranational/federal level, not subnational — see Dimension 2.

### Outstanding

- None for Dimension 1. The W4.1 backfill goal (every row with at least one ISO) is met.

---

## Dimension 2: Tier 1 source coverage by jurisdiction

### Query results

```
Total sources:                     563
Active sources:                    501
Distinct jurisdictions in active:   63
Tier 1 jurisdictions defined:      118
```

**Coverage histogram (Tier 1, n=118):**

| Bucket | Count | % |
|--------|------|---|
| 0 sources | 57 | 48.3% |
| 1 source | 31 | 26.3% |
| 2 sources | 17 | 14.4% |
| 3-5 sources | 9 | 7.6% |
| 6-10 sources | 1 | 0.8% |
| 10+ sources | 3 | 2.5% |

**Top 10 best-covered (active sources):**

| Rank | Jurisdiction | Sources |
|------|-------------|--------|
| 1 | GLOBAL | 180 |
| 2 | EU | 69 |
| 3 | US | 66 |
| 4 | GB | 22 |
| 5 | US-CA | 9 |
| 6 | US-WA | 5 |
| 7 | US-NY | 4 |
| 8 | US-NC | 4 |
| 9 | US-GA | 3 |
| 10 | US-IA | 3 |

**Tier 1 jurisdictions with ZERO active sources (57):**

US-AL, US-ID, US-NE, US-NH, US-OK, US-PR, US-GU, US-MP, US-AS, AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE, GB-ENG, GB-SCT, GB-WLS, CA-ON, CA-QC, CA-BC, CA-AB, CA-MB, CA-SK, CA-NS, CA-NB, CA-NL, CA-PE, CA-YT, CA-NT, CA-NU, AU-VIC, AU-SA, HK, JP, KR

**Tier 1 with <3 sources (under-covered): 105 of 118 (89%).**

### Findings

- The W3 narrative ("563 net-new sources across 125 Tier 1 ISO codes") matches the totals (563 sources, 63 distinct active jurisdictions visible) — but the distribution is very skewed:
  - ~91% of sources concentrate in 4 buckets (GLOBAL, EU, US, GB).
  - Sub-national US states are mostly 1–2 sources (a single legislative archive or DOT page each).
  - **Every single EU 27 member state (AT, BE, BG, …, SE) has ZERO active sources.** Coverage hits "EU" the supranational bucket (69 sources) but does not reach member-state regulators.
  - **Every Canadian province + territory (CA-ON through CA-NU) has ZERO active sources.**
  - **Every UK devolved nation (GB-ENG, GB-SCT, GB-WLS) has ZERO active sources** — only GB-NIR has 2.
  - 4 of 5 anchor APAC singletons (HK, JP, KR, plus AU-VIC, AU-SA) are at zero.
  - 9 US states/territories at zero (AL, ID, NE, NH, OK plus 4 territories PR, GU, MP, AS).
- Tier 1 spot-check spec (`docs/SPOT-CHECK-RESULTS.md`) sampled 20 H-tier sources; 16 confirmed-H, 3 should-be-M (15% false-positive), 1 unreachable. The thresholds need lifting (rel ≥ 75, frt ≥ 55) per recalibration note.

### Outstanding

- **EU 27 member-state regulators (27 jurisdictions, all zero).** No FR / DE / IT / ES / NL national-level sources beyond the EU bucket.
- **Canadian provinces (13 jurisdictions, all zero).** No provincial regulators.
- **UK devolved nations (3 of 4 zero).** GB-ENG / GB-SCT / GB-WLS unrepresented.
- **APAC anchors HK / JP / KR (3 zero).** Only Singapore and Tokyo Metropolis (JP-13) present.
- **9 US states + territories at zero.**

---

## Dimension 3: Operations surface intelligence

### Query results

```
intelligence_items by item_type:
  regulation         105
  market_signal       17
  initiative          16
  regional_data       12   ← driver for /operations "By Jurisdiction" tab
  research_finding    11
  framework           10
  standard             9
  tool                 7
  technology           6
  innovation           1
TOTAL                194
```

**`regional_data` items (12):**

| legacy_id | Title | jurisdiction_iso |
|-----------|-------|------------------|
| united-states-regional-operations-profile | United States Regional Operations Profile | [US] |
| india-regional-operations-profile | India Regional Operations Profile | [IN] |
| china-prc-regional-operations-profile | China (PRC) Regional Operations Profile | [CN] |
| dubai-uae-regional-operations-profile | Dubai / UAE Regional Operations Profile | [GLOBAL] *(should be AE)* |
| united-kingdom-regional-operations-profile | UK Regional Operations Profile | [GB] |
| eu-core-markets-regional-operations-profile | EU Core Markets Regional Operations Profile | [EU] |
| australia-regional-operations-profile | Australia Regional Operations Profile | [AU] |
| industrial-electricity-tariff-benchmarks-by-jurisdiction | Industrial Electricity Tariff Benchmarks | [GLOBAL] |
| japan-regional-operations-profile | Japan Regional Operations Profile | [JP, KR] |
| singapore-regional-operations-profile | Singapore Regional Operations Profile | [SG] |
| brazil-regional-operations-profile | Brazil Regional Operations Profile | [BR] |
| logistics-labor-cost-availability-benchmarks | Logistics Labor Cost & Availability | [GLOBAL] |

### Findings

- Operations page tab "By Jurisdiction" expects items where `item_type = 'regional_data'`. There are 12. Coverage is 11 distinct jurisdictions: AU, BR, CN, EU, GB, GLOBAL, IN, JP, KR (shared row with JP), SG, US.
- **Dubai/UAE profile is mis-tagged as `[GLOBAL]` instead of `[AE]`.** This is a data-quality bug that hides the row from any AE-keyed UI lookup.
- The JP profile carries `[JP, KR]` — KR is a co-mention, not a separate KR profile. So KR effectively has no dedicated regional_data row, just a tag-along.
- Operations page sub-categories (Solar / Electricity / Labor / EV Charging / Green Building) are inferred at runtime from `tags` and brief text via regex on the client (see `OperationsPage.tsx` lines 55–62). With every `regional_data` row showing `tags: []`, the sub-category chips fall back to whatever the client regex picks up from the brief markdown.
- 2 of the 12 are non-jurisdictional benchmark rows (electricity tariffs, labor benchmarks) typed as regional_data — these will display in the "Unspecified" / "GLOBAL" group.

### Outstanding

- **107 of 118 Tier 1 jurisdictions have no `regional_data` profile** (any US state, any EU member state, any CA province, etc.). Operations "By Jurisdiction" surface effectively shows 11 cells, not 118.
- **Mis-tagged Dubai profile** — known data-quality flag.
- `tags` empty on every regional_data row means client-side sub-category routing is fragile.

---

## Dimension 4: Auto-approved sources awaiting spot-check

### Query results

```
sources total:                     563
sources created in last 14 days:   404
  spotchecked = true:                0
  spotchecked = false / NULL:      404
sources spotchecked all-time:        0   ← zero
sources still pending all-time:    563

source_verifications by tier:
  L (low / no source row):         656
  M (provisional review queue):    280
  H (auto-approved → sources):      64
  TOTAL                          1,000
sources resulting from H verifications:  64
```

### Findings

- **Zero sources have been spot-checked.** `spotchecked = true` count is 0 across the entire `sources` table. The `spotchecked` column exists (verified in schema dump) but no row has been flipped.
- Despite the W2.E "299–387 awaiting spot-check" narrative, the actual queue is **404 created in the last 14 days** — none reviewed. All 404 are still on the unaudited side.
- The 1,000-row `source_verifications` table breaks down 64 H / 280 M / 656 L, consistent with the W2.F design (only H produces a `sources` row; L is forensic-only).
- 64 H-tier verifications match the 64 sources that received `resulting_source_id` — the H pipeline wired correctly. But the spot-check loop closing it is not running.
- The audit-tier-h-spot-check.mjs pilot run (20 H-tier sources, 2026-05-06) found 3 of 20 should-be-M (15% false-positive). That pilot did NOT update `spotchecked`/`spotchecked_at` on any of the 20 — it was a pure read-only QA pass.

### Outstanding

- **Spot-check workflow is dormant.** No source has its `spotchecked_by`/`spotchecked_at` set.
- **15% false-positive rate exceeds the 5% target.** SPOT-CHECK-RESULTS.md recommends raising H thresholds to rel ≥ 75, frt ≥ 55 — not yet applied.
- **3 known should-be-M sources surfaced by the pilot run still classified as H** in the live DB:
  - DPNR – USVI Division of Environmental Protection
  - Maryland MDE – Air & Climate Change Program
  - Virginia VDOT (freight)
  These weren't demoted; they're actionable.

---

## Dimension 5: Tier 2 expansion status

### Query results

```
Tier 2 jurisdictions defined:                  44
Tier 2 jurisdictions with any active sources:   1   (CN, 1 source)
Tier 2 jurisdictions with ZERO active sources: 43   (97.7%)

provisional_sources rows:                      12
provisional_sources with discovered_for_jurisdiction populated:   0
```

### Findings

- W3 explicitly deferred Tier 2. Confirmed: 43 of 44 Tier 2 jurisdictions have zero active source coverage.
- **Only Tier 2 jurisdiction with ANY coverage is China (CN), and it has exactly 1 source.**
- Provisional sources (12 rows) all have `discovered_for_jurisdiction = NULL`. This means W3's discovery agents never tagged provenance — the schema column was added (per migration 040 `discovery_provenance.sql`) but no populated rows exist.
- Specifically zero coverage:
  - Switzerland / Norway / Iceland (CH, NO, IS)
  - UAE / Saudi Arabia / Israel / Turkey (AE, AE-DU, AE-AZ, SA, IL, TR)
  - All India states (IN, IN-MH, IN-TN, IN-GJ, IN-KA, IN-DL)
  - All Brazil states (BR, BR-SP, BR-RJ, BR-MG)
  - All Mexico states (MX, MX-CMX, MX-NLE, MX-JAL, MX-MEX)
  - LATAM others (AR, CL, CO, PE)
  - Africa (ZA, EG, MA)
  - SE Asia (ID, TH, MY, VN, PH)
  - Oceania (NZ)
  - China provinces / Macau (CN-44, CN-31, CN-11, CN-33, CN-32, MO)

### Outstanding

- **All 43 of 43 Tier 2 ZERO-coverage jurisdictions are genuine gaps.** This is the W3 explicit-deferral list, but it now needs sequencing.
- `provisional_sources.discovered_for_jurisdiction` is unpopulated for the 12 provisional rows — discovery agents either ran before the column was added or aren't writing to it.

---

## Dimension 6: Non-English sources

### Query results

```
sources schema columns (sampled):
  ... 56 columns including:
  - status, paywalled, access_method, api_endpoint, rss_feed_url
  - processing_paused, admin_only
  - jurisdiction_iso, spotchecked, spotchecked_by, spotchecked_at
  ...
  scan_enabled column:           NOT PRESENT
  language column:               NOT PRESENT
```

### Findings

- W2.F flagged that the `scan_enabled` column wasn't added. **Confirmed: neither `scan_enabled` nor `language` exists on `sources`.** No way to register non-English candidates with `scan_enabled = false` per the original spec.
- Non-English candidate registration / activation toggle is unbuilt at the schema level.
- The closest existing toggle is `processing_paused` (per source) and `admin_only` (per source), but those are different policies (admin pause vs. UI-hide), not language gating.
- Phase C remained English-only as planned. Migration 040 (`discovery_provenance.sql`) didn't add language either.

### Outstanding

- **Schema column `scan_enabled` (or `language`) needs adding before any non-English ingestion can be registered safely.**
- All non-English jurisdictions (China provinces, Brazil/Mexico states, India states, ASEAN) are blocked by this absence — there's no way to add a candidate row in a "registered but not scanned" state.

---

## Dimension 7: 3 missing EU regulations status

### Query results

```
3 of 3 inserts confirmed in intelligence_items:

| legacy_id                            | brief_chars | severity   | integrity_flag | jurisdiction_iso |
|--------------------------------------|-------------|------------|----------------|------------------|
| eu-battery-regulation-2023-1542      |      36,030 | MONITORING | false          | [EU]             |
| eu-hdv-co2-standards-2019-1242       |      24,526 | COST ALERT | false          | [EU]             |
| eu-net-zero-industry-act-2024-1735   |      35,414 | MONITORING | false          | [EU]             |

Total brief generation cost (per EU-BRIEFS-RUNLOG.txt): $0.215 + $0.199 + $0.227 = $0.641
```

### Findings

- All 3 inserts landed cleanly. UUIDs match `EU-INSERTS-LOG.json`:
  - `ac349a70-606d-4eb3-ac19-5a4a0facd07c` (battery)
  - `b7736a1a-2c81-4d58-87b4-ee09330eaff2` (HDV CO2)
  - `859faf76-08a3-4587-a675-c181e19f227a` (net-zero industry)
- All 3 have substantial briefs (24k–36k chars), all under the 14-section regulatory_fact_document contract.
- Severity assignments look reasonable (HDV CO2 → COST ALERT for fleet-impact regs).
- All 3 carry `agent_integrity_flag = false` — no integrity issues raised.
- Runlog confirms parsing extracted citation tables (HDV: 5 sources, Net-Zero: 6 sources, Battery: 0 — battery may need source extraction follow-up).
- The "5 cross-ref opportunities" mentioned in the brief — items that reference EU regulation IDs without a link — were not enumerated in the runlog or audit data and would require a separate text-scan pass to identify. Not yet documented.

### Outstanding

- **5 cross-reference opportunities not catalogued.** Earlier session notes reference 5 existing items that mention these EU regs by ID without a hard link. No log file documents which 5 — needs a dedicated full-text scan of `intelligence_items.full_brief`.
- Battery regulation brief showed `src=0` in parse step — citation table either missing or unparsed. Worth sanity-checking the brief's "## New Sources Identified" section.

---

## Dimension 8: Coverage matrix RPC populated

### Query results

```
coverage_matrix() rows returned:        113
Distinct jurisdiction_iso:               77
Distinct item_type:                      11
```

**Top 15 jurisdictions by item count (from coverage_matrix):**

| Jurisdiction | Items | Sources | Item types |
|-------------|------|--------|-----------|
| GLOBAL | 86 | 180 | framework, technology, research_finding, initiative, market_signal, regulation, standard, regional_data, tool, innovation |
| EU | 42 | 69 | tool, regional_data, research_finding, initiative, regulation, market_signal |
| US | 20 | 66 | research_finding, regional_data, technology, regulation, standard, market_signal, initiative, framework |
| SG | 9 | 2 | regulation, market_signal, regional_data, framework |
| GB | 8 | 22 | regional_data, research_finding, regulation |
| JP | 6 | 0 | market_signal, regional_data, regulation |
| AU | 6 | 2 | regional_data, market_signal, regulation |
| CN | 4 | 1 | regulation, market_signal, regional_data |
| AE | 4 | 0 | regulation |
| US-CA | 4 | 9 | regulation |
| KR | 3 | 0 | regulation, regional_data |
| BR | 3 | 0 | regulation, regional_data |
| IMO | 3 | 0 | regulation, technology |
| IN | 3 | 0 | regional_data, regulation |
| CL | 1 | 0 | market_signal |

### Findings

- **RPC works and returns real data.** 113 (jurisdiction × item_type) pivot rows.
- 77 distinct jurisdictions and 11 item_types covered (slightly more than the 10 currently surfacing in `intelligence_items`, suggesting the RPC includes IMO as a bucket).
- The mismatch between source_count (66 for US) and item_count (20 for US) is correct — sources don't map 1:1 to items; they're the portals.
- Visible asymmetries:
  - **JP, AE, KR, BR, IN, IMO, CL all show items with 0 sources.** Items exist (with briefs and ISO tagging) but no source registry row backs them. The Operations and Regulations surfaces will render the items but "Source: —" will appear.
  - **US-CA has 4 regulation items vs. 9 sources** — the only sub-national US ISO showing items in the matrix.
- Coverage matrix rows reflect the gap pattern in Dimension 2: most weight on GLOBAL/EU/US/GB.

### Outstanding

- 6 jurisdictions (JP, AE, KR, BR, IN, IMO, CL) have items but zero sources — they'll display item content with no provenance pin in the UI.
- The 113-row matrix is much smaller than the 118 Tier 1 + 44 Tier 2 = 162 jurisdictions defined; ~50 Tier 1/2 jurisdictions don't appear in the pivot at all (no items, no sources).

---

## Cross-cutting observations

1. **Sub-national coverage cliff.** The data structure (taxonomy in `tiers.ts`, ISO column on `sources` and `intelligence_items`) is fully built, but at the supranational (EU) and federal (US/GB) level coverage is dense, while at the sub-national level (US states, EU members, CA provinces, UK devolved nations) it's mostly empty or 1-source-deep. This is the same gap from three angles: Dim 2 (sources), Dim 3 (regional_data items), Dim 8 (matrix).

2. **"Active" doesn't mean "audited."** 563 sources, 501 active, but 0 spot-checked. The W2.F H/M/L pipeline auto-approved 64 sources straight to `sources.status='active'`, and the spot-check post-condition has never run. This is a process gap, not a data gap.

3. **Provenance tagging on provisional discoveries was stubbed but never populated.** Migration 040 added `discovered_for_jurisdiction`, but all 12 provisional rows have it NULL. Discovery flows aren't writing to it.

4. **Schema gaps for Phase D foundations (non-English).** `scan_enabled` / `language` were never added to `sources`. Any Tier 2 jurisdiction in a non-English market (CN provinces, BR states, JP, KR, MX states, ASEAN, LATAM) is schema-blocked, not just discovery-blocked.

5. **Dubai/UAE regional_data row is mis-tagged `[GLOBAL]`.** Cosmetic in isolation but reveals a class of data-entry bugs in regional_data ISO tagging that the validation pipeline didn't catch.

6. **Items-without-sources pattern.** Several jurisdictions (JP, AE, KR, BR, IN, CL, IMO) have intelligence_items but no sources backing them. UI surfaces will render content with no source pin. This is at odds with the platform architecture's "Layer 1 (Sources) → Layer 2 (Items)" model.

---

## Prioritized outstanding items

| # | Item | Effort | Severity | Why |
|---|------|--------|----------|-----|
| 1 | **Spot-check the 404 H-tier sources awaiting review** + apply the 3 known should-be-M demotions (DPNR, MDE, VDOT) | Medium (404 rows × ~30s/row review = ~3.4 hours of admin time, or batch review UI) | high | The spot-check loop has never closed. 15% false-positive rate is in the live registry. |
| 2 | **EU 27 member-state regulator discovery + ingestion** (FR, DE, IT, ES, NL minimum, then balance) | Large (a W3-scale Tier 1.5 batch) | high | 27 of 27 Tier 1 EU member states at zero. EU-level coverage masks national-level gaps. |
| 3 | **Recalibrate H thresholds to rel ≥ 75 / frt ≥ 55** per SPOT-CHECK-RESULTS recommendation | Small (config change in W2.F pipeline + retroactive re-classification of borderline Hs) | high | Reduces false-positive flow into the registry going forward. |
| 4 | **Canadian provinces + UK devolved nations** (CA-ON, CA-QC, CA-BC, CA-AB, GB-ENG, GB-SCT, GB-WLS) | Medium | high | 16 of 17 zero. High-traffic freight jurisdictions for the platform. |
| 5 | **Add `scan_enabled` and `language` columns to `sources`** | Small (migration) | medium | Unblocks all non-English Tier 2 work. Blocks nothing currently active. |
| 6 | **Tier 2 expansion sequenced** (start CH/NO/IS — English-friendly Tier 2 — then UAE, IN states, BR states, MX states) | Large (Phase D scope) | medium | 43 of 44 zero. Sequence: English-Latin-script first, non-English after schema gating ships. |
| 7 | **Backfill regional_data profiles for Tier 1 sub-nationals** | Large (107 of 118 missing) | medium | Operations "By Jurisdiction" surface is effectively 11 cells today. |
| 8 | **Fix Dubai/UAE regional_data jurisdiction_iso** from `[GLOBAL]` → `[AE]` | Trivial (1-row UPDATE) | low | Visible bug; representative of a tagging-validation gap. |
| 9 | **Catalogue the 5 EU cross-ref opportunities** (items mentioning the 3 newly-inserted EU regs without a hard link) | Small (full-text scan + link insert) | low | Polish; increases intersection-detection density. |
| 10 | **Backfill `provisional_sources.discovered_for_jurisdiction`** for the existing 12 rows + ensure new discoveries write it | Small | low | Data hygiene; enables future Tier-coverage queries on provisional data. |
| 11 | **Sanity-check Battery regulation brief citation table** (parse showed src=0) | Small | low | Confirm whether the "## New Sources Identified" table is missing or unparsed. |
