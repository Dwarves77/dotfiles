---
name: vocabulary-topic-tags
description: Closed vocabulary of 14 topic values, canonical per migration 063 `sources.scope_topics`. Also the closed vocabulary for `intelligence_items.topic_tags` (607/655 populated, currently using a stale 7-value enumeration). Reconciliation per v2 audit Section 6.2 brings both columns onto this list and deprecates `intelligence_types`.
---

# Vocabulary: topic-tags (closed, 14 values)

## Source

Migration 063 (`sources_classification_axes.sql`) Axis 4a, the canonical 14-value content-topic enumeration:

> regulatory, finance, technology, fuel, labor, infrastructure, environmental, social, governance, transport, packaging, customs, conservation, materials_science

The earlier 7-value list (emissions, fuels, transport, reporting, packaging, corridors, research) inherited from the original `environmental-policy-and-innovation` skill is superseded. The 7-value list has been used to write `intelligence_items.topic_tags`; the 14-value list is now canonical.

## The vocabulary (14 values)

| Tag | Scope |
|---|---|
| `regulatory` | Statutes, directives, delegated acts, agency rules, official guidance, enforcement actions |
| `finance` | Carbon pricing, ETS systems, subsidies, grants, financial-instrument design, fees, levies, investor disclosure |
| `technology` | SAF, e-fuels, hydrogen, ammonia, electrification, AI/automation, sensor and tracking tech |
| `fuel` | Fuel composition, supply, distribution, certification, mandates affecting fuel selection |
| `labor` | Workforce, training, certification, working conditions, labor standards |
| `infrastructure` | Ports, airports, rail networks, charging stations, bunkering facilities, warehouses, corridors |
| `environmental` | Emissions, biodiversity, conservation, pollution, ecosystem impact, climate adaptation |
| `social` | Community impact, equity, indigenous rights, public-health framing of freight operations |
| `governance` | Disclosure frameworks, accounting standards, audit, ratings, certifications, ESG governance |
| `transport` | Vehicle and vessel standards, fleet mandates, ZEV requirements, route restrictions |
| `packaging` | PPWR, EPR, PFAS restrictions, sustainable packaging, returnable systems |
| `customs` | Duties, declarations, CBAM-style border adjustments, customs procedures, trade controls |
| `conservation` | Protected areas, species protections affecting freight routing or facility siting |
| `materials_science` | Lifecycle assessment, material substitution, durability, recyclability research |

## Where this vocabulary applies

This is the closed list for BOTH columns:

- `sources.scope_topics` (TEXT[]) — canonical per migration 063
- `intelligence_items.topic_tags` (TEXT[]) — currently writes use the stale 7-value list; per v2 audit Section 6.2, this column reconciles onto the 14-value list

The audit found `intelligence_items.topic_tags` populated 607/655 (92.7%) with values from the 7-value list. Reconciliation is two-step:

1. Backfill: re-tag the 607 populated rows to the 14-value list. Most values map cleanly (`emissions` → `environmental`, `fuels` → `fuel`, `corridors` → `infrastructure`, `reporting` → `governance`). `research` does not have a direct successor in the 14-value list because research is a source-tier attribute not a content topic; per v2 audit Section 6.2, items previously tagged `research` get re-classified to the topic their content covers (e.g., a hydrogen propulsion research paper tags `technology` and `fuel`, not `research`).
2. Forward writes: writers and classifiers emit only from the 14-value list.

`intelligence_types` (a separate column on intelligence_items, currently inconsistent with topic_tags) is deprecated per v2 audit Section 6.2; it is not an additional axis to reconcile, it is removed.

## Rules

1. **Closed vocabulary.** Tags outside this list fail the regeneration. Not `carbon-pricing` for `finance`. Not `aviation` for `transport`. Not `air` for `infrastructure`.
2. **Multi-valued, capped at 4.** An item can emit multiple tags when its substance crosses categories. A SAF mandate touches `regulatory`, `fuel`, `transport`. A CBAM rule touches `regulatory`, `customs`, `finance`. Maximum 4 tags per item; if more would apply, pick the dominant categories.
3. **Substance over name.** Tag what the brief actually covers, not what the item is nominally named. EU CBAM is named after carbon border adjustment but its substantive content also covers customs declaration imports, finance through fees, and trade compliance. All four (`regulatory`, `customs`, `finance`, `transport`) might apply.
4. **Empty array allowed.** When the item genuinely fits none of the fourteen (rare), emit `[]`. Don't force-fit.
5. **Source vs item.** `sources.scope_topics` is the topic the source COVERS. `intelligence_items.topic_tags` is the topic this specific item ADDRESSES. A source like the EU Official Journal covers `regulatory` (and indirectly all others); an individual EU regulation item from that source may tag `regulatory`, `environmental`, `transport`.

## Where this vocabulary is consumed

- `sources.scope_topics` column (canonical)
- `intelligence_items.topic_tags` column (reconciliation target)
- The dashboard topic filter chips
- The source-coverage matrix on /research
- The dynamic per-item source pool computation (when an item is regenerated, its topic_tags drive which sources are added to the AVAILABLE SOURCES context)
- The agent writer-prompt context selection

## Composition

Used by:
- [[writer-yaml-emission]] — emits topic_tags as part of the metadata block; emit only from the 14-value list
- [[classifier-item-type]] — inputs include topic_tags inferred from content
- [[classifier-source-onboarding]] — assigns sources.scope_topics from the same 14-value list
- [[extractor-intersections]] — items sharing a topic tag are weak intersections; sharing operational_scenario_tag + compliance_object_tag is strong (per [[reference-operational-scenarios]] and [[vocabulary-compliance-objects]])

Related:
- [[reference-operational-scenarios]] — open vocabulary for operational scenarios (different axis)
- [[vocabulary-compliance-objects]] — closed vocabulary for supply-chain roles (different axis)
- v2 audit Section 6.2 (topic_tags / scope_topics / intelligence_types deprecation plan)
- Migration 063 (canonical 14-value enumeration; comment on `sources.scope_topics`)
