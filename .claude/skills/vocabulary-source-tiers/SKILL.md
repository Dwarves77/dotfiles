---
name: vocabulary-source-tiers
description: Closed values T1-T7 for `sources.tier` per the migration 063 framework. Supersedes the legacy 7-tier "trust" hierarchy from `types/source.ts`. The integer column stores 1-7 (no T prefix); display layer prepends T at render time.
---

# Vocabulary: source-tiers (closed, T1-T7)

## Source

Migration 063 (`fsi-app/supabase/migrations/063_sources_classification_axes.sql`), the 5-axis source classification framework. Supersedes the legacy 7-tier "trust" hierarchy in `fsi-app/src/types/source.ts` per v2 audit Section 3 / S8.

## The vocabulary (canonical)

| Tier (stored as INT) | Source role default | Examples |
|---|---|---|
| 1 (T1) | primary_legal_authority | EU Official Journal, US Federal Register, EUR-Lex regulation text, official agency rulemaking, court rulings |
| 2 (T2) | intergovernmental_body | IMO MEPC, ICAO Council, UN agency positions, EU Commission delegated acts |
| 3 (T3) | standards_body, academic_research | ISO, MIT CTL, NREL, Sabin Center, peer-reviewed studies |
| 4 (T4) | industry_data_provider, statistical_data_agency | Eurostat, BLS, BloombergNEF (data products), IEA, IRENA |
| 5 (T5) | industry_association, trade_press | FIATA, ICCT analysis, Lloyd's List, FreightWaves, Aviation Week |
| 6 (T6) | vendor_corporate (commercial SaaS or paid data) | EcoVadis, Sphera, Watershed, Sustainalytics |
| 7 (T7) | government_press, corporate_press | Agency press releases, company announcements, marketing pages |

## Storage and display

- Column `sources.tier` is INTEGER 1-7. No "T" prefix in storage.
- Display layer prepends "T" at render time: T1, T2, ... T7.
- Migration 063's COMMENT documents "T1-T6" but the actual schema is INTEGER (this drift is documented in the schema audit; consolidation work to reconcile is part of [[operational-migration-authoring]]).

## Why the legacy 7-tier is deprecated

`types/source.ts` defines a parallel 7-tier with different semantics:
- Legacy T3 = "Intergovernmental Body" (canonical T2)
- Legacy T4 = "Expert Analysis" (canonical T3)
- Legacy T6 = "Crowd-Sourced" (canonical T6 vendor_corporate, different category entirely)

Live data follows the legacy semantics. The audit found vendor_corporate sources at T3-T5 (legacy interpretation), intergovernmental_body at T3 (legacy), NREL at T4 (legacy). 794 sources need reclassification to the canonical mapping.

The reconciliation work:
- Source reclassification migration: maps each source from legacy tier to canonical tier per its source_role
- Remove legacy tier definition from `types/source.ts`
- Code reading `tier` reads it under one definition

## Default tier from source_role

When [[classifier-source-onboarding]] assigns a source_role, the framework's default tier follows automatically:

| source_role | Default tier |
|---|---|
| primary_legal_authority | 1 |
| intergovernmental_body | 2 |
| standards_body | 3 |
| academic_research | 3 |
| industry_data_provider | 4 |
| statistical_data_agency | 4 |
| industry_association | 5 |
| trade_press | 5 |
| vendor_corporate | 6 |
| government_press | 7 |

Overrides allowed with documented rationale (e.g., a particularly authoritative trade publication may override to 4).

## Composition

Used by:
- [[classifier-source-onboarding]] — assigns tier from source_role at registration
- [[rule-source-tier-hierarchy]] — defines the rule for weighting sources when they conflict
- [[writer-summary-card-surface]] — surfaces tier next to source citation
- [[compute-urgency-score]] — source tier is an input to urgency weighting

Related:
- v2 audit Section 3 / S8 — the two-competing-tier-systems failure this vocabulary resolves
- v2 audit Section 6.2 — source registry as a curated product
