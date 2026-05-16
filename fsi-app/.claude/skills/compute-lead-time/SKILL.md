---
name: compute-lead-time
description: STUB. Computes lead time per item. lead_time_vs_effective_date = entry_into_force − first_observed_at. lead_time_vs_publication = source_publication_date − first_observed_at. Implements Section 6.7. Closes audit S13 (lead time unrealized).
---

# Compute: Lead Time

## Purpose

Computes lead-time metrics per item. Per the operator brief, lead time is the competitive frame. Today: 0/794 sources have populated `lead_time_samples`; all 23 dated regulations were ingested AFTER effective date by avg 779 days. The system is a historical catalog.

This skill, together with the schema additions in Section 6.7 (`source_publication_date`, `first_observed_at` columns), turns the system into the early-warning radar the brief calls for.

## When to use

- After every item ingestion (capture `first_observed_at`)
- After every full_brief regeneration (extract `source_publication_date` if newly available)
- On read for any surface that displays lead-time annotation per [[rule-fsi-brief-framework]]

## Inputs

- `intelligence_items.first_observed_at` (TO ADD: when CL first saw the content)
- `intelligence_items.source_publication_date` (TO ADD: when source published)
- `intelligence_items.entry_into_force` (per [[extractor-structured-facts]])

## Outputs

- `lead_time_vs_effective_date` (days; positive = surfaced before effective; negative = late ingestion)
- `lead_time_vs_publication` (days; positive = surfaced before public source publication; rare but valuable)
- `lead_time_category` (early / on-time / reactive / catalog) — for display affordance

## Categories (TO REFINE)

- "Early" — surfaced > 30 days before effective date
- "On-time" — surfaced 0-30 days before effective date
- "Reactive" — surfaced 0-90 days after effective date
- "Catalog" — surfaced > 90 days after effective date (no lead-time value, this is historical reference)

## Inherits

- [[rule-no-speculation-as-fact]] (omit lead-time annotation when source_publication_date is null; never invent)
- [[rule-fsi-brief-framework]] (lead time as competitive frame)

## Composition

Reads schema columns added per Section 6.7. Output consumed by:
- [[writer-summary-card-surface]] (lead-time annotation on every card)
- [[compute-urgency-score]] (lead-time multiplier)
- [[writer-frame-market]] (lead-time advantage prominent on market frame)

## Audit cross-reference

- v2 audit Section 3 / S13 (lead time unrealized)
- v2 audit Section 6.7 (lead time as first-class column)
- Audit area 7: 23/23 regulations ingested AFTER effective date
