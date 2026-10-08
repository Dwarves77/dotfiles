"use client";

/**
 * BandGroupHeader: the ONE group header for an Immediate / Action / Monitor / Awareness group (lane
 * PAR-2, 2026-10-07, Claude Design artboard 22 ruling A, verbatim): "Group headers (Immediate /
 * Action / Monitor / Awareness item groups) are white, not tinted. Band name in Anton 18 px in the
 * band colour, definition in grey, 3 px band rule on top."
 *
 * Coordinator ruling 2026-10-07: the list surfaces' band block header (ListSurfaceShell's
 * BandSectionHeader) and the detail pages' ItemGroup header are the same part, so both render
 * through this one component (never two implementations). The band name is a sanctioned Anton site
 * (`data-guard-display="band-group-name"`, layout guard L7 allowlist). The definition truncates on
 * one line and carries its full text in `title` (ux-laws, no clipped text). With no band the header
 * is a plain white row with no rule and no band name.
 */

import type { ReactNode } from "react";
import type { UrgencyBand } from "@/lib/urgency/bands";

export function BandGroupHeader({
  band,
  children,
  right,
  nameSlot,
}: {
  /** The group's band; null renders the neutral white header (no rule, no band name). */
  band: UrgencyBand | null;
  /** Extra left content after the definition (an item title). */
  children?: ReactNode;
  /** Right-aligned content (a count, a qualifier). */
  right?: ReactNode;
  /** Optional `data-part-slot` value for the band name (ItemGroup's "band-pill" acceptance hook). */
  nameSlot?: string;
}) {
  return (
    <div
      data-audit="band-header"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderTop: band ? `3px solid ${band.cssVar}` : undefined,
        borderBottom: "1px solid var(--line-2)",
        background: "var(--card)",
      }}
    >
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 10, rowGap: 2, minWidth: 0, flex: "1 1 auto" }}>
        {band && (
          <>
            <span
              data-audit="band-header-label"
              data-guard-display="band-group-name"
              data-part-slot={nameSlot}
              style={{
                flexShrink: 0,
                fontFamily: "var(--font-display)",
                fontWeight: 400,
                fontSize: 18,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: band.cssVar,
              }}
            >
              {band.label}
            </span>
            <span
              data-audit="band-header-window"
              title={band.window}
              style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}
            >
              {band.window}
            </span>
          </>
        )}
        {children}
      </span>
      {right}
    </div>
  );
}
