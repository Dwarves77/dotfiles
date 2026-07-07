# Classification rules audit, 2026-05-09

## Snapshot context

- Snapshot timestamp (start of audit run): `2026-05-10T03:11:03.988Z`
- `intelligence_items` count at snapshot: **613**
- `intelligence_items` count one minute later (re-probed at `2026-05-10T03:12:20.341Z`): **618**
- Cold-start backfill (background task `b37bz0u4z`) is concurrent. The corpus is climbing at roughly 5 items per minute as of this run. All counts in this doc are anchored to the 613-row snapshot; results do not include rows the cold-start writes after `2026-05-10T03:11:03.988Z`.
- `sources` count: **783**.
- Sources that have shipped at least one item: **562**.
- Sources that have shipped exactly one item: **553** (98.4 percent of contributing sources). The corpus is one-shot-per-source dominated; only nine sources have contributed 2 or more items so far.
- Read-only investigation. No DB writes, no schema changes, no item deletions, no LLM calls. The throwaway script lived at `fsi-app/scripts/_classification-temp.mjs` and its JSON output at `fsi-app/scripts/_classification-out.json`; both were deleted at the end of the run.
- Two prior surveys provide upstream context and are extended, not duplicated, here:
  - `dotfiles/docs/four-page-architecture-survey-2026-05-09.md`
  - `dotfiles/docs/topic-relevance-investigation-2026-05-09.md`
- A concurrent primitives audit (`af7aa0bda45070c51`) writes to `dotfiles/docs/primitives-audit-2026-05-09.md`; this doc does not touch that file.

## TL;DR

Per-rule pass / ambiguous / fail across 613 items:

| Rule | Pass | Ambiguous | Fail |
|---|---:|---:|---:|
| Regulatory | 55 | 428 | 130 |
| Research | 59 | 522 | 32 |
| Market Intel | 8 | 162 | 443 |
| Operations | 38 | 551 | 24 |

Primary category, deterministic assignment (highest-confidence pass wins; tie-break Reg, Ops, Research, Market Intel; otherwise Out of Scope or Ambiguous):

| Primary | Count | % |
|---|---:|---:|
| Regulatory | 55 | 9.0 |
| Research | 47 | 7.7 |
| Operations | 35 | 5.7 |
| Market Intel | 8 | 1.3 |
| Regulatory (single-rule ambiguous) | 5 | 0.8 |
| Research (single-rule ambiguous) | 2 | 0.3 |
| Out of Scope (garbage extraction) | 49 | 8.0 |
| Pure Out of Scope (failed all four rules) | 0 | 0.0 |
| Ambiguous (multi-rule ambiguous, no clean pass) | 412 | 67.2 |

Highest-leverage finding: **412 of 613 items, 67 percent, sit in the multi-ambiguous bucket where two or more rules return ambiguous and none returns a clean pass.** The bucket is not noise. It contains EUR-Lex regulations (`CountEmissions EU`), IGO frameworks (`Getting to Zero: Green Corridors`, `World Bank Carbon Pricing Dashboard`), industry coalitions (`European Clean Trucking Alliance`, `Sustainable Packaging Coalition`), and tier-1 ministry homepages (`Germany BMDV`, `Mexico SEMARNAT`). The reason most of them are ambiguous and not pass is structural, not editorial: the snapshot lacks the schema fields the rules need to evaluate (effective date, originating-body provenance type, quantitative-content flag, primary-vs-secondary source role). Until those fields exist, no rule-based classifier of any sophistication, including an LLM, can drive these items to a deterministic pass on the existing data alone. The audit's strongest signal is therefore not "the rules are wrong" but "the schema does not carry the inputs the rules need."

49 of the 613 items are garbage-extraction (Cloudflare interstitial, CAPTCHA gate, 403 page misclassified as a regulation), 8 percent of the corpus. This number has grown from the 37 found in the topic-relevance audit yesterday to 49 today, tracking with the cold-start writing more parliamentary-scrape rows. The fetch-quality filter the operator already has paused for in-flight tooling would handle the entire bucket as a 30-line pre-classify gate.

## A. Per-rule corpus classification

### A.1 Regulatory rule

The four conditions evaluated per item:

- **C1**: legal-obligation language present (`shall`, `must comply`, `required`, `prohibition`, `deadline`, `effective`, `adopted`, etc.) OR `item_type IN ('regulation','directive','standard','guidance','framework')`.
- **C2**: in force OR adopted with set effective date (`status IN ('in_force','adopted','superseded','expired','repealed')` OR `entry_into_force` populated OR `compliance_deadline` populated OR text contains "effective from", "in force", "enters into force", "gazetted", "published in the official journal").
- **C3**: relevant jurisdiction (`jurisdictions` non-empty OR source's `intelligence_types` non-empty).
- **C4**: primary legal authority host (matches one of the regulator host patterns: `*.gov`, `eur-lex.europa.eu`, `*.parliament.*`, `imo.org`, `icao.int`, `legifrance`, `bcn.cl`, `congreso.*`, gazette portals, etc.).

Counts: **pass 55, ambiguous 428, fail 130**.

Top ambiguity reason: `passes 2 of 4`. The most common 2-of-4 pattern is C1 + C3 (text reads like a regulation, item carries jurisdictions) but C2 fails because there is no `entry_into_force` / `compliance_deadline` and the status is the default `monitoring`, and C4 fails because the source URL is an IGO portal, an industry coalition, or a `.org` body. The next most common 2-of-4 is C1 + C4 (regulator host plus regulation-shaped item) but no enforceable jurisdiction or no effective date.

Quoted Regulatory pass samples (5 of 55):

1. **CountEmissions EU**, EUR-Lex via European Parliament Legislative Train Schedule. Item type `regulation`, host `europarl.europa.eu`. Summary: "PROPOSED, not yet adopted. Legislative process ongoing. ACTION NOW: Implement ISO 14083-aligned reporting now, CountEmissions will make it mandatory."
2. **CARB Advanced Clean Trucks**, California Air Resources Board, host `ww2.arb.ca.gov`. Item type `regulation`. Summary: "IN FORCE. ACT sales requirements active. ACF fleet requirements phasing in. Federal waiver challenge creates uncertainty."
3. **EU CO2 Standards for Heavy Trucks**, EUR-Lex / Official Journal, host `eur-lex.europa.eu`. Item type `regulation`. Summary: "IN FORCE. 2030 target is the first major milestone, expect rapid fleet transition acceleration from 2026-2030."
4. **IMO MARPOL Annex VI**, International Maritime Organization, host `imo.org`. Item type `regulation`. Summary: "IN FORCE. Foundation regulation. EEXI operational from 2023."
5. **Brazil Logistica Reversa**, Ministerio do Meio Ambiente e Mudanca do Clima, host `gov.br`. Item type `regulation`. Summary: "IN FORCE. Expanding scope. ACTION NOW: Verify reverse logistics compliance for clients shipping to Brazil."

Quoted Regulatory ambiguous samples (5 of 428):

1. **Alternative Fuels Insight (IRENA/IMO)**, host `irena.org`. Reason: passes 2 of 4. C1 satisfied (item type framework), C3 satisfied (item carries jurisdictions). C2 fails (no effective date, status = monitoring). C4 fails (irena.org is not in the regulator host pattern list).
2. **Lloyd's Register Fleet Analytics**, host `lr.org`. Reason: passes 2 of 4. The Lloyd's Register block of 41 items is dominated by regulatory-shaped briefs whose source is a classification society, not a regulator; C4 fails for every one of them.
3. **Germany BMDV**, host `bmdv.bund.de` (or similar). Reason: passes 2 of 4. C1 + C3 satisfied. C2 fails on the snapshot's `status='monitoring'` default; the item describes hydrogen corridors and LNG/NH3 shipping but carries no `entry_into_force`. C4 satisfied for the host but the heuristic missed it because the URL is a `.bund.de` host not in the regulator pattern set, a false negative discussed in the methodology section.
4. **Getting to Zero: Green Corridors**, IGO consortium. Reason: passes 2 of 4. Looks like a directory of established corridors; not a regulation, not enforced.
5. **Sustainable Packaging Coalition**, industry body. Reason: passes 2 of 4. Reads like guidance but the source is `.org` not a regulator.

Quoted Regulatory fail samples (5 of 130):

1. The 49 garbage-extraction items mostly fail Regulatory: titles like "Cloudflare Security Verification, Danish Parliament Website" or "ESPO Website Security Verification Page" carry no obligation language and no effective date. They satisfy C4 (the underlying host is `.gov` or `.eu`) but fail C1, C2, C3.
2. Trade-press market-signal items: `International Roadcheck 2026 ELD and Cargo Securement Focus`, host `freightwaves.com`. Fails C4 (not a regulator host) plus typically fails C2.
3. Pure research summaries on academic hosts: `MIT Center for Transportation and Logistics`, host `ctl.mit.edu`. Fails C1 and C4.
4. Vendor PR: `Hydrogen Insight: Industry Intelligence on Clean Hydrogen Market Developments`, host `hydrogeninsight.com`. Fails C1, C2, C4.
5. Industry coalition position papers: `European Clean Trucking Alliance`, host `clean-trucking.eu`. Fails C1, C4.

### A.2 Research rule

The four conditions evaluated per item:

- **C1**: forward-looking (text contains `draft`, `consultation`, `proposed`, `under review`, `forecast`, `projection`, `future`, `emerging`, `horizon`, `scenario`; OR `pipeline_stage IN ('draft','active_review')`; OR `item_type='research_finding'`; OR status not yet in force).
- **C2**: originates from rulemaking, IGO, academic, or named research institution (text mentions MIT, Cambridge, Oxford, NREL, IEA, IRENA, World Bank, IMO MEPC, ICAO CAEP, peer-reviewed; OR host matches `.edu`, `.ac.uk`, `irena.org`, `iea.org`, `nrel.gov`, `lbl.gov`, etc.).
- **C3**: named provenance (source has a name, OR the item text mentions an originating body).
- **C4**: relevant to verticals or transport modes (text contains a freight/cargo/transport/sustainability anchor, OR the source carries a domain).

Counts: **pass 59, ambiguous 522, fail 32**.

Top ambiguity reason: `passes 3 of 4 (C1, C3, C4)`. The persistent failure is C2: text reads forward-looking, the source has a name, the item is freight-relevant, but the source is neither an academic institution, a national lab, an IGO research arm, nor a formal rulemaking process. The pipeline correctly identifies a forward-looking item, but the rule's strict provenance requirement makes most of these ambiguous rather than pass.

Quoted Research pass samples (5 of 59):

1. **Alternative Fuels Insight (IRENA/IMO)**, host `irena.org`. Item type `framework`. C2 satisfied via the IRENA host pattern.
2. **World Bank Carbon Pricing Dashboard**, host `carbonpricingdashboard.worldbank.org`. Item type `framework`. C2 satisfied via the worldbank.org host pattern.
3. **NREL Transportation R&D**, host `nrel.gov`. Item type `regulation` (mis-typed at ingest, but the host plus item content satisfy all four research conditions).
4. **MIT Center for Transportation & Logistics**, host `ctl.mit.edu`. Item type `research_finding`. C2 satisfied via mit.edu.
5. **Cranfield Sustainable Logistics**, host `cranfield.ac.uk`. Item type `research_finding`. C2 satisfied via the .ac.uk pattern.

Quoted Research ambiguous samples (5 of 522):

1. **Germany BMDV**, item describes hydrogen corridor planning but the source is the Federal Ministry of Transport, not a research institution. Passes C1, C3, C4; fails C2.
2. **CDP Supply Chain**, an annual disclosure programme. Forward-looking pass, named provenance, freight-relevant; fails C2 because CDP is a coalition rather than an academic body.
3. **Getting to Zero: Green Corridors**, an industry-coalition directory. Same pattern.
4. **Sustainable Packaging Coalition**, industry body guidance.
5. **European Clean Trucking Alliance**, advocacy body for ZEV truck adoption.

The pattern is clean: industry coalitions, advocacy groups, and government ministries all show forward-looking activity but are not "named research institutions" under the operator's strict reading of the rule. The rule as written would route them to Out of Scope; the heuristic conservatively marks them ambiguous.

### A.3 Market Intel rule

The five conditions:

- **C1**: forward-indicating commercial signal (text contains `price`, `capacity`, `deployment`, `launch`, `partnership`, `orders`, `delivery`, `expansion`, `investment`, `million`, `billion`, `shortage`, `merger`, `strike`, `spot rate`, `index`, etc.; OR `item_type IN ('market_signal','initiative','innovation','technology')`; OR `domain IN (2,4)`).
- **C2**: quantitative content (regex matches a currency amount, a percentage, a unit like MW / GW / TEU / tons / kWh / km, a quarter like Q1 2026, or a year 20xx).
- **C3**: named industry data provider, trade press, or vendor announcement (host matches FreightWaves, Lloyd's List, JOC, Reuters, Bloomberg, Splash247, etc., OR source `intelligence_types` includes MKT or NEWS).
- **C4**: NOT yet codified in binding regulation (status not in `in_force / adopted / etc.` AND item_type not regulation/directive).
- **C5**: affects verticals/transport modes (text contains a freight anchor).

Counts: **pass 8, ambiguous 162, fail 443**.

Top failure reason: 0 of 5 or 1 of 5. Most items in the corpus are regulatory or research-shaped, not market-shaped, so C1 and C2 simultaneously fail. The 8 passes are concentrated on the small set of trade-press hosts that the cold-start has reached so far (FreightWaves, Splash247, Hydrogen Insight, CleanTechnica, Maritime Carbon Intelligence).

Quoted Market Intel pass samples (5 of 8):

1. **Maritime CCS Infrastructure Expansion and IMO Net-Zero Framework Development Accelerate in May 2026**, host `maritimecarbonintelligence.com`. Item type `market_signal`. Quantitative: "2-20M tons CO2/year storage", "MEPC 84".
2. **International Roadcheck 2026: ELD and Cargo Securement Focus Expected to Impact Spot Rates and Capacity**, host `freightwaves.com`. Item type `market_signal`. Quantitative: "May 12, 2026" plus historical data references.
3. **Commercial Carrier Journal**, host `ccjdigital.com`. Item type `market_signal`.
4. **May 2026 Maritime Intelligence Brief: Hormuz Instability Drives War Risk Innovation, Nuclear Shipping Initiative Launched, Dry Bulk M&A Escalates**, host `splash247.com`. Item type `market_signal`.
5. **Air Cargo Market Dynamics: Elevated Rates, Geopolitical Impacts, and Capacity Adjustments (May 2026)**, host `aircargonews.net`. Item type `market_signal`. Names carriers (Emirates SkyCargo, Lufthansa).

The 8-pass count is structural: the registry has only 38 trade-press / market-news sources of the 718 active ones (per the four-page survey), and only a handful of them have been scanned by the cold-start so far. The Market Intel rule is well-formed but the corpus does not carry enough market-shaped content for the rule to discriminate at scale yet.

Quoted Market Intel ambiguous samples (3 of 162):

1. **CDP Supply Chain**, passes 3 of 5: C1 (forward signal), C3 (named provider), C5 (freight-relevant). Fails C2 (no quantitative content in summary) and C4 (not strictly forward, also is an "active programme").
2. **World Bank Carbon Pricing Dashboard**, passes 3 of 5: similar pattern.
3. **Splash247 Green**, passes 4 of 5 (C1, C3, C4, C5). Fails C2 only because the snapshot summary is generic ("Maritime green tech news; alternative fuels, vessel technology") with no specific quantitative content. The full item text would likely satisfy C2 if the heuristic could read past the summary.

### A.4 Operations rule

The four conditions:

- **C1**: jurisdictional fact (`jurisdictions` non-empty OR `item_type='regional_data'` OR `domain IN (3,6)`).
- **C2**: tariff / wage / permit / infrastructure-access keyword present (`tariff`, `wage`, `electricity rate`, `kWh`, `permit`, `permitting`, `port slot`, `airport handling`, `interconnection`, `building code`, `drayage`, `terminal handling`, etc.).
- **C3**: government data, recognized utility/labor data provider, OR named permitting authority (host in BLS / Eurostat / EIA / FERC / CPUC / Ofgem set, OR text mentions BLS / Bureau of Labor Statistics / Eurostat / Ofgem / public utility commission / tariff schedule / industrial electricity, OR host matches a regulator pattern).
- **C4**: jurisdiction is one we operate in or are evaluating (any non-empty `jurisdictions` array; the platform is global so the bar is low).

Counts: **pass 38, ambiguous 551, fail 24**.

Top ambiguity reason: `passes 2 of 4`. The persistent failure is C2: most items in the corpus describe regulatory programmes or research findings, not utility tariffs or wage schedules. C1, C3, and C4 all succeed for many items (a CARB rule has jurisdictions, a regulator host, and a relevant jurisdiction), but C2 requires a tariff / wage / permit signal specifically, which most items lack.

Quoted Operations pass samples (5 of 38):

1. **CARB Advanced Clean Trucks**, host `ww2.arb.ca.gov`. C2 satisfied via "fleet" / "drayage" keywords; C1 satisfied via jurisdictions; C3 satisfied via regulator host; C4 satisfied. Note: this item passes both Regulatory and Operations; the primary-category tie-break routes it to Regulatory.
2. **Industrial Electricity Tariff Benchmarks by Jurisdiction**, host `iea.org`. Item type `regional_data`. C2 satisfied via `tariff` and `electricity rate`; C1 satisfied via item type.
3. **Warehouse Solar & BESS ROI Analysis**, host `nrel.gov`. Item type `research_finding`. C2 satisfied via "warehouse" + "ROI" + "LCOE $30-50/MWh"; C1 satisfied via jurisdictions.
4. **California Advanced Clean Fleets Rule (CARB)**, host `ww2.arb.ca.gov`. Same pattern as ACT.
5. **Georgia EPD Annual Open Burning Ban and Drought Response**, host `epd.georgia.gov`. Item type `directive`. C2 satisfied via "permit" / "permitting" / "annual ozone season"; C1 satisfied via Georgia jurisdiction; C3 satisfied via `.gov` host.

Quoted Operations ambiguous samples (5 of 551):

1. **Alternative Fuels Insight (IRENA/IMO)**: passes 2 of 4. C1 + C3 satisfied; C2 fails (no tariff/wage/permit content); C4 fails (jurisdictions empty).
2. **Lloyd's Register Fleet Analytics**: passes 2 of 4. Same pattern; the LR block of 41 items uniformly fails C2.
3. **Germany BMDV**: passes 2 of 4.
4. **CDP Supply Chain**: passes 2 of 4.
5. **Getting to Zero: Green Corridors**: passes 2 of 4.

### A.5 Out of Scope

Pure Out of Scope (an item that fails the rule for all four other categories): **0 items** in the snapshot.

Out of Scope by garbage-extraction: **49 items**. These are items whose title matches a Cloudflare / CAPTCHA / 403 / scheduled-maintenance pattern. They were short-circuited to the garbage bucket before rule evaluation because their content is not a regulatory / research / market / operations object at all; it is a fetch-failure interstitial misclassified as content. The 49 items break down by host:

- Parliament-scrape garbage: Hellenic Parliament, Cyprus Parliament, Portuguese Parliament, Maltese Parliament, Tasmanian Parliament, Northern Territory Legislative Assembly, Wisconsin State Legislature, NHDES, Federal Register, ESPO, Kentucky EEC, Minnesota PUC, NRDEC. Cloudflare or CAPTCHA blocks dominate.
- Same pattern as observed in `topic-relevance-investigation-2026-05-09.md`. Count has grown from 37 to 49 since that audit, tracking the cold-start writing additional parliamentary scrapes.

The fact that pure Out of Scope is zero while multi-ambiguous is 412 is the clearest signal in the audit. The rules are well-defined enough that nothing in the corpus categorically fails all four; the corpus is consistently sustainability-and-freight-adjacent. The structural problem is that ambiguity dominates, not that the rules are too lax.

## B. Primary-category distribution and cross-tabs

Total per-primary counts (repeated from TL;DR):

| Primary | Count |
|---|---:|
| Regulatory | 55 |
| Research | 47 |
| Operations | 35 |
| Market Intel | 8 |
| Regulatory (single-rule ambiguous) | 5 |
| Research (single-rule ambiguous) | 2 |
| Out of Scope (garbage) | 49 |
| Out of Scope (pure) | 0 |
| Ambiguous (multi-rule) | 412 |

### B.1 Cross-tab against `domain` (1..7)

| domain | Reg | Res | Ops | Mkt | Amb | OOS-garbage | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 (regulations and policy) | 53 | 35 | 33 | 8 | 370 | 49 | 549 |
| 2 (technology and innovation) | 1 | 2 | 0 | 0 | 7 | 0 | 10 |
| 3 (operations and infrastructure) | 0 | 0 | 0 | 0 | 10 | 0 | 10 |
| 4 (markets and economics) | 0 | 2 | 0 | 0 | 14 | 0 | 17 (incl. 1 res-amb) |
| 5 (humanitarian and resilience) | 1 | 2 | 0 | 0 | 5 | 0 | 8 |
| 6 (energy and facilities) | 0 | 0 | 2 | 0 | 2 | 0 | 4 |
| 7 (other / horizon) | 0 | 6 | 0 | 0 | 4 | 0 | 10 |

Three observations:

1. The 87 percent domain-1 dominance noted in the four-page survey is reinforced. 549 of 613 items are domain-1, and the rule-based classifier finds Regulatory passes (53), Research passes (35), and Operations passes (33) all inside domain-1, not in the domains nominally aligned with those buckets. This means `domain` as currently encoded does not align with the rule-based five-category taxonomy. Domain-1 is acting as a catch-all.
2. Domain 3 (operations and infrastructure), the natural home for an Operations-passing item, has 10 items in the snapshot, all classified Ambiguous (multi). Zero of them pass the Operations rule because they lack the tariff / wage / permit specificity the rule demands. They are mostly framework or guidance items about port operations or freight corridors.
3. Domain 4 (markets and economics) has 17 items, of which only 2 pass the Research rule (e.g., World Bank Carbon Pricing Dashboard) and zero pass Market Intel. The 14 multi-ambiguous items in domain 4 are mostly initiatives or frameworks that read like industry signals but lack quantitative content.

### B.2 Cross-tab against `item_type`

| item_type | Reg | Res | Ops | Mkt | Amb | OOS-garbage | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| regulation | 46 | 9 | 7 | 0 | 83 | 0 | 145 (incl. 5 reg-amb) |
| directive | 4 | 2 | 1 | 0 | 7 | 0 | 14 |
| standard | 0 | 1 | 0 | 0 | 10 | 0 | 11 |
| framework | 5 | 4 | 6 | 0 | 97 | 0 | 112 |
| guidance | 0 | 3 | 12 | 0 | 59 | 5 | 79 |
| research_finding | 0 | 16 | 2 | 0 | 8 | 0 | 26 |
| technology | 0 | 3 | 0 | 0 | 9 | 18 | 30 |
| innovation | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| tool | 0 | 2 | 1 | 0 | 18 | 0 | 21 |
| market_signal | 0 | 3 | 1 | 8 | 35 | 4 | 51 (incl. 1 res-amb) |
| initiative | 0 | 2 | 0 | 0 | 37 | 0 | 40 (incl. 1 res-amb) |
| regional_data | 0 | 2 | 5 | 0 | 48 | 22 | 77 |

Two observations:

1. `item_type='regulation'` (145 items) splits into 46 Regulatory passes, 9 Research passes, 7 Operations passes, and 83 multi-ambiguous. The classifier-emitted item_type is not a reliable proxy for the operator's Regulatory category; only one in three regulation-typed items passes the strict Regulatory rule.
2. `item_type='regional_data'` (77 items, the natural feeder for the Operations page) splits into 5 Operations passes, 22 garbage-extraction failures, 48 multi-ambiguous, plus 2 Research passes. Only 6.5 percent of regional_data items pass the Operations rule. The 22 garbage extractions inside regional_data are the parliamentary-scrape Cloudflare interstitials misclassified as regional_data by the Haiku content classifier. The 48 multi-ambiguous regional_data items typically describe a region's regulatory environment but lack the tariff / wage / permit specificity Operations requires.

### B.3 Cross-tab against `pipeline_stage`

| pipeline_stage | Reg | Res | Ops | Mkt | Amb | OOS-garbage |
|---|---:|---:|---:|---:|---:|---:|
| published (legacy backfill) | 41 | 22 | 2 | 0 | 115 | 0 |
| (null, new cold-start rows) | 14 | 25 | 33 | 8 | 297 | 49 |

The pipeline_stage column splits cleanly into legacy-backfilled `published` (186 rows) and cold-start `null` (425 rows of the 613 snapshot). Two observations:

1. The legacy `published` cohort is Regulatory-heavy (41 of 55 Regulatory passes are in legacy rows) and Research-leaning (22 of 47 Research passes). This matches the manual pre-cold-start curation pattern.
2. The null cohort is dominated by cold-start churn: 297 multi-ambiguous, 49 garbage. Regulatory and Research passes from the cold-start are sparse (14 and 25 respectively), but Operations passes from the cold-start dominate (33 of 35 total). The cold-start is finding `regional_data` shaped content faster than it is finding clean Regulatory or Research content.

### B.4 Where rule-based classification diverges from existing classification

- The existing `item_type` field assigns `regulation` to 145 items but the Regulatory rule only passes 46 of them. **Divergence rate: 68 percent of regulation-typed items do not satisfy the strict four-condition Regulatory rule.** The most common reason is the missing C2 evidence (no `entry_into_force`, no `compliance_deadline`, status defaulted to monitoring) and not a real-world violation of the rule, just a schema gap.
- The existing `domain` 1 (regulations and policy) carries 549 of 613 items, but only 53 are clean Regulatory passes. **Divergence rate: 90 percent of domain-1 items are not clean Regulatory passes under the new rules.** The dominance of domain 1 shows that domain is being used as a catch-all rather than a rule-aligned category.
- The existing `pipeline_stage` field has no relationship to the five-category taxonomy. It is an editorial-state field (draft / active_review / published / archived) rather than a category field.
- The existing `severity` field (CRITICAL / HIGH / MODERATE / LOW) and `urgency_tier` field (watch / elevated / stable / informational) are orthogonal to category. They are decision-pressure fields, not classifier output.

## C. Schema and code support for rule-based testing

For each rule, what currently exists in schema vs code vs nowhere:

### C.1 Regulatory rule

| Condition | Where checkable today |
|---|---|
| C1 obligation language | Inferred from `item_type IN ('regulation','directive','standard','guidance','framework')` (CHECK constraint in migration 004 line 137-143). The check constraint encodes 12 item_type values but the operator's Regulatory rule only loosely overlaps with five of them; no schema field directly encodes "binding obligation". |
| C2 in force OR adopted with effective date | Partially supported. `entry_into_force DATE` and `compliance_deadline DATE` exist (migration 004 line 169-170). `status` (CHECK constraint to one of `proposed/adopted/in_force/monitoring/superseded/repealed/expired`, line 156-159) maps cleanly. **Gap**: nothing forces a non-`monitoring` status to be set; the snapshot has `monitoring: 413, in_force: 20, adopted: 7`, so 67 percent of items default to monitoring even when text suggests in-force. |
| C3 enforceable jurisdiction | `jurisdictions TEXT[]` and `jurisdiction_iso TEXT[]` (migration 004 + 033). Indexed via GIN. **Coverage**: 93 percent of sources have non-empty `jurisdiction_iso`. Items inherit looser; `jurisdictions` on items can be empty even when source has one. |
| C4 primary legal authority | Not directly encoded. The closest signal is `sources.intelligence_types` (mixed-case bag, `REG / regulation / legislation` lowercase plus uppercase). The operator's separate `tier` field (1 = canonical primary) is a proxy but does not bind to "primary legal authority" specifically. **Gap**: no `source_role` column. The four-page survey already flagged this. |

Where currently encoded:

- Formal in classifier prompt: the Haiku verification prompt (`fsi-app/src/lib/llm/haiku-classify.ts` lines 37-73 and `fsi-app/src/lib/sources/verification.ts` lines 204-240) encodes `ai_trust_tier` (T1/T2/T3) which approximates C4. The `freight_score` encodes a proxy for C3-relevance.
- Formal in CHECK constraints: `item_type` (12 values), `status` (7 values), `priority` (4 values), `severity` (4 values), `pipeline_stage` (4 values plus null).
- Informal in code comments: the 14-rule rubric and severity-to-priority mapping is encoded as comment + assignment in `system-prompt.ts` lines 252-258 but not as schema.
- Absent: no schema field for "is this a binding rule" vs "is this guidance" vs "is this an aspirational framework". The CHECK on `item_type` admits all five via `regulation / directive / standard / guidance / framework` without distinguishing binding from non-binding.

### C.2 Research rule

| Condition | Where checkable today |
|---|---|
| C1 forward-looking | Partially supported via `pipeline_stage` (`draft`, `active_review`) and `item_type='research_finding'`. **Gap**: no `time_horizon` or `is_in_force` boolean. `status='proposed'` exists but conflates rulemaking-proposed with research-proposed. |
| C2 originating body type | Not directly encoded. Source `intelligence_types` includes `RES` and `RESEARCH` but the bag is mixed-case and overlaps with regulator types (a single source can carry `[REG, RES]`). **Gap**: no `provenance_type` enum (academic / national-lab / IGO / industry-coalition / vendor). |
| C3 named provenance | `sources.name` is mandatory (migration 004). Always present. |
| C4 freight relevance | `domain` (CHECK 1..7), `transport_modes TEXT[]`, `verticals TEXT[]`. Coverage uneven: 60 percent of sources have empty `topic_tags`; `vertical_tags` is 99 percent empty. |

Where currently encoded:

- Formal in classifier: `ai_relevance_score` and `ai_freight_score` in the verification prompt are the only places "research vs regulator vs market" is interpreted, and the prompt explicitly conflates them ("regulators with mandates covering ANY of: emissions, air quality...").
- Informal in code comments: `system-prompt.ts` line 260-266 maps `research_finding` to `research_summary` format. No code path enforces "research finding must originate from an academic body".
- Absent: no schema field that says "this item came from a peer-reviewed source" vs "this item came from a vendor white paper".

### C.3 Market Intel rule

| Condition | Where checkable today |
|---|---|
| C1 commercial signal | `item_type IN ('market_signal','initiative','innovation','technology')` is a partial proxy. `domain IN (2,4)` is a partial proxy. |
| C2 quantitative content | **Unsupported**. `key_data TEXT[]` is the only home for numbers and it is a free-form string array. No `is_quantitative` flag, no structured price / capacity / volume column. The four-page survey already flagged this as a missing time-series schema gap. |
| C3 named industry data provider | **Unsupported**. Source `intelligence_types` includes `MKT` and `NEWS` (44 + 8 sources) but the bag is mixed-case. No `source_role='market_news'` enum. |
| C4 not yet codified in regulation | `status` partially encodes this; `proposed` and `monitoring` would qualify, `in_force` and `adopted` would not. |
| C5 affects verticals/transport modes | Same as Research C4. |

Where currently encoded:

- Formal in classifier prompt: `item_type='market_signal'` and `severity='COST ALERT'` are emitted when the prompt detects price/cost change. The classifier does not distinguish quantitative from qualitative market signals.
- Absent: no quantitative-content flag, no time-series schema, no `source_role` flag for market-news. This is the rule with the weakest schema support.

### C.4 Operations rule

| Condition | Where checkable today |
|---|---|
| C1 jurisdictional fact | `item_type='regional_data'`, `domain IN (3,6)`, `jurisdictions TEXT[]`. Decent coverage. |
| C2 tariff / wage / permit | **Unsupported as a structured field**. The four-page survey flagged the absence of utility-tariff schedule, labour-cost benchmark, and permitting-timeline tables. The `OperationsPage.tsx` chip grid regex-matches the title / note / tags. |
| C3 government data provider | Source `tier=1` and `tier=2` plus `intelligence_types=[REG]` are the proxies. **Gap**: no `source_role='operational_data'` enum. |
| C4 jurisdiction we operate in | Treated as universally true given the platform's global posture. |

Where currently encoded:

- Formal in client-side filter: `OperationsPage.tsx` filters on `r.type === 'regional_data' || r.domain === 3` for the jurisdiction tab and `r.domain === 6` for the facility tab. This is the page's only encoding of the Operations rule.
- Absent: no structured tariff / wage / permit table; no source-role flag for operational-data sources.

### C.5 Cross-rule schema observations

- The `src/lib/llm/haiku-classify.ts` content prompt emits `item_type` from a 12-value enum and `severity` from a 5-value enum. Neither enum maps onto the operator's five-category taxonomy. The mapping the operator wants (item -> Regulatory / Research / Market Intel / Operations / Out of Scope) is not currently encoded anywhere in the classifier prompt, the schema, or the route handler.
- The verification prompt (`verification.ts` lines 204-240) emits `ai_relevance_score` and `ai_freight_score` plus `ai_trust_tier`. None of these correspond to the five-category rule conditions; they are pre-classification triage scores.
- The Wave 2 cheap-classify gate flagged in the topic-relevance audit's Decision 3 would be the natural place to add per-item rule evaluation. Today no such gate exists.

## D. Per-source distribution under new rules

The corpus distribution is an artefact of the cold-start strategy: 553 of 562 contributing sources have shipped exactly 1 item. Per-source concentration metrics are therefore noisy at the source level and more informative at the host level (where multiple sources may share a domain).

### D.1 Top hosts by item count (aggregating duplicate source rows)

| host | items | OOS | multi-amb |
|---|---:|---:|---:|
| www.lr.org (Lloyd's Register) | 42 | 0 | 27 |
| eur-lex.europa.eu | 14 | 0 | 13 |
| www.iea.org | 10 | 0 | 4 |
| www.irena.org | 8 | 3 | 4 |
| www.imo.org | 8 | 0 | 7 |
| www.eia.gov | 8 | 0 | 8 |
| www.epa.gov | 6 | 0 | 6 |
| www.nrel.gov | 5 | 0 | 5 |
| www.eea.europa.eu | 5 | 0 | 5 |
| www.mlit.go.jp | 5 | 0 | 5 |
| www.gov.uk | 5 | 0 | 5 |
| assets.publishing.service.gov.uk | 4 | 0 | 4 |
| www.mpa.gov.sg | 4 | 0 | 4 |
| www.csrf.ac.uk (Centre for Sustainable Road Freight) | 4 | 0 | 3 |
| www.nashville.gov | 4 | 1 | 4 |

The Lloyd's Register block (42 items) is the single largest concentration of multi-ambiguous content in the corpus. Of those 42 items, the rule-based classifier finds 16 Regulatory passes, 1 Research pass, 1 Operations pass, plus 5 Regulatory-single-rule-ambiguous and 18 multi-ambiguous. The 18 multi-ambiguous are uniformly the Lloyd's Register Class Notices and Statutory Updates that read like regulations but originate from a classification society, not a regulator. Under a strict reading of the operator's Regulatory C4, they are not Regulatory; under the Research rule they fail C2 (LR is not an academic body).

### D.2 Top sources by Out-of-Scope concentration

Because of the one-shot-per-source pattern, most OOS sources have 1 item with 100 percent OOS. The leading OOS hosts are all garbage-extraction casualties:

| source | host | items | OOS | OOS% |
|---|---|---:|---:|---:|
| Hellenic Parliament | www.hellenicparliament.gr | 1 | 1 | 100 |
| Parliament of Malta | parlament.mt | 1 | 1 | 100 |
| Cyprus Parliament | www.parliament.cy | 1 | 1 | 100 |
| Assembleia da Republica (PT) | www.parlamento.pt | 1 | 1 | 100 |
| Wisconsin State Legislature | docs.legis.wisconsin.gov | 1 | 1 | 100 |
| Federal Register | www.federalregister.gov | 1 | 1 | 100 |
| Kentucky EEC | eec.ky.gov | 1 | 1 | 100 |
| Minnesota PUC | mn.gov | 1 | 1 | 100 |
| YPEN Greece | ypen.gov.gr | 1 | 1 | 100 |
| Parliament of Tasmania | www.parliament.tas.gov.au | 1 | 1 | 100 |

These are all parliamentary or environmental ministry portals where the cold-start scrape returned a Cloudflare interstitial or a CAPTCHA gate, and Haiku then summarised the interstitial as a "regulation" or "regional_data" item. Same pattern as `topic-relevance-investigation-2026-05-09.md`. The fix discussed there (a 30-line title-pattern filter) would clear all 49 of the garbage items in this audit.

49 sources have at least one OOS-garbage item; this is the count of sources affected by the fetch-quality gap.

### D.3 Top sources by ambiguous concentration

Multi-ambiguous concentration (sources with >= 2 ambiguous-on-multiple-rules items):

| source | host | items | multi-amb | amb% |
|---|---|---:|---:|---:|
| Lloyd's Register Group | lr.org | 41 | 26 | 63 |
| EUR-Lex (one of two registry rows) | www.eea.europa.eu | 3 | 3 | 100 |
| European Commission Press Corner | finance.ec.europa.eu | 3 | 3 | 100 |
| California Legislative Information (Leginfo) | leginfo.legislature.ca.gov | 3 | 3 | 100 |
| European Clean Trucking Alliance | clean-trucking.eu | 2 | 2 | 100 |
| International Civil Aviation Organization | www.icao.int | 2 | 2 | 100 |
| EC DG CLIMA Shipping | climate.ec.europa.eu | 2 | 2 | 100 |
| EUR-Lex (second registry row) | eur-lex.europa.eu | 2 | 2 | 100 |

Multi-ambiguous sources are not editorially "wrong"; they are operator-relevant sources whose ambiguity is rule-driven. The Leginfo row is a particularly striking case: California's official legislative archive should be a clean Regulatory pass if any source ever could be, but the snapshot's three Leginfo items are all multi-ambiguous because the items lack `entry_into_force`, default to `status='monitoring'`, and read like bills-in-progress rather than enacted regulations.

538 sources have at least one multi-rule-ambiguous item; this is essentially the entire corpus, which reinforces the structural finding that ambiguity is the dominant signal.

## Methodology and caveats

### What the heuristic does

For each item, the classifier evaluates the four (or five) conditions of each rule as boolean. A rule "passes" if all conditions are true. A rule is "ambiguous" if at least 2 of N conditions are true but not all. A rule "fails" if 0 or 1 condition is true. The primary category is the highest-confidence pass, with tie-break order Reg > Ops > Research > Market Intel; if no rule passes and exactly one is ambiguous, the item is assigned to that category as ambiguous; if multiple rules are ambiguous, the item lands in "Ambiguous (multi)"; if all rules fail, the item is "Out of Scope".

### Heuristic confidence

- **High** for the garbage-extraction set (49 items). Title-based pattern matching is unambiguous. The 49 items are a clear lower bound; the cold-start may add more as it continues.
- **High** for the eight Market Intel passes. They are explicit market-signal items on trade-press hosts with quantitative content.
- **Moderate-to-high** for the 55 Regulatory passes and 47 Research passes. The four-condition test is stricter than the existing `item_type='regulation'` check, so a passing item is more constrained than the existing classification. False-positive risk is low; false-negative risk is moderate (some genuine regulations failed C4 because the regulator host pattern set does not include every national gazette domain, e.g., German `.bund.de` ministries, French `.gouv.fr` ministries with non-standard subdomains, Latin American gazettes with unusual TLDs).
- **Low** for the 412 multi-ambiguous bucket. Most of these items are not actually classification failures; they are classification-impossible-from-the-snapshot items. An LLM with the same data would face the same ambiguity. The schema does not carry the discriminating fields.

### False-positive risk

- The Operations rule's C2 keyword set includes "fleet" and "drayage" which collide with general regulatory text (CARB ACT mentions "fleet" multiple times). This drives some Regulatory items into Operations-pass territory. The primary-category tie-break routes them back to Regulatory, so the false-positive rate at the primary level is low (<3 percent), but the per-rule pass count for Operations is inflated.
- The Research rule's C2 host-pattern set is narrow. NREL.gov shows up as both a regulatory-leaning host (energy.gov subnet) and a research host. This causes some NREL items to dual-pass.

### False-negative risk

- The Regulatory rule's C4 host-pattern set is incomplete. Known misses: `bund.de` (Germany), `gouv.fr` direct subdomains (France ministries), Chilean `bcn.cl` (added but easy to miss similar Latin American hosts), Korean `.go.kr`, etc. Roughly 20-40 items in the multi-ambiguous bucket would likely move to Regulatory pass with a more complete host pattern set.
- The Market Intel rule's quantitative-content regex is conservative. It matches currency amounts, percentages, units, quarters, and 4-digit years. A trade-press item that uses qualitative language ("rates surged", "capacity tightened") without specific numbers will not satisfy C2.
- The Operations rule's keyword set is narrow. A regulatory permit programme might describe "permit applications" without using the word "permit" in the summary text the heuristic sees.

### Where the cold-start being concurrent biases findings

- **Parliamentary scrape phase**: the cold-start was actively scraping European parliaments at snapshot time. This is the source of most garbage-extraction items. As the cold-start moves past the parliamentary phase to other source classes, the garbage rate per minute will fall but the absolute count will continue to climb until a fetch-quality gate is added.
- **One-shot-per-source dominance**: 553 of 562 contributing sources have shipped exactly 1 item, because the cold-start probes each registered source once and the per-source revisit cycle has not started. The 9 sources with 2+ items (LR, IEA, EUR-Lex, IRENA, IMO, EIA, EPA, NREL, etc.) are early test sources or sources reached via multiple registry entries. As the steady-state ingestion cycle starts, per-source item counts will multiply and per-source concentration metrics will become more informative.
- **Pipeline_stage skew**: the legacy `published` cohort (186 items) reflects pre-cold-start manual curation; the `null` cohort (425 items) reflects cold-start churn. As the cold-start continues, the null cohort will grow and the per-pipeline_stage cross-tab will skew further.
- **Snapshot drift**: the corpus grew from 613 to 618 items in the minute between the audit script run and the post-run sanity probe, and from 446 (four-page survey) to 488 (topic-relevance audit) to 613 (this audit) over roughly 24 hours. Numbers in this doc are anchored to 613 as of `2026-05-10T03:11:03.988Z`; absolute counts will be obsolete within hours. Proportions (the 67 percent multi-ambiguous, the 8 percent garbage, the 9 percent Regulatory pass rate) are more durable.

### What the audit did not do

- Did not call any LLM.
- Did not write to the database, modify schema, or delete any item.
- Did not touch the in-flight cold-start script `fsi-app/scripts/wave1-cold-start.mjs` or its agent_runs writes.
- Did not modify the handoff doc `dotfiles/docs/walk-away-handoff-2026-05-09.md`.
- Did not propose implementation, recommend a decision, or rewrite any rule. The five rules as stated by the operator at the top of this dispatch are taken as given for this audit pass; refinement is the operator's call after reading.

## Related

- [[four-page-architecture-survey-2026-05-09]] — Explicitly extends this survey; both find the missing sources.source_role column and domain-1 acting as a catch-all are the root of unclassifiability
- [[topic-relevance-investigation-2026-05-09]] — Explicitly extends it; the garbage-extraction bucket grew from that audit's 37 to 49 here, same Cloudflare/CAPTCHA interstitial pattern
- [[ADR-007-bias-tag-threshold-per-dimension]] — shared classification-rules subsystem; audit of the classifier whose bias-tag confidence cutoffs this ADR retunes
- [[california-pilot-summary]] — Shares the Haiku relevance/freight scoring and tier logic; the rules audit examines what those same classifier signals do and do not encode
- [[caros-ledge-product-audit-2026-05-15]] — S2/S5 routing-and-classifier failures are the same finding: item_type is not a reliable category proxy and the Haiku classifier lacks an…
