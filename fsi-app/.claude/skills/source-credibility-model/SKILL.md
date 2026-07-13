---
name: source-credibility-model
description: Source credibility model for Caro's Ledge. Defines the six-element credibility system (type-based tier, bias tags, citation-network credibility, source discovery loop, operator override, recency decay), the bias tag vocabulary, the customer-facing signal sets per surface, and operational criteria for credibility-affecting work. Load on any dispatch that touches sources table, source_citations or brief-to-source edge tables, tier/base_tier/effective_tier/tier_override columns, bias_tag columns, the candidate review surface, Haiku classification endpoints, customer-facing credibility signal rendering, the discovery loop, or citation network scoring + decay + override semantics. Extends environmental-policy-and-innovation's 6-level Source Type Hierarchy. Customer-facing signal sets per surface align with caros-ledge-platform-intent's five-surface model.
when_to_load:
  - "Touches the sources table (read or write)"
  - "Touches source_citations or intelligence_item_citations edge tables"
  - "Modifies tier, base_tier, effective_tier, tier_override, override_reason, override_date, or bias_tag* columns on sources"
  - "Touches the candidate review surface (canonical_source_candidates table, admin canonical-sources review components, /api/admin/canonical-sources/* routes)"
  - "Modifies the Haiku recommend-classification endpoints (canonical-sources/recommend-classification, sources/recommend-classification)"
  - "Modifies the verification pipeline (src/lib/sources/verification.ts)"
  - "Adds or modifies customer-facing credibility signal rendering on any of the seven surfaces (Regulations, Research, Market Intel, Operations, Community, Map, Intelligence Assistant)"
  - "Changes the discovery loop (citation extraction in src/app/api/agent/run/route.ts, source resolution in any consumer, candidate promotion criteria)"
  - "Adds or modifies citation network scoring (src/lib/trust.ts), recency decay, or override semantics"
---

# Source Credibility Model

## Section 1: Purpose and Scope

This skill defines the source credibility model for Caro's Ledge. It is the canonical source of truth for how source credibility is computed, surfaced, and acted on across the platform.

**Owned by this skill:**

- The six-element credibility model (type-based tier, bias tags, citation-network credibility, source discovery loop, operator override, recency decay) and how the elements compose
- The bias tag vocabulary (three dimensions, multi-value within each)
- The customer-facing credibility signal sets per platform surface
- The operational criteria for tier classification, candidate promotion, override, and decay
- The discovery-loop autonomy thresholds and audit-trail expectations on override

**NOT owned by this skill:**

- Brief content rules (owned by `environmental-policy-and-innovation`)
- Platform surface intent (owned by `caros-ledge-platform-intent`)
- Dispatch loop closure, OBS handling, DP compliance, sweep discipline (owned by `sprint-followups-discipline`)

Cross-skill load is additive, not exclusive. A Build 8 (Research) dispatch loads all four: env-policy (brief content), platform-intent (Research surface intent), sprint-followups-discipline (loop closure), source-credibility-model (the Q9 Research signal set, candidate review wiring, effective tier computation).

## Section 2: The Six-Element Model as a Coherent System

The source credibility model has six elements that together produce a single credibility signal (effective tier) that customers and agents see by default.

**1. Type-based default tier.** Every source has a static `base_tier` (INT 1-7) assigned at classification time based on the source's institutional type per the environmental-policy-and-innovation 6-level Source Type Hierarchy (tier 7 = overflow/uncategorized). Base tier is set once at classification and rarely changes; it preserves the classifier's or operator's original credibility judgment for audit and provenance.

**2. Bias tags.** Sources carry orthogonal bias tags across three dimensions (Funding/Institutional Affiliation, Methodological Orientation, Stakeholder Position). Bias is independent of tier; a tier-2 regulator can have any bias profile, just as a tier-6 analytical outlet can. Bias is a separate axis from authority weight. Bias tags apply to external publisher sources only.

**3. Citation-network credibility.** Sources accumulate credibility weight from incoming citations. Citation weight is tier-weighted (citations from higher-tier sources count more) and decayed (recent citations count more than old ones). The aggregated weighted citation sum contributes to a source's effective tier.

**4. Source discovery through citations.** When briefs cite sources not in the registry, the discovery loop captures them as candidates. High-confidence candidates surface to the operator review queue; low-confidence ones accumulate in provisional storage without consuming operator attention until they cross promotion thresholds.

**5. Operator override.** The operator can explicitly set `tier_override` on a source with `override_reason` and `override_date`. The override takes precedence over computed values in the effective tier formula. Overrides are auditable via the existing `source_trust_events` table.

**6. Recency decay.** Citation weight decays with a half-life curve (18-24 months tunable). Recent citations contribute more than old ones. Decay applies to citation-network contributions only; it does NOT apply to base_tier (structural, not time-sensitive) or to accessibility decay (separate existing logic in `src/lib/trust.ts`).

### System diagram

```
base_tier (from classification, INT 1-7, static) ────────────┐
                                                              │
citation network (tier-weighted, decayed) ────────────────────┤
                                                              ├──> effective_tier ──> customer-facing signal
operator override (when present)                              │                        (Section 8)
  COALESCE(tier_override, computed_dynamic, base_tier) ───────┘
```

Formula: `effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)`

Where `computed_dynamic_tier` is derived from `base_tier` plus the tier-weighted decayed citation network sum, computed by daily batch recompute.

**The moat (reg-fact eligibility).** The reg-fact grounding-tier stamp derives from static `base_tier` ONLY (with the per-host `tier_override` as the single sanctioned escape); dynamic reputation (effective_tier) and time-in-system never confer reg-fact grounding eligibility — a NULL `base_tier` resolves to NULL, never to a reputation tier. Reputation earns a SIGNAL trust within the signal tier; it never promotes a signal to a fact. The only bridge from signal to fact is verification against the domain's authoritative primary. (Enforced by fitness F12 / invariant SC-9; the resolver `tierOfSource` is `base_tier ?? null`, and the grounding pipeline does not select effective_tier into the resolver rows.)

**Why six elements together, not just static tier.** Each element addresses a failure mode the others cannot:

- Type-based tier alone is static; a tier-6 analytical outlet whose work is consistently cited by tier-1 regulators is doing tier-3-quality work, but static tier misses that signal
- Bias tags alone don't address authority; a methodologically-transparent industry-funded source can still be authoritative within its scope, but bias warns the consumer about lens
- Citation network alone overweights popular sources without considering institutional type; high citation count from low-tier sources should not elevate a source's credibility
- Discovery alone produces noise without verification gates; high-confidence routing prevents queue flood
- Override alone is human-only; without computed signals, every classification decision is operator labor
- Decay alone is time-only; without network and base signals, decay has nothing to operate on

## Section 3: Type Tier Operational Criteria

The base_tier 1-7 mapping extends the env-policy 6-level Source Type Hierarchy with operational decision criteria:

| Tier | Type | Operational meaning |
|---|---|---|
| 1 | Binding law | Primary legal text. The source IS the rule. Published regulations, statutory text, treaty articles, and the official legal publishers that carry them: **EUR-Lex / the Official Journal, legislation.gov.uk, Federal Register / eCFR**. |
| 2 | Regulator / regulator guidance | The regulator that issues the binding instrument, plus its implementation guidance, interpretive bulletins, FAQs, compliance manuals. **Instrument-issuing intergovernmental regulators belong HERE, not at T3: IMO** (MARPOL / MEPC resolutions) **and ICAO** (CORSIA) are the maritime/aviation regulators whose adopted instruments are binding; the **European Commission** (implementing / delegated acts, enforcement, official guidance) is the EU executive/regulator; national regulators/ministries. Rationale: a body that ISSUES binding instruments is classified by the act's nature as a regulator, never lumped with analysis bodies. |
| 3 | Intergovernmental analysis body | Intergovernmental institutions that INFORM but do not issue binding rules: **OECD, IEA, World Bank, UNCTAD, ICAP, IPCC**, UN analytical bodies. Authoritative analysis and data, not primary law — distinct from IMO/ICAO/Commission at T2. |
| 4 | Industry body / classification society | Trade associations, professional standards bodies, consortiums — and **classification societies (Lloyd's Register, DNV, ClassNK, Bureau Veritas)**. PRECEDENT (class-society cell): a class society's delegated authority attaches to its OFFICIAL ACTS (statutory surveys, certificates), NOT to its website / client briefings; the latter are industry-body publishing — usable as labeled `Industry interpretation:` ANALYSIS, never unlabeled FACT-grade grounding for a CRITICAL/HIGH regulation. The same ruling recurs for **EU MRV / CBAM accredited verifiers**. |
| 5 | News reporting | Factual news coverage of regulatory or industry developments. Reuters, FT, Wall Street Journal, trade press in factual reporting mode. |
| 6 | Analysis and opinion | Analytical commentary, op-eds, sustainability journalism, industry analyst reports, law-firm client briefings. GreenBiz, Edie, Environmental Finance, analyst publications. |
| 7 | Overflow/uncategorized | Sources that don't fit the hierarchy. Used sparingly; signals a classification gap to resolve. Bulk registration MUST classify rather than default to T7 (a real institution defaulted to overflow is the duplicate-row defect). |

### Tier 7 weight in citation-network scoring

T7 weight = 0. A source classified as T7 contributes no credibility signal when it cites other sources, because T7 is the platform's signal that the source's authority has not been established. Promoting other sources based on T7 citations would amplify uncertainty.

This differs from T6 (weight = 0.15) where the source has a known classification (analytical/opinion) and contributes some signal because its type is known even if its tier is low.

### Sub-vertical inheritance

When a sub-vertical regulator (e.g. IMO for maritime, ICAO for aviation, FMCSA for US trucking) acts within its vertical, its tier defaults to the parent vertical's regulator tier (typically T2). When a sub-vertical body acts outside its mandate (e.g. an industry consortium publishing analytical commentary), the work is classified by the act's nature, not the institution's parent type.

The classifier prompt should recognize both the institution AND the work product to assign correctly.

Open sub-decision: per-jurisdiction threshold differentials. Today the classifier uses global thresholds (75/55 relevance/freight). Whether EU vs US vs APAC need different calibration is operator-domain-knowledge work; not yet decided. Tracked in the decisions doc Open Sub-Decisions section.

### Tier as referenced in classifier prompts vs customer-facing surfaces

Classifier prompts continue to reference "tier 1-7" as the static type taxonomy. They classify `base_tier`. Customer-facing surfaces and agents reference `effective_tier` (the dynamic signal that incorporates network + override + decay). The two are distinct schema fields after Q2 lands; consumer migration is per-consumer (decisions doc Open Sub-Decision).

### Per-item-type authority floor (provenance gate)

The authority floor is the minimum grounding tier a CRITICAL/HIGH item's FACT claims may carry, and it is **calibrated per item type** — a single tier floor across all types is a category error (the regulatory floor would false-quarantine 76–88% of correctly-sourced market/research facts, which legitimately ground at T3–6). A CRITICAL/HIGH item's FACT claims MUST carry `source_tier_at_grounding` at or above the floor for their item type, enforced by `validate_item_provenance` (migration 141): **regulation-family ≤ T2**, **research_finding ≤ T4** (preserves the T3 research core — IPCC/OECD/IEA/World Bank — with one tier of industry-analysis margin; T5–6 are relabeled to ANALYSIS by the mechanical prose-safe discipline), **technology/innovation/tool ≤ T5** (forward default, calibrated against zero live items, REVISIT when the first land). A FACT below its type's floor either re-grounds to a higher-tier source or relabels to a labeled ANALYSIS claim; it is never forced.

**Named exemptions (REVISIT, so neither silently becomes permanent).** `market_signal` and `initiative` are EXEMPT from a tier floor: their strength is corroboration-count (Section 4 — N independent tier-weighted corroborators), not a single-source tier, and codifying the corroboration gate before it is built would put unbuilt mechanism in the gate. `regional_data` is EXEMPT: its floor is per-SECTION (feasibility facts ≤ T3; cost-data facts any tier with a registered source), not item-level. Both stay exempt until their gates are built; the absence is registered (invariant SC-8), not silent.

### Canonical institutional tier (one tier per institution)

Tier is a property of the **institution**, not of a row. The registry MUST hold **one canonical institutional tier per host group** — multiple `sources` rows for the same institution (different pages, ingestion paths, dates) MUST share one `base_tier`. The grouping key is the **registrable domain (eTLD+1) = the institution** by default, with documented super-domain exceptions where a shared government domain hosts distinct bodies: **europa.eu subdomains are institution-distinct** (eur-lex.europa.eu = T1 legal text vs ec.europa.eu = T2 regulator vs eea.europa.eu = T3 agency), and **legislation.gov.uk (T1) is distinct from gov.uk departmental (T2)**. A single deliberate per-row exception is allowed ONLY via the Section 7 override columns (`tier_override` + `override_reason`, default none); absent an override, inconsistent per-row tiers are the duplicate-row defect and MUST be canonicalized. Bulk registration MUST classify (never default a real institution to T7 overflow); the register-as-source path assigns the institution's honest tier at registration.

**Register-at-grounding assigns a DETERMINISTIC tier only (SC-13).** The register-at-grounding step (pool-host registration, run BEFORE the FACT stamp so a corroborator-grounded span resolves to a real tier) may assign `base_tier` ONLY where the tier is knowable without guessing: an existing institution-group (eTLD+1) match INHERITS the canonical tier, or a codified host-class rule applies (legal-primary → T1, gov/regulator/intergov → T2). There are **NO LLM tier guesses and NO default tier**. An AMBIGUOUS host (no institution match, no codified rule) is **NOT registered** — its FACT span NULL-stamps and walls the floor honestly, and `surfaceNullTierHosts` aggregates the host into ONE `integrity_flag` for one batched operator look (the 44-host pattern), never an auto-judged tier and never item-by-item clicks. Minting a guessed default tier is **fake certification**: a guessed T5 hollow-passes the technology floor (=5), certifying a FACT on a host whose authority was never established. This is the register-side twin of the no-constant-stamp rule below — the stamp RESOLVES an institution's tier, it never INVENTS one. (Historical note: the prior pass registered ambiguous pool hosts at a sub-floor default of 5, the guessed-tier defect this rule closes; the brief-cited `New Sources Identified` registration is a separate credibility path whose guessed-default residual is registered, not silent.)

**Per-claim attribution = the source containing the span.** A FACT claim is attributed to the source whose fetched content actually contains its verbatim span (resolved via the span's pool row), NOT a hardcoded primary. Its grounding-tier stamp is set so that **the stamp equals the canonical institutional tier of the source containing the span** (the flagged-override row tier where present; NULL when that host is unregistered). No constant stamps: a constant masquerading as a resolved tier is fake certification. (Durable form: a single `institutions` table with `sources` referencing it — tracked follow-on; until then the per-host canonical `base_tier` carries the institutional tier.)

**Floor-qualifying source reaches grounding COMPLETE (the truncation moat).** For a FACT to ground at the authority floor, its span MUST be matchable in a floor-qualifying source — so any source at/above the item's authority floor (tier ≤ floor: reg-family ≤T2, research ≤T4, tech ≤T5) MUST reach the grounding model in FULL, never silently truncated. The synthesis/grounding block builder is TIER-ORDERED: floor-qualifiers are placed first, in full; the shared input budget's truncation pressure falls on the LOWEST-tier corroborators first, never the floor-qualifier. A floor-qualifying source larger than the hard context ceiling is the chunking case — a SURFACED wall (a `truncation-guard` integrity_flag + the item stays quarantined with a named reason), NEVER a silent slice. Rationale: a truncated floor source forces the fact to a sub-floor corroborator → `fact_below_authority_floor` even though the pool is healthy (Lane-#4 batch-1 root cause, 2026-07-03). Synthesis and grounding read the IDENTICAL window (same pool + budget + tiers) so a span written in synthesis is matchable in grounding.

**Floor-first span re-attribution (the attribution half of the moat).** The truncation moat gets the floor source COMPLETE to the model; this closes the ATTRIBUTION half. A FACT is attributed to the source that contains its span — but when the SAME verbatim span sits in BOTH a floor-qualifying source AND a sub-floor corroborator that echoes the enacted text, the grounding attribution MUST prefer the floor-qualifying source (best-tier-first), so the fact grounds AT the floor instead of walling on `fact_below_authority_floor`. This is binding and it is NEVER forced: re-attribution fires ONLY when the verbatim span is genuinely present in a floor source; a span absent from every floor source keeps its honest attribution (walls, relabels to labeled ANALYSIS, or an explicit GAP) and MUST NOT be stamped to a floor source it is not in — a forced floor stamp is fake certification. Wrong-language primary is the language case: the extractor writes the VERBATIM ORIGINAL-LANGUAGE span from the national enacted text (the customer-checkable provenance), the surface labels it "translated from [language] original", and an EU parent act is never substituted as primary for a national-instrument fact. A FACT that still resolves to an UNREGISTERED host (null tier) after re-attribution is surfaced as ONE host-aggregated `integrity_flag` per host (the self-surfacing signal that names the next host to register), consumed by verifyCandidate at hold-lift.

**Slot-forcing genuine-support (never fabricate a FACT to clear a criterion).** When the grounding extractor leaves a required slot (or an unlabeled binding-assertion section) with no slot_key-tagged FACT/GAP claim, slot-forcing closes the gap — but it MUST NOT fabricate. A FACT is tagged with the slot_key ONLY where the grounding JUDGE confirms the span supports the assertion; word-overlap NOMINATES candidate spans (pool-present clauses over a minimum length, best-topic-overlap first), it NEVER decides. A judge-failed assertion routes to the 4c label path (relabel to grounded ANALYSIS in the prose) where the prose covers it, or to an honest GAP where it genuinely does not — and it MUST NEVER become a FACT. This is the integrity rule (no invented facts) mechanized for slot coverage: a FACT is never emitted to clear a criterion, so the ground-only slot-forcing pass converts missing_required_slot / unlabeled_assertion cheaply WITHOUT hollow-verifying an item. The genuine-support audit quotes the judge decision for a sample of emitted FACTs.

## Section 4: Citation Network Semantics

### Edge tables

Two edge tables hold citation relationships:

- **`source_citations`** (existing per migration 004): source-to-source edges. When source A cites source B, a row is inserted with `source_id` (citing), `cited_source_id`, `detected_at`, `context`. Used for tier-weighted credibility scoring.

- **`intelligence_item_citations`** (NEW per Q1, schema TBD): brief-to-source edges. When intelligence_item X cites source Y, a row is inserted. Backfilled from `intelligence_items.sources_used` (UUID[]) for INPUT-source associations at launch. Discovered-source associations (from agent "New Sources Identified" markdown tables) fill organically going forward. Historical markdown parsing is out of scope per decisions doc Flag 3.

### Tier-weighted citation sum

```
weighted_sum(source_id) = SUM(
  tier_weight(citing_source.effective_tier) * decay_factor(detected_at)
) FOR each row in source_citations WHERE cited_source_id = source_id
```

**Tier weights** (verbatim from Q7):

- T1 = 1.0
- T2 = 0.85
- T3 = 0.7
- T4 = 0.5
- T5 = 0.3
- T6 = 0.15
- T7 = 0

### Independence and syndication (corroboration integrity)

Corroboration STRENGTH counts INDEPENDENT corroborators, not raw citation edges. When N outlets
republish a single underlying announcement (one press release, one wire story), that is ONE
corroboration, not N — syndication is collapsed to its origin before counting. Two integrity rules
follow, both load-bearing for any "how well-corroborated is this signal?" judgment (the Market
surface's corroboration-count grounding model in particular):

1. **Independent over raw.** Count distinct INDEPENDENT corroborators (citers sharing a syndication
   group collapse to one), never the raw edge count. Raw count rewards a single announcement echoed
   across an aggregator network, inflating credibility from one source.
2. **Tier over volume.** A corroborator's weight is its institutional tier (T1 best … T7 = 0), not how
   often it appears. Ten low-tier echoes do not outweigh one T1/T2 independent confirmation; high
   citation volume from low-tier sources must not elevate credibility (the Section 1 principle).

Implementation: `src/lib/sources/source-growth.ts` (`aggregateConvergence`) collapses each syndication
group to one unit at its best tier, then reports `independent_citers` / `confirmation_count` /
`highest_citing_tier`; the trust citation component (`src/lib/trust.ts`) consumes those, not raw edge
counts. Distinguish the two measures: the tier-weighted decayed SUM below scores a source's STANDING
credibility over time (it can grow from many edges); the independent-citer COUNT scores a single
SIGNAL's corroboration strength right now. A signal is "strongly corroborated" only on independent,
suitably-tiered confirmation — never on volume alone.

### Recency decay

`decay_factor(detected_at)` is a half-life curve. Starting parameter: 18-24 months tunable; operator decides exact value (open sub-decision in the decisions doc). Formula:

```
decay_factor(detected_at) = 0.5 ^ ((NOW - detected_at) / half_life)
```

A citation at `now` contributes weight 1.0. A citation at `now - half_life` contributes weight 0.5. A citation at `now - 2 * half_life` contributes weight 0.25.

Decay applies to citation-network contributions to effective_tier ONLY. Decay does NOT apply to:

- `base_tier` (structural, not time-sensitive; a 2010 EU regulation is still binding at tier 1 in 2026)
- accessibility decay (separate existing logic in `src/lib/trust.ts` operating on `last_accessible` timestamps)
- `tier_history` audit trail (immutable record)

### Promotion threshold

Per Q7: a source is candidate for tier elevation when `weighted_sum >= 2.5`. The threshold accounts for tier-weighted contributions (a single T1 citation = 1.0, so the threshold requires effectively 2-3 high-tier citations or many more low-tier citations).

### Recompute cadence

Daily batch. The recompute job:

1. For each source, sums weighted decayed citation contributions
2. Computes `computed_dynamic_tier` as a function of `base_tier` plus the network signal
3. Writes `effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)` to the sources row
4. Logs to `source_trust_events` when `effective_tier` changes

The `source_citations.detected_at` column (existing per migration 004, currently unused in scoring) wires into the decay computation.

## Section 5: Source Discovery Loop

### Citation extraction at ingest

The agent at brief generation emits a "New Sources Identified" markdown table per the system prompt contract at `src/lib/agent/system-prompt.ts:358-368`. Extraction logic at `src/app/api/agent/run/route.ts:479-580` parses the table and routes each citation:

- If the URL matches an existing `sources` row: write a row to `source_citations` (source-to-source edge); also write to `intelligence_item_citations` once Q1 lands.
- If the URL doesn't match: write to `provisional_sources` with the agent's tier estimate, incrementing `citation_count` and updating `citing_source_ids` on repeated citations.

### URL canonicalization at resolution

Per Q10 (migration 087, helper at `src/lib/sources/url-canonicalize.ts`), all URL-based source resolution goes through `canonicalizeUrl()`. This lowercases scheme and host, strips www prefix, trims trailing slash, sorts query params, strips fragments. Resolution sites are documented in the Q10 dispatch report; future resolution code MUST use the helper.

### Candidate surfacing threshold

Per Q7: candidates with classifier confidence > 0.65 surface to the operator review queue (`canonical_source_candidates` table; admin UI at `src/components/sources/CanonicalSourceReview.tsx`). Below-threshold candidates accumulate in `provisional_sources` without surfacing.

### Citation-frequency promotion threshold

Per Q7: a candidate with 3+ citations and weighted sum >= 2.5 promotes to operator review regardless of classifier confidence. This catches sources the platform learns about through repeated citation even when individual classification confidence is moderate.

### Tier-opinion preservation

Per Q3: when the agent's brief generation cites an EXISTING source AND has a tier estimate for it that differs from the source's current `base_tier`, record the opinion as evidence. Schema TBD: either a new `tier_opinions` table (citing_source_id, target_source_id, opined_tier, opinion_date, opinion_source) or an extension to `source_citations` (add opined_tier column).

Aggregated disagreement flag: when 5+ opinions disagree with the database tier on the same source within a 90-day window, surface to operator review as a tier reconsideration prompt.

This makes the discovery loop self-improving on existing sources, not just on new ones.

### Expected operator review queue size

Per Q7: 5-15 new candidates per week. Thresholds are tunable starting points; adjust based on observed queue size and review experience.

## Section 6: Bias Tag Vocabulary

Three dimensions, multi-value within each. Standard is accuracy and transparency at all times.

### Dimension 1: Funding/Institutional Affiliation

- industry-funded
- government-funded
- foundation-funded
- subscription-supported
- academic-institutional
- mixed-funded
- funding-opaque

### Dimension 2: Methodological Orientation

- peer-reviewed
- methodologically-transparent
- analytical-synthesis
- editorial-opinion
- advocacy
- factual-reporting
- standards-defining

### Dimension 3: Stakeholder Position

- industry-incumbent
- industry-challenger
- regulator-aligned
- environmental-advocate
- independent-research
- customer-perspective
- labor-perspective
- investor-perspective

### Assignment

The Haiku recommend-classification prompts propose bias tags as part of classification. Operator confirms on candidate review. Multi-tag per dimension is allowed and expected; most sources carry multiple tags within at least one dimension.

### Scope

Bias tags apply to external publisher sources ONLY. User-generated Community content (a freight forwarder posting a market observation, a peer response in a community thread) uses author-identity + workspace-verification credibility signals (Section 8 Community row), NOT bias tags. The sources registry concept does not apply to user-generated content.

A member sharing a FreightWaves article on Community: the source (FreightWaves) carries its bias tags as a sources-registry record; the member's act of sharing carries author-identity signals as a Community-content record. Two different credibility models apply at the two layers.

### Worked example

ICCT (International Council on Clean Transportation):

- Dimension 1: foundation-funded
- Dimension 2: methodologically-transparent, analytical-synthesis
- Dimension 3: independent-research, environmental-advocate

A single source carries multiple tags within each dimension where they apply. The combination is informative: foundation-funded + methodologically-transparent + environmental-advocate signals "rigorous third-party research with explicit advocacy framing." Customers reading an ICCT-cited brief can calibrate accordingly.

## Section 7: Override Mechanism Rules

### Columns

Three columns on sources per Q5:

- `tier_override` INT NULL CHECK (tier_override BETWEEN 1 AND 7)
- `override_reason` TEXT NULL
- `override_date` TIMESTAMPTZ NULL

### Effective tier formula

```
effective_tier = COALESCE(tier_override, computed_dynamic_tier, base_tier)
```

Override takes precedence when present. Falls back to computed dynamic tier from network signals. Falls back to static `base_tier` when no network signal available (typical for newly-registered sources before citation accumulation).

### When to override

- Classifier-vs-evidence disagreement: classifier scored T4 but operator domain knowledge says T3 is correct given the institutional context
- Network signal misleading: rare case where citation network erroneously elevates a low-quality source (or fails to elevate a high-quality one) and operator judgment supersedes
- Bridging classification gaps: sources that fit T7 (overflow) until a better classification path exists may carry an override to a more accurate tier

### How to override

Explicit POST to the override endpoint (route TBD, likely `/api/admin/sources/[id]/tier-override`). Mandatory `override_reason` field; the audit trail must record why. Audit log to `source_trust_events` (existing table) with `event_type = 'tier_override'`, `created_by = 'human'`, payload including before/after tier and reason.

Override does NOT modify `base_tier`. Base tier preserves the classifier's original judgment for provenance.

### Revert

Clear `tier_override`, `override_reason`, `override_date` to NULL. `effective_tier` resumes computation from network + base. A revert is itself a `source_trust_events` row with `event_type = 'tier_override_revert'`.

## Section 8: Customer-Facing Signal Sets Per Surface

Per Q9. Per-surface signal sets with consistent vocabulary across surfaces. Asymmetry is deliberate per audience need.

| Surface | Primary credibility signals |
|---|---|
| Regulations | tier + jurisdiction + binding status |
| Research | tier + bias tag + citation count + recency |
| Market Intel | tier + recency + signal-strength |
| Operations | tier + jurisdiction + applicability |
| Community | author identity + workspace verification |
| Map | tier (overlay over Regulations) |
| Assistant | inline citations with full provenance |

**Canonical domain INT-to-surface mapping** (1-7): see `fsi-app/src/lib/domains.ts` for the single source of truth consumed by both the Haiku classifier (via `domainForItemType`) and the surface filters on /regulations, /market, /operations, /research, and the Dashboard surface-coverage widget. Domain integers MUST NOT be hardcoded outside that file; use the named exports (`REGULATIONS_DOMAIN`, `RESEARCH_DOMAIN`, etc.) instead. The migration 101 routing rule is the authoritative branch logic and is mirrored verbatim in `domainForItemType`.

### Per-surface implementation is build-dispatch scope

This section specifies WHAT signals each surface foregrounds. Build dispatches specify HOW (visual treatment, badge style, expand-on-click panel structure, color coding). Per-surface implementation lands per Tier 4 build:

- Build 7 Market Intel: tier + recency + signal-strength
- Build 8 Research: tier + bias tag + citation count + recency
- Build 9 Operations: tier + jurisdiction + applicability
- Build 10 Community: author identity + workspace verification (separate model, see below)
- Build 11 Dashboard: aggregates across surfaces

### Vocabulary consistency

Tier badge means the same everywhere (T1-T7 with the same labels and colors). Jurisdiction renders the same way wherever it appears. Bias tags render consistently when present. Customers learn the signal vocabulary once and recognize it across surfaces.

### Community surface uses a different model

The Community surface renders user-generated content. The bias tag vocabulary applies to external publisher sources only and does not apply to Community content. Community credibility uses author-identity-shaped signals:

- Author identity (verified member, organization affiliation)
- Workspace verification (member is associated with a verified workspace)
- Posting history (operator-tunable signal weight)
- Future moderation signals (flagged content, peer endorsement, etc.)

When a member shares a FreightWaves article on Community, the FreightWaves source carries its bias tags (separate sources-registry signal); the member's act of sharing carries author-identity signals (Community model). Both render on the Community surface side by side.

## Section 9: Anti-Patterns

These behaviors mean the model was not understood or was deliberately ignored:

- **Expanding category vocabulary to capture distinctions that belong in `source_role`.** A common temptation: "we need an 'analytical_press' category for the 8 analytical-press sources." Operator rejected this in the analytical-press dispatch (2026-05-19). Press content goes in `category='research'` with `source_role='trade_press'` and tier 5-6. Categories are surface routing; roles and tiers are credibility differentiation within a surface.

- **Exact-URL matching at source resolution.** Source registry lookups must canonicalize URLs first via `src/lib/sources/url-canonicalize.ts`. Direct `.eq("url", rawUrl)` calls produce silent duplicates from formatting drift (trailing slashes, www, query-param ordering). Q10 fixed the existing sites; new resolution code must use the helper.

- **Discarding tier-opinions when source already exists.** When Haiku estimates a tier for a cited source and the source already exists with a different tier, do not discard the opinion. Record it per Q3. Aggregated disagreement at 5+ within 90 days surfaces for operator review.

- **Conflating role with bias.** `source_role` (institution type: trade_press, academic_research, regulator) is orthogonal to bias (perspective: industry-incumbent, environmental-advocate, peer-reviewed). A `source_role='academic_research'` source can carry any bias profile across the three bias dimensions. Treating role values as bias values (e.g., assuming academic_research implies peer-reviewed) loses signal and produces wrong customer-facing presentation.

- **Treating tier as fully static when network signals exist.** After Q2 schema lands, the dynamic computed `effective_tier` IS the credibility signal customers and agents should consume. Reading `base_tier` directly when the consumer wants dynamic credibility silently shows stale signal.

- **Adding bias tags to user-generated Community content.** The sources registry concept does not apply to user-generated content. Community uses a different credibility model (author identity + workspace verification + posting history). Conflating the two models produces wrong UI and wrong audit semantics.

- **Skipping URL canonicalization on new source resolution code.** When adding a new source lookup, comparison, or write, use `canonicalizeUrl()` from the helper. Skipping it recreates the same silent-duplicate failure mode Q10 fixed.

- **Reading `sources.tier` directly when the consumer wants the dynamic value.** Per Q2 the schema will have both `base_tier` (static) and `effective_tier` (dynamic). Most consumers want `effective_tier`. A few definitional consumers (the `SourceTier` type definition, classifier prompts that reference the tier 1-7 type taxonomy) want `base_tier`. Per-consumer review at the migration point per the decisions doc Open Sub-Decision.

- **Auto-merging duplicate sources without operator decision.** Q10 surfaced 9 duplicate sets in `sources` plus 29 cross-table collisions. The dispatch policy was surface, do not merge. Merging requires operator judgment for sets like BREEAM vs BRE Group where the canonical name is non-obvious.

## Section 10: Cross-References

- **`environmental-policy-and-innovation`**: defines the 6-level Source Type Hierarchy this skill extends in Section 3. Integrity rule applies to bias tag assignment (no invented tags; assignment grounded in source evidence). Load alongside on intelligence_items work.

- **`caros-ledge-platform-intent`**: defines the five-surface canonical model that drives the per-surface signal sets in Section 8. Intelligence Assistant is the cross-cutting capability per platform-intent Section 4 that surfaces credibility per the Assistant signal set (inline citations + full provenance via the CitationPanel component in `src/components/AskAssistant.tsx`).

- **`sprint-followups-discipline`**: load-trigger rule (fifth named binding rule, added 2026-05-19 alongside this skill) names which dispatches must load source-credibility-model. Sources-schema-touch precondition applies to dispatches that touch the sources table. The Sweep-discipline rule applies to credibility-model audits and reviews.

- **`docs/design-principles.md`**: DP-1 single-pane operator review binds on operator-facing credibility surfaces, particularly the candidate review queue (`canonical_source_candidates` review at `src/components/sources/CanonicalSourceReview.tsx`) and the override mechanism UI (TBD).

- **`docs/sprint-2/source-credibility-model-decisions-2026-05-19.md`**: source-of-truth document for all 10 architectural decisions encoded in this skill. Captured at commit `2e9175a` (merged to master in commit `4943e83`). Open sub-decisions tracked there: per-consumer base_tier vs effective_tier migration calls (Q2), exact half-life value (Q6), per-surface implementation specifics during Tier 4 builds (Q9), bias vocabulary iteration if needed (Q4), T7 weight = 0 confirmation (Q7).
