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

## Reference index

Everything not stated in this core moved verbatim, unreworded, to `references/`. Read the file whose trigger fires:
- `references/purpose-and-system-diagram.md`: section 1 purpose and scope, and the six-element system diagram
- `references/authority-floor-and-canonical-tier.md`: per-item-type authority floor (provenance gate) and the canonical institutional tier; read when touching tier derivation or the gate
- `references/citation-network-semantics.md`: section 4: edge tables, tier-weighted citation sum, independence and syndication, recency decay, promotion threshold, recompute cadence
- `references/source-discovery-loop.md`: section 5: citation extraction, URL canonicalization, candidate surfacing, promotion thresholds
- `references/bias-tag-vocabulary.md`: section 6: bias tag dimensions, assignment, scope
- `references/customer-facing-signal-sets.md`: section 8: credibility signals per customer surface
- `references/anti-patterns-and-cross-references.md`: sections 9 and 10: anti-patterns and cross-references

BINDING: references/authority-floor-and-canonical-tier.md, read before touching an institution tier or tier derivation (section: Canonical institutional tier)
BINDING: references/customer-facing-signal-sets.md, read before rendering credibility signals on any surface (section: Section 8)
BINDING: references/anti-patterns-and-cross-references.md, read before choosing which skills load with this one (section: Section 10)

## Section 2: The Six-Element Model as a Coherent System

The source credibility model has six elements that together produce a single credibility signal (effective tier) that customers and agents see by default.

**1. Type-based default tier.** Every source has a static `base_tier` (INT 1-7) assigned at classification time based on the source's institutional type per the environmental-policy-and-innovation 6-level Source Type Hierarchy (tier 7 = overflow/uncategorized). Base tier is set once at classification and rarely changes; it preserves the classifier's or operator's original credibility judgment for audit and provenance.

**2. Bias tags.** Sources carry orthogonal bias tags across three dimensions (Funding/Institutional Affiliation, Methodological Orientation, Stakeholder Position). Bias is independent of tier; a tier-2 regulator can have any bias profile, just as a tier-6 analytical outlet can. Bias is a separate axis from authority weight. Bias tags apply to external publisher sources only.

**3. Citation-network credibility.** Sources accumulate credibility weight from incoming citations. Citation weight is tier-weighted (citations from higher-tier sources count more) and decayed (recent citations count more than old ones). The aggregated weighted citation sum contributes to a source's effective tier.

**4. Source discovery through citations.** When briefs cite sources not in the registry, the discovery loop captures them as candidates. High-confidence candidates surface to the operator review queue; low-confidence ones accumulate in provisional storage without consuming operator attention until they cross promotion thresholds.

**5. Operator override.** The operator can explicitly set `tier_override` on a source with `override_reason` and `override_date`. The override takes precedence over computed values in the effective tier formula. Overrides are auditable via the existing `source_trust_events` table.

**6. Recency decay.** Citation weight decays with a half-life curve (18-24 months tunable). Recent citations contribute more than old ones. Decay applies to citation-network contributions only; it does NOT apply to base_tier (structural, not time-sensitive) or to accessibility decay (separate existing logic in `src/lib/trust.ts`).

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
