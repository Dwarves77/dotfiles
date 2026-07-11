/**
 * TIER LABELS — the ONE home for the customer-facing T1–T7 tier vocabulary (Q-1 fix,
 * reconciliation remediation 2026-07-11).
 *
 * Operator ruling (site-gap register Q-1): the Source Health legend is CORRECT —
 * T5 industry / T6 commercial-intel / T7 news-commentary — and the cards were WRONG:
 * they conflated TIER (content-authority class, per the tier-ontology "content not role"
 * decision) with STATUS ("T7 Provisional/Unverified" — provisional/unverified is a
 * provenance/status word, never a tier label).
 *
 * Every surface that renders a tier label imports THIS constant. A drift-guard test
 * (tier-labels.test.mjs, surface_of pattern) fails when a component hardcodes a
 * conflicting vocabulary.
 *
 * NOTE: the promotion-ladder commentary in src/types/source.ts still narrates the older
 * "T7 Provisional → T6 News/Commentary" naming. That is the tier-MODEL doc, flagged in
 * the 2026-07-11 closeout as residual; this module owns only the DISPLAY vocabulary.
 */
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
