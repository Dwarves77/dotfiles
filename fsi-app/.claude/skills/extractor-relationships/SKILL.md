---
name: extractor-relationships
description: STUB. Identifies cross-references, supersessions, implementations between items from `full_brief` content. Writes to canonical `item_relationships` table per Section 6.4. Replaces today's 5 overlapping link mechanisms (related_items, item_cross_references, 4 linked_*_ids columns).
---

# Extractor: Relationships

## Purpose

Identifies the relationship graph between items. Per Section 6.4, the canonical store is `item_relationships` with (source_item_id, target_item_id, relationship_type, confidence, provenance). This extractor writes that table.

Today's state: 5 overlapping link mechanisms exist; only one (`item_cross_references`) is populated and only by the 2026-04 backfill. The agent emits `related_items` UUID array but no extractor consolidates into the canonical store.

## When to use

After every full_brief regeneration. Identifies links FROM this item TO others.

## Inputs

- Item's `full_brief` markdown (the writer's output)
- AVAILABLE SOURCES pool from the regeneration (related items the writer drew on)
- `intelligence_items.related_items` UUID array from the YAML metadata

## Outputs

For each identified relationship:
- `source_item_id` (this item)
- `target_item_id` (the related item)
- `relationship_type` (one of: supersedes, implements, references, conflicts_with, depends_on, amends, related_to, sector_competitor)
- `confidence`
- `provenance` (where in the brief the relationship is mentioned)

## Process (TO REFINE)

1. Parse brief for citations of other items (by title or by inline link)
2. Resolve each citation to a UUID via [[operational-entity-resolution]]
3. Determine relationship_type from context ("supersedes" language, "implements" language, "references" passively, etc.)
4. Emit relationship + confidence + provenance
5. Above-threshold relationships auto-write to `item_relationships`
6. Below-threshold enter [[operational-human-review-queue]]

## Relationship type vocabulary

- `supersedes` — this item replaces the target (e.g., new directive replacing old)
- `implements` — this item operationalizes the target (e.g., delegated act implementing a regulation)
- `references` — this item cites the target as authority or context
- `conflicts_with` — this item is in tension with the target (e.g., two regulations imposing inconsistent requirements)
- `depends_on` — this item's compliance depends on the target being satisfied
- `amends` — this item modifies the target
- `related_to` — generic relatedness (use sparingly when none of the above fits)
- `sector_competitor` — this item describes a peer doing what the workspace might do (used for competitive-positioning intersections)

## Inherits

- [[rule-no-speculation-as-fact]] — invented UUIDs forbidden; only items in source pool can be linked
- [[rule-cross-reference-integrity]]

## Composition

Reads from per-format writer output. Writes to canonical `item_relationships` (replacing today's overlapping mechanisms). Output consumed by:
- [[extractor-intersections]] (uses relationships as one input to intersection scoring)
- Renderer (the LinkedItemsCard reads this table)
- [[writer-frame-research]] / [[writer-frame-market]] (cross-page framing reads relationships)

## Audit cross-reference

- v2 audit Section 3 / S10 (frozen relational tables)
- v2 audit Section 6.4 (knowledge graph layer)
- Schema audit: catalogs the 5 overlapping link mechanisms this skill consolidates
