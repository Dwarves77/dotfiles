/**
 * RecordGradeBadge — Lane POP (2026-09-01, migration 278 `intelligence_items.item_grade`).
 *
 * Operator ruling (system-review-2026-09-01.md): record-grade items MAY appear on customer surfaces,
 * as long as they are LABELED. A record-grade item carries only deterministically extracted FACT/GAP
 * spans (title/identity/date/scope — see src/lib/intake/record-facts.mjs) with no synthesized brief;
 * this badge is the label. Renders nothing for the historical "brief" grade (the default — see
 * Resource.itemGrade in src/types/resource.ts) or when the grade is not yet known/projected by a
 * surface's mapper (undefined), matching the fail-open posture other lens badges in this directory use
 * (e.g. RelevanceBadge: absent signal renders nothing, never a placeholder).
 *
 * Server component (no client state), styled like RelevanceBadge/TierBadge — a small pill, not a full
 * card, so it reads naturally in either a header chip row or the meta rail.
 */

export function RecordGradeBadge({ itemGrade }: { itemGrade?: "record" | "brief" }) {
  if (itemGrade !== "record") return null;
  return (
    <span
      title="This item was minted from extracted facts only — the full synthesized brief has not been written yet."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "5px 10px",
        borderRadius: 4,
        border: "1px solid var(--moderate)",
        color: "var(--moderate)",
        background: "transparent",
        whiteSpace: "nowrap",
      }}
    >
      Catalogue record: extracted facts only, full brief pending.
    </span>
  );
}
