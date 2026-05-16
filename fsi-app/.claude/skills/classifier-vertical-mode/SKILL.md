---
name: classifier-vertical-mode
description: STUB. Assigns `intelligence_items.verticals[]` and `transport_modes[]` from content features. Closes audit S14 (96% empty verticals; corrupted modes like "GLOBAL").
---

# Classifier: Vertical and Mode

## Purpose

Tags items with the verticals and transport modes their content materially affects. Today: 95.5% of items have empty `verticals[]` and 71.4% empty `transport_modes[]`; even populated tags are dubious ("Sustainable Aviation Fuel" tagged `bulk-commodity, fine-art`). This classifier produces accurate, validated tags.

## When to use

- New item ingestion (after item_type per [[classifier-item-type]])
- Backfill of existing items with empty arrays
- Reclassification when vertical taxonomy evolves

## Inputs

- Item content (full_brief, summary, title)
- Source row (source's scope_verticals and scope_modes are starting hints, not authoritative for the item)

## Outputs

- `intelligence_items.verticals[]` per [[vocabulary-verticals]]
- `intelligence_items.transport_modes[]` per [[vocabulary-transport-modes]]
- `verticals_confidence` and `modes_confidence` (TO ADD as schema columns)

## Process (TO REFINE)

1. Read item content; identify which freight verticals are materially affected (not just mentioned)
2. Validate against [[vocabulary-verticals]] closed taxonomy
3. Identify transport modes from content (air, road, ocean, rail)
4. NEVER use "GLOBAL" as a mode value (it's a sentinel from corrupted data); empty array is the right answer when mode is unknown
5. Validate against [[vocabulary-transport-modes]]
6. Emit with confidence; route low-confidence to [[operational-human-review-queue]]

## Negative examples (do not produce)

- "Sustainable Aviation Fuel" tagged `bulk-commodity, fine-art` → wrong; SAF affects `air` mode and is vertical-agnostic, so verticals = [] (or specifically the high-air-volume verticals like live-events, automotive, fine-art if tour or museum logistics frequently use air)
- Any item tagged `verticals=[live-events]` because the title mentions "events" without operational live-event freight context
- Any item with `transport_modes=[GLOBAL]` (forbidden value)

## Inherits

- [[rule-no-speculation-as-fact]]
- [[vocabulary-verticals]]
- [[vocabulary-transport-modes]]

## Audit cross-reference

- v2 audit Section 3 / S14 (vertical and mode priority not enforced)
- v2 audit Section 6.8 (multi-tenancy with sector ranking; depends on accurate vertical tagging)
- Chrome audit 5.1 (Mode = GLOBAL on Norway fjords)
