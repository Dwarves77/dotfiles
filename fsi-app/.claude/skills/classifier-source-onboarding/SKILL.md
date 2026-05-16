---
name: classifier-source-onboarding
description: STUB. 5-axis classification of a new source before it ingests its first item. Implements Section 6.2 source-onboarding workflow. Replaces today's "tier-N default" auto-creation pattern that produces 28% bulk-defaulted, 27.6% LOW-confidence sources.
---

# Classifier: Source Onboarding

## Purpose

When a new source URL is encountered, this skill produces the 5-axis classification (source_role, tier, jurisdictions, scope_topics/modes/verticals, expected_output) BEFORE the source is approved to ingest items. Replaces today's bulk-default pattern.

## When to use

- A scraper encounters a URL not yet in the `sources` table
- An operator manually proposes a new source
- An audit identifies a source that needs reclassification (e.g., EcoVadis bulk-default → vendor_corporate)

## When NOT to use

When the source already exists with HIGH-confidence classification — re-classification only when triggered by reliability score drift or content drift detection.

## Inputs

- Source URL + sample of its content (first page, recent items, about page)
- [[reference-priority-source-registry]] (check if source is already on the curated list)
- [[vocabulary-source-tiers]] for tier defaults per source_role

## Outputs

To `sources` table row:
- `source_role` (one of the framework values)
- `tier` (1-7, default per role per [[vocabulary-source-tiers]])
- `jurisdictions[]` + `jurisdiction_iso[]` per [[reference-jurisdictions]]
- `scope_topics[]` per [[vocabulary-topic-tags]]
- `scope_modes[]` per [[vocabulary-transport-modes]]
- `scope_verticals[]` per [[vocabulary-verticals]]
- `expected_output` (JSONB probability dist over Regulatory/Research/Market_Intel/Operations/Out_of_Scope)
- `classification_confidence` (HIGH / MEDIUM / LOW)
- `classification_rationale` (text explaining the classification)
- `classification_assigned_at` (timestamp)
- Owning organization FK (when entity table from Section 6.1 exists)

## Source-vs-resource gate (HARD GATE, runs first)

Before the 5-axis classification begins, this classifier applies [[rule-source-vs-resource-distinction]] as a hard gate. Examine the URL's primary content type:

- **Change-driven intelligence** (regulation amendment, market signal announcement, research finding, regulator consultation, court ruling, etc.) → proceed with source onboarding (the 5-axis classification below)
- **Self-promotional** (vendor "About Us", "We Provide X", marketing landing page, cookie banner, terms of service, trade association membership listing, vendor LinkedIn announcement about themselves) → REJECT from source onboarding. Flag the URL as `resource_candidate` and route to resource-taxonomy review per [[reference-resource-taxonomy]] (or to the future vendor directory pipeline). Do NOT create a `sources` row.

For ambiguous cases (vendor publishes industry analysis alongside sales content), apply the judgment named in [[rule-source-vs-resource-distinction]]: would this content exist absent a sales motion? If yes, the URL CAN proceed with onboarding for the specific analytical content (with the vendor as the publisher); if no, route to resource-taxonomy review.

The EcoVadis case (migration 074) is the canonical example of what this gate prevents going forward.

## Process (TO REFINE)

0. **Source-vs-resource hard gate** (above) — REJECT resources before the 5-axis classification starts
1. Fetch sample content from the URL
2. Check [[reference-priority-source-registry]] for prior coverage
3. Determine source_role from content type (legal authority text → primary_legal_authority; SaaS product page → vendor_corporate; etc.)
4. Apply default tier from [[vocabulary-source-tiers]]
5. Determine jurisdictions from URL domain + content
6. Determine scope_topics from content domain
7. Determine scope_modes from content modes covered
8. Determine scope_verticals from content vertical applicability
9. Compute expected_output as a probability distribution
10. Set classification_confidence based on whether human reviewed
11. If HIGH: source is approved to ingest. If MEDIUM/LOW: source enters [[operational-human-review-queue]].

## Inherits

- [[rule-source-vs-resource-distinction]] — the hard gate above; the load-bearing rule for this classifier
- [[rule-source-tier-hierarchy]]
- [[vocabulary-source-tiers]]
- [[vocabulary-topic-tags]]
- [[vocabulary-transport-modes]]
- [[vocabulary-verticals]]
- [[reference-jurisdictions]]
- [[reference-operational-scenarios]]
- [[reference-priority-source-registry]]
- [[reference-resource-taxonomy]] (with awareness of the 2026-05-15 correction note: the existing file lists SOURCE content categories, not resources; a true resource catalog is a future dispatch)

## Audit cross-reference

- v2 audit Section 6.2 (source registry as a curated product)
- v2 audit Section 3 / S4 (28% bulk-defaulted; 27.6% LOW confidence)
- Migration 074 (EcoVadis reclassification — example of post-hoc fix this skill prevents)
