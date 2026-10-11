export const TIER_LABELS: Record<number, string> = {
  1: "Binding Law",
  2: "Regulator Guidance",
  3: "Intergovernmental",
  4: "Expert Analysis",
  5: "Industry / Standards",
  6: "Commercial Intelligence",
  7: "News / Commentary",
};

/** Label lookup that never leaks a status word for an unknown/null tier. */
export function tierLabelOf(tier: number | null | undefined): string {
  if (tier == null) return "Unrated";
  return TIER_LABELS[tier] ?? `Tier ${tier}`;
}
