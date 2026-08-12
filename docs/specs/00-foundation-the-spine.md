# Surface spec 00: the foundation, and why five surfaces are one product

Status: DRAFT for operator review, 2026-08-12. Grounded in external research against named
industry practice; every non-obvious claim carries its source. Companion documents: `01-regulations`,
`02-market-intel`, `03-research`, `04-operations`, `05-community`, `06-gap-register-and-sequence`.

## 0. The thesis

The five surfaces are not five products that share a nav bar. They are **five lenses on one spine**.
This is the literal architecture of the best multi-module intelligence product in an adjacent domain:
Wood Mackenzie's platform is named *Lens* because its modules (Upstream, Gas & LNG, Power &
Renewables, Metals & Mining, Hydrogen, Carbon & Emissions) are views over one asset-by-asset data
foundation, and the product is sold on the cross-commodity insight that only a shared foundation
allows ([woodmac.com/lens](https://www.woodmac.com/lens/)). Bloomberg's grammar is the same shape:
you *load an entity*, then apply a function (`DES`, `FA`, `CN`, `ANR`). The function operates on
whatever is loaded. Cross-module navigation works because the entity is application state, not a
query parameter retyped per screen
([Imperial College Bloomberg guide](https://library-guides.imperial.ac.uk/bloomberg/functions)).

Caro's Ledge today has the inverse: five surfaces, each with its own classification of what an item
is, its own count population, its own heading map, and until 2026-08-11 no shared guard on which
surface may render which item. The per-surface rebuilds proposed in the 2026-05-23 synthesis would
have produced five better-looking surfaces that still were not one product.

**Three foundation objects make it one product. Everything in the per-surface specs assumes them.**

1. **The entity spine.** One canonical, permanent, resolvable ID per real-world thing. Every surface
   dereferences the same object.
2. **The number envelope.** Every figure anywhere in the product carries the same metadata jacket.
   A number without its envelope is not shippable.
3. **The shared vocabularies.** Six enums, defined once, rendered identically on every surface.

A fourth object, the **portfolio**, is what turns the spine into a personal product.

## 1. The entity spine

### 1.1 Why it is the load-bearing decision

An entity spine is a registry of resolvable objects that every module dereferences, so "the same
thing" is literally the same row everywhere. Three implementations worth copying:

- **LSEG PermID**: "open, permanent, and universal identifiers" covering organisations, instruments,
  funds, issuers and people, explicitly positioned as the thing that connects all datasets in the
  information model, and explicitly *complementing* rather than replacing RIC, ISIN and LEI. The spine
  is a hub with a crosswalk, not a replacement standard
  ([lseg.com](https://www.lseg.com/en/data-analytics/products/permid-data-management)).
- **FIGI**: two design principles to steal. IDs are **never reused** (the same instrument in
  perpetuity, unchanged through corporate actions) and are **hierarchical** (exchange-level vs
  composite) ([FIGI](https://en.wikipedia.org/wiki/Financial_Instrument_Global_Identifier)).
- **LEI / ISO 17442**: the **Level 1 "who is who" / Level 2 "who owns whom"** split. Identity data and
  relationship data are separate layers with separate refresh cadence and separate confidence
  ([GLEIF](https://www.gleif.org/en/organizational-identity/introducing-the-legal-entity-identifier-lei/iso-17442-the-lei-code-structure)).

### 1.2 The nine canonical entities

Each carries an internal permanent ID (`cl:*`, never reused, survives renames and M&A) plus a
crosswalk to external standards. Adopting existing identifiers rather than inventing them is what
makes the data joinable to the customer's own systems and to third-party feeds.

| Entity | Internal | External identifiers to adopt |
|---|---|---|
| Organisation (carrier, forwarder, shipper, terminal, OEM, verifier) | `cl:org:*` | **LEI** (ISO 17442, free, L1+L2) · **IMO Company Number** (7 digits, permanent; on merger the survivor's number persists and the smaller is frozen, a ready-made corporate-action rule) · IATA designator · SCAC · UIC code · EORI · D-U-N-S |
| Vessel / asset | `cl:asset:*` | **IMO ship number** (unchanged across flag, owner, name and type change for the life of the hull) · MMSI (mutable, an attribute never a key) · aircraft registration + ICAO 24-bit · ENI · ISO 6346 equipment codes |
| Node / place | `cl:node:*` | **UN/LOCODE** (103,034 locations, 249 territories, semi-annual releases; already the lingua franca of forwarders) · IATA 3-letter and ICAO 4-letter · UIC station · GS1 GLN below LOCODE granularity |
| **Corridor / lane** | `cl:corridor:*` | No standard exists. Derived: ordered `(origin node, mode, destination node)` with a stable hash. **This is the highest-value proprietary entity in the product; nobody else canonicalises it.** |
| Jurisdiction | `cl:juris:*` | ISO 3166-1/-2 · **NUTS** (versioned, pin the version) · MARPOL ECA/SECA polygons · EU ETS and ETS2 scope · CORSIA state pairs. Flag state, port state and operator state are three *roles* on the same object |
| Regulatory instrument | `cl:instr:*` | **CELEX + ELI URIs.** ELI carries `{point in time}` and `{version}` natively, so "the obligation as it stood on the shipment date" is a citable link rather than a caveat; FRBRoo-based, RDFa/JSON-LD embeddable, 21 jurisdictions ([EUR-Lex ELI](https://eur-lex.europa.eu/eli-register/what_is_eli.html)) · IMO resolutions MEPC.xxx(yy) · CFR citations |
| Method / standard | `cl:method:*` | **EN ISO 14083** and its **transport chain element (TCE) / hub / leg** decomposition, which is the natively standardised freight-emissions entity and must be a first-class object rather than a calculation detail · GLEC Framework · GHG Protocol Scope 3 Cat 4/9 |
| Fuel / technology | `cl:tech:*` | No global registry exists; build and publish one. Model as a **pathway** (feedstock × conversion × region), never a bare name. "HVO" is not an entity; "HVO from used cooking oil, EU, ISCC EU" is. Anchor to CN/HS, RED III pathway IDs, ISCC/RSB scheme IDs, CORSIA default LCA values |
| Person / research org | `cl:person:*`, `cl:ror:*` | **ORCID** and **ROR**, so a Research citation resolves to the same Organisation object as a Market Intel record when a university spins out a technology |

### 1.3 Two rules that make the spine load-bearing rather than decorative

1. **Composite / atomic hierarchy.** "Maersk" the group, "Maersk A/S" the LEI'd legal entity and
   "MAEU" the carrier operating identity are three objects with declared relations, not one fuzzy
   object. Every screen states which level it shows. This is FIGI's composite/exchange-level
   distinction ported to corporate structure, and it maps onto GLEIF's L1/L2 split.
2. **Alias table with provenance, never overwritten names.** Every alias carries who asserted it and
   when. PermID's stated value is reducing mapping inconsistency; that only holds if aliases are
   evidence, not edits.

### 1.4 What we already have

`src/lib/surface-of.mjs` is a partial spine: it is the ratified `(item_type, domain) → surface`
classifier, it codegens migration 148's SQL, it carries a drift guard, and as of PR #450 it governs
both outbound links and inbound route admission. It classifies items. It does not yet resolve
entities. The spine proper is net-new and is the single largest foundation investment in this plan.

## 2. The number envelope

**Rule: no figure ships without its envelope.** A professional price is never a scalar. The envelope
below is the intersection of the IOSCO PRA Principles
([PD391](https://www.iosco.org/library/pubdocs/pdf/IOSCOPD391.pdf)), the Platts assessment
methodology, and Argus's published specifications.

| Field | Why it exists |
|---|---|
| `value` (+ `low`/`high` where a range is honest) | In a thin market a point estimate is a lie of precision. Argus publishes ranges for voluntary carbon precisely because the range *is* the honesty signal |
| `derivation` | `observed / transacted-index / assessed / calculated / interpolated / modelled / estimated`. IOSCO 2.3(a) mandates disclosing whether a number is transaction-based, spread-based or interpolated. **The single most load-bearing field** |
| `unit`, `currency`, `fx_date` | Two "diesel prices" on different units are different commodities |
| `basis` | Incoterm, delivery point, spec, vintage. Location differentials are often larger than the daily move |
| `as_of` triple: `event_date`, `source_published_at`, `ingested_at` | Three different facts. Bare "last updated" conflates all three and is the anti-pattern |
| `expected_refresh`, `staleness_state` | `current / ageing / stale / frozen`. Frozen means the source stopped publishing |
| `n` (sample size) and `contributor_count` | IOSCO 2.3(a) requires publishing the size and liquidity of the market assessed. Also the defence against key-submitter dependency |
| `method` → `cl:method:*` + version | Series breaks are the silent killer of trend analysis. Two numbers under different methods must never share a column without the chip |
| `judgment_note` | IOSCO 2.3(b): a concise explanation of where judgment was applied, what was excluded, and why |
| `provenance` (W3C PROV chain) | See §4 |
| `origin_class` | See §3.6 |

**Significant figures are driven by `n`.** Publishing `€47.83/tCO2e` when the honest read is `€45 to 50`
is the false-precision failure. Everstream deliberately scores supply-chain risk on a coarse 0 to 25
scale to avoid exactly this ([everstream.ai](https://www.everstream.ai/articles/rate-supply-chain-risk-with-scoring/)).

**Never zero-fill.** A missing emission factor is `M` (missing), never `0`. This is the single most
damaging silent failure available to a freight emissions product.

## 3. The six shared vocabularies

Professional products use **one vocabulary across modules**; modules differ only in which values they
emit. Per-module vocabularies are the most common cause of a five-module product feeling like five
products. Each of these is defined once, in one enum, rendered by one component.

### 3.1 `status` (does the value exist, and in what state)

Adopt **SDMX CL_OBS_STATUS** wholesale rather than inventing: `A` normal, `P` provisional, `E`
estimated, `I` imputed, `F` forecast, `B` series break, `D` definition differs, `U` low reliability,
`V` unvalidated, `G` experimental, `M/O/L/H/Q` missing variants, `N` not significant
([SDMX implementation guide](https://sdmx.org/wp-content/uploads/CL_OBS_STATUS_implementation_20-10-2014.pdf)).
SDMX keeps OBS_STATUS separate from CONF_STATUS (confidentiality) and PRE_BREAK_VALUE. Copy that
separation: availability, confidentiality and comparability are three orthogonal facts, and collapsing
them into one "data quality" badge destroys information.

### 3.2 `confidence` (how much should I believe it)

Two schemes, each right for a different kind of claim. Publish the mapping between them so one chip
can render either.

- **Asserted-and-sourced claims** (Regulations, Market Intel, Community): the **Admiralty/NATO 6×6**
  code. Letter A to F for *source* reliability (F = insufficient history to judge, which is distinct
  from unreliable); number 1 to 6 for *information* credibility (1 = confirmed by independent sources,
  2 = logical and consistent but not confirmed). Rendered `B2`. The design lesson is that a highly
  reliable source can carry uncorroborated information (`A2`) and an unreliable source can carry
  confirmed information (`E1`); collapsing these into one star rating destroys the most useful
  distinction in the system ([Admiralty code](https://en.wikipedia.org/wiki/Intelligence_source_and_information_reliability)).
- **Numeric-and-modelled values** (Operations, Research, emission factors): the **ecoinvent/Weidema
  five-axis pedigree**: reliability, completeness, temporal correlation, geographical correlation,
  further technological correlation, each 1 to 5, converted to uncertainty factors
  ([pedigree report](https://lca-net.com/files/Pedigree_report_final_May2012.pdf)). This is the right
  scheme because it is the vocabulary the customer's LCA and assurance people already speak, and
  because temporal/geographical/technological correlation *is* the question "is this EU 2019 road
  factor valid for my 2026 Brazilian lane."

**Never combine likelihood and confidence in one statement.** ICD 203 forbids it explicitly: likelihood
is how probable the event, confidence is how good the evidence base. Two chips, never one. ICD 203 also
supplies a closed, published probability ladder (*almost no chance* 01-05% through *almost certainly*
95-99%) so that "likely" means the same thing every time
([ICD 203](https://www.intelligence.gov/assets/documents/intelligence-community-directives/ICD_203.pdf)).

### 3.3 `severity` / `materiality`

Two separate scales, never merged: `impact` (none / operational / cost / compliance / licence-to-operate)
× `applicability` (confirmed applies / likely applies / monitor / not applicable). A jurisdiction-wide
instrument can be maximum impact and not applicable simultaneously; a single scalar hides that.

### 3.4 `freshness`

The three timestamps from §2, plus `expected_refresh` and `staleness_state`, all visible.

### 3.5 `provenance`

Model on **W3C PROV**: Entity / Activity / Agent with `wasGeneratedBy`, `used`, `wasDerivedFrom`,
`wasAttributedTo`, `wasInformedBy`, `actedOnBehalfOf` ([W3C PROV-DM](https://www.w3.org/TR/prov-dm/)).
Every published record carries a derivation chain to primary sources. This is what makes the
Assistant's citations auditable rather than decorative, and it is the artefact an assurance provider
will pay for.

### 3.6 `origin_class` — the vocabulary that protects everything else

`verified` (our editorial, dual-checked) · `official` (primary source, unmodified) · `derived` (our
calculation from stated inputs and a named method) · `modelled` (our estimate where inputs are absent)
· `partner` (licensed third party) · `community` (user-contributed, unverified) ·
`community-corroborated` (n independent contributors agree, still not verified).

**Three hard rules.** It is non-suppressible in every view including exports, PDFs and Assistant
output. It **propagates to the weakest constituent** in any aggregate. It survives CSV/XLSX/PDF export
as a column, not merely as screen decoration.

## 4. Coverage honesty: six states, six treatments, never one grey dash

In a product whose coverage is genuinely partial, the way absence is communicated *is* the trust
model. Six distinct states:

| State | Meaning | Treatment |
|---|---|---|
| Not applicable | The question is meaningless here (a SECA surcharge on a rail leg) | Suppress the field, explain on hover. Not an empty state |
| Not covered | In product scope, not yet built | Named coverage gap, roadmap position, "request coverage" |
| No data yet | Covered, source has not published | Expected-refresh date, last known value with as-of |
| Suppressed | Exists, withheld (confidentiality, k-anonymity, licence) | State the reason class; never look like absence |
| Not filtered in | Exists outside the active portfolio scope | "N items hidden by your scope" + one-click widen. **The filter-bubble antidote** |
| Error | System failure | Distinct treatment, retry, status link |

**The reference implementation is Climate TRACE**, which publishes coverage as a quantified,
sector-by-sector inventory of what is and is not included (70,000+ assets in the UI vs 7M+ via
download; the top 600 power plants globally; roughly two thirds of oil and gas production; feedlots
covering only Argentina and the US), routes users to the fuller download when the UI looks thin, and
invites gap reports ([Climate TRACE](https://climatetrace.org/news/how-to-understand-asset-level-emissions-by-country)).
Numerator and denominator, per sector, in the product, with a contribution path.

**Requirements.** A first-class Coverage surface (mode × geography × data class, versioned, dated,
publicly linkable, exportable, generated from the data rather than hand-written). Coverage as a
default Map layer, because a map that renders uncovered regions identically to zero-emission regions
is a lie. Denominators everywhere ("based on 4 of 11 legs; 7 modelled"), beside the number and not in
a footnote. Coverage shown at portfolio-add time, so expectations are set at commitment rather than at
disappointment.

## 5. The portfolio: one "my things" object across five surfaces

The standard model is Capital IQ's: watchlists created once in a personal workspace, populated by
filter, paste or bulk upload, supporting **multiple entity types** (companies, geographies, indices,
industries, instruments), with alerts configured separately carrying name, subject, frequency
(real-time or digest), format and recipients; the watchlist then acts as a **filter in various areas
of the platform**
([S&P Capital IQ](https://pages.marketintelligence.spglobal.com/PiperSandler-SettingsWatchListsAlertsCIQ.html)).

Four layers:

1. **Portfolio.** Heterogeneous, spine-typed: a mix of `cl:org`, `cl:corridor`, `cl:node`, `cl:juris`,
   `cl:tech`, `cl:instr`. Team-shareable, owned, multiple per user. **One object, not five per-surface
   subscriptions.**
2. **Scope.** The active portfolio is ambient state applied identically on all five surfaces plus
   Dashboard, Map and the Assistant. A persistent, one-click-clearable chip in the global header.
   Silent scoping is the filter-bubble failure mode.
3. **Triggers.** Per-surface emitters, shared taxonomy. Regulations: instrument added or amended
   touching a watched jurisdiction or corridor, consultation opened, compliance date T-90/T-30/T-7.
   Market Intel: price band breach, capacity or service change on a watched corridor, carrier
   ownership event. Research: new evidence carrying a `contradicts` or `quantifies` edge to something
   in the portfolio, or a factor revision that changes a previously reported number. Operations:
   threshold breach, and **recalculation notice** ("a factor you used in a filed report has been
   revised"). Community: reply, thread tagged to a watched entity, corroboration threshold crossed.
4. **Delivery.** Per trigger class: immediate / daily / weekly / in-app / never, plus a **`must-see`
   class that ignores digest and mute preferences**. Digests compose **across** surfaces into one
   severity-ordered message. Five per-surface emails in one morning is the strongest possible signal
   that this is five products.

## 6. Cross-references between surfaces

**Links must be entity-mediated, not text-mediated.** An item on Regulations does not link to a Market
Intel article; both link to `cl:juris:EU` and `cl:instr:CELEX:32023R1805` and a corridor, and the UI
derives the cross-reference. This is how Bloomberg's related-functions menu works: generated from the
loaded entity, not curated per article.

Every edge carries a **typed relation** from a fixed set: `implements`, `amends`, `supersedes`,
`is-evidence-for`, `contradicts`, `quantifies`, `applies-to`, `affects-corridor`, `discussed-in`,
`computed-under`.

Six machine-checkable properties make a link trustworthy: typed; directional and asymmetric;
attributed (editor, rule, or model, and model-suggested edges are visually distinct and excluded from
exports and Assistant citations); anchored to a passage or clause rather than a document (ELI gives
clause-level URIs for EU law); confidence-scored and thresholded, with below-threshold edges in an
explicitly labelled "possible connections" tray rather than inline; and reciprocal and non-dangling,
with tombstones plus successors instead of 404s.

**Never cross-link on keyword overlap.** That is the mechanism by which every "related content" module
in the industry became ignorable.

## 7. Assistant guardrails

The positioning is binding: a research helper, not a synthesis or decision engine. The rules serious
products publish:

- **Corpus closure.** AskGartner draws exclusively from Gartner proprietary insight, verified
  references, primary research, case studies and Peer Insights, explicitly contrasted with public LLMs
  ([AskGartner FAQ](https://www.gartner.com/en/products/ask-gartner-faqs)). LSEG Workspace AI Search
  is grounded in trusted, licensed datasets ([LSEG](https://www.lseg.com/en/data-analytics/products/workspace/updates/act-with-the-same-confidence-at-a-new-speed-introducing-lseg-workspace-ai-search)).
- **Mandatory traceable citation.** An uncited sentence is a bug. If a claim cannot be anchored to a
  record ID, the sentence is not emitted.
- **Entitlement-aware retrieval**, filtered before generation, never after.
- **One calculator.** The Assistant computes nothing itself; it calls the same audited ISO 14083
  service Operations uses, or it declines. Two calculators is how you get two answers.
- **Output-use restriction.** Assistant output is watermarked non-attestable and blocked from the
  compliance filing/export pathway. This is the sharpest available mechanism for keeping it a helper.
- **Show the search in plain language**, including **what was searched and returned nothing**. The
  null result is the honesty signal.
- **Refuse and route, never hedge.** Hard refusal classes: compliance verdicts ("are we compliant with
  FuelEU?" returns the obligation, the applicability test and the user's own data, never a verdict),
  forward price prediction, carrier recommendation, and any conclusion that would require `community`
  or `modelled` data to be presented as `verified`.
- **Provenance-class propagation.** The answer inherits and displays the weakest class present. No
  laundering.

## 8. The coherence test

`scripts/verify/surface-acceptance.mjs` (Phase 1) implements these as executable assertions. Full list
in `06-gap-register-and-sequence`. The spine-level assertions are:

1. Every entity referenced on any surface resolves to a `cl:` ID. Zero free-text entity references.
2. No `cl:` ID is reused after retirement.
3. One canonical detail page per entity; all five surfaces link to the same URL.
4. Loading an entity and switching surfaces preserves the entity.
5. Every external identifier validates against its standard's format and check digit.
6. Merges and renames preserve inbound links (301, never 404).
7. Exactly one enum per vocabulary in the codebase; zero per-surface variants.
8. Every vocabulary value renders with the identical component on every surface.
9. `origin_class` propagates to the weakest constituent in every aggregate, and survives export.
10. Every cross-surface link is typed, reciprocal and non-dangling.
11. Every numeric claim links to a `cl:method` and a source with an as-of.
12. Six empty states are distinguishable; no bare dash, no zero-fill.
13. Every aggregate shows its denominator.
14. Adding an entity to a portfolio from any surface produces the same record.
15. Active scope filters every surface plus Dashboard, Map and Assistant, and is always visible.
16. Digests compose across surfaces into one message.
17. Assistant: zero uncited factual sentences; numbers equal Operations numbers for the same query.

**The human test, for what CI cannot catch.** Hand an evaluator one corridor and one regulation. Ask
them to reach every relevant item on all five surfaces without using search or the URL bar, then state
which single question each screen answered. If any screen answers zero questions or more than one, it
is dashboard sprawl. If they hit a dead end, the spine has a hole there.

## 9. What this means for the existing plan

`surface-rebuild-plan-2026-08-11.md` Phase 0 (substrate) and Phase 1 (acceptance gate) remain correct
and are prerequisites. This document adds a Phase 0.6: **the entity spine**, which is net-new, is the
largest single foundation item, and gates the cross-surface behaviour every per-surface spec assumes.
Sequencing consequence is in `06-gap-register-and-sequence`.
