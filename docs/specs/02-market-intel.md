# Surface spec 02: Market Intel

Status: DRAFT for operator review, 2026-08-12.

**Contract (RULED 2026-07-12).** Market Intel reads are COMPARATIVE and NUMERICAL: deltas,
trajectories, lead-time against competitors and adjacent industries. Not a compliance-action text
brief.

**Current verdict.** Violates. The comparative *chrome* is built and correct (key-figure column,
trajectory bars, price board, severity and band tiles). Every numeric input behind it is an orphan:
`marketData` has no producer anywhere in `src`, `trajectory_points` is not instructed in the system
prompt, `recommendedActions` has no mapper, the price board is fed by two hardcoded UUIDs from a
hand-run script with no scheduler, and `ProseSection`, the Regulations prose renderer that supports no
tables and no lists, renders 7 of 8 sections. The surface reads as a severity-sorted list of prose
briefs wearing market vocabulary.

---

## 1. The anatomy of a number

This surface lives or dies on whether its numbers carry the envelope in `00-foundation` §2. The
envelope is not decoration: it is what converts a number into something a CFO can budget on and a
lawyer can write into a contract.

**Assessment vs transacted index is the definitional split**, and the product must render them
differently:

- An **assessment** is an expert judgment of where the market was at a timestamp, built from a data
  hierarchy (Platts: firm bids and offers standing at close, then transparent completed transactions
  in-window, then related market data, then calculated), and subject to a **repeatability test**: a
  trade counts only if it arose from a bid or offer available to a broad representation of independent
  parties ([Platts methodology](https://www.spglobal.com/content/dam/spglobal/ci/en/documents/platts/en/our-methodology/methodology-specifications/platts-assessments-methodology-guide.pdf)).
- A **transacted index** is a mechanical volume-weighted average with no judgment. Argus's EU ETS Index
  is a daily VWAP, and *its fallback is itself a methodology disclosure*: if no trades occur, the
  midpoint of the closing bid-offer spread is taken.
- The commercial consequence: **assessments always print, transacted indices go dark in illiquid
  conditions.** Hence FBX's waterfall (fewer than 10 valid rates triggers waterfall methodology; fewer
  than 5 carriers requires assessor validation)
  ([FBX Guide](https://www.balticexchange.com/content/dam/balticexchange/consumer/documents/data-services/documentation/fbx-guides---polices/FBX%20Guide.pdf)).

**Be willing to print "insufficient data."** Xeneta's floor is a minimum of 5 rates per route, per day,
per equipment type before anything publishes ([Xeneta methodology](https://www.xeneta.com/methodology)).

## 2. Signal versus fact

This is the surface's second contract, alongside comparativeness. The industry separates three
orthogonal axes and so must we:

1. **Source reliability × information credibility** (Admiralty, `00-foundation` §3.2).
2. **Likelihood vs analytic confidence** (ICD 203). Never in the same sentence.
3. **Corroboration count**, counting *independent origins*, not mentions. Three trade-press pickups of
   one press release is corroboration = 1. Weighting: primary or regulatory filing > company direct
   disclosure > two independent commercial sources > single trade press > single unattributed.

**Make the promotion event a first-class object with a timestamp.**

```
[SIGNAL]  Corroboration: 2 independent   Confidence: MODERATE
          First seen 4d ago · Last movement 6h ago · UNCONFIRMED
          → promotes to [FACT] on primary-source confirmation
[FACT]    Source: EU Official Journal · Verified 2026-08-04 · immutable
```

**The delta between "first seen as signal" and "confirmed as fact" is this product's headline KPI, and
it is auditable.** Never retroactively rewrite a signal card; version it. Carbon Pulse encodes maturity
in cadence instead (real-time ticker, breaking alerts, curated daily digest); we should encode it in
state and *also* borrow the cadence split for delivery ([Carbon Pulse](https://carbon-pulse.com/what-we-offer/)).

## 3. The comparative vocabulary

Specific patterns, with their conventions, because "make it comparative" is not a spec.

- **Rebase to 100** for series in different units. State the base in the axis label (`Index, Jan-2024 =
  100`). Rebasing changes the reference point, not the measured change ([BLS](https://www.bls.gov/cpi/factsheets/rebasing.htm)).
  **Failure mode: rebasing to a period that was itself an outlier**, which makes every other series
  look wrong while appearing rigorous.
- **Percentage points vs percent.** Ratios move in points, quantities move in percent. IATA's monthly
  air cargo analysis distinguishes load-factor "%-pt change" from CTK "+5.5%". Mixing them is a tell
  for an unserious product. Enforce `pp` vs `%` typographically at component level.
- **The standard row**: `current | Δ1w | Δ1m | Δ3m | ΔYoY | 52w range position | sparkline`. The
  52-week range position answers "is this move big?" without a volatility model.
- **Percentile bands.** Xeneta publishes market low (2.5th percentile), market average and market high
  (97.5th percentile) per corridor. **The band is the product**: the customer's own rate plotted inside
  it is the entire value proposition.
- **Forward curves**: solid for realised, dashed for forward, shaded fan for scenarios, and the fan
  **must be labelled** with what it represents. An unlabelled fan is the most misread object in market
  intelligence.
- **Peer cohorts**: show the distribution with a marker for "you", and make the cohort definition
  visible and editable. A benchmark against the wrong cohort is worse than none.
- **Lead-time chart**: a horizontal timeline with x-axis in *months*, not score, carrying a marker for
  the customer, a distribution for the direct-peer cohort and a band for the adjacent-industry cohort.
  Read: "you are 14 months ahead of the forwarding median and 6 months behind the automotive OEM
  cohort." This is the contract's third clause made concrete, and nothing in the product does it today.

## 4. Freight benchmark patterns

The corridor is the atomic unit, and corridor definitions are proprietary and non-comparable across
vendors, which is itself a fact to surface.

- **FBX**: 12 tradelanes plus a weighted global composite; all-in port-to-port 40ft non-refrigerated;
  includes ocean freight and seaborne surcharges; **excludes** origin/destination port charges and
  import customs.
- **Drewry WCI**: 8 named port pairs volume-weighted; USD/40ft; **includes BAF, the EU ETS surcharge**,
  peak season, equipment, port dues, security, canal transit, congestion and customary THC; excludes
  documentation, booking, customs and all inland. Outlier filter: median first, drop >30% variance
  ([Drewry](https://www.drewry.co.uk/logistics-executive-briefing/logistics-executive-briefing-articles/world-container-index-methodology)).
- **Baltic Air Freight Index / TAC**: weekly transactional USD/kg, six origin airports, 17 destination
  baskets.
- **The sustainability hook is already in the freight rate.** WCI enumerates the EU ETS surcharge as an
  included component. **Carbon cost is now inside the price of freight**, which is the natural join
  between this surface and Regulations, and the single most defensible "only we do this" component
  available to us.

**Spot vs contract is the primary axis, not a filter.** Xeneta runs both, and **the spread between them
is the actionable read**: contract lags spot by roughly a quarter, so a widening spot-over-contract
spread is a forward warning that renewals will reprice up.

**What forwarders actually look at, in rough order of decision weight:** their lane against the market
band; the spot-to-contract spread and its direction; capacity signals ahead of price (blank sailings,
deployed capacity by week, which is what price follows); schedule reliability and average delay days;
surcharge decomposition, because BAF, ETS and congestion move independently of base rate and are billed
through; and capacity structure by operator.

## 5. Methodology disclosure

IOSCO PD391 is the de facto standard and a commercial passport, not a compliance cost: ICIS and Argus
both publicise their annual IOSCO audits, and FBX is administered under UK Benchmarks Regulation. **The
audit certificate is what lets a number be written into a contract clause.**

Publish: a versioned, dated, free methodology document; all criteria and procedures including how
volume, transactions, bids and offers are used, the guidelines controlling judgment, the relative
importance of each criterion, transaction thresholds and what happens when they are not met,
**procedures addressing key-submitter dependency** (the one everyone forgets and the one that kills
small indices), and criteria for excluding data; the rationale; **change control with advance notice
and published stakeholder comments plus our responses**, because silent methodology changes are the
cardinal sin; periodic review; per-assessment disclosure of liquidity, mix and judgment; an audit trail
of every judgment, exclusion and rationale retained five years; conflicts of interest; a complaints
procedure with independent recourse; and eventually external audit.

We are not a PRA today. We should adopt the disclosure discipline now and grow into the audit, because
retrofitting an audit trail is impossible.

## 6. Required components

| # | Component | Decision it serves |
|---|---|---|
| 1 | **Comparative ribbon**: 6 to 10 headline metrics, each `level · Δ1w · Δ1m · ΔYoY · sparkline · as-of` | The 15-second "has anything moved that changes my week" read. The contract in its most literal form |
| 2 | **Corridor rate board** with P2.5 / average / P97.5 bands, spot and contract series, `n`, and the customer's own rate if supplied | Am I overpaying, and do I renew or ride spot |
| 3 | **Carbon cost overlay on the freight rate**: EUA × maritime phase-in, ETS2, CBAM, UKA, expressed as **cost per FEU per corridor**, not EUR/tCO2e | What is the carbon component of my quote, and where is it going. The differentiating component |
| 4 | **Signal feed with promotion state**: signal/fact, corroboration count, ICD-203 confidence, first-seen, last-movement, promotion timestamp | What do I need to know before my competitor, and how much do I bet on it |
| 5 | **Lead-time position chart** (months axis; you, peer cohort, adjacent-industry band) | When must I act before a customer RFP starts scoring me on it. Converts vague pressure into months |
| 6 | **Peer cohort benchmark** with visible, editable cohort definition and distribution | Which competitors am I losing tenders to, and on what dimension |
| 7 | **Capacity and reliability forward panel**: deployed capacity 12 weeks out, blank sailings, schedule reliability, average delay | Do I book early, and what do I tell a time-critical art or live-events client about transit risk |
| 8 | **Fuel and energy strip**: jet kerosene, marine gasoil/VLSFO proxies, EU diesel by member state, SAF premium where obtainable | Where are BAF and FSC going next quarter |
| 9 | **Policy timeline** (dated, forward-looking, "days until", filtered by mode and geography) — *not* a text brief, that is Regulations' job | What deadline determines this quarter's investment |
| 10 | **Methodology and provenance drawer**, one click from any number | Can I forward this screenshot to my customer's procurement team |
| 11 | **Freshness panel**: last-updated and next-expected on every series, visibly degraded past cadence | Trust calibration. Cheap to build, disproportionate return |
| 12 | **Watchlist and threshold alerting**, alerting on breach with delta and band context, not level | Tell me when my number moves; I will not open this daily |

## 7. Free data sources for a $0 build

Named, with cadence and access route. Three are unusually well suited because they are already
panel-shaped and timestamped.

| Dataset | What | Cadence | Access |
|---|---|---|---|
| **EMSA THETIS-MRV** | **Per-ship verified** CO2, fuel, distance, time at sea, transport work and efficiency for ships >5,000 GT calling at EEA ports, with the verifier named | Annual | Free public portal, [mrv.emsa.europa.eu](https://mrv.emsa.europa.eu/#public/emission-report). **The highest-value free dataset available to this product: vessel-level, verified, and it lets us benchmark actual carriers** |
| **SBTi Target Dashboard** | Per company: sector, region, near-term and net-zero status including **commitment removed**, target type, scopes, base year, temperature classification | **Weekly, Thursdays** | Free .xls, no login, [sciencebasedtargets.org/target-dashboard](https://sciencebasedtargets.org/target-dashboard). **This is the diffusion engine behind the lead-time chart** |
| **EU Weekly Oil Bulletin** | Diesel and Eurosuper by EU-27 member state, with and without taxes, history to 2005 | Weekly (Thu) | Free .xlsx, [energy.ec.europa.eu](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) |
| **EIA Open Data API v2** | Spot and futures, retail diesel by state and PADD, kerosene/jet, residual fuel | Daily to monthly | Free, API key, [eia.gov/opendata](https://www.eia.gov/opendata/) |
| **EEX environmentals hub** | EUA primary auction clearing price, volume, full history; daily open interest | Per auction | Free, [eex.com](https://www.eex.com/en/market-data/market-data-hub/environmentals-data) |
| **EEA EU ETS Data Viewer** | Verified emissions, allocations, surrenders by installation and sector, including aviation and maritime | Annual | Free |
| **Berkeley Voluntary Registry Offsets Database** / **CarbonPlan OffsetsDB** | Project-level issuances and retirements, harmonised | Quarterly / frequent | Free |
| **Sea-Intelligence press room** | Headline monthly global schedule reliability | Monthly | Free headline figures |
| **Alphaliner TOP 100** | Operator deployed TEU, owned vs chartered, orderbook, share | Daily | Public overview |
| **IATA Air Cargo Market Analysis** | CTK, ACTK, cargo load factor, yields by region and route area, with jet fuel and PMI context | Monthly | Free PDF, parse tables |
| **Eurostat transport** | Freight tonne-km by mode, modal split, port and airport freight volumes | Quarterly/annual | Free API |
| **ECB Data Portal** | Daily EUR reference rates | Daily | Free API, `eurofxref-daily.xml`, [ecb.europa.eu](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html). Needed to normalise multi-currency series. **Producer built** (`scripts/producers/market/ecb-fx-producer.mjs`) and **registered** (`public.data_sources` row `ecb`, migration 281, 2026-09-02 — licence text [UNCONFIRMED] pending a live read, see that migration's header); still kill-switched OFF by default (the runtime env switch) pending an operator-dispatched dry-then-apply run — no live rows yet |

**What we cannot get free**: contract rate benchmarks at Xeneta/Drewry granularity. Say so on the
Coverage surface rather than approximating them.

## 8. Acceptance criteria

1. Every rendered figure carries the full envelope; zero figures without `derivation`, `as_of` and
   `unit`.
2. Zero UI fields bound to a producer that does not exist in `src` (today: `marketData`,
   `recommendedActions`, `cross_references`).
3. Count population equals row population (today they differ: counts include `technology` and
   `innovation`, rows do not).
4. `ProseSection` is not imported by this surface; a comparative section can render a table.
5. Every signal carries corroboration count of *independent origins* and a promotion-state timestamp.
6. Ratio changes render as `pp`, quantity changes as `%`.
7. No series renders past its `expected_refresh` without visible degradation.
8. Any chart with a rebased axis prints its base period in the axis label.
9. No cohort renders without its definition and size.
10. Methodology page exists, is versioned, and every number links to it.

## 9. Gap: current state vs this spec

| Spec element | Now |
|---|---|
| Number envelope | **Absent.** No derivation class, no `n`, no methodology version |
| Comparative read | **Absent in substance.** Chrome present, all numeric inputs orphaned |
| Key-figure column | Reads `item.marketData?.currentPrice`; **no producer exists**. Permanent em-dashes |
| Trajectory | `trajectory_points` not instructed in the system prompt; panel is a hardcoded pending frame |
| Corridor rate board | **Absent** |
| Carbon cost per FEU | **Absent.** The differentiating component does not exist |
| Lead-time chart | **Absent.** Zero comparative affordances: grep for "lead time", "vs prior", "delta", "competitor", "adjacent" across the market tree returns nothing |
| Signal/fact state | Partial. An "Unverified" chip exists but is **unconditional** (`isSignalType = !!r.type`, and the mapper defaults type to `"uncertain"`), so a verified regulation opened here renders labelled Unverified. An epistemic-integrity inversion |
| Peer cohort | **Absent** |
| Capacity/reliability | **Absent** |
| Methodology drawer | **Absent.** The Methodology card claims convergence scoring the index does not implement |
| Freshness | **Absent.** PriceBoard prints "Next release: date" against a hand-run script with no scheduler |
| Market series producers (WO-16, `market_series`) | **Partial, updated 2026-09-02 (Lane PROD).** Of the four registry entries (`src/lib/market/series-registry.mjs`): EU Weekly Oil Bulletin is implemented, registered, kill-switch-armable, and has run live (6 rows). ECB FX is implemented, source-registered (migration 281), and its own `ENABLED` reviewed-code gate is now true — still kill-switched OFF by default (runtime env switch) pending a dispatched dry-then-apply run; a `--since YYYY-MM-DD` history backfill mode also shipped this commit (`fetch-oil-bulletin.mjs`), unrun against the live workbook. EIA v2 is implemented and source-registered but has **no GitHub Actions workflow step** — blocked on `EIA_API_KEY` not being a registered GitHub Actions secret (`.github/workflows/producers.yml`'s own comment on the `eia-v2-petroleum-spot` dispatch choice names the exact blocking check). EEX EUA remains an undocumented stub (no licence found). **No `market_series` row from any of these three sits behind a live comparative UI component yet** — this table's own earlier rows (Key-figure column, Trajectory, Freshness) describe a different, still-orphaned data path (`item.marketData`), not `market_series` |
| Format sections first-class | 1 of 8 (Sources). 7 of 8 are prose through the Regulations renderer |
| Detail route surface guard | **Fixed** in PR #450 |
| Customer-visible roadmap language | Present: "band tagging is being backfilled", "once the commodity-price feed is connected", "lands when the workspace-membership backend ships", "pending tier review in the Admin queue" |

## 10. Failure modes to design against

Stale presented as live. Unlabelled estimates rendered identically to observations. False precision.
Survivorship in indices and cohorts (track exits explicitly; SBTi's "commitment removed" status is
exactly this and must be counted). Key-submitter dependency. Thin-market printing. Silent methodology
change and undisclosed series breaks. Cohort gerrymandering. Rebasing to an outlier. Ratio/percentage
confusion. Corroboration inflation. Circularity, where our own published number feeds a customer rate
that is then submitted back as an input. Alert fatigue, answered with threshold-based rather than
event-based alerting.
