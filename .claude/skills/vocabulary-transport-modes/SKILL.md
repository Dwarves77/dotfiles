---
name: vocabulary-transport-modes
description: Closed platform vocabulary of transport modes (air, road, ocean, rail). Stored in `intelligence_items.transport_modes` (TEXT[]). The string "GLOBAL" is NOT a valid mode and must never be stored as one (audit found this corruption on the Norway fjords item). Per-tenant usage distribution and any ordering preference live in `workspace_settings`, not in this vocabulary.
---

# Vocabulary: transport-modes (closed, freight-mode taxonomy)

## Source

The four-mode taxonomy is the platform-level enumeration of freight transport modes. Per-tenant volume distribution and rendering preferences are NOT part of this vocabulary; they live in `workspace_settings.mode_profile` (or equivalent) and are applied by [[compute-sector-relevance]] and the rendering layer at read time.

Dietl/Rockit, the current build's primary tenant, runs air-primary in practice. That is a tenant-level fact, not a platform-level rule. When additional tenants come on board, each carries its own mode distribution.

## The vocabulary

| Mode tag | Description |
|---|---|
| `air` | Air freight: cargo aircraft, belly cargo, charter |
| `road` | Trucking/road: long-haul, drayage, last-mile, urban delivery |
| `ocean` | Ocean: container, bulk, project cargo, ro-ro |
| `rail` | Rail: intermodal, dedicated rail freight |

## Disallowed values

The string `GLOBAL` is NOT a valid mode. The audit found Norway fjord regulations rendered with Mode = "GLOBAL" because the field has been used as a fallback sentinel for "unknown jurisdiction scope" — that is a data-shape failure, not a mode value.

When the mode is genuinely unknown:
- Emit empty array `[]`, not a sentinel
- The writer prose acknowledges the gap: "Mode applicability requires source review"
- The detail page renders "Mode: not yet classified" (per [[writer-operator-empty-states]])

The string `multimodal` is also disallowed; emit the actual modes that apply (e.g., `[air, road]` for an SAF mandate that affects belly cargo carried by both passenger air and road feeder operations).

## Rules

1. **Multi-valued.** An item affecting both road drayage and ocean container moves emits `[road, ocean]`.
2. **Validation at write time.** [[classifier-vertical-mode]] assigns modes from content features. Values outside the 4 fail the regeneration.
3. **Empty array allowed.** Items genuinely scope-agnostic (a horizontal compliance reporting standard) emit `[]` and are treated as "all modes" for filter/ranking purposes per [[compute-sector-relevance]].
4. **No platform-level mode ordering.** This vocabulary does NOT impose a render order. The active workspace's `mode_profile` (or equivalent), applied by the rendering layer, determines which modes surface first for that tenant. For the current Dietl/Rockit build, that means air sorts first; that is a tenant-level fact, not a platform rule.

## Audit baseline

The audit found:
- 71.4% of items have empty transport_modes[]
- Mode distribution (when populated): ocean (145), road (138), air (106), rail (15)
- The Norway fjord regulation renders Mode = "GLOBAL" (corruption); should be `[ocean]`

The reconciliation work:
- Backfill `intelligence_items.transport_modes` for items currently empty, using [[classifier-vertical-mode]]
- Replace any "GLOBAL" sentinel with `[]` and the proper writer-acknowledged gap
- Add CHECK constraint or trigger that forbids "GLOBAL" in this column

## Composition

Used by:
- [[classifier-vertical-mode]] — assigns transport_modes[] from content features
- [[compute-sector-relevance]] — mode is an input to ranking (workspace's mode profile × item's mode tags)
- [[writer-yaml-emission]] — emits transport_modes per the metadata contract
- [[writer-summary-card-surface]] — mode chips on cards
- [[rule-workspace-anchored-output]] — workspace's mode mix drives which mode-specific framing is foregrounded

Related:
- [[vocabulary-verticals]] — orthogonal axis (mode + vertical define the operator surface for an item)
- v2 audit Section 3 / S14 (mode priority not enforced)
- Chrome audit 5.1 (Mode = GLOBAL corruption case)

## Future-state expansion (multi-tenant onboarding)

If additional modes become operationally meaningful as the platform grows (pipeline, inland waterway, multimodal hybrids treated as a first-class tag), they expand this enumeration. Until then, the four above are the closed list. Per-tenant ordering preferences and any sub-mode distinctions (charter vs scheduled, drayage vs long-haul) live in `workspace_settings`, not in this vocabulary.
