/**
 * PromotionStateBadge — the five-gate promotion machine's visible state (spec 05 §4, §5 component
 * 6, acceptance 4: "Community items surfaced on other surfaces carry the unverified label in that
 * context too"). Renders the state label PLUS the `origin_class` value whenever it is supplied,
 * because acceptance criterion 4 and spec 05's "one doctrinal edge" both require origin_class to
 * stay visible everywhere a community-originated item appears — including inside platform
 * intelligence after editorial pickup (spec 05 §5 component 10). See PromotePostButton.tsx for the
 * editorial-pickup call site.
 */

import { promotionStateLabel, isUnverifiedContribution } from "./identity-format";
import type { CommunityPromotionState } from "./types";

interface PromotionStateBadgeProps {
  state: CommunityPromotionState | null | undefined;
  /** Kept visible alongside the state per spec 05's doctrinal edge: content promoted from
   * Community "carries its own provenance class... and never renders as machine-grounded or
   * verified." Falls back to `state` when the caller has no separate origin_class value yet. */
  originClass?: string | null;
}

export function PromotionStateBadge({ state, originClass }: PromotionStateBadgeProps) {
  const label = promotionStateLabel(state);
  const unverified = isUnverifiedContribution(state);
  const oc = originClass ?? (state || "community");

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        minWidth: 0,
      }}
    >
      <span
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "1px 7px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: unverified
            ? "var(--color-high, #b45309)"
            : "var(--color-low, #15803d)",
          border: `1px solid ${
            unverified
              ? "var(--color-high-border, #fed7aa)"
              : "var(--color-low-border, #a7f3d0)"
          }`,
          borderRadius: 3,
          flexShrink: 0,
        }}
      >
        {label.split(" — ")[0]}
      </span>
      <span
        title="Origin class — this label stays visible wherever this content appears, including inside platform intelligence"
        style={{
          fontSize: 10.5,
          color: "var(--color-text-muted)",
          fontStyle: "italic",
          overflowWrap: "anywhere",
          minWidth: 0,
        }}
      >
        origin: {oc}
      </span>
    </span>
  );
}
