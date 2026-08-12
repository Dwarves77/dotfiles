# Surface spec 04: Operations

Status: DRAFT for operator review, 2026-08-12.

**Contract (RULED 2026-07-12).** Operations reads are STRUCTURED JURISDICTIONAL DATA SURFACES:
comparative and numerical regional intelligence (feasibility, cost, labour, materials, infrastructure)
for hire-vs-automate and infrastructure decisions. Not a text brief. It is a **content build, explicitly
not a decision-engine UI**.

**Current verdict.** Violates. Two regions cannot be placed on a shared axis anywhere in the UI. The one
affordance that advertises comparison, a dimension chip whose `aria-label` reads "Spotlight a dimension
across regions", resolves to drawing a 2px border on cells inside accordions that are closed by default.
Clicking "Labor markets" with all regions collapsed changes nothing visible on screen. Separately, the
five sourced dimensions have data for 3 of 5 regions, and **EU and US have zero on all five**, because
the only script that has ever written `regional_data_facts` hardcodes `["ASIA","UK","UAE"]` and is on the
dead-code manifest with no scheduler.

**Operator ruling 2026-08-11:** EU and US data is IN scope, sourced over free HTTP. The dead one-shot is
not revived; the new producer is built wired.

---

## 1. The structural fact: two blocks, never one

Professional location-intelligence products split the object into a **cost model** (money, comparable,
additive) and a **quality/capability index** (scores, non-additive), and never mix them in one column.
fDi Benchmark's own framing is the schema: it "compares costs and qualities of investment destinations"
across 2,500 data points and 1,000+ locations ([fdibenchmark.com](https://www.fdibenchmark.com/products)).
CBRE runs Labor Analytics as a separately named product because labour is the dominant operating-cost
line and needs occupation-level resolution, not a country average.

The 2026 Area Development consultant survey gives the industry's live weighting, and it has moved:
**availability of skilled labour 100%, site readiness and due-diligence status 98.5%, electric power
availability 94%**. Feasibility has overtaken price as the binding constraint. **A surface that scores
feasibility instead of gating it gets the decision backwards** (see component 8).

## 2. Composite indicators: the warnings we must respect

The OECD/JRC Handbook's own cons list, reproduced as design constraints, because we are building exactly
the artefact it warns about:

- may send misleading policy messages if poorly constructed or misinterpreted
- may invite simplistic conclusions
- **may be misused to support a desired conclusion if the construction process is not transparent**
- the selection of indicators and weights could be the subject of dispute
- **may disguise serious failings in some dimensions**
- may lead to inappropriate decisions if dimensions that are hard to measure are ignored

And the governing statement: *"Transparency must be the guiding principle of the entire exercise."*

**Consequences for this surface.** Normalise by **distance-to-reference (base region = 100)**, not
min-max, because min-max destroys ratio meaning for cost. **Never hard-code the base region**: a Dutch
forwarder and a Polish forwarder ask the same question from different origins, and a fixed base smuggles
in a point of view. Publish weights. Ship sensitivity as a feature, not an internal check.

## 3. Missing data: the rule that protects everything

1. **Never impute silently. Never impute at all in a cost cell.** A missing electricity price is missing.
   Inventing one and displaying it identically to a real one is precisely the failure the Handbook names.
2. **Explicit flag vocabulary on every cell**, modelled on Eurostat and consistent with the shared
   `status` vocabulary in `00-foundation` §3.1: observed / provisional / estimated (method X) / modelled
   / proxy (from Y) / confidential / not available / not applicable / stale (>N years).
3. **Reference period on every cell.** A 2023 packaging recycling rate assessed against a 2030 target is
   legitimate; presenting it undated is not.
4. **Per-region coverage percentage as a first-class field**: "Region R: 14 of 22 indicators populated."
5. **Suppression rule for aggregates**: if a derived cell would depend on more than ~20% imputed inputs,
   suppress the derived cell and show the components instead.
6. **If you must estimate, name the donor.** "Estimated from Czechia (nearest peer, NACE H, 2024)" is
   defensible. "18.20" is not.
7. **Sensitivity as a shipped feature.** If the automate-vs-hire answer flips when a missing input moves
   within its plausible range, **the surface must say the answer is indeterminate.**

This is also the honest frame for the EU/US hole: making it visible as a row of dashes in one glance is
better product behaviour than hiding it behind two closed accordions, and it correctly prices the data
dispatch that follows.

## 4. The automate-vs-hire model

The output shape, because "supports the decision" is not a spec:

| Field | Note |
|---|---|
| `total_capex` | with a four-layer breakdown |
| `annual_opex_automate` / `annual_opex_hire` | escalated |
| `simple_payback_years` | display, never decide on it alone |
| `discounted_payback_years`, `npv_delta`, `irr` | IRR flagged n/a where cash-flow signs make it meaningless |
| `levelised_cost_per_unit` | €/unit throughput. The true apples-to-apples metric |
| **`breakeven_wage`** | The wage at which NPV = 0. **This is the field that answers "HVAC monitoring vs two people"** |
| **`breakeven_utilisation`** | Systems below roughly 60% utilisation never pay back, so utilisation is a threshold to render, not an assumption to bury |
| `breakeven_energy_price` | |
| `sensitivity_ranking` | Tornado over utilisation, wage growth, ramp duration, energy price, uptime |
| `assumption_set_id` | Versioned, shared across regions |
| `confidence` | Driven by input vintage and coverage, not by the model |

For the solar arm use LCOE with NREL's simple form, capacity factor from PVGIS per site, but carry
LCOE's documented limits forward: it ignores dispatchability and is scale-biased, so for a warehouse the
decision metric is **self-consumption-weighted avoided grid cost**, not raw LCOE.

Practitioner failure modes to design against: building the case on vendor assumptions rather than the
customer's own order data; underestimating IT integration and ramp-up, the largest overrun drivers;
sizing to peak rather than realistic utilisation; automating a broken process without redesign.

## 5. The fully-loaded labour chain

Decisions 1 and 5 both hinge on this and both are routinely wrong because someone used the headline wage.
Render it **as a chain, not a number**, because the chain is the content:

base wage (BLS OEWS / Eurostat SES, at occupation level) → + employer social contributions
(`lc_ncost_r2` / OECD) → + leave and absence → + turnover and recruitment → + shift premium ÷ productive
hours = **€ per productive hour**.

Relevant US SOC codes: 53-7062 Laborers and Freight/Stock/Material Movers, 53-7065 Stockers and Order
Fillers, 53-7051 Industrial Truck and Tractor Operators, 53-3032 Heavy and Tractor-Trailer Drivers,
43-5071 Shipping/Receiving/Inventory Clerks, 11-3071 Transportation/Storage/Distribution Managers,
**49-9021 HVAC Mechanics and Installers** (decision 1), 49-2094 Electrical/Electronics Repairers
Commercial and Industrial, 17-2112 Industrial Engineers.

## 6. Required components

| # | Component | Decision served |
|---|---|---|
| 1 | **Region roster with a coverage ledger** (count and % of populated indicators, oldest reference period in the row) | All five. A comparison whose regions have unequal data density is a comparison of data density |
| 2 | **Dimension × region matrix with dual-layer cells**: native value and unit primary, index vs base region secondary and visually subordinate | Decision 2 is literally this object |
| 3 | **Base-region selector**, never hard-coded | §2 |
| 4 | **Provenance and vintage stamp on every cell**: source, dataset code, reference period, status flag, retrieval date | What makes this intelligence rather than a table, and the only defence against the Handbook's misuse warning |
| 5 | **Fully-loaded labour chain** (§5) | Decisions 1 and 5 |
| 6 | **Automate-vs-hire TCO panel per region** (§4), with `breakeven_wage` and `breakeven_utilisation` given equal prominence to the headline | Decisions 1 and 5. The break-even fields convert a point estimate into a defensible decision |
| 7 | **Sensitivity / break-even strip**, tornado-ordered, utilisation cliff marked | Decisions 1 and 5 |
| 8 | **Feasibility gate layer, evaluated BEFORE cost**: PPWR thresholds, EPR registration and authorised-representative requirements, PFAS limits, national permitting, ETS2. Rendered as gates (blocked / conditional / clear), **never as points added to a score** | Decisions 3, 4, 5. §1 |
| 9 | **Materials supply ↔ compliance join**: recyclate availability by material by region placed directly against the PPWR recycled-content threshold for that material and year | Decisions 3 and 4 **are one decision**. "Is recycled PET available in Region R" and "can I meet the rPET threshold in Region R" are the same query. The join is the product |
| 10 | **Infrastructure read with distance-to-node**: port throughput and CPPI, rail freight, airport cargo tonnage, public HDV charging density, each paired with travel distance and time from the candidate region to the nearest qualifying node | Decision 2. Raw throughput without distance is trivia; distance without capacity is a map. The pair is the operational fact |
| 11 | **Missing-data surface** with reasons, per-region coverage %, and the suppression rule | Protects every decision. §3 |
| 12 | **Assumption register, one versioned object**: discount rate, horizon, energy price path, wage escalation, currency and FX date, productive-hours convention, editable in one place and stamped on every derived output | If the discount rate lives in twelve places, the comparison is not a comparison |

## 7. Free dataset inventory

The most actionable part of this spec. ✅ = real API.

**Energy**: Eurostat `nrg_pc_205` industrial electricity by country and consumption band, biannual, free
JSON-stat API ✅; `nrg_pc_205_c` price components ✅; `nrg_pc_203` gas ✅; EIA API v2 retail electricity by
state and sector, monthly, free key ✅; EIA natural gas by state ✅; ENTSO-E Transparency day-ahead prices
by bidding zone, 15-min, free token ✅.

**Labour**: Eurostat `lc_lci_lev` labour cost levels by country × NACE including **H Transportation and
storage**, €/hour with wage and non-wage split ✅; `lc_lci_r2_q` quarterly index ✅; `lc_ncost_r2`
non-wage cost share, **the fully-loaded multiplier** ✅; `earn_ses_*` Structure of Earnings by **ISCO
occupation** × NACE × firm size ✅; `earn_mw_cur` minimum wages ✅; `lfst_r_lfe2en2` regional employment at
**NUTS 2** ✅; **US BLS OEWS** by SOC × state and MSA with mean, median and p10 to p90, annual, free key,
500 req/day ✅; **BLS QCEW** county × NAICS 493 Warehousing and 484 Truck Transportation, quarterly ✅;
**BLS ECEC** benefits as % of total compensation, the empirical loaded multiplier; **ILOSTAT** SDMX for
~190 countries ✅; OECD Taxing Wages for employer SSC ✅.

**Infrastructure**: World Bank **Container Port Performance Index** ~400 ports, annual; **UNCTADstat**
port call and median time in port; **UNCTAD PLSCI** liner connectivity, mirrored in World Bank Data360 ✅;
**World Bank LPI** 6 dimensions ✅; Eurostat `mar_go_qm` **port-level** goods tonnage ✅; `rail_go_*` ✅;
`avia_gooc` **airport-pair** freight tonnage ✅; `road_go_*` ✅; **EAFO** public HDV charging points by
country and power class; **US DOE AFDC** station-level lat/lon, connector, power, near real-time, free
key ✅; OpenStreetMap/Overpass for warehouses, sidings, port geometry ✅ (uneven quality); EU TENtec.

**Materials and PPWR**: Eurostat `env_waspac` packaging waste by country × material × generated /
recovered / recycled, annual with a **~22-month lag**, latest reference year 2023 ✅; `cei_wm020`
recycling rate by material ✅; `cei_srm030` circular material use rate ✅; **Eurostat Comext** monthly
HS-level trade in recyclate (3915 plastic waste, 4707 paper waste, 7204 ferrous scrap, 7602 aluminium
scrap, 7001 glass cullet) ✅, **the sharpest available proxy for regional recyclate supply**; PRODCOM ✅;
EEA circularity metrics; US EPA Facts and Figures (national only, no state granularity).

**Solar**: **PVGIS v5.3** (JRC), point lat/lon, annual and monthly PV yield, hourly series, TMY, horizon
profile, tilt/azimuth/tracking/losses, free, no key, 30 calls/s ✅. Global Solar Atlas rasters; NREL
NSRDB + PVWatts v8 for the Americas ✅.

**Grid carbon intensity**: **Ember** API, 200+ geographies yearly and 88 monthly, gCO2/kWh, free key,
CC-BY-4.0 ✅; EEA indicator; Electricity Maps free tier ✅ **but non-commercial licence only, so not
usable here**; UK DESNZ conversion factors including **freight gCO2e per tonne-km by mode and vehicle
class**; US EPA eGRID.

**Regulatory and tax**: World Bank B-READY (quintiles, not ranks); EUR-Lex REST and SPARQL ✅; OECD
Corporate Tax Statistics ✅. **Structural gap: 27 separate Member-State EPR registers, no common API.**

**Land and warehouse rent: the honest gap.** No free, authoritative, machine-readable, pan-jurisdiction
dataset exists. Prologis, Cushman & Wakefield, JLL, CBRE and Savills publish free PDFs with inconsistent
definitions. **Design consequence: rent must be a manually curated, provenance-stamped, explicitly dated
cell, visibly of a different quality class from the API-fed cells. Do not launder a PDF number into a
cell that looks identical to a Eurostat cell.**

## 8. PPWR, the join that makes decisions 3 and 4 one decision

Regulation (EU) 2025/40, in force 11 Feb 2025, **applicable from 12 Aug 2026**, with recycled-content and
recyclability obligations biting **1 Jan 2030**. The forwarder is bound as a user of transport and
grouped packaging and where it is importer of record.

**UNCONFIRMED and required before building the join:** the recycled-content percentages for 2030 and
2040, the empty-space ratio, and the transport-packaging reuse targets. The DG ENV page did not carry
them. These are numeric spec inputs and must be read from the Regulation text directly.

## 9. Acceptance criteria

1. A cross-region view exists in which two regions appear on one axis for one dimension, without
   expanding accordions.
2. Every cell carries source, dataset code, reference period, status flag and retrieval date.
3. Zero imputed values in cost cells; zero silent imputation anywhere.
4. Every region row shows its coverage percentage.
5. Derived cells suppress above the imputation threshold and show components instead.
6. The base region is user-selectable and printed wherever an index is shown.
7. Feasibility renders as gates, never as score contributions.
8. `breakeven_wage` and `breakeven_utilisation` render with equal prominence to the headline result.
9. One assumption register, one discount rate, stamped on every derived output.
10. Native units are primary; index is visually subordinate.
11. Distance-to-node accompanies every infrastructure capacity figure.
12. Manually-curated cells (rent) are visually distinguishable from API-fed cells.

## 10. Gap: current state vs this spec

| Spec element | Now |
|---|---|
| Cross-region comparison | **Absent.** The chip draws a border; regions are independent closed accordions |
| Dual-layer cells / index | **Absent.** Values are per-cell strings ("S$0.272 / kWh" beside "Constrained"), no units, no normalisation, no sort |
| Base-region selector | **Absent** |
| Cell provenance | **Partial and false.** The masthead claims "every fact carries a source and date", but `OperationsFact` has no date field and all fact rows have `source_id` NULL, so the surface falls through to unlinked free-text |
| Labour chain | **Absent** |
| Automate-vs-hire TCO | **Absent.** No breakeven fields, no payback, no NPV. Decision 1 has no home: the dimension enum is fixed at six values with a CHECK constraint, and the only place an HVAC-vs-hire comparison could live is section S3, which is prose-only and gated off for EU and US |
| Sensitivity | **Absent** |
| Feasibility gates | **Absent.** Regulatory feasibility (D1) is faked from regulation counts by hand-written regex, and reports 5/5 coverage while `region_dimension_coverage` reports 0 rows for the same dimension. **Two contradictory truths for D1 on one surface** |
| Materials ↔ PPWR join | **Absent.** D1 emits regulation links, D4 emits an unrelated fact list, nothing joins them |
| Distance-to-node | **Absent** |
| Missing-data surface | **Partial.** Honest dashes render, but there is no coverage %, no suppression rule, and `region_dimension_coverage` is fetched, threaded, and consumed only by a `console.log` while the ledger recomputes coverage from raw facts |
| Assumption register | **Absent** |
| Data for EU and US | **Zero on all five sourced dimensions.** No live producer for `regional_data_facts` |
| By-state list | **Broken.** States are enumerated from regulations via a 4-entry regex, so 10 of 13 sourced, cited state cost facts can never render |
| Detail read | Prose. All 8 sections funnel through `ProseSection`; S3 and S4, the two comparative sections, are permanently omit-noted for EU and US because the matrix gate requires ≥2 sourced regions including the item's own |
| Region severity | **Wrong by construction.** Derived from the worst *regulation* in the region, then painted onto every dimension figure, under a severity vocabulary that reads "threshold breached, immediate cost impact" |
| Assistant coverage | `/api/ask` grounds only on `intelligence_items` and `sources`; it cannot see `regional_data_facts`, `region_dimension_coverage` or `state_cost_facts`. The Ask chips ("Warehouse labor, EU vs US") point at exactly the data the Assistant is blind to. **"Structured content plus Assistant" currently has neither half wired for cross-region questions** |
| Customer-visible internal vocabulary | `D1`–`D6` prefixes, "60% of region × dimension cells populated (15 of 25)", "coverage expands weekly", raw enum `regional_data` in the detail rail, raw internal UUID as "ID" |
