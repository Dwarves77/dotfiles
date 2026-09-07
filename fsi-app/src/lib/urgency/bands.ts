/**
 * The one urgency vocabulary (UI system handoff 2026-09-06, README §0.2).
 *
 * The audit (docs/design/audit-2026-09-06/ASSESSMENT.md §4) found FIVE
 * competing urgency vocabularies rendered from the same underlying
 * CRITICAL/HIGH/MODERATE/LOW priority scale:
 *   Regulations list  — Immediate action · Action · Monitor · Awareness
 *   Dashboard         — Immediate action · High · Moderate · Low
 *   Research          — Action required · Cost alert · Monitor · Background
 *   Market intel      — Action required · Cost alert · Window closing ·
 *                        Competitive edge · Monitoring (five, not four)
 *   Operations        — Critical · High · Moderate · Low
 *   Detail page chip  — "Action 6mo"
 *
 * This module is the single source of truth. Every list/tile/chip/marker
 * in the app renders one of these four bands, with these words, this hex,
 * this tint — never a page-local relabeling. Existing surface components
 * (RegulationsLedger, MarketIntelLedger, ResearchLedger/Detail,
 * OperationsLedger, DashboardHero) still render their own vocabulary
 * arrays as of this lane; migrating each ledger onto BAND_ORDER /
 * bandFromPriority is later-lane scope (README: "17 page artboards...
 * later lanes do the other 16 pages") but MUST delegate to this module
 * rather than reintroduce a sixth vocabulary. This lane's own dashboard
 * assembly (src/components/dashboard/**, DashboardHero's replacement)
 * consumes it directly.
 */

export type UrgencyBandKey = "immediate" | "action" | "monitor" | "awareness";

/** The stored platform priority scale (CRITICAL/HIGH/MODERATE/LOW,
 *  src/types/resource.ts `Resource.priority`, `WorkspaceAggregates.byPriority`)
 *  is the same four-value scale as the urgency band, computed upstream from
 *  each item's next binding date. `bandFromPriority` is the ONE place that
 *  maps between the two label sets. */
export type PlatformPriority = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export interface UrgencyBand {
  key: UrgencyBandKey;
  /** The one label. Always this word, everywhere. */
  label: string;
  /** The one window description. */
  window: string;
  /** Band hue (README §0.2 table). */
  hex: string;
  /** Band tint (README §0.2 table). */
  tint: string;
  /** CSS var name carrying `hex` (theme.css canonical token). */
  cssVar: string;
  /** CSS var name carrying `tint`. */
  tintCssVar: string;
  /** Band-tinted border colour (dc.html #sys "Chips" band chip: each band
   *  chip's 1px border is a tint of the band hue, not the hue itself —
   *  design audit 2026-09-07 B7). */
  border: string;
  /** CSS var name carrying `border`. */
  borderCssVar: string;
  /** The platform priority value this band corresponds to. */
  priority: PlatformPriority;
}

/** Four bands, in order, hot → cool (README §0.2: "the step from Action to
 *  Monitor is where the reader can relax, and the hue change says so"). */
export const BAND_ORDER: readonly UrgencyBand[] = [
  {
    key: "immediate",
    label: "Immediate",
    window: "≤ 90 days",
    hex: "#DC2626",
    tint: "#FEF2F2",
    cssVar: "var(--immediate)",
    tintCssVar: "var(--immediate-tint)",
    border: "#FECACA",
    borderCssVar: "var(--immediate-border)",
    priority: "CRITICAL",
  },
  {
    key: "action",
    label: "Action",
    window: "≤ 6 months",
    hex: "#F97316",
    tint: "#FFF7ED",
    cssVar: "var(--action)",
    tintCssVar: "var(--action-tint)",
    border: "#FED7AA",
    borderCssVar: "var(--action-border)",
    priority: "HIGH",
  },
  {
    key: "monitor",
    label: "Monitor",
    window: "6–12 months",
    hex: "#2563EB",
    tint: "#EFF6FF",
    cssVar: "var(--monitor)",
    tintCssVar: "var(--monitor-tint)",
    border: "#BFDBFE",
    borderCssVar: "var(--monitor-border)",
    priority: "MODERATE",
  },
  {
    key: "awareness",
    label: "Awareness",
    window: "background",
    hex: "#16A34A",
    tint: "#F0FDF4",
    cssVar: "var(--awareness)",
    tintCssVar: "var(--awareness-tint)",
    border: "#BBF7D0",
    borderCssVar: "var(--awareness-border)",
    priority: "LOW",
  },
] as const;

const BY_KEY: Record<UrgencyBandKey, UrgencyBand> = Object.fromEntries(
  BAND_ORDER.map((b) => [b.key, b]),
) as Record<UrgencyBandKey, UrgencyBand>;

const BY_PRIORITY: Record<PlatformPriority, UrgencyBand> = Object.fromEntries(
  BAND_ORDER.map((b) => [b.priority, b]),
) as Record<PlatformPriority, UrgencyBand>;

export function band(key: UrgencyBandKey): UrgencyBand {
  return BY_KEY[key];
}

/** The one place platform priority (CRITICAL/HIGH/MODERATE/LOW, as stored
 *  on `Resource.priority` and `WorkspaceAggregates.byPriority`) becomes an
 *  urgency band. */
export function bandFromPriority(priority: PlatformPriority | string | null | undefined): UrgencyBand {
  if (priority && priority in BY_PRIORITY) {
    return BY_PRIORITY[priority as PlatformPriority];
  }
  // Unknown/missing priority renders as the lowest-urgency band rather than
  // guessing; callers with a real "unscored" case use the Absence
  // convention (src/components/ui/Absence.tsx), not a band substitution.
  return BY_KEY.awareness;
}

/**
 * Classify a next-binding date into a band directly from days-to-date, for
 * call sites that have a raw date and no stored priority (e.g. a re-derived
 * "due next" sort key). Mirrors the CRITICAL/HIGH/MODERATE/LOW day windows
 * the platform priority pipeline already uses, so the two stay in lockstep.
 */
export function classifyByDays(daysUntil: number | null | undefined): UrgencyBand {
  if (daysUntil == null || Number.isNaN(daysUntil)) return BY_KEY.awareness;
  if (daysUntil <= 90) return BY_KEY.immediate;
  if (daysUntil <= 182) return BY_KEY.action; // ~6 months
  if (daysUntil <= 365) return BY_KEY.monitor; // 6–12 months
  return BY_KEY.awareness;
}

/** Days between two dates (UTC, floor), for classifyByDays callers. */
export function daysUntil(target: Date | string, from: Date = new Date()): number {
  const t = typeof target === "string" ? new Date(target) : target;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((t.getTime() - from.getTime()) / msPerDay);
}
