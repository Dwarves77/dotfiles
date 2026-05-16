---
name: compute-sector-relevance
description: STUB. Workspace × item.verticals graded relevance score. Implements Section 6.8 sector ranking (not filtering). Closes audit S14 (vertical priority not enforced) plus S12 (sector configuration writes to 4 stores).
---

# Compute: Sector Relevance

## Purpose

Computes a graded relevance score for each item in the workspace's view. Items rank by relevance × recency × authority × lead-time, with off-portfolio items still visible at the bottom (the brief's "should not be drowning" describes ranking, not filtering).

Today: 96% of items have empty `verticals[]`; even if filtering were wired (it isn't), no data to filter on.

## When to use

On every page render. The page-data RPC accepts a `sector_profile` parameter and returns each item with a `sector_relevance_score`.

## Inputs

- Workspace's `sector_profile` (per [[vocabulary-verticals]] canonical values, resolved from one canonical store per Section 6.8)
- Item's `verticals[]` (per [[classifier-vertical-mode]])
- Item's `transport_modes[]` (per [[classifier-vertical-mode]])
- Workspace's transport-mode priority (defaults to air-primary per [[vocabulary-transport-modes]])

## Outputs

- `sector_relevance_score` (numeric, 0-1)

## Scoring rules (TO REFINE)

For each item:
- HIGH-priority vertical match (workspace.sector_profile contains item.verticals[i] AND that vertical is HIGH priority): score += 1.0
- MEDIUM-priority vertical match: score += 0.7
- Adjacent vertical (e.g., live-events and film-tv share broadcast operations): score += 0.5
- Workspace-agnostic item (item.verticals = []): score = 0.5 (universal baseline)
- Off-portfolio item (no overlap): score = 0.1 (still appears, ranked low)

Mode multiplier (workspace's air-primary preference):
- Item tagged with workspace's primary mode: ×1.5
- Item tagged with workspace's secondary mode: ×1.0
- Off-mode: ×0.7

Final score = vertical_score × mode_multiplier (capped at 1.0)

## Inherits

- [[vocabulary-verticals]]
- [[vocabulary-transport-modes]]

## Composition

Reads from [[classifier-vertical-mode]]. Used by every page-data RPC's ranking. Composed with [[compute-urgency-score]] for final item ordering.

## Audit cross-reference

- v2 audit Section 6.8 (multi-tenancy with sector ranking)
- v2 audit Section 3 / S14 (vertical priority not enforced)
- v2 audit Section 3 / S12 (sector configuration four-store fork)
