# Source Classification Framework
## Five-axis taxonomy for source registration in Caro's Ledge
## May 10, 2026

---

## Methodology

This framework defines deterministic rules for classifying every source in the registry along five axes. Each axis is rule-based and independently testable. Together the axes determine: what category of items a source is expected to produce, what authority weight its content carries in conflict resolution, what scope its coverage is bounded by, and how items from the source should be routed through the item classification rules.

### What this framework does

- Provides deterministic rules for assigning Role, Tier, Jurisdiction, Scope, and Expected Output to every registered source
- Establishes "out of scope" handling for sources at the registration gate (different from item-level Out of Scope, which is a valid landing category for items)
- Defines source-aware item routing: how source classification informs which item rules are tested first and how multi-rule-ambiguous cases are resolved
- Defines drift detection: how the system catches sources whose actual output deviates from expected output

### What this framework does NOT do

- Does not handle source language. Language is operational metadata, on hold pending future translation build.
- Does not handle source access method (RSS, API, scrape, manual). Operational, not classification.
- Does not handle source health monitoring (heartbeat, last-fetch outcome). Separate primitive.
- Does not determine item classification. Items are classified by the five item rules drafted separately, with source-aware priority.
- Does not determine page rendering. Pages are filters over classified items.
- Does not replace schema additions required to resolve the 67% multi-rule-ambiguous finding from the classification rules audit. Item-level schema work (structured fields for rule conditions) is the next architectural conversation, sequenced after this framework lands.

---

## The five axes

| Axis | Captures | Type | Set at |
|---|---|---|---|
| 1. Role | Source's institutional function | One primary value, zero or more secondary | Registration, fixed |
| 2. Tier | Authority weight for conflict resolution | One value (T1-T7) | **NOT derived from Role** — see the superseded note under "Role-to-Tier mapping" below. `base_tier` is the content-authority tier (T1=legal text … T6=news), set by classifier/operator at registration |
| 3. Jurisdiction | Legal/geographic scope under which source operates | Single, multi-list, or global | Registration, fixed |
| 4. Scope | What topics, transport modes, verticals the source covers | Three sub-fields, each multi-valued | Registration, mutable as source content evolves |
| 5. Expected Output | Probability distribution across the five item categories | {Regulatory, Research, Market_Intel, Operations, Out_of_Scope} | Derived from Axes 1-4 at registration, refined by observed history |

A source is registered if and only if all five axes have valid assignments. If any axis cannot be assigned, the source does not enter the registry. There is no "unclassified" registration state.

---

## Axis 1: Role

The source's institutional function. Determines what kinds of items the source is expected to produce. A source has exactly one primary role and zero or more secondary roles.

### Valid roles and inclusion rules

**1.1 primary_legal_authority**

Inclusion rule: the source is an entity legally empowered to issue binding rules, regulatory determinations, or judicial precedent in a defined jurisdiction.

Examples: SEC, EPA, CARB, CMA, FCA, EUR-Lex, Federal Register, European Commission DG FISMA / ENV / CLIMA / MOVE / GROW, European Parliament, Council of the EU, ECB, ESMA, EBA, court records (CJEU, US Supreme Court).

Edge cases:
- A regulator publishing a research paper does not change role; the source remains primary_legal_authority. The item from that source may classify as Research, but the source's role is unchanged.
- Government press offices that aggregate cross-agency announcements are NOT primary_legal_authority. They are government_press (role 1.10). This distinction is the fix for the EU ESRS Mode E failure where the press-corner aggregate was treated as if it carried primary regulatory authority.
- Statistical agencies (BLS, Eurostat) are NOT primary_legal_authority even though they are governmental, because they don't issue binding rules. They are statistical_data_agency (role 1.5).

**1.2 intergovernmental_body**

Inclusion rule: treaty-based or UN-system organization producing frameworks, conventions, or technical guidance across member states.

Examples: IMO (MEPC, MSC, all sub-committees), ICAO (CAEP, all panels), IEA, IRENA, IPCC, World Bank, OECD, ILO, ICAP.

Edge cases:
- ECB and ESMA are EU bodies operating under EU treaty authority, but their direct authority is over EU jurisdiction, not multilateral. They are primary_legal_authority within EU, not intergovernmental_body.
- ICAP (International Carbon Action Partnership) is membership-based but not treaty-based. Classified as intergovernmental_body for ETS coverage purposes; the framework allows membership-organizations producing multilateral work product to qualify.
- WTO, IMF, BIS: intergovernmental_body with secondary statistical_data_agency where applicable.

**1.3 standards_body**

Inclusion rule: formal standards-setting organization with documented governance and standard-development process.

Examples: IFRS Foundation, ISSB, EFRAG, ISO, GRI, SASB, TCFD legacy, TNFD, SBTi.

Edge cases:
- Maritime classification societies (DNV, Lloyd's Register, ABS, BV, RINA, ClassNK) are standards_body for technical maritime standards (rules of class) AND industry_data_provider for their commercial market analysis. Multi-role: standards_body primary, industry_data_provider secondary.
- ICAO and IMO sub-committees overlap with standards-setting function. They remain intergovernmental_body, not standards_body, because their authority is treaty-based, not standards-development based.

**1.4 academic_research**

Inclusion rule: university, national lab, or peer-reviewed research entity. Source is institutionally academic OR publishes through peer-reviewed channels.

Examples: MIT (Climate Portal, Media Lab, Sloan), Cambridge Institute for Sustainability Leadership, Stanford Doerr School, NREL, Tyndall Centre, ICCT, Smart Freight Centre, peer-reviewed journals (Studies in Conservation, Journal of Sustainable Transport, Energy Policy).

Edge cases:
- RMI (Rocky Mountain Institute) is non-profit research without university affiliation but with recognized peer-quality output and editorial independence. Classified as academic_research.
- Industry-funded research organizations require evaluation. If methodology is documented and editorially independent of funder, academic_research. If not, industry_data_provider.
- Research arms inside corporations (e.g., Microsoft Research, Bell Labs legacy): if publication channel is genuinely peer-reviewed and editorially independent, academic_research; otherwise vendor_corporate.

**1.5 statistical_data_agency**

Inclusion rule: national or supranational statistical or labor data agency producing systematic data series with documented methodology, primary data collection role.

Examples: BLS (Bureau of Labor Statistics), Eurostat, ILO, EIA (US Energy Information Administration), ENTSO-E, ONS (UK Office for National Statistics), national customs offices, World Bank LPI team.

Distinction from industry_data_provider: agency role is governmental or treaty-based, not commercial.

**1.6 industry_data_provider**

Inclusion rule: commercial entity producing market data, analysis, or benchmarks with documented methodology.

Examples: BloombergNEF, MSCI, Moody's, S&P (data and ratings side), Argus Media, ICIS, Wood Mackenzie, Rystad Energy, Workiva, FTSE Russell.

Edge cases:
- S&P Global Sustainable1 has a news side (trade_press) and a data/ratings side (industry_data_provider). Each channel registered separately.
- BloombergNEF and Bloomberg Green: the same parent operates a data product (BNEF, T6 industry_data_provider) and an editorial publication (Bloomberg Green, T5 trade_press). Different sources in the registry.

**1.7 trade_press**

Inclusion rule: editorial publication with named editor or editorial team, documented editorial process, independent of source material being reported.

Examples: ESG Today, Reuters Sustainable Switch, Bloomberg Green, FT Moral Money, Carbon Pulse, FreightWaves, Journal of Commerce, Lloyd's List, Air Cargo News, The Loadstar, Splash 247, TradeWinds, Carbon Brief.

Edge cases:
- Niche newsletters with a single named author and clear editorial standards qualify. Carbon Pulse (paywalled, named editor) is trade_press T5.
- Corporate blogs that mimic editorial format are NOT trade_press. They are vendor_corporate. The test: is the editorial team independent of the entity being reported on?
- Industry newsletter from an association reporting on member activity: industry_association (1.8), not trade_press.

**1.8 industry_association**

Inclusion rule: member-based organization representing commercial sector interests.

Examples: IATA, ICS (International Chamber of Shipping), BIMCO, World Shipping Council, IRU, ATA (American Trucking Associations), A4E, ECTA, AAR, CER.

Edge cases:
- Vertical-specific associations: Gallery Climate Coalition (fine art), A Greener Future (live events), albert/BAFTA (film/TV), AAM (museums), ICOM-CC (conservation), IIC. All industry_association.
- Trade associations sometimes adopt quasi-regulatory roles (e.g., IATA cargo handling standards become de facto rules). Standards remain industry_association role, not primary_legal_authority. The standard's authority is membership consensus, not legal enforceability.

**1.9 vendor_corporate**

Inclusion rule: single commercial entity, primary signal is for its own announcements.

Examples: Maersk, Boeing, Airbus, BYD, Neste, Volvo Trucks, Hauser and Wirth, Christie's, Sotheby's, Rokbox, Earthcrate.

Tier always T6 by default.

Multi-role rare. A corporation publishing peer-reviewed research would need that publication channel separately registered as academic_research with separate URL/feed.

**1.10 government_press**

Inclusion rule: government press office or news distribution channel that aggregates announcements from multiple government bodies, downstream of primary regulator publications.

Examples: ec.europa.eu/commission/presscorner, gov.uk news service, white-house.gov news, the7 ec.europa.eu rows currently in registry (all on press-corner aggregate, which does not carry ESRS announcements).

This role exists specifically to capture the Mode E failure pattern from the EU ESRS coverage diagnostic. ec.europa.eu press-corner is government_press, not primary_legal_authority, even though it's a government domain. The distinction prevents the system from treating press releases as if they carry the same authority as primary publication.

Special handling: items from government_press sources need downstream-attribution to underlying primary_legal_authority where identifiable. A press release announcing an EC adoption should be linked to the DG that published the adoption (DG FISMA for ESRS, DG ENV for EUDR, etc.). Without this, items get attributed to the aggregate channel, losing authority signal. Mechanism design pending.

### Sources that fail every Role rule

A candidate source that cannot be assigned any of the 10 roles is NOT registered. There is no "unclassified" or "out of scope" role for sources. If a source can't be classified, the question is whether to register it at all. Default: don't register.

This differs from item classification, where Out of Scope is a valid landing category for items. For sources, "out of scope" means the source itself doesn't belong in the registry.

---

## Axis 2: Tier

Authority weight, used for conflict resolution and confidence scoring. Six tiers, derived from Role at registration. Tiers are fixed; they don't drift over time. If source content quality changes, that's a source-health signal handled separately.

**Schema mapping note:** Axis 2 maps to the existing `sources.tier` integer column from migration 004 (range 1-7, CHECK constraint). Framework values T1-T6 correspond to integer values 1-6. The "T" prefix in this document is descriptive; the schema column is integer-typed.

Tier 7 currently holds 20 source rows in the registry. The framework defines six tiers. The disposition of those 20 rows (real seventh category requiring framework amendment vs. legacy data requiring migration to a defined tier) is flagged for the registry cleanup workstream that runs after the sources-schema migration and before the 130-corporate expansion.

### Role-to-Tier mapping

> **⚠ SUPERSEDED (2026-06-01).** This role-based Role→Tier mapping was proposed in this
> document (2026-05-10) but **was never implemented as the `base_tier` derivation** — no
> migration or code derives `base_tier` from `source_role` (verified: every `base_tier`
> migration — 090/091/093/094/099 — is plumbing, none derive from role). `base_tier` is and
> always has been the **content-authority tier** from migration 004 / `src/types/source.ts`
> `SOURCE_TIER_DEFINITIONS` (T1 = primary legal text · T2 = regulator implementation, incl.
> EPA and sub-state primary regulators "same as EPA" · T3 = intergovernmental body · T4 =
> expert analysis · T5 = industry & standards · T6 = news & commentary · T7 = provisional),
> set by classifier/operator at registration and applied by the live classifiers
> (`verification.ts`, `haiku-classify.ts`, `recommend-source-tier.ts`). The content ontology
> (older — 2026-04-04) is **authoritative**; this role table is retained for historical
> context only. `source_role` is a separate, independently-populated axis (it captures the
> entity's role; it does NOT set the tier). Do not score `base_tier` against the table below.


| Role | Default Tier | Notes |
|---|---|---|
| primary_legal_authority | T1 | Primary publisher of binding rules |
| intergovernmental_body | T2 | Frameworks, conventions, treaty-based authority |
| standards_body | T2 | Formal standards even when privately governed (e.g., classification societies) |
| academic_research | T3 | Peer-reviewed or institutional academic |
| statistical_data_agency | T4 | Governmental data, primary collection role |
| industry_data_provider | T6 | Commercial data with documented methodology |
| trade_press | T5 | Named editorial standards |
| industry_association | T5 | Default; T6 if output is purely member communication, not editorial |
| vendor_corporate | T6 | Vendor claim, never sole authority |
| government_press | T5 | Downstream channel; underlying primary source authority is T1 |

### Conflict resolution

When two sources conflict on a fact, higher tier wins by default. A T1 EUR-Lex publication of an adopted regulation overrides a T5 trade press summary. A T2 IMO MEPC working paper overrides a T6 vendor claim about emissions reduction.

Within the same tier, recency wins. Within recency, observed correctness history wins.

Tier is a default. Specific anomalies can downgrade (e.g., a primary_legal_authority publishing a known-erroneous notice would have that notice flagged), but the source's tier remains the registered value.

---

## Axis 3: Jurisdiction

Legal or geographic scope under which the source operates. Distinct from content scope (Axis 4), which captures what the source covers. Jurisdiction captures where the source's authority resides.

### Valid values

- **Single jurisdiction**: us-federal, us-ca, us-ny, us-tx, eu, eu-de, eu-fr, eu-it, uk, jp, cn, in, br, sg, hk, ae, etc.
- **Multi-state grouping**: eu (covers all member states unless otherwise specified), eea, asean, latam, na, mena, etc.
- **Global**: assigned to intergovernmental bodies and global data providers (IMO, ICAO, World Bank, BloombergNEF). Global is a valid jurisdiction value, not "no jurisdiction."
- **Multi-jurisdiction with explicit list**: ECB (covers eurozone member states, list maintained); maritime classification societies (multi-flag-state coverage by membership).

### Rule

Jurisdiction is the legal scope under which the source operates, NOT the geographic scope of its content. NREL is us-federal even when reporting on global solar; the source's jurisdiction is US national lab, the content scope is captured in Axis 4.

### Edge cases

- Multinational corporation: jurisdiction is the corporation's domicile (Maersk = dk, Boeing = us-federal, BYD = cn). Content scope is global, captured in Axis 4.
- Trade press operating globally with US incorporation: jurisdiction = us-federal; content scope = global.
- Press-corner aggregates for multi-DG commissions: jurisdiction = eu (the institution is EU, the channel covers multiple DGs).

---

## Axis 4: Scope

Three sub-fields. Each captures what the source covers in content, distinct from the jurisdiction under which the source operates.

### 4a. Topics

What subject domains the source addresses. Multi-valued.

Valid values: regulatory, finance, technology, fuel, labor, infrastructure, environmental, social, governance, transport, packaging, customs, conservation, materials_science.

Rule per topic: assigned only if the source provides regular and material coverage. A source mentioning aviation in one annual report doesn't cover transport topic; it must address transport with regular content.

### 4b. Modes

Transport modes covered. Multi-valued.

Valid values: air, road, ocean, rail, all, none.

- "all" for sources that cover multiple modes regularly (IEA, IMO and ICAO when both relevant)
- "none" for sources that don't address transport (sustainability reporting standards bodies, financial regulators, conservation bodies)

### 4c. Verticals

Caro's Ledge verticals covered. Multi-valued.

Valid values: fine_art, live_events, luxury, film_tv, automotive, humanitarian, freight_general, all, none.

- Most general sources: freight_general (covers freight as an industry without vertical specificity) or all (sustainability standards apply across verticals)
- Vertical-specific sources are rare and high-value: GCC for fine_art, A Greener Future for live_events, albert for film_tv, UNHRD for humanitarian
- "none" for sources that don't address any commercial vertical (purely academic methodology papers, for example)

### Mutability note

Axis 4 is the only mutable axis. As a source's content evolves (new topics added, new modes covered), the registration record gets updated. Updates are logged with timestamp and reason. Roles, Tiers, and Jurisdictions are fixed at registration; only Scope evolves.

---

## Axis 5: Expected Output

Probability distribution across the five item categories. Derived from Axes 1-4 at registration, refined by observed item-output history over time.

### Default distributions per Role

| Role | Regulatory | Research | Market Intel | Operations | Out of Scope |
|---|---|---|---|---|---|
| primary_legal_authority | 50-70% | 20-30% | 5% | 5% | 5% |
| intergovernmental_body | 5% | 50-60% | 20-30% | 10-20% | 5% |
| standards_body | 25% (post-adoption) | 60-70% | 5% | 0% | 5-10% |
| academic_research | 0% | 80-90% | 5-10% | 0% | 5% |
| statistical_data_agency | 0% | 5% | 20-30% | 70-80% | 5% |
| industry_data_provider | 0% | 5-10% | 80-90% | 5% | 5% |
| trade_press | 20-30% (reporting on regulators) | 5-10% | 60-70% | 0% | 5-15% |
| industry_association | 0% | 20-30% | 50-60% | 10-20% | 5% |
| vendor_corporate | 0% | 0% | 80-90% | 0% | 10% |
| government_press | varies | varies | varies | varies | varies (aggregate channel; downstream attribution required) |

These are starting distributions. Observed history refines them per source over time. After 30-90 days of ingestion, observed distribution replaces the default.

### Three uses of Axis 5

**5a. Source-aware item routing**

When an item arrives from a source, before testing against the item rules:
1. Look up source's Axis 5 distribution
2. Test item rules in descending order of source's expected likelihood
3. If a rule passes deterministically, classify into that category
4. If multiple rules pass ambiguously, use Axis 5 distribution as tie-breaker (highest expected probability wins)
5. If no rule passes, item lands in Out of Scope with reason "no rule passed under source-aware routing"

This addresses the 67% multi-rule-ambiguous finding partially. Source-awareness reduces ambiguity for items from sources with concentrated expected output (a vendor_corporate source with 90% Market Intel expectation rarely produces ambiguous-Regulatory items). Doesn't fully resolve 67% ambiguity until item-level schema additions enable deterministic rule-condition testing. That's the next architectural conversation.

**5b. Drift detection**

For each registered source, periodically compare:
- Observed item distribution over recent N items (rolling window)
- Expected output distribution from Axis 5

If observed deviates from expected by more than threshold (default 30 percentage points on any single category), flag for source-scope review.

Possible causes of drift:
1. Source's actual scope changed (regulator added new content type)
2. Source classification was wrong at registration
3. Item rules need refinement
4. Genuinely anomalous output (regulator publishing emergency notice; vendor making unusual announcement)

Drift detection is a primitive, partial overlap with primitive 3.2 from primitives audit (intercept telemetry). Implementation pending; referenced here for completeness.

**5c. Anomaly flagging**

An item from vendor_corporate landing in Regulatory is anomalous. An item from primary_legal_authority landing in Out of Scope is anomalous (NYC ICE lawsuit was this case). Anomalous items get flagged for review even when classification rules pass deterministically.

Anomaly threshold: item's classified category has less than 5% expected probability per source's Axis 5 distribution.

---

## Worked examples

### Example 1: finance.ec.europa.eu (the EU ESRS Mode A failure)

| Axis | Value |
|---|---|
| Role primary | primary_legal_authority |
| Role secondary | none |
| Tier | T1 |
| Jurisdiction | eu |
| Scope topics | regulatory, finance, environmental, social, governance |
| Scope modes | none |
| Scope verticals | all |
| Expected output | Regulatory 50%, Research 40%, Market Intel 5%, Out of Scope 5% |
| Routing implication | Items tested first against Regulatory rule, then Research |

Why this matters: EU ESRS draft is a Research-category item from this source (forward-looking, not yet adopted). Source-aware routing tests Regulatory first, fails (consultation open), tests Research second, passes. Item lands cleanly on /research with high confidence.

### Example 2: EFRAG (the silent-ingestion failure)

| Axis | Value |
|---|---|
| Role primary | standards_body |
| Role secondary | none |
| Tier | T2 |
| Jurisdiction | eu |
| Scope topics | regulatory, environmental, social, governance, finance |
| Scope modes | none |
| Scope verticals | all |
| Expected output | Research 70%, Regulatory 25% (post-adoption), Out of Scope 5% |
| Routing implication | Items tested first against Research |

### Example 3: Journal of Commerce (the misclassified item from May 10 screenshot)

| Axis | Value |
|---|---|
| Role primary | trade_press |
| Role secondary | none |
| Tier | T5 |
| Jurisdiction | us-federal |
| Scope topics | transport, finance, regulatory |
| Scope modes | ocean, road |
| Scope verticals | freight_general |
| Expected output | Market Intel 70%, Regulatory 20%, Operations 5%, Out of Scope 5% |
| Routing implication | Items tested first against Market Intel |

Why the screenshot misclassified: without source-aware routing, the classifier saw "Regulatory Changes Across Transportation Sectors" in the title and the Regulatory rule triggered on keyword surface. Multiple rules passed ambiguously; default routing put it on /regulations. With source-aware routing, source's expected output puts Regulatory at 20% versus Market Intel at 70%; tie-breaker resolves to Market Intel; item lands cleanly on /market.

### Example 4: IEA (intergovernmental, multi-content)

| Axis | Value |
|---|---|
| Role primary | intergovernmental_body |
| Role secondary | none |
| Tier | T2 |
| Jurisdiction | global |
| Scope topics | fuel, technology, transport, environmental |
| Scope modes | all |
| Scope verticals | freight_general |
| Expected output | Research 60%, Market Intel 25%, Operations 10%, Out of Scope 5% |
| Routing implication | Items tested first against Research, then Market Intel |

Items like "Global EV Outlook 2024" land in Research. Items like "IEA Electricity Price Data for Large Industrial Customers" land in Operations (jurisdictional cost data).

### Example 5: Gallery Climate Coalition (E2 vertical-defining miss)

| Axis | Value |
|---|---|
| Role primary | industry_association |
| Role secondary | academic_research (research arm publishes peer-reviewed materials work) |
| Tier | T5 (primary), T3 (when output is from research arm) |
| Jurisdiction | global (UK-incorporated, global membership) |
| Scope topics | environmental, regulatory, finance, materials_science, conservation |
| Scope modes | none |
| Scope verticals | fine_art |
| Expected output | Market Intel 50%, Research 30%, Operations 15% (carbon calculator data), Out of Scope 5% |
| Routing implication | Items tested first against Market Intel, then Research |

### Example 6: Maersk (vendor)

| Axis | Value |
|---|---|
| Role primary | vendor_corporate |
| Role secondary | none |
| Tier | T6 |
| Jurisdiction | dk |
| Scope topics | fuel, technology, transport, finance, environmental |
| Scope modes | ocean |
| Scope verticals | freight_general |
| Expected output | Market Intel 90%, Out of Scope 10% |
| Routing implication | Items tested first against Market Intel only |

Anomaly check: a Maersk item classified as Regulatory would trigger anomaly flag (Maersk's expected Regulatory rate is near zero). Either the item's classification is wrong or Maersk announced something unusual (e.g., voluntary adoption of binding-style commitment). Review required.

### Example 7: ec.europa.eu/commission/presscorner (the Mode E aggregate)

| Axis | Value |
|---|---|
| Role primary | government_press |
| Role secondary | none |
| Tier | T5 |
| Jurisdiction | eu |
| Scope topics | varies per release |
| Scope modes | varies |
| Scope verticals | varies |
| Expected output | distributed across all categories based on underlying primary source |
| Special handling | items require downstream-attribution to primary_legal_authority source (DG FISMA for ESRS, DG ENV for EUDR, DG CLIMA for ETS, etc.); without attribution, items lose authority signal |

---

## Source registration rule

A candidate source is registered if and only if all conditions met:

1. A primary Role can be assigned from the 10 valid roles
2. Tier is derivable from Role (default mapping or documented exception)
3. Jurisdiction can be assigned (single, multi-list, or global)
4. Scope sub-fields (topics, modes, verticals) each have at least one assignable value (including "none" where applicable)
5. Expected Output distribution can be computed from Axes 1-4

If any condition fails, the source is NOT registered. Default: don't register.

---

## URL-pattern-based source registration

When a single organization publishes distinct content types through distinct URL paths, each path is registered as a separate source rather than as a single source with multiple roles. This applies whenever an organization's outputs cleanly separate by URL into different role categories.

### Rule

If an organization X publishes:
- Content type A through `x.org/path-a/` with role Role_1
- Content type B through `x.org/path-b/` with role Role_2

Then register two sources:
- Source 1: `x.org/path-a/` with primary Role_1
- Source 2: `x.org/path-b/` with primary Role_2

NOT a single source `x.org` with primary Role_1 and secondary Role_2.

### Why this matters

Source-aware routing operates on Role + Expected Output. If a source has multi-role with no URL distinction, the classifier must guess which role applies to a given item. With per-URL registration, the source is determined at fetch time and the role is unambiguous.

### Worked examples

**Lloyd's Register:** publishes rules-of-class technical standards through one URL path and market intelligence through another. Register as two sources, one for the rules-and-regulations path (standards_body, T2, Research-dominant) and one for the insights/intelligence path (industry_data_provider, T6, Market Intel-dominant).

**S&P Global:** news side (Sustainable1 articles) is trade_press T5. Data and ratings side is industry_data_provider T6. Two separate sources by URL path.

**Bloomberg:** Bloomberg Green editorial is trade_press T5. BloombergNEF data product (about.bnef.com) is industry_data_provider T6. Two separate sources, different domains.

**Gallery Climate Coalition:** member resources and advocacy paths are industry_association T5. Research and methodology publications path is academic_research T3. Two separate sources.

### Multi-role within a single URL (fallback)

When an organization's outputs do NOT cleanly separate by URL, multi-role on a single source is the fallback. Example: a regulator that occasionally publishes research through the same news feed it uses for binding rules. Single source registered, primary_legal_authority primary, academic_research secondary.

In this fallback case, the multi-role precedence rule applies: primary role's Expected Output tested first; if all primary-role rules fail, secondary role's Expected Output tested. This is the only place secondary roles operate.

### Registration migration implication

Existing sources in the registry that should split under this rule (Lloyd's Register, multi-role corporate parents, etc.) need a registry-cleanup workstream after the sources-schema migration lands. Identifying split candidates is part of the 185-unknowns triage and the 130-corporate-add expansion, both held pending framework adoption.

---

## Source-aware item routing summary

Item classification process under this framework:

```
1. Item arrives from source S
2. Look up S's Axis 5 (Expected Output) distribution
3. Order item categories by descending expected probability for S
4. Test item against category rules in that order:
   a. If Regulatory rule passes deterministically → Regulatory
   b. Else if Research rule passes → Research
   c. Else if Market Intel rule passes → Market Intel
   d. Else if Operations rule passes → Operations
   e. Else → Out of Scope (reason: no rule passed)
5. If multiple rules pass ambiguously, use Axis 5 distribution as tie-breaker
6. Check anomaly: classified category's expected probability for S below 5% threshold? Flag for review.
7. Persist classification with: category, source, axis-5-distribution-at-classification-time, ambiguity-flag, anomaly-flag
```

Persisting axis-5-distribution-at-classification-time is important. Source's Axis 5 evolves over time as observed history accumulates. Knowing the distribution at the moment of classification supports retroactive analysis when a source drifts.

---

## What this framework leaves to the next architectural conversation

The 67% multi-rule-ambiguous finding from the classification rules audit is not fully resolved by source-aware routing alone. Source-awareness reduces ambiguity but does not eliminate it. Final resolution requires schema additions to intelligence_items so rule conditions can be tested deterministically rather than inferred from text:

- in_force boolean
- effective_date scalar
- adopted_date scalar
- source_role tag (denormalized from sources table for query speed)
- affected_modes enum array
- affected_verticals enum array
- jurisdictions array
- citation_to_primary_authority text or URL field
- axis5_distribution_at_classification jsonb (snapshot of source's expected output at classification time, supports retroactive analysis when sources drift)

These fields would let item rules test conditions directly. The schema work is sequenced after this framework lands and after the sources-schema migration lands. Adding fields without finalizing the framework risks adding the wrong fields (e.g., a source_role tag that doesn't match the 10 roles defined here).

## Implementation sequencing

This framework is the first of three architectural pieces. Order matters:

**Phase 1 (this framework + companion sources-schema migration):** establishes the source classification primitive and the columns to store it. Sources start being registered with axis assignments. Registry expansion (Task 6 in the wave dispatch) writes to real columns, not docs.

**Phase 2 (source-aware routing classifier change, next wave after framework adoption):** implements the algorithm in Section 5a. Classifier reads source's Axis 5, orders rule testing by descending expected probability, applies tie-break and anomaly logic. This unlocks the ambiguity-reduction benefit of source-awareness.

**Phase 3 (item-level schema work, sequenced after Phase 2):** adds the 9 structured fields above to intelligence_items. Item rules transition from text-inference testing to direct field testing. This is what closes the 67% multi-rule-ambiguous finding.

Each phase has prerequisites; jumping ahead defeats the purpose.

---

## Open questions for operator review

1. **Multi-role precedence (fallback case only)**: the URL-pattern rule above means most multi-role situations resolve to separate registered sources. For the residual fallback cases (single URL with mixed content), do we test against both expected output distributions, or only primary? Recommendation: primary first, secondary on primary's failure. Operator's call.

2. **Drift detection thresholds**: 30 percentage points on a single category is the default proposal. Window length (last N items) and frequency of check (daily, weekly) need operator decision based on volume.

3. **Anomaly threshold**: 5% expected probability is the default proposal. Could be tighter (3%) or looser (10%) depending on noise tolerance.

4. **Anomaly disposition workflow**: defining the trigger without the disposition creates queue pile-up risk. Options for what happens to anomaly-flagged items:
   - **Default-pass with flag visible**: item publishes normally with anomaly indicator; operator can review on demand. Pros: no pile-up, signals visible. Cons: anomalies may be missed in volume.
   - **Queue for human review with default-pass-after-N-days SLA**: item publishes after N days if not actioned, flag persists. Pros: forced attention with safety valve.
   - **Default-block with required review**: anomalies don't publish until reviewed. Pros: tightest gate. Cons: backlog risk if review unstaffed.
   
   Recommendation: default-pass with flag visible during framework rollout and instrumentation period (first 90 days), then revisit with observed anomaly volume. Operator's call.

5. **Government_press downstream-attribution mechanism**: design surface for how items from press-corner aggregates get linked to underlying primary source. Pending separate design dispatch. Not blocking framework adoption.

6. **Vertical taxonomy stability**: the six verticals (fine_art, live_events, luxury, film_tv, automotive, humanitarian) are fixed in the framework. If a seventh vertical emerges, the framework needs amendment, not just an enum value addition.

End framework.

## Related

- [classification-backfill-plan-2026-05-22](./classification-backfill-plan-2026-05-22.md) — Uses migration 084 sources.category which derives from the framework's source_role axis
- [registry-to-ingestion-handoff-design-2026-05-10](./registry-to-ingestion-handoff-design-2026-05-10.md) — Same-day; EFRAG (this doc's proof) and W2.F verification pipeline tier-H routing are that framework's worked examples
- [classification-backfill-ambiguous-2026-05-22](./classification-backfill-ambiguous-2026-05-22.md) — The ambiguity cause is unset source_role/category from migrations 063+084, the framework's 5-axis registration
- [ADR-002-tier-model](../decisions/ADR-002-tier-model.md) — same source-classification subsystem that sets the structural base_tier at registration
- [SOURCE-TYPE-TAXONOMY-PROPOSAL](./SOURCE-TYPE-TAXONOMY-PROPOSAL.md) — Shared subsystem: this proposal formalizes the source-type-of-body classification axis that the source-classification framework governs
