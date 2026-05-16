---
name: vocabulary-compliance-objects
description: Closed vocabulary of 18 values for `intelligence_items.compliance_object_tags`. Names the supply-chain roles or operational entities a regulation imposes obligations on. Tags outside the glossary fail regeneration. Each item emits 0-4 compliance-object tags.
---

# Vocabulary: compliance-objects (closed, 18 values)

## Source

Original `environmental-policy-and-innovation` skill, "Compliance Object Tags" section.

## The vocabulary

Carriers (4):
- `carrier-ocean`
- `carrier-air`
- `carrier-road`
- `carrier-rail`

Vehicle/fleet operators (3):
- `vessel-operator`
- `aircraft-operator`
- `road-fleet-operator`

Forwarders & intermediaries (3):
- `freight-forwarder`
- `customs-broker`
- `nvocc`

Cargo principals (5):
- `shipper`
- `importer`
- `exporter`
- `manufacturer-producer`
- `distributor`

Infrastructure (4):
- `port-operator`
- `airport-operator`
- `terminal-operator`
- `warehouse-operator`

## Rules

1. **Exact match required.** No synonyms, no plurals, no variants. `carrier-ocean` not `ocean-carrier`. `freight-forwarder` not `forwarder` not `freight_forwarder`.
2. **0-4 tags per item.** An item with no clear compliance object (e.g., a research finding without a directed obligation) emits an empty array. That is the honest answer.
3. **Tag what is obligated.** A regulation about ocean fueling probably obligates `vessel-operator` and `port-operator`; it may also touch `freight-forwarder` indirectly through pass-through. Tag the directly obligated roles, not the cascading-affected roles.
4. **Closed vocabulary.** Tags outside the 18 fail regeneration.

## Why this vocabulary is closed

Drives intersection detection deterministically. Items sharing a compliance_object_tag join cleanly when they also share an operational_scenario_tag. Two items where one tags `freight-forwarder` and the other tags `forwarder` never join. The vocabulary's job is to make joining mechanical.

## Composition

Used by:
- [[writer-yaml-emission]] — emits compliance_object_tags as part of the 13-field metadata block
- [[extractor-intersections]] — compliance_object_tag overlap is a hard requirement for intersection detection
- [[compute-intersection-strength]] — +2 points per shared compliance_object_tag

Related:
- [[reference-operational-scenarios]] — open vocabulary; together with this closed vocab forms the intersection axes
- [[vocabulary-topic-tags]] — different axis, used for filtering not intersection joining
