---
name: rule-source-tier-hierarchy
description: When sources conflict or carry different authority weight, weight by tier per the migration 063 framework (T1 primary legal authority through T7 vendor product pages). The legacy `types/source.ts` 7-tier "trust" hierarchy is deprecated. Sources are reclassified to the canonical mapping; code that reads `tier` reads it under one definition.
---

# Rule: Source tier hierarchy (canonical = migration 063 framework)

## Source

Original `environmental-policy-and-innovation` skill, "Source Type Hierarchy" section, plus migration 063 framework (`fsi-app/supabase/migrations/063_sources_classification_axes.sql`). Reconciled per v2 audit Section 3 / S8 (two competing tier semantics in the same `tier` column).

## The canonical hierarchy (migration 063 framework)

When sources conflict, weight in this order:

| Tier | Source role | Examples |
|---|---|---|
| T1 | Primary legal authority | EU Official Journal, US Federal Register, EUR-Lex regulation text, court rulings, official agency rulemaking |
| T2 | Intergovernmental body | IMO MEPC, ICAO Council, UN agency positions, EU Commission delegated acts |
| T3 | Standards body / academic research | ISO, MIT CTL, NREL, Sabin Center, peer-reviewed studies |
| T4 | Industry data provider / statistical agency | Eurostat, BLS, BloombergNEF (data products), IEA, IRENA |
| T5 | Industry association / trade press | FIATA, ICCT analysis, Lloyd's List, FreightWaves, Aviation Week |
| T6 | Vendor corporate / industry data provider (commercial) | EcoVadis, vendor SaaS platforms, paid data products |
| T7 | Government press / corporate press | Agency press releases, company press releases, marketing pages |

The framework default per source_role:
- primary_legal_authority → T1
- intergovernmental_body → T2
- standards_body / academic_research → T3
- industry_data_provider / statistical_data_agency → T4
- industry_association / trade_press → T5
- vendor_corporate → T6
- government_press → T7

## Why the legacy 7-tier is deprecated

The legacy `types/source.ts` 7-tier "trust" hierarchy defines T3 as "Intergovernmental Body" and T4 as "Expert Analysis" — it conflicts with the migration 063 framework where intergovernmental_body is T2 and academic_research is T3.

Live data follows the legacy semantics: vendor_corporate sources are T3-T5 (not T6), intergovernmental_body is T3 (not T2), NREL is T4 (not T3). Two contradictory tier systems share the same numeric column.

The reconciliation: migration 063 framework is canonical. Sources are reclassified to it. The legacy definition is removed from `types/source.ts`. Code that reads `tier` reads it under one definition.

## Required behavior at write time

When classifying or reclassifying a source:
- Use the framework default for the source's role unless a specific override is documented
- Never default to a legacy tier value
- Note: the EcoVadis reclassification (migration 074) corrected EcoVadis from statistical_data_agency T4 / trade_press T5 to vendor_corporate T6 per this canonical mapping

When weighting sources during synthesis:
- T1 sources can support definitive statements (with the legal-counsel caveat per [[rule-no-regulatory-inferences-as-fact]])
- T2-T3 sources support definitive analysis with explicit attribution
- T4-T5 sources support directional analysis labeled as such
- T6-T7 sources support attribution to the source but not to the underlying fact

## Required behavior at read time

When the operator surface displays a claim, the source tier appears next to the source citation. T1 and T7 must be visually distinguishable on the card.

The CONFIDENCE filter chip on /regulations reads `Resource.classificationConfidence` (NOT `Resource.authorityLevel`, which is the dead phantom field). Items classified at LOW confidence carry a visible "default classification, not verified" indicator until human review confirms.

The SourceProvenanceBadge is hydrated on every page (currently only /admin), so the tier pill renders on every card.

## Audit cross-reference

- v2 audit Section 3 / S8 (two competing tier semantics)
- v2 audit Section 6.2 (source registry as a curated product, one canonical tier system)
- v2 audit Section 6.10 (operator-facing data quality affordances; tier visible on every card)

## Composition

Inherited by:
- [[classifier-source-onboarding]] — assigns source_role + tier per this canonical mapping
- [[writer-summary-card-surface]] — surfaces tier next to source citation
- [[rule-source-traceability-per-claim]] — tier informs how a claim is hedged at the card layer
- [[compute-urgency-score]] — source tier is an input to urgency weighting
