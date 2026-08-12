# Surface spec 03: Research

Status: DRAFT for operator review, 2026-08-12.

**Contract (RULED 2026-07-12, `research-is-horizon-scan`).** Research answers: what is emerging, who is
studying it, how does it change my planning horizon. Reads are STRUCTURED HORIZON ASSESSMENTS, being
horizon distance, maturity, credibility of who is studying it, and the planning-assumption shift. NOT
paper summaries. Feedstock is autonomous machine intake from research-role sources. Editorial curation
queues are FORBIDDEN.

**Current verdict.** Violates on shape, and the doctrine's own feedstock clause describes a capability
that cannot currently run (registered in the doctrine register as a known gap with a named landing
point). The surface renders findings without a horizon axis, a maturity scale, or a credibility model.

**A correction on the record.** I previously believed this surface still shipped the rejected editorial
draft-staging queue, on the authority of a code comment at `src/app/research/page.tsx:44` stating "the
pipeline_stage UI control still functions." Traced properly, `pipelineStage` is selected, mapped,
adapted, typed and **never rendered**. The only stage UI is admin chrome. **The doctrine is clean.**

---

## 1. The atomic unit is the assessment, not the paper

One assessment may draw on forty sources, and the forwarder never needs to read one. A card that cannot
populate `planning_assumption_shifted` does not ship as a card; it goes to the evidence pool as a source
only. This single rule kills paper-summary syndrome at the schema level rather than by editorial
discipline.

## 2. Maturity: three axes, scored independently, never averaged

A freight forwarder is neither a research funder nor a technology developer. They are a **buyer and a
promise-maker to clients**. TRL alone is the wrong instrument because it terminates at "it works", and
the forwarder's question begins there. ARENA's founding argument for the Commercial Readiness Index was
exactly this: TRL was insufficient and commercial maturity needed a parallel index.

| Axis | Scale | Question it answers |
|---|---|---|
| **Technical maturity** | **IEA-extended TRL 1 to 11**, not 1 to 9 | Does it physically work at operational scale? Levels 10 to 11 are where the forwarder's problem lives: "commercial but not yet integrated into value chains at scale" is the exact state of SAF, e-trucks and methanol bunkering |
| **Commercial maturity** | **ARENA CRI 1 to 6** | Can I *buy* it, on a normal contract, at a price I can quote? CRI 3 to 4 (scale-up driven by specific policy, still subsidised) is a very different buying posture from CRI 6 (bankable asset class) |
| **Adoption barrier** | **DOE ARL, the 17-dimension risk vector, not the 1-9 rollup** | Which specific thing blocks me? "Infrastructure: High" and "Regulatory environment: High" are actionable; "ARL 4" is not |

Add **MRL as a conditional fourth axis** only where supply constraint is binding (electrolysers, battery
cells, SAF/HVO refinery capacity): MRL 8 "pilot line capability" vs MRL 10 "full rate production" is the
difference between a pilot allocation and a contractable volume.

**Product rules.** Every maturity score carries a **corridor** (TRL 8 to 10), never a point, plus the
basis and the assessor. Never render TRL on a linear axis; use discrete stepped bands. Always show modal
and geographic scope: "SAF: TRL 9 to 11 for HEFA, TRL 6 to 8 for PtL; CRI 4 in EU (mandated), CRI 2
elsewhere." **Scope is where honesty lives.**

TRL's known criticisms (domain-anchored definitions, no integration risk, no commercial signal) must be
surfaced in-product, not hidden. NASA's own TRL 7 is "demonstrated in a space environment", which is the
tell that whoever writes the top of the ladder decides what "proven" means.

## 3. Horizon distance: two numbers, differently derived

**1. Horizon band** (coarse, always present, machine-assignable): `NOW (0-2y) | NEAR (2-5y) | MID (5-10y)
| FAR (10y+) | UNRESOLVED-DECAY`. The last is Gartner's "obsolete before plateau" and is the most
operationally valuable flag in the set, the one nobody ships. **A forwarder needs to be told "do not
build a plan around this" as much as "build a plan around this."**

**2. Named trigger date**, specific and falsifiable: not "5 to 10 years" but *"binds on you at [DATE]
because [NAMED MECHANISM]"*. For freight this is unusually tractable because the calendar is largely
legislated: ReFuelEU SAF steps, FuelEU intensity steps, EU ETS maritime phase-in, CountEmissions EU
from 2 Dec 2030.

**Three kinds of horizon, and label which one you are quoting:**

- **Availability horizon**: when can I procure it at all.
- **Economic horizon**: when does it cross my cost threshold.
- **Obligation horizon**: when am I required to have done something.

**For a forwarder the obligation horizon almost always arrives first, and it is the one most products
omit.** EN ISO 14083 conformance is an obligation-horizon item, not a technology item.

**Estimation, autonomous, no editorial queue.** A rules cascade, recording which rule fired:

- **R1** a dated statutory instrument exists → band from the instrument. Highest confidence.
- **R2** a diffusion or cost-curve fit with sufficient history → band from the modelled crossover interval.
- **R3** a reputable institutional roadmap gives a date (IEA, ICCT, IMO, national plan) → band from the
  roadmap, tagged with the issuing body and its scenario assumption.
- **R4** none of the above → band from a maturity-to-horizon prior (TRL 10-11 → NOW/NEAR; 8-9 →
  NEAR/MID; 5-7 → MID/FAR; 1-4 → FAR), confidence forced low and labelled "inferred from maturity, no
  dated evidence."

## 4. Credibility: two scores, never merged

### Score 1, evidence base (IPCC-shaped)

*Evidence dimension* (limited / medium / robust) from: `n_works` in the topic-and-time window;
`n_independent_groups` as distinct ROR institution clusters, a replication proxy; `n_countries`, which
guards against single-jurisdiction artefacts; the evidence-type mix (article / review / preprint /
report); and `has_operational_data`, a boolean for whether any source contains field or fleet
measurement rather than model or lab.

*Agreement dimension* (low / medium / high) from: extracted claim polarity per source; variance across
comparable quantitative estimates; and the presence of an explicit dissenting result from a
high-authority source, **which alone caps agreement at medium**.

Map the 3×3 to confidence very low → very high, as IPCC does. Then apply **GRADE-style modifiers as
visible line items, never folded silently**: indirectness (mode, geography, cargo-type or scale
mismatch, for example a bulk study supporting a temperature-controlled fine-art claim); risk of bias
(funder is the technology vendor); imprecision; inconsistency; publication bias (all supporting evidence
from one programme, detectable via shared award IDs or shared ROR); and upgrades for large effect size
and for convergent independent evidence.

**Permit a likelihood statement only where confidence is high or above.**

### Score 2, source authority (computable, free data)

| Component | Computation | Free source and field |
|---|---|---|
| Role class | `university / national_lab / standards_body / intergovernmental / journal / institute_ngo / industry_association / vendor / analytical_press`. Vendors are never excluded but permanently flagged and capped | ROR `types`; OpenAlex `institutions.type` |
| Institutional standing | **Topic-scoped**, not brand: institution FWCI *in the specific topic*, in-topic works count, topic share. Prevents "MIT said it" when MIT has no freight-decarbonisation footprint | OpenAlex `/institutions`, `group_by=institutions.id&filter=topics.id:X` |
| Author standing | In-topic works, in-topic FWCI, h-index, all topic-restricted, plus recency via `counts_by_year` | OpenAlex `/authors` `summary_stats` |
| Funding independence | Funder identity, and whether the funder is a commercial beneficiary of the claim. Public competitive funding scores independent; vendor-funded scores dependent; **undisclosed scores unknown, which is not the same as independent** | OpenAlex `grants[]`; Crossref `funder`; CORDIS |
| Reception | **FWCI and `citation_normalized_percentile`, never raw `cited_by_count`.** For works under 24 months, suppress FWCI and substitute a velocity measure against the subfield cohort | OpenAlex `fwci`; Semantic Scholar `influentialCitationCount` as cross-check |
| Integrity | Retraction, corrections, predatory-venue flag | OpenAlex `is_retracted` (Retraction Watch); DOAJ |

**The grey-literature path is mandatory for freight.** IEA, ICCT, TRB/TRID, Smart Freight Centre, IMO,
EASA and national ministries produce most of the decision-relevant evidence and are poorly
citation-indexed. Route them through a non-citation authority model: role class, institutional mandate
(is this body the standard-setter for this domain?), method transparency, independent replication, and
whether the body is cited *by* indexed literature. **Never let absence of a citation footprint read as
low authority; that is a coverage artefact, not a quality signal.**

**Aggregate as a distribution, never a mean**: "3 high-authority independent, 1 medium, 2 vendor-flagged."
A mean hides the one dissenting national lab, which is the most decision-relevant object on the card.

Citation pathologies to design against: age bias, field bias, self-citation, review-article inflation,
and brand-name substitution for topic competence.

## 5. The planning-assumption shift

The artifact that actually changes a decision, five slots, machine-generated:

> **ASSUMPTION AT RISK** — "We assume Frankfurt–Milan express road linehaul stays diesel-costed through
> 2030 and that our per-shipment carbon figure is a reporting line, not a price."
>
> **SHIFT** — "Becomes: linehaul on this lane carries a compliance-linked fuel-cost component from
> [DATE], and the carbon figure becomes a contracted number your automotive client audits."
>
> **LOAD-BEARING? VULNERABLE?** — Load-bearing: yes, this assumption sits under 34% of quoted margin on
> EU road. Vulnerable: yes, dependent on a single unresolved legislative outcome.
>
> **SIGNPOSTS (watch these, not the news)** — committee publishes implementing act (confirms); second
> OEM announces production slot allocation (confirms); TEN-T charging build rate falls below X
> sites/quarter (refutes or delays).
>
> **ACTIONS** — Shaping: open the pass-through clause conversation at the next two renewals. Hedging:
> price one lane both ways in the next tender. Wind-tunnel verdict on current plan: needs modification.
>
> **DECISION DEADLINE** — the last responsible moment is [DATE], set by [contract cycle / asset order
> lead time / regulatory notice period].

**Two structural rules.**

1. **Every so-what binds to a named, quantified assumption in the customer's own plan.** This requires a
   live per-tenant **assumption register**: the set of things this forwarder's pricing, contracting and
   capacity plans assume. Without it there is no "so what", only "here's a thing." Generic implications
   ("forwarders should monitor SAF developments") are the category's primary failure mode.
2. **Signposts must be machine-observable.** A signpost the system can watch is a signpost that will
   fire. This makes the surface self-closing: the same autonomous intake that detected the signal
   watches for its own confirmation and promotes or downgrades the card **without an editorial queue**,
   which is how the surface satisfies the 2026-07-12 ruling by construction rather than by policy.

## 6. Forecasting: what is honest, and the mandatory refusal state

**Forecastable with quantified uncertainty:** component cost trajectories where a long production-and-cost
series exists (cells, PV, electrolysers) via Wright's law with Monte Carlo bands; **crossover intervals
rather than dates** ("diesel parity for this duty cycle falls in 2029 to 2034 at 70% probability", built
on ICCT's freight TCO structures); and mandated quantities, which are legislated rather than forecast,
where only compliance cost should be modelled.

**Not honestly forecastable, and we must not fake it:** adoption timing for technologies with no
deployment history (ammonia bunkering, liquid hydrogen air cargo), where Bass has nothing to fit and a
borrowed p/q is a decorated guess; regulatory outcomes, and the IMO Net-Zero Framework is the case in
point, a vote widely expected to pass that did not; infrastructure build-out driven by discretionary
public capital; and anything with a step-change supply constraint, because SAF availability is a
refinery-capacity problem, not a learning-curve problem, and Wright's law would produce a confident
wrong answer.

**Design rule: the surface must have a first-class UI state that says "not forecastable, here is the
conditional structure and the signposts instead." A forecasting method that cannot decline is a
liability.**

## 7. Required components

| # | Component | Decision it serves |
|---|---|---|
| 1 | **Horizon assessment card** as the atomic unit | The contract's core ruling |
| 2 | **Three-axis maturity triple** with the binding constraint named | Can I buy it, at what commercial posture, and what specifically blocks it. TRL alone would say battery-electric tractors are TRL 9 while omitting that the depot power connection is the actual barrier |
| 3 | **Dual horizon**: band plus dated trigger with named mechanism and derivation basis | Band goes in the list view; mechanism makes it arguable; basis makes it discountable |
| 4 | **Split credibility**: evidence×agreement separate from source-authority distribution, with the GRADE modifier ledger | A vendor consortium producing robust internally consistent evidence must read as *high evidence, low independence*, in one glance |
| 5 | **Who-is-studying-it panel**: ranked institutions and authors, role class, topic-scoped standing, funder independence, geographic spread | Named in the contract. Topic-scoping is what prevents brand-name credibility |
| 6 | **Dissent panel**, first-class, never collapsed | Where credible sources disagree, that disagreement *is* the assessment: it says hedge rather than commit. Surfacing only consensus manufactures false confidence |
| 7 | **Assumption-register binding** (load-bearing × vulnerable) | Converts "here's a thing" into "here's the thing in *your* plan that breaks" |
| 8 | **Machine-watchable signposts** with automatic state transitions `emerging → strengthening → stalled → resolved → falsified` | Makes foresight actionable and satisfies the no-editorial-queue ruling |
| 9 | **Cost-crossover module** with Monte Carlo bands and an explicit not-forecastable state | "When does SAF / e-truck / hydrogen become my problem" is a cost question |
| 10 | **Obligation calendar** joined to the assessments it forces | The obligation horizon precedes the technology horizon |
| 11 | **Assessment history ledger**: every prior confidence, horizon and maturity value with timestamp and cause | **A horizon assessment must be able to be wrong in public and be seen to have been wrong.** A card that silently rewrites its own history is a marketing artifact |
| 12 | **Coverage and gap map**: what intake watches, what it does not, where evidence is thin | Prevents absence of signal being read as absence of change |

Optional 13th: a **wind-tunnel view**, running the customer's plan against 3 to 4 standing scenarios,
each option classified robust / needs modification / redundant.

## 8. Free intake and credibility stack ($0)

**OpenAlex** is the spine: works, authors, institutions, topics, `fwci`,
`citation_normalized_percentile`, `grants[]`, `is_retracted`, `counts_by_year`; free, no key, polite-pool
by email. **ROR** for institution identity and type. **ORCID** for authors. **Crossref** for DOI
metadata and funder arrays. **Semantic Scholar** for `influentialCitationCount` as a cross-check.
**DOAJ** as a legitimate-OA whitelist. **CORDIS** for EU project, organisation and funding tables.
**TRID** for transport-specific literature. **OpenAIRE** for grey literature. Patents as a leading
indicator of who is investing ahead of publication.

Domain feedstock: IEA, ICCT, IMO, EASA, EMSA, Smart Freight Centre, national transport ministries,
university transport institutes.

## 9. Acceptance criteria

1. Every card carries a maturity triple with corridors, not points, plus basis and assessor.
2. Every card carries a horizon band, a trigger where R1-R3 applies, and its derivation basis.
3. Every card carries evidence level, agreement level, confidence, and the GRADE modifier ledger.
4. Source authority renders as a distribution, never a mean.
5. Dissent is a first-class field and renders uncollapsed when non-empty.
6. Zero cards ship without `planning_assumption_shifted`.
7. Every signpost is machine-observable, with a named watcher.
8. Raw `cited_by_count` is never rendered as a credibility signal.
9. Works under 24 months suppress FWCI and show velocity instead.
10. Assessment history is append-only and visible.
11. A "not forecastable" state exists and renders the conditional structure.
12. No editorial queue, no operator-approval affordance, no "featured by" framing anywhere on the surface.

## 10. Gap: current state vs this spec

| Spec element | Now |
|---|---|
| Assessment as atomic unit | **Absent.** Atom is a finding/paper |
| Maturity triple | **Absent.** No TRL, CRI or ARL anywhere |
| Horizon band and trigger | **Absent.** No horizon axis at all, which is the contract's first clause |
| Split credibility | **Partial and pathological.** Citation-count chips exist, which is the raw metric the literature warns against; no FWCI, no topic scoping, no funder independence |
| Who-is-studying-it | **Absent** as a structured panel |
| Dissent | **Absent** |
| Assumption register | **Absent.** Per-tenant object does not exist |
| Signposts and state machine | **Absent** |
| Crossover forecasting | **Absent** |
| Assessment history | **Absent** |
| Theme rendering | **Broken.** A finding matching no theme regex is counted in the tiles and rendered in zero bands, with no empty state. Verified content is silently invisible |
| Editorial queue | **Clean.** `pipelineStage` is fetched and never rendered; the false claim is in a code comment |
| Autonomous research-source intake | **Absent**, and correctly registered in the doctrine register as a known gap with a named landing point |
| Format sections | 6 of 6 render, conditionally |
