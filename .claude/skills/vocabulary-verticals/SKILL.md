---
name: vocabulary-verticals
description: Closed vocabulary of cargo verticals for the current Dietl/Rockit build. Stored in `intelligence_items.verticals` (TEXT[]). Drives sector ranking ([[compute-sector-relevance]]) and per-vertical content surfacing. Multi-tenant generalization is a follow-up: when additional tenants onboard, this vocabulary expands into a platform-wide list and `workspace_settings.sector_profile` selects each tenant's subset.

---

# Vocabulary: verticals (current build, freight-vertical taxonomy)

## Source

Operator brief 2026-05-15:
> Freight forwarding verticals served (weighted by Dietl/Rockit portfolio):
> - Live events (touring music, theatrical, broadcast)
> - Fine art and museum logistics
> - Luxury goods
> - Film and TV production
> - High-value automotive (classic, supercars, prototypes)
> - Humanitarian cargo
> - High-value goods, general

## The vocabulary

| Vertical tag | Description | Brief priority |
|---|---|---|
| `live-events` | Touring music, theatrical, broadcast | HIGH |
| `fine-art` | Fine art and museum logistics | HIGH |
| `luxury-goods` | Luxury goods | HIGH |
| `film-tv` | Film and TV production | HIGH |
| `automotive` | High-value automotive: classic, supercars, prototypes | HIGH |
| `humanitarian` | Humanitarian cargo | MEDIUM |
| `freight-general` | High-value goods, general | MEDIUM |

## Rules

1. **Multi-valued.** An item can affect multiple verticals. A SAF mandate touches `air`-mode workspaces across all verticals; tag with the verticals the item materially affects.
2. **Use the canonical kebab-case form.** `live-events` not `live_events` not `Live Events`.
3. **Empty array means workspace-agnostic.** An item that affects every workspace regardless of vertical (e.g., a horizontal compliance reporting standard) emits `[]`. Sector relevance scoring treats `[]` as "applies to all" rather than "applies to none."
4. **Validation against content.** [[classifier-vertical-mode]] assigns verticals from content features, not from author guess. The audit found "Sustainable Aviation Fuel" tagged `bulk-commodity, fine-art` (incorrect on both axes) — that is the failure mode this vocabulary's enforcement is designed to prevent.

## Sector ranking weights (operator brief)

Per [[compute-sector-relevance]]:
- HIGH-priority verticals (live-events, fine-art, luxury-goods, film-tv, automotive) score 1.0 for a workspace whose sector_profile includes that vertical
- MEDIUM-priority verticals (humanitarian, freight-general) score 0.7 for a workspace whose sector_profile includes them
- Cross-vertical relevance (item tagged live-events scoring against a film-tv workspace) scores 0.5 when the workspace is reasonably adjacent (live-events ↔ film-tv share broadcast operations)
- Workspace-agnostic items (verticals = `[]`) score 0.5 universally
- Items entirely off-portfolio score 0.1 (still appear, ranked low)

The operator brief specifies "ranking, not filtering" — items with low relevance still appear, just lower. See [[compute-sector-relevance]] for the formula.

## Audit baseline

The audit found 95.5% of items have empty verticals[]. The brief's HIGH verticals cover only 13 items between them today. Even where verticals are populated, the tagging is dubious ("Sustainable Aviation Fuel" tagged `bulk-commodity, fine-art`).

The reconciliation work:
- Backfill `intelligence_items.verticals` for the 626 items that currently have empty arrays, using [[classifier-vertical-mode]]
- Validate existing tagged items against this canonical vocabulary
- Reject any tag outside this vocabulary in future writes

## Composition

Used by:
- [[classifier-vertical-mode]] — assigns verticals[] from content features
- [[compute-sector-relevance]] — workspace × item.verticals graded scoring
- [[writer-yaml-emission]] — verticals not currently in YAML emission contract; needs to be added per Section 6.5 structured fact extraction
- [[writer-summary-card-surface]] — surfaces vertical chips on cards when verticals are sparse enough to be useful
- [[rule-workspace-anchored-output]] — workspace's vertical mix drives which verticals are foregrounded in writer prose

Related:
- [[vocabulary-transport-modes]] — modes are the orthogonal axis (mode + vertical define the operator surface for an item)
- v2 audit Section 6.8 (multi-tenancy with sector ranking)
- v2 audit Section 3 / S14 (vertical and mode priority not enforced)

## Future-state expansion (multi-tenant onboarding)

The seven verticals above are the Dietl/Rockit portfolio. The current build is for that tenant. When additional tenants come on board through the onboarding flow:

- This vocabulary expands into a platform-wide superset of cargo verticals (e.g., bulk commodity, perishables, pharmaceuticals, oil and gas, project cargo, e-commerce parcel, hazmat, dry/refrigerated retail, automotive OEM, aerospace MRO, defense, agriculture)
- `workspace_settings.sector_profile` (or equivalent) selects each tenant's active subset
- [[compute-sector-relevance]] reads the active workspace's subset, not this static list
- Cross-tenant vertical relevance scoring is computed from the workspace's selected verticals rather than the seven below

Until that work ships, this vocabulary IS the active enumeration. Do not pre-emptively expand it; do not pre-emptively make [[classifier-vertical-mode]] tag with verticals outside this list. When multi-tenant onboarding is ready to ship, this skill is the load-bearing piece that gets rewritten.
