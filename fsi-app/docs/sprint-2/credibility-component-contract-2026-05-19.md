# Credibility Component Contract

**Dispatch**: Phase 1 credibility component foundation
**Date**: 2026-05-19
**Branch**: feat/phase1-credibility-components
**Location**: `src/components/credibility/`

## Purpose

Shared, contract-stable components that all Tier 4 builds (Build 7 Market Intel, Build 8 Research, Build 9 Operations, Build 11 Dashboard) consume to render Q9 credibility signal sets. By landing the contract first, Tier 4 builds can fire in parallel without reinventing the same components.

Per source-credibility-model SKILL.md Section 8, the Q9 per-surface signal sets are:

| Surface | Primary credibility signals |
|---|---|
| Regulations | tier + jurisdiction + binding status |
| Research | tier + bias tag + citation count + recency |
| Market Intel | tier + recency + signal-strength |
| Operations | tier + jurisdiction + applicability |
| Community | author identity + workspace verification (separate model, out of scope) |
| Map | tier (overlay over Regulations) |
| Assistant | inline citations with full provenance |

## Component Inventory

| Component | File | LOC | Purpose |
|---|---|---|---|
| CredibilityBadge | `CredibilityBadge.tsx` | 173 | Canonical T1-T7 tier display |
| BiasBadge | `BiasBadge.tsx` | 174 | Bias tag chips grouped or inline |
| CitationCountChip | `CitationCountChip.tsx` | 118 | Count + click-to-expand chip |
| RecencyChip | `RecencyChip.tsx` | 107 | Relative-time signal |
| JurisdictionChip | `JurisdictionChip.tsx` | 127 | Jurisdiction code + label |
| SignalStrength | `SignalStrength.tsx` | 122 | Market Intel five-step pill |
| ProvenancePanel | `ProvenancePanel.tsx` | 173 | Full single-pane source detail |
| (barrel) | `index.ts` | 33 | Public export surface |

Total: 1,027 LOC.

## Component Contracts (TypeScript)

### CredibilityBadge

```ts
export interface CredibilityBadgeProps {
  /** Source tier 1-7. Null / undefined renders an em-dash placeholder. */
  tier: number | null | undefined;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md" | "lg";
  /** When true, append the tier label (e.g., "Binding Law"). Default false. */
  showLabel?: boolean;
}
```

Also exports `getTierLabel(tier)` for non-rendering consumers that need the canonical label string.

### BiasBadge

```ts
export type BiasDimension = "funding" | "methodology" | "stakeholder";

export interface BiasTag {
  dimension: BiasDimension;
  /** Tag text from the Section 6 vocabulary (e.g., "industry-funded"). */
  tag: string;
  /** Optional classifier confidence 0-1; not rendered, available for tooltips. */
  confidence?: number;
}

export interface BiasBadgeProps {
  /** Empty array renders nothing. */
  tags: BiasTag[];
  /**
   * 'inline' = chips flow as a single horizontal group.
   * 'grouped' = chips are clustered per dimension with a small dimension label.
   * Default 'inline'.
   */
  layout?: "inline" | "grouped";
}
```

### CitationCountChip

```ts
export interface CitationCountChipProps {
  /** Count of 0 renders nothing. */
  count: number;
  /** Optional freshest citation timestamp shown alongside the count. */
  recency?: string | Date | null;
  /** Source identifier passed through to onExpand. */
  sourceId?: string;
  /** When true AND onExpand is provided, chip becomes a button. */
  expandable?: boolean;
  /** Expand handler. Parent renders the panel; this component triggers. */
  onExpand?: (sourceId: string) => void;
}
```

### RecencyChip

```ts
export interface RecencyChipProps {
  /** Null renders nothing. */
  timestamp: string | Date | null;
  /** Visual size. Default 'sm' since recency is usually a secondary signal. */
  size?: "sm" | "md";
}
```

### JurisdictionChip

```ts
export interface JurisdictionChipProps {
  /** Null renders nothing. */
  jurisdiction: string | null;
  /** Optional human label override. */
  label?: string;
  /** Whether to show the human label alongside the code. Default true. */
  showLabel?: boolean;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md";
}
```

Also exports `JURISDICTION_LABELS` (Readonly<Record<string, string>>) of ~20 common codes for direct consumption.

### SignalStrength

```ts
export type SignalStrengthValue =
  | "critical"
  | "high"
  | "moderate"
  | "low"
  | "monitoring";

export interface SignalStrengthProps {
  strength: SignalStrengthValue;
  /** Visual size. Default 'md'. */
  size?: "sm" | "md";
}
```

Also exports `getStrengthLabel(strength)` for non-rendering consumers (screen-reader summaries, dashboard counts).

### ProvenancePanel

```ts
export interface ProvenanceSource {
  id?: string;
  name: string;
  url?: string;
  tier?: number;
  /** Optional override of the tier's canonical label. */
  tierLabel?: string;
  biasTags?: BiasTag[];
  citationCount?: number;
  recency?: string | Date | null;
  /** Optional one-line description / institutional context. */
  description?: string;
}

export interface ProvenancePanelProps {
  source: ProvenanceSource;
}
```

ProvenancePanel composes CredibilityBadge, BiasBadge, CitationCountChip, and RecencyChip rather than reinventing any of them. The panel decides what to render based on which fields are populated; missing fields render nothing.

## Per-Surface Consumption Guide

Match Q9 signal sets to the components each Tier 4 build will consume.

### Build 7, Market Intel (tier + recency + signal-strength)

- `CredibilityBadge` on every signal card (size sm in dense lists, md on the card header).
- `RecencyChip` next to the badge.
- `SignalStrength` as the priority pill (replaces the inline "WATCH / ELEVATED" text in `PolicySignals.tsx`).
- `CitationCountChip` on cards where the underlying intelligence item has multiple cited sources, with `expandable + onExpand` wired to open `ProvenancePanel` in a side panel.

### Build 8, Research (tier + bias tag + citation count + recency)

- `CredibilityBadge` (size md, showLabel false on result list; showLabel true on detail).
- `BiasBadge` layout='inline' on result rows, layout='grouped' on the detail surface.
- `CitationCountChip` with `expandable=true` so clicking the count opens `ProvenancePanel`.
- `RecencyChip` next to the citation count.

### Build 9, Operations (tier + jurisdiction + applicability)

- `CredibilityBadge` on each operational source / brief reference.
- `JurisdictionChip` next to the tier (showLabel=true on detail, showLabel=false on dense rows).
- Applicability rendering is build-specific (Operations vocabulary, not credibility). It is NOT covered by this contract.

### Build 11, Dashboard (aggregates across surfaces)

- All seven components are in scope. The dashboard aggregates signals from Market Intel, Research, Operations, and Regulations into a unified credibility summary.
- `CredibilityBadge` on every surfaced item.
- `SignalStrength` for the Market Intel rollup section.
- `CitationCountChip` for the Research rollup.
- `JurisdictionChip` for the Regulations / Operations rollup.
- `ProvenancePanel` triggers from any chip with `expandable=true`.

### Regulations + Map

Not Tier 4 dispatches but the contract applies. Regulations should swap `SourceProvenanceBadge` for `CredibilityBadge + JurisdictionChip` per the migration guide below (follow-up dispatch, not this one). Map overlay reuses CredibilityBadge with the existing Leaflet popup wiring; popup content can embed `ProvenancePanel` directly.

### Assistant

`ProvenancePanel` is the panel rendered when a user clicks an inline citation footnote. The Assistant already ships inline citations per Q8; this dispatch establishes the panel they expand into.

## Style Guide Notes

### Tier color hierarchy

| Tier | Hex | Token role |
|---|---|---|
| T1 | #1E3A8A | navy, binding law |
| T2 | #2563EB | blue, regulator implementation |
| T3 | #0891B2 | cyan, intergovernmental |
| T4 | #475569 | slate, expert analysis |
| T5 | #64748B | slate-light, industry / standards |
| T6 | #94A3B8 | slate-muted, news / commentary |
| T7 | #94A3B8 | slate-muted, provisional |

Palette anchors to navy at T1 and attenuates through slate-muted by T7. Mirrors the pre-existing `SourceProvenanceBadge` palette to preserve recognition during migration.

### Bias dimension visual differentiation

| Dimension | Tint | Icon | Reading |
|---|---|---|---|
| Funding | Amber wash (#CA8A04 family) | $ | Money / institutional |
| Methodology | Cyan wash (#0891B2 family) | M | Method / rigor |
| Stakeholder | Purple wash (#9333EA family) | S | Position / lens |

Tints are intentionally subtle so bias does not visually compete with tier (the primary authority signal).

### Signal strength color tokens

Reads from theme.css via CSS variables:

- critical → `--color-critical` / `--color-critical-bg` / `--color-critical-border`
- high → `--color-high` / `--color-high-bg` / `--color-high-border`
- moderate → `--color-moderate` / `--color-moderate-bg` / `--color-moderate-border`
- low → `--color-low` / `--color-low-bg` / `--color-low-border`
- monitoring → `--color-text-muted` / `--color-surface-raised` / `--color-border-subtle`

Monitoring is intentionally neutral so it does not visually compete with elevated severities.

### Jurisdiction chip

The chip uses uppercase tabular-nums for the code (e.g., "EU", "US-CA") and renders the human label in regular-weight secondary text alongside. Resolution order: explicit `label` prop, then `JURISDICTION_LABELS` map, then the platform helper `isoToDisplayLabel`.

## Migration Guide: SourceProvenanceBadge to CredibilityBadge

The existing `src/components/sources/SourceProvenanceBadge.tsx` couples the badge to a `useSourceStore` lookup by `sourceId`. The new `CredibilityBadge` is data-shape-pure: callers pass `tier` directly.

### Why migrate

1. CredibilityBadge can render where the source is not in the store (e.g., briefs that cite sources not yet promoted to the registry).
2. CredibilityBadge composes with BiasBadge, JurisdictionChip, CitationCountChip, RecencyChip cleanly. SourceProvenanceBadge was a single-purpose composite.
3. The label can render alongside the T-pill (showLabel=true). Customers learn the tier vocabulary faster.

### How to migrate (per consumer)

Before:

```tsx
<SourceProvenanceBadge sourceId={item.sourceId} />
```

After (when the consumer wants tier + name + URL):

```tsx
<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
  <CredibilityBadge tier={source.tier} size="sm" />
  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a>
</span>
```

After (when the consumer wants the full provenance panel):

```tsx
<CitationCountChip
  count={citations.length}
  recency={freshestCitationAt}
  sourceId={source.id}
  expandable
  onExpand={(id) => setExpandedSourceId(id)}
/>
{expandedSourceId === source.id && (
  <ProvenancePanel source={source} />
)}
```

### Migration scope (out of scope for THIS dispatch)

This dispatch establishes the new components alongside the old one. Per-surface migration is the follow-up dispatch responsibility. Do NOT modify existing consumers yet (Regulations, sources admin) in this commit.

## Anti-Patterns

These behaviors mean the contract was misread.

### Do NOT render bias tags on Community content

Per source-credibility-model SKILL.md Section 9: bias tags apply to external publisher sources only. Community content (a freight forwarder posting a market observation, a peer response in a community thread) uses author-identity + workspace-verification signals, NOT bias tags. Rendering BiasBadge on Community content produces wrong UI and wrong audit semantics.

If a Community post embeds a shared external source (e.g., a FreightWaves article), the source itself can carry BiasBadge in its preview card. The member's act of sharing carries separate author-identity signals (out of scope here; covered by Build 10 Community).

### Do NOT render tier on Community author signals

Author identity is not tier-coded. A freight forwarder posting an observation is not a T2 source. CredibilityBadge applies to external publisher sources only.

### Do NOT add coupling to stores, routing, or click handlers in the badge

CredibilityBadge is data-shape-pure on purpose. If the caller wants the badge to navigate, the caller wraps it in an anchor or button. The previous SourceProvenanceBadge coupled the badge to sourceStore lookup AND opened the source URL on click; that coupling made it impossible to use the badge in contexts where the source was not in the store.

### Do NOT invent new signal-strength values

The five values (critical / high / moderate / low / monitoring) match the env-policy severity vocabulary. Adding a sixth ("elevated", "warning", "info") fragments the vocabulary across surfaces. If a new severity reading is needed, surface the case to the source-credibility-model decisions doc first.

### Do NOT bypass canonicalizeUrl when resolving source URLs upstream

This contract does NOT cover URL resolution; that is upstream of the components. But callers populating `ProvenanceSource.url` must resolve through `canonicalizeUrl()` per Q10 (see source-credibility-model Section 5). Components do not duplicate that responsibility.

### Do NOT render placeholders for missing fields in ProvenancePanel

Silence is more informative than a placeholder on a credibility surface. If a source has no bias tags, the panel renders no bias section, NOT a placeholder. The customer reads absence as "no bias signal classified yet" rather than "no bias detected".

### Do NOT read `base_tier` directly when displaying credibility

Per source-credibility-model Section 9: post-Q2 the schema will have both `base_tier` (static) and `effective_tier` (dynamic). Callers passing `tier` to CredibilityBadge MUST pass the consumer-appropriate value. For customer-facing surfaces that is `effective_tier`. For the SourceTier type definition and classifier prompts that is `base_tier`. Per-consumer review at the Q2 migration point (see source-credibility-model decisions doc Open Sub-Decision).

## Verification

- `npm run typecheck` passes.
- No modifications to existing consumers (SourceProvenanceBadge stays as-is; per-consumer migration is follow-up scope).
- Components compile and export from `src/components/credibility/index.ts`.

## Cross-References

- source-credibility-model SKILL.md, Section 6 (bias vocabulary), Section 8 (per-surface signal sets), Section 9 (anti-patterns)
- caros-ledge-platform-intent SKILL.md, five-surface canonical model
- docs/design-principles.md, DP-1 single-pane operator review (drives ProvenancePanel composition)
- src/components/sources/SourceProvenanceBadge.tsx, pre-existing badge to migrate FROM
- src/components/market/PolicySignals.tsx, signal-strength precedent (will adopt SignalStrength in Build 7)
- src/lib/jurisdictions/iso.ts, platform helper used by JurisdictionChip
