# Surface spec 06: the gap register and the build sequence

Status: DRAFT for operator review, 2026-08-12. Supersedes the sequencing in
`docs/plans/surface-rebuild-plan-2026-08-11.md` §7 by inserting the foundation work that plan did not
yet know was needed. Everything in that plan remains valid; this extends it.

## 1. How to read this

The 2026-05-23 synthesis sequenced five per-surface rebuilds. The 2026-08-11 re-verification showed the
per-surface framing was itself the error: four defects were identical on all four intelligence surfaces
and lived below them. This document shows the same thing one layer up. **Most of what makes these
surfaces industry-leading is not per-surface either.** It is one spine, one number envelope, six
vocabularies and one portfolio, and every surface spec assumes all four.

Gaps are therefore grouped by **layer**, not by page. A gap fixed at the layer is fixed for every
surface at once; a gap fixed at a page is fixed once.

Severity: **P0** blocks the contract (the surface cannot deliver its ruled intent without it).
**P1** materially degrades trust or correctness. **P2** completeness.

## 2. Layer 0: the spine (net-new, gates everything)

| # | Gap | Sev | Notes |
|---|---|---|---|
| S-1 | **No entity spine.** No canonical, permanent, resolvable ID for organisation, asset, node, corridor, jurisdiction, instrument, method, technology, person | **P0** | `surface-of.mjs` classifies items; it does not resolve entities. The single largest foundation investment |
| S-2 | **No corridor entity.** The atomic unit of freight has no representation | **P0** | Highest-value proprietary entity; nobody else canonicalises it. Blocks Market Intel components 2, 3, 5, 7 and Operations component 10 |
| S-3 | No external identifier crosswalk (LEI, IMO ship and company number, UN/LOCODE, IATA/ICAO, NUTS, CELEX/ELI, ROR, ORCID) | P1 | Blocks joining to customer systems and to free datasets, most of which are keyed on these |
| S-4 | **No number envelope.** No `derivation`, no `n`, no `basis`, no method version, no as-of triple | **P0** | Blocks every numeric claim on Market Intel and Operations from being contractable |
| S-5 | **No shared vocabularies.** `status`, `confidence`, `severity`, `freshness`, `provenance`, `origin_class` do not exist as single enums | **P0** | `origin_class` in particular is unfixable retroactively: content ingested without a provenance class cannot be reliably reclassified |
| S-6 | No W3C PROV derivation chain | P1 | The artefact an assurance provider pays for; also what makes Assistant citations auditable |
| S-7 | **No portfolio object.** No "my things" across surfaces, no scope chip, no cross-surface digest | **P0** | Without it the five surfaces cannot be personalised coherently and every alert is per-surface noise |
| S-8 | No typed cross-reference model | P1 | Untyped related-item rails are the industry's canonical noise generator |
| S-9 | No coverage surface, no six-state empty-state vocabulary | P1 | Currently coverage is claimed in prose ("every fact carries a source and date") while being false |

## 3. Layer 1: the four substrate defects (from the 2026-08-11 re-verification)

| # | Gap | Sev | Status |
|---|---|---|---|
| B-1 | No surface guard on detail routes | P0 | **CLOSED**, PR #450 |
| B-2 | Counts and rows come from two different classifiers on every surface | P0 | Open, Phase 0.2 |
| B-3 | ~17 UI fields bound to producers that do not exist | P0 | Open, Phase 0.3 |
| B-4 | `domain: row.domain \|\| 1` launders unclassified rows onto Regulations | P1 | Open, Phase 0.4 |
| B-5 | Market and Operations import the Regulations prose renderer, which supports no tables or lists | P0 | Open, Phase 0.5. **This one alone makes the comparative contract physically impossible on two surfaces** |

## 4. Layer 2: per-surface gaps

Full detail in the per-surface specs. Summary of P0 items only.

**Regulations** (`01`): obligation as atomic unit is absent; **`binding_position` is absent**, which is
the field that distinguishes duty from carrier pass-through from customer data-request and is the
product's core insight; `binding_status` does not exist, so "what is binding" has no data model; the
cost clause is broken with de-mapped fields and orphaned tiles; no applicability model; the four dates
are not distinguished; 7 of 15 sections render and are gated off by a `hasFull` toggle that disables
itself precisely on items whose brief failed to parse.

**Market Intel** (`02`): every numeric input is an orphan, so the comparative chrome renders permanent
em-dashes; no corridor rate board; **no carbon-cost-per-FEU overlay**, which is the most defensible
differentiating component available and is the natural join to Regulations; no lead-time chart, so the
contract's third clause has zero implementation; the unverified chip is unconditional and inverts
epistemic integrity; no methodology disclosure.

**Research** (`03`): no horizon axis at all, which is the contract's first clause; no maturity scale; no
credibility model beyond raw citation counts, which is the metric the literature specifically warns
against; no assumption register, so there is no "so what"; no signposts, so nothing self-closes; theme
rendering silently hides verified content that matches no regex.

**Operations** (`04`): no cross-region comparison anywhere, and the one control that promises it draws a
border; **EU and US have zero data on all five sourced dimensions** with no live producer; no labour
chain; no TCO or break-even, so decision 1 has no home; feasibility is scored rather than gated;
materials and PPWR are adjacent but unjoined; D1 reports two contradictory coverage truths; the Assistant
cannot see any of the operations tables it is invited to answer questions about.

**Community** (`05`): no antitrust posting guard, no verified-pseudonymous identity, no house seeding, no
promotion state machine, no `origin_class`.

## 5. Layer 3: content and data gaps

| # | Gap | Sev |
|---|---|---|
| D-1 | No autonomous research-source intake (registered in the doctrine register as a known gap with a named landing point) | P0 for Research |
| D-2 | No live producer for `regional_data_facts`; EU and US never in scope of the one script that ever wrote it | P0 for Operations |
| D-3 | No price/index ingestion for any of the free sources named in `02` §7 | P0 for Market Intel |
| D-4 | No obligation decomposition for any instrument | P0 for Regulations |
| D-5 | 16 regulatory facts UNCONFIRMED (`01` §9), including PPWR numeric targets, FuelEU cycle dates and California deadlines | P1, blocks specific components |
| D-6 | No emission-factor store, versioned and dated, despite CountEmissions EU making factor provenance a legal question from 2030 | P1 |

## 6. The revised sequence

Phases 0 and 1 are unchanged from `surface-rebuild-plan-2026-08-11.md` and remain first. What follows
inserts the spine and re-orders Phase 2 by what unblocks the most.

### Phase 0, substrate. In progress.
0.1 surface admission guard — **DONE, PR #450**. 0.2 one population per page. 0.3 producer or deletion
for the ~17 orphan fields. 0.4 stop coalescing null domain. 0.5 per-page prose renderer with table and
list support.

### Phase 1, the acceptance gate.
`scripts/verify/surface-acceptance.mjs` + F26, two-way ratchet on today's measured counts per the
operator ruling. Ship before any redesign so Phase 2 is provable.

### Phase 2, the spine. NEW, and it is the phase that makes this one product.
2.1 Entity registry and the nine entity types, with permanent IDs and the external crosswalk.
2.2 **The corridor entity**, because it unblocks the most downstream components.
2.3 The number envelope as a shared type, enforced by the acceptance gate.
2.4 The six vocabularies as single enums, `origin_class` first because it is unfixable retroactively.
2.5 The portfolio object, scope chip and cross-surface digest.
2.6 Typed cross-references and the coverage surface.

### Phase 3, data producers, run in parallel with Phase 2 because they are independent.
3.1 Market Intel free-source ingestion: EU Weekly Oil Bulletin, EIA v2, EEX auctions, **THETIS-MRV**
(vessel-level verified performance, the highest-value free dataset available), **SBTi dashboard weekly**
(the diffusion engine behind the lead-time chart), ECB FX.
3.2 Operations free-source ingestion: Eurostat energy, labour and packaging-waste series; BLS OEWS and
QCEW; PVGIS; Ember; EAFO and AFDC; Comext recyclate trade. **EU and US first**, per the operator ruling.
3.3 Research intake: OpenAlex, ROR, ORCID, Crossref, plus the grey-literature path.
3.4 Regulations: obligation decomposition, starting with the instruments that bind the forwarder directly
(CountEmissions EU, CBAM indirect representation, Empowering Consumers, PPWR).
3.5 Close the 16 UNCONFIRMED regulatory facts.

### Phase 4, per-surface shape work, ordered by measured contract-distance and by unblocking.
4.1 **Operations cross-region column.** Zero backend, the data is already keyed correctly, and it
converts the surface from a gallery of prose cards into the comparative read the ruling names.
4.2 **Regulations `binding_position` and the obligation register.** The product's core distinction.
4.3 **Market Intel carbon-cost-per-FEU overlay and one numeric channel end to end.**
4.4 **Research horizon band, maturity triple and credibility split.**
4.5 Regulations: ungate the seven built section renderers from the `hasFull` toggle.
4.6 Research: project the real theme column and add an Unclassified band.

### Phase 5, Community and the Assistant.
5.1 Antitrust posting guard and verified-pseudonymous identity, before any usage expansion.
5.2 The promotion state machine.
5.3 House-seeded benchmark cadence.
5.4 Assistant guardrails and the one-calculator rule.

## 7. Why this order

**The spine before the surfaces**, because five of the twelve components on each surface spec are
spine-dependent, and building them per-surface builds them five times and inconsistently.

**`origin_class` before content growth**, because content ingested without a provenance class cannot be
reliably reclassified later, and because the moment Community or modelled data touches an Operations
figure without it, the product has laundered an estimate into a fact.

**Data producers in parallel**, because they are independent of the spine and are the long pole. The
research shows almost everything needed is free and API-accessible; the work is ingestion discipline,
not acquisition.

**The corridor entity early**, because it is the join between all four intelligence surfaces and the
single object no competitor canonicalises.

**Operations cross-region first in Phase 4**, because it is the cheapest change with the largest
contract movement, and because it makes the EU/US data hole visible in one glance, which correctly
prices Phase 3.2 rather than hiding it.

## 8. What is genuinely differentiating

Recorded so the sequence protects it. Four things in this plan are not available from any competitor:

1. **Carbon cost inside the freight rate, per corridor, per FEU.** Drewry already includes the EU ETS
   surcharge in WCI, so the industry has conceded that carbon is a freight cost. Nobody presents the
   decomposition to a forwarder against their own lanes.
2. **The binding-position distinction.** Every regulatory intelligence product is built for the
   duty-holder. Our customer usually is not one, and telling them which of three positions they occupy
   is a product nobody sells.
3. **The corridor as a canonical entity**, joining regulation, price, research and operations to a lane.
4. **The lead-time-to-obligation read**, built from free diffusion data (SBTi weekly, THETIS-MRV
   vessel-level verified performance) against a largely legislated calendar. It converts "sustainability
   pressure" into months.

## 9. Open decisions for the operator

1. **Spine scope for v1.** All nine entity types, or start with corridor + jurisdiction + organisation +
   instrument and defer asset, method, technology and person?
2. **Assumption register ownership.** Research (`03` §5) and Operations (`04` §6 component 12) both need
   a per-tenant assumption register. One object shared, or two? Recommend one, since a discount rate and
   a planning assumption are the same class of thing and duplication is how the two surfaces diverge.
3. **PRA-style methodology disclosure.** Adopt the IOSCO disclosure discipline now, before we publish
   any index-like number? Recommend yes: retrofitting an audit trail is impossible, and the disclosure
   is what makes a number contractable.
4. **Community usage expansion** is currently gated behind the antitrust guard in this sequence. Confirm
   that is the right gate, or say if Community should stay at current usage until later.
