// ══════════════════════════════════════════════════════════════
// Credibility components, Phase 1 contract
// ══════════════════════════════════════════════════════════════
//
// Canonical shared components for rendering Q9 credibility signal
// sets across all Tier 4 builds (Market Intel, Research, Operations,
// Dashboard). Components compose; surface-specific wrappers should
// reuse these directly rather than reinventing.
//
// See docs/sprint-2/credibility-component-contract-2026-05-19.md
// for the per-surface consumption guide and anti-patterns.
// ══════════════════════════════════════════════════════════════

export { CredibilityBadge, getTierLabel } from "./CredibilityBadge";
export type { CredibilityBadgeProps } from "./CredibilityBadge";

export { BiasBadge } from "./BiasBadge";
export type { BiasBadgeProps, BiasTag, BiasDimension } from "./BiasBadge";

export { CitationCountChip } from "./CitationCountChip";
export type { CitationCountChipProps } from "./CitationCountChip";

export { RecencyChip } from "./RecencyChip";
export type { RecencyChipProps } from "./RecencyChip";

export { JurisdictionChip, JURISDICTION_LABELS } from "./JurisdictionChip";
export type { JurisdictionChipProps } from "./JurisdictionChip";

export { SignalStrength, getStrengthLabel } from "./SignalStrength";
export type { SignalStrengthProps, SignalStrengthValue } from "./SignalStrength";

export { ProvenancePanel } from "./ProvenancePanel";
export type { ProvenancePanelProps, ProvenanceSource } from "./ProvenancePanel";
