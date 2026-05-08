# Caro's Ledge — Tier 1 Monitoring Status — 2026-05-08

## Executive summary

Source registry is broad (**718 active, non-admin sources** spanning ~130 Tier 1 priority jurisdictions) but **ingestion is the bottleneck**: of those 718 sources, **577 (80%) have zero `intelligence_items` rows since creation**, and only **39 sources produced any items in the last 4 weeks**. Total active items in the platform = **184**, with **30 Tier 1-tagged items in the last 30 days** (concentrated in APAC=12, US=6, AU=4, MENA=4). Verdict: registry coverage is on plan; the worker pipeline is dramatically under-running its registry. Tier 2 dispatch should prioritize *activating* existing sources before adding new ones, plus closing the MENA / Latam / Africa registry holes.

Heuristic note: the env-body / legislature pattern set in `lib/coverage-gaps.ts` is intentionally broad but biased toward Anglo regulator naming. Several `partial` flags below (notably across EU members and several US states) reflect that legislatures named in non-English or via state-info portals don't match the matchers, not that the legislative source is actually missing. Treat the `partial` rollups as a reviewer queue, not a gap.

---

## 1. Tier 1 source registry health

Per-region rollup of Tier 1 priority jurisdictions, computed from `sources` where `status='active' AND admin_only=false`. `covered` = both env body AND legislature matched; `partial` = one matched; `gap` = no active source row tagged to that ISO.

| Region | Total | Covered | Partial | Gap |
|---|---:|---:|---:|---:|
| United States (sub-national) | 56 | 46 | 10 | 0 |
| EU member states | 27 | 11 | 16 | 0 |
| United Kingdom (nations) | 4 | 3 | 0 | 1 |
| Canada (provinces & territories) | 13 | 12 | 1 | 0 |
| Australia (federal & states) | 9 | 9 | 0 | 0 |
| APAC priority (SG / HK / JP / KR) | 4 | 3 | 1 | 0 |
| MENA priority | 5 | 0 | 0 | 5 |
| Latin America priority | 6 | 0 | 0 | 6 |
| Africa priority | 5 | 0 | 0 | 5 |
| **Totals** | **129** | **84** | **28** | **17** |

**Hard gaps (zero source rows):**

- **GB-ENG** — no active source tagged specifically to England (note: most UK Parliament + Defra sources are tagged `GB`, not `GB-ENG`; this is a tagging convention choice, not a true gap).
- **MENA priority (5)**: AE, SA, IL, TR, QA — no active sources carrying these ISO tags. (Some MENA sources exist but are tagged at a higher level — the matcher loses them at the ISO scope level.)
- **Latin America priority (6)**: BR, MX, AR, CL, CO, PE — same pattern: zero sources carry country ISO tags. **However**, items already exist for BR (3), MX (1), CL (1), CO (1) — see Section 2 — so the items are landing without a discoverable source row. This is a Tier 2 priority.
- **Africa priority (5)**: ZA, EG, KE, NG, MA — no active sources, no items. Real gap.

**Partial-flagged jurisdictions to verify (16 EU partials + 10 US partials):** mostly heuristic false-flags. EU partial breakdown:

```
AT  missing=leg    BE  missing=env   HR  missing=env   CZ  missing=env
FR  missing=leg    IT  missing=env   LV  missing=env   LT  missing=leg
LU  missing=env    NL  missing=env   PL  missing=env   PT  missing=env
RO  missing=env    SK  missing=env   SI  missing=env   ES  missing=env
```

These almost certainly have legislatures and env bodies via EUR-Lex / EEA / national gazettes — the matcher is the problem. Recommend either tightening matchers or flipping to explicit per-source taxonomy tags (`source_type IN ('environmental_body', 'legislature', 'gazette', …)`).

**US partials (10):** US-FL, US-GA, US-MD, US-MN, US-NH, US-NJ, US-VA, US-WA, US-DC, US-VI — most are missing-`leg` flags where state legislative info portals don't match `legis|parliament|assembly|senate|congress`.

**Other partials worth noting:**
- **CA-QC** (Quebec) — missing-`env`, likely real (provincial env body MELCCFP doesn't match patterns).
- **JP** — missing-`leg`, likely real (Diet/国会 not matching outside the `\bdiet\b` pattern; Japanese-language source URLs need explicit handling).

---

## 2. Intelligence items per jurisdiction

`intelligence_items` rows where `is_archived=false`, grouped by ISO via `jurisdiction_iso`. Total active items in DB: **184**. Tier 1-tagged items: **48 all-time / 30 last-30-days**.

### Per-region totals

| Region | All-time items | Last 30d |
|---|---:|---:|
| US sub-national | 8 | 6 |
| EU members | 4 | 1 |
| UK nations | 0 | 0 |
| Canada provinces | 0 | 0 |
| Australia federation | 6 | 4 |
| APAC priority | 18 | 12 |
| MENA priority | 6 | 4 |
| Latam priority | 6 | 3 |
| Africa priority | 0 | 0 |

### Per-ISO detail (only ISOs with non-zero items shown)

| ISO | Region | All-time | Last 30d |
|---|---|---:|---:|
| US-CA | US sub-national | 6 | 4 |
| US-NY | US sub-national | 1 | 1 |
| US-TN | US sub-national | 1 | 1 |
| DK | EU | 1 | 0 |
| DE | EU | 1 | 0 |
| NL | EU | 1 | 1 |
| SE | EU | 1 | 0 |
| AU | AU federation | 6 | 4 |
| SG | APAC | 9 | 5 |
| JP | APAC | 6 | 5 |
| KR | APAC | 3 | 2 |
| AE | MENA | 6 | 4 |
| BR | Latam | 3 | 2 |
| MX | Latam | 1 | 0 |
| CL | Latam | 1 | 1 |
| CO | Latam | 1 | 0 |

**Observations:**
- **UK, Canada, Africa, GB nations, all CA provinces, most US states, most EU members all have zero ISO-tagged items.** The US sub-national score of 8 is concentrated in CA (6) + NY (1) + TN (1).
- **APAC is the most-active region** by items / 30d, driven by SG and JP.
- **AE leads MENA**, **BR/CL drive Latam**, and **AU has solid federal coverage**.
- The 184-vs-48 gap = ~136 active items don't carry a Tier 1 priority ISO. Likely tagged `US`, `EU`, `GB`, `GLOBAL`, `IMO`, `ICAO` at the supranational level rather than per-state/country.

---

## 3. Zero-ingestion sources

**577 of 718 active+non-admin sources (80%) have zero `intelligence_items` rows referencing them since creation.**

Distribution by tier:

| Tier | Zero-ingestion sources |
|---:|---:|
| 1 | 316 |
| 2 | 121 |
| 3 | 63 |
| 4 | 53 |
| 5 | 14 |
| 6 | 1 |
| 7 | 9 |

All 577 share `days_since_creation = 33` — i.e., they were inserted on or around **2026-04-05** (the Wave 3 / Wave 4 source registry expansion). The sources themselves are right; **the ingestion worker hasn't visited most of them**. Sample T1 zero-ingestion sources:

- Diário Oficial da União (Brazil) — `https://www.gov.br/pt-br/servicos/acessar-o-diario-oficial-da-uniao`
- Ley Chile — `https://www.bcn.cl/leychile`
- Statutes of the Republic of Korea — `https://elaw.klri.re.kr/eng_service/main.do`
- Singapore Statutes Online — `https://sso.agc.gov.sg`
- Federal Register — `https://www.federalregister.gov`
- Regulations.gov — `https://www.regulations.gov`
- Gazette of India eGazette — `https://egazette.gov.in`
- US EIA Open Data API — `https://www.eia.gov/opendata/`
- Council of the European Union Press — `https://www.consilium.europa.eu/en/press/press-releases/`
- US EIA Petroleum Spot Prices — `https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm`
- IEA Data and Statistics Hub — `https://www.iea.org/data-and-statistics/data-explorers`
- MIT Climate Machine — `https://climatemachine.mit.edu`

The full 577-row list is in the JSON sidecar at `docs/monitoring-status-2026-05-08.json` under `zeroIngestionSources`.

---

## 4. Ingestion velocity

Items per source per week, last 4 weeks (`w0` = 0–7 days ago, `w3` = 21–28 days ago). **Only 39 sources produced any items in the last 28 days.** All 39 produced ≤3 items each — the platform has no high-throughput sources.

### Top 5 most-active

| Source | Tier | w0 | w1 | w2 | w3 | Total |
|---|---:|---:|---:|---:|---:|---:|
| California Legislative Information (Leginfo) | 1 | 3 | 0 | 0 | 0 | 3 |
| Publications Office of the EU / EUR-Lex | 1 | 2 | 0 | 0 | 0 | 2 |
| International Renewable Energy Agency (IRENA) | 1 | 0 | 0 | 0 | 1 | 1 |
| International Energy Agency (IEA) | 1 | 0 | 0 | 0 | 1 | 1 |
| National Renewable Energy Laboratory (NREL) | 1 | 0 | 0 | 0 | 1 | 1 |

### Bottom 5 (with at least 1 item)

| Source | Tier | Total |
|---|---:|---:|
| City of Los Angeles City Clerk | 1 | 1 |
| Metropolitan Government of Nashville (Davidson Co.) | 1 | 1 |
| MIT Sustainable Supply Chain Lab | 4 | 1 |
| International Energy Agency (IEA) — second row | 1 | 1 |
| International Maritime Organization (IMO) | 1 | 1 |

**Distribution:** 26 of the 39 active sources only produced their item in `w3` (21–28 days ago) — i.e., the last ingestion event for most sources is already approaching a month old. Only 8 sources produced items in `w0` (most recent week). Worker cadence is the constraint.

The full velocity table is in the JSON sidecar at `velocity.allRows`.

---

## 5. Outside-Tier-1 gap analysis

Operational priorities NOT yet in the Tier 1 priority list (or in Tier 1 but flagged as gap above), ordered by Dietl/Rockit operational relevance:

| ISO | Coverage | # sources | Items all-time | Items 30d | Operational reason | Tier 2 priority |
|---|---|---:|---:|---:|---|---:|
| **CN** (national) | partial | 1 | 4 | 3 | Largest manufacturing/export origin globally; current single-source coverage at NPC law DB. Items already flowing — registry just needs second source (env body, e.g., MEE — Ministry of Ecology and Environment). | **P1** |
| **IN** (national) | gap | 0 | 3 | 3 | Major freight market; eGazette portal already in registry (zero-ingest, see §3). Need worker activation, not new source. | **P1** |
| **BR** (national) | gap | 0 | 3 | 2 | South America gateway; Diário Oficial in registry (zero-ingest). Items exist with no source linkage. | **P1** |
| **MX** (national) | gap | 0 | 1 | 0 | USMCA trade lane; SEMARNAT + DOF needed. No registry rows. | **P2** |
| **ZA** | gap | 0 | 0 | 0 | Sub-Saharan transport gateway (Durban/Cape Town). Audit flagged. | **P2** |
| **EG** | gap | 0 | 0 | 0 | Suez Canal Authority — chokepoint risk. | **P2** |
| **DE-NW** (North Rhine-Westphalia) | gap | 0 | 0 | 0 | Largest DE Land by GDP; Duisburg port + Ruhr industrial corridor. | **P3** |
| **DE-BY** (Bavaria) | gap | 0 | 0 | 0 | Munich/BMW manufacturing corridor; Land env ordinances. | **P3** |
| **DE-HE** (Hesse) | gap | 0 | 0 | 0 | Frankfurt FRA airport hub + financial center. | **P3** |
| **DE-HH** (Hamburg) | gap | 0 | 0 | 0 | Largest DE container port. | **P3** |
| **KE** | gap | 0 | 0 | 0 | East Africa hub (Mombasa). | **P3** |
| **NG** | gap | 0 | 0 | 0 | West Africa freight market (Lagos). | **P3** |
| **DE-BW** (Baden-Württemberg) | gap | 0 | 0 | 0 | Stuttgart industrial; Daimler/Bosch supply chain. | **P4** |
| **DE-HB** (Bremen) | gap | 0 | 0 | 0 | Bremerhaven auto/break-bulk port. | **P4** |
| **DE-BE** (Berlin) | partial | 2 | 0 | 0 | Capital + BER airport — already partially covered per CLAUDE.md. | covered — verify pair |

**Pattern:** The Latam/MENA/Africa hard-gap row blocks (BR, MX, ZA, EG, KE, NG, MA, AE, SA, IL, TR, QA, AR, CL, CO, PE) all need source-registry rows — items in some of those ISOs are landing without a `source_id` link. This is two problems compounding: Tier 1 LATAM/AFRICA marked "priority" in the dispatch but the registry never received the env+legislature pair, and the worker is depositing items there without closing the source loop.

---

## Recommendations

1. **Activate existing zero-ingestion T1 sources before adding new ones.** 316 Tier 1 sources have been in the registry for 33 days with zero items. Federal Register, Regulations.gov, eGazette India, EUR-Lex, Diário Oficial, Ley Chile, Singapore Statutes Online, NPC law DB are all already in `sources` — the worker just isn't ingesting them. Audit `/api/worker/check-sources` cadence + scoping logic.
2. **Insert env-body + legislature pair rows for the 16 hard-gap ISOs** (MENA × 5, Latam × 6, Africa × 5). For BR/MX/CL/CO especially, items are landing without source linkage — the source-registry insert is overdue. Use the existing Wave-3 dispatch pattern (`scripts/tier1-eu-*-execute-log.json` shape).
3. **Tighten or replace the env-body / legislature regex matchers in `lib/coverage-gaps.ts`.** 28 of the 129 Tier 1 jurisdictions are flagged `partial` largely because the matcher misses non-Anglo regulator naming. Either expand the pattern set (proven cheaper based on the existing matcher list) or move to a `source_type` taxonomy column on `sources`. Until then, the Map · Coverage gaps card understates real coverage.
4. **Open an integrity flag for the 136 items not carrying a Tier 1 priority ISO.** The 184-vs-48 split means ~74% of active items are tagged at supranational scope (`US`, `EU`, `GB`, `GLOBAL`, `IMO`, `ICAO`). For a freight-forwarder ops surface the per-state/country tag is what matters. Backfill should use the W4 ISO-backfill pattern in `docs/W4-1-iso-backfill-log.json`.
5. **Resolve GB-ENG tagging convention.** Either explicitly tag UK Parliament / Defra / DfT to `GB-ENG` OR drop GB-ENG from `TIER1_PRIORITY_REGIONS` in favor of treating England as the implicit GB default. Currently the only UK-nation `gap` is structural, not real.
