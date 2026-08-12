# Surface spec 01: Regulations

Status: DRAFT for operator review, 2026-08-12. Regulatory status verified against primary sources on
2026-08-12; items that could not be confirmed are listed in §9 and must be re-verified before build.

**Contract (RULED 2026-07-12, `analysis-follows-page-intent`).** Regulations is the ONLY page whose
read is a compliance-action text brief: what is binding, when, what it costs, what to do. Not
comparative, not numerical.

**Current verdict.** Qualified NO on delivering its own intent. Two of the four contract clauses are
structurally unanswerable at HEAD: `penalty_range`, `cost_mechanism` and `enforcement_body` were
de-mapped as absent from schema with the consuming tiles left in place, so *what it costs* renders
permanent em-dashes, and `binding_status` exists nowhere in the repo, so *what is binding* has no
representation in the data model at all.

---

## 1. The strategic finding that should reshape this surface

Almost nothing in the freight sustainability landscape binds a freight forwarder directly. The
industry's regulatory intelligence products are built for the duty-holder. **Caro's Ledge's customer is
usually not the duty-holder, and the product's core job is to tell them which of the three positions
they are in.**

**Directly binding on the forwarder (statutory duty falls on the forwarder itself):**

| Instrument | Why the forwarder is bound |
|---|---|
| **CountEmissions EU, Regulation (EU) 2026/1030** | **The centre of gravity.** The only instrument in this landscape written *at* transport service organisers. Conditional-mandatory: disclosure is voluntary, the method is not. The moment a forwarder puts a gCO2e/t-km figure in a tender, quote, customer report or marketing, it must be computed the prescribed way, aligned to EN ISO 14083. Adopted 29 Apr 2026, in force 2 Jun 2026, applies **2 Dec 2030** ([DG MOVE](https://transport.ec.europa.eu/news-events/news/new-eu-rules-harmonising-transport-emissions-calculations-take-effect-2026-06-01_en), [EUR-Lex 32026R1030](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1030)) |
| **CBAM, when acting as indirect customs representative** | The Commission's own definitive-regime page states that EU importers "or their indirect customs representatives" must apply for authorised CBAM declarant status. Where the importer is not EU-established this is **mandatory**, and the forwarder carries registration, declaration and certificate-surrender liability. A present, 2026, widely underappreciated exposure ([DG TAXUD](https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-definitive-regime_en)) |
| **Empowering Consumers Directive (EU) 2024/825** | Applies **27 Sep 2026**. Bans generic environmental claims and offset-based "climate neutral" claims. Applies to the forwarder's own marketing. This, not the Green Claims Directive, is the near-term green-claims risk |
| **PPWR, Regulation (EU) 2025/40** | Applicable since **12 Aug 2026**. Binds the forwarder as a user of transport and grouped packaging (empty-space ratio, reuse targets), and as importer of record where applicable |
| **SOLAS VGM** | Binds the named shipper; forwarders routinely assume it as agent |
| **CSRD** | Only the largest forwarding groups (>1,000 employees AND >€450m after the Omnibus) |

**Reaches the forwarder as carrier pass-through (a price, not a duty):** EU ETS maritime, FuelEU
Maritime, ReFuelEU Aviation, CORSIA, EU ETS2 from 2028, IMO CII/EEXI, and the IMO Net-Zero Framework
if adopted.

**Reaches the forwarder through customer contracts (data demands, not statutory duty):** CSRD/ESRS
Scope 3, SBTi customer targets, CSDDD supplier codes, EUDR due-diligence statement references in the
customs chain.

**The Omnibus gave mid-size forwarders a defensive right that did not exist twelve months ago:** an
in-scope customer may not demand more than the VSME standard from a counterparty averaging fewer than
1,000 employees. That is a product feature waiting to be built, not just a fact.

**Design consequence.** A product that conflates duty, price and data-request will over-alarm and
under-serve. `binding_position` (see §3) is therefore the single most important new field on this
surface, and it is more important than any UI work.

## 2. What the industry does, and the unit of content

The atomic unit is not the document. It is the **obligation**: an affirmative duty to complete, or
refrain from, a set of actions. Ascent estimates only ~35% of regulatory text contains obligations;
the rest is definitional ([Ascent](https://www.ascentregtech.com/blog/automate-identification-of-your-regulatory-obligations/)).
Thomson Reuters resolves at subsection level: each subsection creating an actionable requirement forms
a unique Obligation document
([TRRI](https://legal.thomsonreuters.com/content/dam/ewp-m/documents/legal/en/pdf/support/regulatory-intelligence-obligations-library-sell-sheet.pdf)).

**If the atom is a PDF, the customer still has to read it, and we have added a search box to a problem
that needed a decomposition.** Our current 15-section Regulatory Fact Document is a good *brief*; it is
not an obligation register, and the two are different products serving different moments.

## 3. The data model

### 3.1 Instrument (`cl:instr:*`)

`celex`, `eli_uri` (carries point-in-time and version natively), `title`, `short_name`,
`instrument_type`, `issuing_body`, `jurisdiction[]`, `official_gazette_ref`, `lifecycle_state`,
the four dates (§3.3), `supersedes[]`, `amended_by[]`, `as_at_date`, `known_unapplied_effects`,
`translation_flag` (official language / official translation / vendor translation).

### 3.2 Obligation (`cl:oblig:*`) — NET NEW, the core build

| Field | Decision it serves |
|---|---|
| `obligation_id` (stable, versioned) | The register must survive amendment. Version the obligation *object*, not the document, or you can only say "this document changed", never "this duty changed" |
| `pinpoint_citation` (article/paragraph/subsection) | Can a named person find the exact words that bind them |
| `verbatim_text` | Defensibility. Paraphrase alone is not evidence of due diligence |
| `plain_language` | Can a non-lawyer act. Enhesa's entire value proposition |
| **`binding_position`** | `direct_duty / carrier_passthrough / customer_contract / monitoring_only`. §1. **The field that makes this product different from a generic EHS register** |
| `duty_holder_class` | Carrier, shipper, forwarder, NVOCC, customs representative (direct/indirect), ISM company, fuel supplier, aircraft operator, producer. In freight this is the difference between liability and pass-through |
| `applicability_trigger` | The profile answer that caused inclusion. Libryo surfaces this on the requirement itself; it is what auditors interrogate and the most under-built field in immature products |
| `jurisdiction[]`, `mode[]`, `vertical[]` | Scope |
| `frequency` | Annual, per-consignment, per-voyage, event-triggered. Drives calendar generation |
| Four dates (§3.3) | |
| `evidence_required`, `retention_period` | What to keep, and for how long, to prove it later |
| `sanction_class`, `severity_score`, `statutory_maximum` | §3.4 |
| `cost_formula` (nullable) | §3.4. Populated only where a published formula exists |
| `owner`, `status`, `date_reviewed`, `next_review_due` | Status is exactly three values (Enhesa's floor): **Yes / No / Not assessed**. "Not assessed" is a first-class state, never a null. Every attempt at richer status taxonomies collapses in practice |
| `control_action` → task | |
| `provenance` | Source URL, retrieval date, verifier, immutable change history |

### 3.3 Four dates, never one

`entry_into_force` ≠ `date_of_application` ≠ `first_deadline` ≠ `enforcement_start`. Conflating them is
a class of product failure. Two worked examples from our own domain:

- **CountEmissions EU**: in force 2 Jun 2026, applies 2 Dec 2030, voluntary in scope but mandatory in
  method, implementing and delegated acts still pending.
- **FuelEU Maritime**: an annual cycle with four operative dates (report to verifier, recorded in the
  FuelEU database, compliance/pooling notification, Document of Compliance issued only after penalty
  payment). A single "effective date" field cannot represent either.

### 3.4 Cost: quantify only where a formula exists

Vendors do not quantify compliance cost, and the reason is that their customers cannot either. PwC and
TheCityUK found that **no firm surveyed had a systematic framework to quantify the cost of regulatory
compliance**; directly attributable cost was ~2.6% of operating cost, organisation-wide ~10.4%
([PwC](https://www.pwc.co.uk/financial-services/assets/pdf/reducing-cost-of-compliance.pdf)).

**Freight sustainability is the rare domain with priced obligations, and that is our opening.** Three
cost slots, carried separately and never merged:

1. **Penalty exposure** (statutory maximum, or a formula).
2. **Direct compliance cost** (verifier fees, certificate purchase, registration fees; knowable).
3. **Effort** (person-days, one-off vs recurring). **Never presented as money.**

The priced obligations, verified 2026-08-12:

| Instrument | Formula | Unit price |
|---|---|---|
| **FuelEU Maritime** | Penalty € = (\|compliance balance gCO2e\| ÷ (GHGIe_actual × 41,000)) × 2,400; balance = (target − actual) × Σ energy MJ; 2025 target = 91.16 × 0.98 = 89.34 gCO2e/MJ; ×(1 + 0.1(n−1)) for consecutive deficit years | **€2,400 / t VLSFOe**; OPS **€1.5/kWh** |
| **EU ETS maritime** | Σ(emissions × route factor) × phase-in × EUA price. Route factor 100% intra-EU and at-berth, 50% extra-EU. Phase-in **100% from 2026** | EUA market; non-compliance **€100/tCO2e** indexed |
| **CBAM** | Certificates = embedded emissions − carbon price paid at origin − free-allocation benchmark adjustment. Certificate price = quarterly average EUA auction price (2026), weekly from 2027 | EUA-linked; ×3 to ×5 for unauthorised import |
| **EU ETS2** | Passed into fuel price | MSR soft cap **€45/t** (2020 prices, indexed), from 2028 |
| **IMO Net-Zero Framework** | *Not law.* Tier 1 / Tier 2 deficits against GFI reference 93.3 gCO2e/MJ | **US$100 and US$380/tCO2e** — model as scenario, `adopted: false` |

**Mixing a modelled estimate with a statutory figure in the same visual slot destroys trust faster than
showing nothing.**

### 3.5 Applicability

Three production patterns exist; all are profile → filter → register. Enhesa uses two-tier screening
(audit-scope questions kill whole domains cheaply, then jurisdiction-specific applicability questions
do surgical exclusion). Libryo has its regulatory team **pre-answer** the logic questions during
onboarding from known location and operations, so the customer confirms rather than composes; it then
uses the same answers to filter *change notifications*, and instructs customers to re-review whenever
there is a significant change or annually, because **applicability decays**.

Minimum forwarder profile: legal entities and establishment jurisdictions with EU/UK/US nexus (branch,
EORI, fiscal representative); activity codes plus **regulated-role flags** (customs representative
direct/indirect, AEO, NVOCC/OTI, IATA cargo agent, RA/KC aviation security, ADR/IMDG/DGR
consignor-vs-carrier role, waste-shipment notifier); modes operated and whether as principal or agent;
country pairs and corridors actually used; asset register including vessel GT, because the EU
ETS/FuelEU threshold is vessel-level not company-level; commodity classes (dangerous goods, CITES and
cultural property for art logistics, lithium batteries for live events, dual-use for prototypes,
controlled-temperature pharma, sanctioned destinations); thresholds (headcount, turnover, balance
sheet, tCO2e, energy, vehicle count); and **customer-imposed obligations** from shipper contracts and
tender commitments, which for a mid-size forwarder often bind harder and sooner than statute.

**Design rule: every register row carries the trigger that put it there, and every trigger is a profile
attribute the customer can see and change.** Applicability without an audit trail of *why* is
indistinguishable from a guess.

### 3.6 Lifecycle, on two orthogonal axes

**Instrument lifecycle:** horizon/announced → consultation open (with comment deadline) → consultation
closed → proposal published → adopted → in force → applies from → amended → superseded → repealed.
Roughly **5% of proposed legislation becomes law** ([Regology](https://www.regology.com/blog/horizon-scanning-and-regulatory-change-strategic-foresight-in-action)),
which is the best available argument for keeping horizon items visually and structurally separate from
binding ones.

**Register-record state:** Active / Needs review / Archived, plus Enhesa's **major vs minor**
classification. Enhesa's *implicit major change* category is the sophisticated one and is directly
relevant to us: an annex, referenced document or emission-factor table changes a compliance value while
the parent text is untouched. **Diffing statutes alone misses a large share of what actually changes,
and in freight sustainability, where default fuel values and DG lists move independently, it may miss
the majority.**

## 4. Required components

| # | Component | Decision it serves |
|---|---|---|
| 1 | **Binding-position banner** on every obligation: duty / pass-through / contract / monitor | Is this mine, my carrier's, or my customer's? The product's core distinction |
| 2 | **Applicability panel** with visible triggers and a "not applicable, because…" control that records reason and date | Is this actually mine? The recorded exclusion is the defence |
| 3 | **Obligation card**: plain language + verbatim provision + pinpoint citation + as-at date | What exactly must I do, and can I show my customer the text |
| 4 | **Four-date timeline** per obligation plus a consolidated calendar with T-90/T-30/T-7 | When must I have done something |
| 5 | **Horizon lane**, visually separate from binding | What goes in next year's budget and next tender's assumptions |
| 6 | **Change feed** filtered by applicability, with major/minor and provision-level diff (eCFR-style red/green redline is the expected visual) | Does this week's change touch me |
| 7 | **Consequence block**: sanction class, severity, statutory maximum, and computed exposure **only where formulaic** | How hard do I push internally, and do I surcharge |
| 8 | **Evidence and retention slot** with an artefact upload | ISO 14001 §6.1.3 and §9.1.2 require documented compliance obligations *and* documented periodic evaluation; buyers with certified systems map our output straight onto those clauses |
| 9 | **Owner, three-value status, review date** | Who is on the hook, and is our position stale |
| 10 | **Obligation → task** with owner and due date | What happens Monday |
| 11 | **Export and point-in-time snapshot** (Excel/PDF) | Hand this to procurement, an auditor or an insurer today. Often the most-used feature |
| 12 | **Customer-obligation ingest** (contracts, tender commitments, permits) alongside law | For a mid-size forwarder the biggest exposure is often a shipper clause, not a statute |

## 5. Provenance standard

Canonical instrument identifier (CELEX + ELI, and ELI carries point-in-time and version in the URI
itself); pinpoint to the provision, not the instrument; **as-at date of the text assessed against**;
known-unapplied effects (legislation.gov.uk's editorial lag is typically 4 to 8 weeks against a
3-month target, and any product mirroring national law inherits that lag and must disclose it);
retrieval timestamp, source URL and gazette reference; human accountability; immutable change history
including a snapshot of *what the customer was told*, on a given date; and a translation flag.

**The defensibility test:** on 14 March, what did we believe applied to us, on what basis, who said so,
and against which text version? A surface that cannot answer that is content, not evidence.

## 6. Free primary sources

EUR-Lex (REST + SPARQL, ELI URIs, machine-readable); the Official Journal; legislation.gov.uk
(point-in-time URIs, prospective versions, outstanding-effects box); eCFR (point-in-time back to 2017,
green/red redlines); IMO, ICAO, EASA and EMSA publications; national gazettes. All free. The gap is
27 fragmented Member-State EPR registers with no common API, which is a structural coverage limit to
state openly rather than paper over.

## 7. Acceptance criteria (feeds `surface-acceptance.mjs`)

1. Every obligation carries `binding_position`, and zero render without it.
2. Every obligation carries a pinpoint citation and an as-at date.
3. Cost is rendered only where `cost_formula` is non-null; every other cost slot shows sanction class
   and statutory maximum, never a modelled number in the same visual slot.
4. Status vocabulary has exactly three values and "not assessed" is never rendered as a null or dash.
5. Every register row exposes its applicability trigger.
6. The four dates are distinct fields, and no view collapses them.
7. Horizon items never render in a binding list without a visual separation.
8. Every instrument resolves to a CELEX or ELI, and ELI URIs validate.
9. Change items carry major/minor classification and a provision-level diff.
10. Export contains `origin_class` and the as-at date as columns.

## 8. Gap: current state vs this spec

| Spec element | Now |
|---|---|
| Obligation as atomic unit | **Absent.** Atom is a 15-section brief |
| `binding_position` | **Absent.** Does not exist in the repo |
| `binding_status` | **Absent.** The load-bearing word in "binding regulatory intelligence" has no field |
| Cost fields | **Broken.** `penalty_range`, `cost_mechanism`, `enforcement_body` de-mapped, tiles left in place, permanent em-dashes |
| Applicability model | **Absent.** No profile-driven filtering, no triggers |
| Four dates | **Partial.** Timeline exists; the four are not distinguished |
| Section renderers | 7 of 15 first-class, and the built ones are gated off by a `hasFull` toggle that disables itself precisely on items whose `full_brief` failed to parse, hiding sections that are stored and paid for |
| Change feed with diff | **Absent** |
| Evidence/retention | **Absent** |
| Export / point-in-time | **Absent** |
| Provenance to clause level | **Partial.** Source lists exist; no ELI, no as-at, no pinpoint |

## 9. UNCONFIRMED, must be re-verified before build

Carried forward verbatim from the 2026-08-12 verification pass. Each is a spec input that could not be
confirmed against a primary source, mostly because EUR-Lex served metadata rather than operative text
and several agency sites block automated access.

1. California SB 253 / SB 261 current deadlines, CARB final regulation status, thresholds and penalty
   caps. CARB and leginfo both refused access. **Must be checked before this enters a spec.**
2. Exact date of the resumed IMO extraordinary session (substance confirmed: a December 2026
   adopt-or-fail decision; the precise dates conflict between IMO's own pages and secondary sources).
3. CBAM Article 26 penalty operative text.
4. CBAM Omnibus regulation OJ citation (substance corroborated, citation not read directly).
5. FuelEU Maritime annual compliance cycle dates (all four).
6. FuelEU Annex IV exact formula constants (€2,400 and 41,000 MJ/t corroborated, Annex not rendered).
7. ReFuelEU Aviation intermediate Annex I steps for 2032, 2040, 2045 (sources mutually inconsistent).
8. ReFuelEU penalty formula.
9. eFTI Regulation (EU) 2020/1056 application date.
10. PPWR numeric targets: recycled-content percentages, the empty-space ratio, transport reuse targets.
11. EUDR second-delay amending regulation number.
12. "Stop the clock" directive citation.
13. GLEC Framework current version and its conformance statement against EN ISO 14083:2023 (Smart
    Freight Centre returned 403).
14. CORSIA first-phase cancellation deadline.
15. Litigation status of EPA's endangerment-finding rescission.
16. Whether any SBTi sector guidance covers freight forwarding / 3PL specifically.

## 10. Volatile: build as data, never hardcode

IMO Net-Zero Framework (adopt-or-fail December 2026; adoption status, GFI trajectory, both tier prices
and entry into force are all in play). CORSIA EEU price and availability (~10 supplying states against
~130 participants, and phase 2 turns mandatory in under five months). CountEmissions EU implementing
and delegated acts, which will carry the default emission factors and primary-data hierarchy, so
**factor tables must be versioned, dated data**. EU ETS2 start date, already moved once. US federal
position, where both the EPA rescission and the SEC proposal will be litigated and either could be
vacated, so model US obligations as reversible. California, which has moved repeatedly. The Green
Claims Directive, dormant rather than dead, so keep a status field rather than a boolean. The CII
second review. Sector-specific ESRS, where a transport and logistics standard would materially change
forwarder data duties. EUDR, delayed twice already.
