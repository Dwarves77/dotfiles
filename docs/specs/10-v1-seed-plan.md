# Surface spec 10: the v1 static-seed plan, and the licence problem in it

Status: DRAFT for operator review, 2026-08-12. Licence terms verified against published sources on
2026-08-12; every entry carries the URL read and the date. **This is not legal advice.** It records what
published terms *say*, with citations, so counsel can check the reasoning rather than reconstruct it.

## 0. The finding, first

The v1 strategy is right: **static seeds and batch CSV imports, no live API dependency, with the schema
pre-wired so connecting a feed later is an insert rather than a rewrite.** That removes runtime risk and
cost. It also moves the risk somewhere less obvious, and that is where the problem is.

**Reading an open dataset is not the same legal act as embedding it in a database and re-serving it to
paying customers.** A licence verification pass found that **four of the datasets the seed plan names
cannot be embedded and re-served commercially, and three more that were assumed safe also cannot.** Two
of the four were the centre of the plan.

| Assumed | Actual |
|---|---|
| Seed GLEC v3 default emission factor tables | **PROHIBITED.** "No use of this publication may be made for resale or for any other commercial purpose whatsoever, without prior permission in writing from Smart Freight Centre" |
| Seed ISO 14083 default values | **PROHIBITED**, and the strictest terms in the set. A single *named* end-user licence, and "integration, embedding, encoding, structuring… or operationalization of the ISO Publication within any digital or software-based environment" requires **separate licensing**. Structured extraction and text/data mining are also barred |
| Seed Clean Cargo annual CSV as Tier 2 | **Carrier-specific factors are members-only.** Whether a member may re-serve them to its own customers is unverified, and membership cost is unpublished. The *aggregate* public report is conditional on prior written notification |
| Use IEA grid factors | **PROHIBITED**, and the terms describe our exact use case: no databases "substantially derived from" the material or that "could constitute a substitute", and raw data downloads capped at five points |
| UN/LOCODE is safe | **NOT SAFE.** UN terms grant only "personal, non-commercial use, without any right to resell or redistribute", and prohibit compiling derivative works. No open licence exists |
| SBTi dashboard is free to use | **"This does not represent a license to repackage or resell any of the data."** Express permission from both SBTi and CDP required |
| World Bank CPPI is CC-BY | **Conditional.** Co-produced with S&P Global; the rights notice puts third-party clearance on the reuser |

**The largest single exposure is not the emission-factor layer, it is the IDENTIFIER layer.** IATA codes,
SCAC codes, IMO numbers from the S&P register and UN/LOCODE are all restricted, and the IATA terms are the
most explicit prohibition of the whole set: no redistribution "including without limitation, its clients",
and integration "in any commercial product or service… is strictly prohibited".

## 1. The one distinction that saves the build

**Methods are not copyrightable. Tables and text are.**

We can be **GLEC-conformant and ISO 14083-conformant in method** while populating the calculation from
sources we may lawfully re-serve. Buy one copy of ISO 14083 for a named engineer to read; implement the
calculation logic; never ship its tables. That is the legally safe path and it is fully available.

The substitute is genuinely good rather than a grudging fallback:

**UK DESNZ/Defra GHG conversion factors 2026** (published 31 July 2026) under **Open Government Licence
v3.0**, which expressly permits **commercial exploitation AND sub-licensing** — the rare combination we
need. It carries freight tonne-km factors by mode and vehicle class, HGVs by size and laden state, rail,
sea by vessel type and size class, air by haul length, WTT and TTW separated, plus refrigerant GWPs.
Supplement with the **US EPA GHG Emission Factors Hub** and **eGRID** (US public domain) for US
specificity, and **EMEP/EEA** (CC BY 4.0) for modal energy-intensity parameters.

For carrier-specific factors, the substitute is better than the blocked source: **EMSA THETIS-MRV**
publishes, per IMO number per year, CO2 emitted, fuel consumed, distance, time at sea, cargo carried and
derived efficiency, for every ship over 5,000 GT calling at EEA ports, with the verifier named. We can
join ship to operator and compute our own carrier-and-lane intensities, **and we own the derivation.**
That is a stronger position than re-serving someone else's average.

And it solves the IMO-number problem elegantly: THETIS-MRV publishes IMO numbers as part of a
**statutorily mandated disclosure** under Regulation (EU) 2015/757 Art. 21. The S&P terms bind users of
S&P's site; they do not reach identifiers obtained from the EU's own legal publication. Using an IMO
number as a foreign key is a different act from redistributing S&P's register.

## 2. The revised v1 seed set

Only green-list sources. Every one verified, with its attribution string.

### A. Statutory and regulatory master seed — fully clean

| Content | Source | Licence |
|---|---|---|
| EU ETS maritime phase-in (100% from 2026), route factors (100% intra-EU and at-berth, 50% extra-EU), €100/tCO2e excess penalty | EUR-Lex | CC BY 4.0 |
| FuelEU formulas and constants: €2,400/t VLSFOe, 41,000 MJ/t, target trajectory (2025 = 91.16 × 0.98 = 89.34 gCO2e/MJ), OPS €1.5/kWh, consecutive-year escalator | EUR-Lex | CC BY 4.0 |
| CBAM definitive-regime dates and certificate pricing mechanism | EUR-Lex + Commission | CC BY 4.0 |
| CountEmissions EU (Reg (EU) 2026/1030) dates and scope | EUR-Lex | CC BY 4.0 |
| EUDR, PPWR, ETS2, ReFuelEU dates and thresholds | EUR-Lex | CC BY 4.0 |

**This is the surface that works perfectly on day one with zero external dependency**, because it is law,
law is CC BY 4.0 under Decision 2011/833/EU, and the arithmetic is prescribed. Note the required
authenticity caveat: *only the Official Journal is authentic*, and we must never imply our copy is.

### B. Spatial and entity master seed — REDESIGNED

The original plan (UN/LOCODE master + SCAC/IATA/IMO crosswalk) is not licensable. Replacement:

- **Nodes:** our own `cl:node:` keys, populated from **NGA World Port Index** (US public domain, includes
  coordinates and facility attributes), **GeoNames** (CC BY 4.0) and **Wikidata** (CC0).
- **UN/LOCODE, IATA, SCAC become INPUT ALIASES, never published datasets.** A customer-supplied code
  resolves to our key; we never serve the list. This is the design rule that makes the identifier layer
  safe, and it costs us nothing functionally.
- **Organisations key on LEI** (GLEIF, CC0, no attribution required). US road carriers additionally key
  on **FMCSA USDOT/MC numbers** (public domain).
- **Vessels key on IMO numbers acquired from THETIS-MRV**, not from the S&P register.
- **Corridors** use our own content-addressed key, already built and tested this week.

### C. Operational and regional economics seed — one substitution

| Content | Source | Licence |
|---|---|---|
| Grid carbon intensity | **Ember** (replaces IEA) | CC BY 4.0 |
| EU grid intensity | EEA | CC BY 4.0 |
| US grid subregion | EPA eGRID | public domain |
| Industrial electricity and gas prices, EU | Eurostat `nrg_pc_*` | CC BY 4.0 |
| Road fuel prices, EU | Commission Weekly Oil Bulletin | CC BY 4.0 |
| US energy prices | EIA | public domain |
| Labour cost levels, NACE H | Eurostat `lc_lci_lev`, `lc_ncost_r2`, `earn_ses_*` | CC BY 4.0 |
| US wages by occupation and county | BLS OEWS, QCEW, ECEC | public domain |
| Solar yield | PVGIS | unrestricted |

### D. Technology and OEM roadmap seed — factual, with care

OEM commercial-stage announcements are **facts about announcements**, and reporting them with attribution
is ordinary practice. Two rules: cite the announcement, and do not reproduce spec sheets wholesale.
Record `density_basis` explicitly (manufacturers quote cell-level Wh/kg; payload maths needs pack-level,
typically 20 to 30% lower) and emit **`M` (missing)** rather than a derived pack estimate where only cell
is disclosed. That will make our table look emptier than a competitor's, and it is the correct call.

## 3. The three-tier hierarchy, revised and shipped

The incoming design was sound and I have extended it in two ways that matter.

```
carrier_primary        rank 1   pedigree floor 1   PRIMARY   — telemetry / verified voyage return
verified_operator_avg  rank 2   pedigree floor 2   PRIMARY   — our derivation from THETIS-MRV
programme_lane_avg     rank 3   pedigree floor 2             — Clean Cargo slot: EXISTS, EMPTY, gated
modal_default          rank 4   pedigree floor 3             — DESNZ / EPA. THE v1 BASELINE
proxy_estimate         rank 5   pedigree floor 4             — donor value, must name its donor
```

**Correction 1: the DQI direction was inverted.** The draft described a GLEC default as "2 out of 5"
upgrading to "4/5 or 5/5" on API connection, i.e. higher is better. That is backwards relative to the
**ecoinvent/Weidema pedigree used by ISO 14083**, which is **1 = best, 5 = worst**, and which this product
already ships in `vocabularies.mjs`. Two scales pointing opposite ways in one product is how a quality
score silently inverts, and an inverted quality score is worse than none because it is confidently wrong.
Resolved: pedigree is 1-best everywhere, a `pedigreeToStars()` helper converts at the display edge only,
and **nothing inverted is ever stored**. A `pedigreeFloor` per tier also prevents a modal default from
claiming pedigree 1, which is exactly the claim an auditor tests.

**Correction 2: the licence gate was absent.** A tier is not selectable merely because a row exists. The
resolver consults the licence register and **skips** a tier whose source is not clear, falling through to
the open-licence default beneath it. So a members-only Clean Cargo factor sitting in the table can never
become the served value. The skip is **returned, not swallowed** — silently dropping a candidate is how a
licence problem becomes invisible.

Two further fixes to the view: it excludes **future-dated rows** (a data-entry error would otherwise win
the `ORDER BY` and serve as the active factor), and it filters on a `licence_clear_sources` list so the
SQL side gates too rather than trusting the application.

**The upgrade path is unchanged and works exactly as intended.** Connect a feed, insert rows tagged
`carrier_primary`, and the view re-prioritises with no frontend change; the pedigree improves; the
propagation outbox marks dependent Scope 3 values stale. That part of the design was right.

## 4. Primary-data share is tkm-weighted, not leg-counted

Shipped with the resolver, because it is the tender metric and the obvious implementation is the wrong
one. Ten short primary legs and one long default leg is **not** 91% primary. A leg-count average is the
flattering answer; tonne-km weighting is the true one, and it is what ISO 14083 asks for. No legs returns
**null**, never 0%, because "no data" and "0% primary" are different statements.

## 5. What to do next, in order

1. **Send two emails.** They are free and each unlocks real capability.
   - `info@smartfreightcentre.org`: does the Clean Cargo report's written-notification clause operate as a
     standing licence for a SaaS product, or is a commercial agreement required? Is the clause still in
     the current edition? What does Clean Cargo membership cost and does it convey redistribution rights?
   - EMSA information desk and DG CLIMA Unit B2: does the THETIS-MRV public emission report fall under
     the EU reuse policy (Decision 2011/833/EU)? **This is the highest-value question of the two**,
     because discharging it unlocks both the carrier-factor substitute and the lawful IMO-number source.
2. **Ask UNECE in writing** (`unlocode@un.org`) to confirm permitted commercial reuse of UN/LOCODE.
   Cheap, and it would resolve an item currently sitting on counsel's desk.
3. **Buy one copy of EN ISO 14083** for a named engineer. Implement the method; never ship the tables.
4. **Budget the two licences that are simply costs, not grey areas**: IATA codes if air identifiers are
   commercially necessary, and NMFTA SCAC if US road carrier codes are. Both are known, budgetable
   subscriptions.
5. **Build the `emission_factors` table and the `licence_clear_sources` view**, which deletes the two
   F25 allowlist entries this unit added.

## 6. Shipped this unit

| Change | Detail |
|---|---|
| **Source licence register as an enforced gate** | `src/lib/contracts/source-licence.mjs`. 24 sources with verdict, licence, attribution string, URL read and verification date. `assertEmbeddable()` **throws**, and an unregistered source **fails closed** — that is the actual path by which unlicensed data enters a product. Refusals name the substitute; conditional refusals name who to ask and what to ask |
| **Factor tier resolver with the licence gate** | `src/lib/contracts/factor-tier.mjs`. Five tiers with pedigree floors, licence-gated resolution that falls through and reports skips, tkm-weighted primary-data share, and the active-factor view codegen |
| **DQI direction fixed** | 1-best throughout, matching the pedigree convention already shipped. Stars are display-only |
| 31 tests | Including one asserting a licence-blocked candidate is skipped and resolution falls through, one asserting skips are returned rather than swallowed, and the DQI direction asserted in both directions |

Gates: suite **1360/1360** (was 1329), fitness **20/20 with 0 violations**, meta-gate **PASS**, `tsc` clean.

## 7. Explicitly unverified, do not rely on these

1. **Smart Freight Centre accreditation terms** — site returned 403 repeatedly. Several vendors are
   publicly GLEC-accredited, so a commercial pathway exists, but **accreditation must not be assumed to
   convey a data licence.**
2. **Clean Cargo membership cost and member data-use terms.**
3. **Whether the notification clause survives in the current Clean Cargo edition** (2023 edition read).
4. **EUR-Lex's own notice wording** — page returned navigation only; the notice string in the register is
   assembled from the Commission legal notice plus the standard OJ authenticity clause.
5. **National EN adoptions of ISO 14083** (BSI, DIN, NEN). Expected to be equally or more restrictive;
   not read. If buying the EN version, read that seller's terms.
6. **Whether ISO 14083 contains extensive default tables at all** — the standard was not read. The
   licence position holds either way.
7. **PVGIS upstream dataset licences** (CM SAF, ERA5, NSRDB) if we embed raw irradiance rather than
   PVGIS-computed output.
8. **LPI-specific licence** — no statement on the LPI site; the general World Bank dataset terms applied.
9. **Ember upstream pass-throughs** — confirm no ingested series is IEA-derived.

## 8. Two things I would push back on

1. **"Baseline EUA prices (weekly static benchmark)" as a seed.** A statutory formula is stable; an EUA
   price is not. Seeding a price as a static benchmark and letting it age silently is the exact failure
   the freshness machinery exists to catch. Recommend: EUA arrives only via batch CSV with a real as-of,
   renders `stale` past its cadence, and **never** feeds a statutory computation as though current. The
   formula is seedable; the price is not.
2. **"Regulations: 100% fully functional day one."** True for *what the law says* and for the arithmetic.
   Not yet true for *what applies to this customer*, which needs the applicability profile, and not for
   `binding_position`, which does not exist in the schema yet. The honest v1 claim is: complete statutory
   content and computation, applicability pending. Worth being precise about, because "fully functional"
   is the kind of statement that gets repeated to a customer.
