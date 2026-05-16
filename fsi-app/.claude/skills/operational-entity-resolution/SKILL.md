---
name: operational-entity-resolution
description: STUB. Match new ingest against existing canonical entities (regulations, organizations, jurisdictions) before creating duplicate rows. Implements Section 6.1 master-data layer. Closes EcoVadis-class duplication (5 source rows for one company) and IIC-class miscategorization at the entity layer.
---

# Operational: Entity Resolution

## Purpose

When a new scrape arrives, match it against existing canonical entities before creating new rows. Today's failure: same regulation ingested twice from two URLs becomes two rows; same source has multiple entries (EcoVadis: 5 source rows for one company).

Per Section 6.1, every regulation/organization/jurisdiction/transport-mode/vertical/event has a canonical entity ID. New ingestion attaches to existing entities through this resolution pipeline.

## When to use

- New URL scraped: resolve to existing item entity or create new
- New source URL encountered: resolve to existing organization entity or create new
- New jurisdiction string in content: resolve to canonical jurisdiction entity per [[reference-jurisdictions]]

## Inputs

- The new content (URL, title, content excerpt)
- The proposed entity type (regulation / organization / jurisdiction / etc.)
- Existing entity tables (when built per Section 6.1)

## Outputs

- Resolved entity ID (existing or new)
- Match confidence
- Resolution rationale

## Process (TO REFINE)

1. Match by URL (exact or after normalization for trailing slashes, query params, etc.)
2. Match by title-normalized hash
3. Match by jurisdiction + citation pair (for regulations)
4. Match by domain + organization name (for sources)
5. Match by ISO code (for jurisdictions)
6. If no match: create new entity, flag for human review per [[operational-human-review-queue]]
7. If match with confidence < 0.85: flag for human review

## Inherits

- [[rule-no-speculation-as-fact]] (don't fabricate matches)
- [[reference-jurisdictions]]

## Composition

Used by all classifiers (resolve entity refs). Used by all writers (link to canonical entities, not free-text). Used by [[extractor-relationships]] (resolve cited items to UUIDs).

## Audit cross-reference

- v2 audit Section 6.1 (master data and entity resolution)
- v2 audit Section 3 / S1, S2 (single detail-page route, item_type+domain routing — fixed by canonical entities)
- Schema audit will identify which entity tables exist vs need to be added
