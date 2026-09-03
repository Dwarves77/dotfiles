/**
 * CorroborationChip — "N organisations corroborating" (spec 05 §5 component 5, acceptance 7:
 * "corroboration counts distinct organisations, not posts"). Fed by
 * GET /api/community/threads/[id]/corroboration via api-client.getThreadCorroboration.
 *
 * Deliberately does NOT accept a raw post count as a fallback display — showing posts where
 * organisations belongs is exactly the confusion acceptance criterion 7 rules out.
 */

import { Users } from "lucide-react";
import { corroborationLabel } from "./identity-format";
import type { CommunityThreadCorroboration } from "./types";

interface CorroborationChipProps {
  corroboration: CommunityThreadCorroboration | null | undefined;
}

export function CorroborationChip({ corroboration }: CorroborationChipProps) {
  if (!corroboration) return null;

  return (
    <span
      title={corroboration.consistent ? "Consistent across contributing organisations" : "Contributing organisations disagree"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        fontSize: 10.5,
        fontWeight: 700,
        color: corroboration.organisations > 0
          ? "var(--color-low, #15803d)"
          : "var(--color-text-muted)",
        border: `1px solid ${
          corroboration.organisations > 0
            ? "var(--color-low-border, #a7f3d0)"
            : "var(--color-border)"
        }`,
        borderRadius: 3,
        flexShrink: 0,
      }}
    >
      <Users size={10} aria-hidden="true" />
      {corroborationLabel(corroboration.organisations)}
      {!corroboration.consistent && corroboration.organisations > 0 ? " · mixed" : ""}
    </span>
  );
}
