"use client";

/**
 * BandTile — the urgency-band tile (UI system handoff 2026-09-06, README
 * §0.4 "Band tiles"). Four per row on every list surface + the dashboard.
 *
 * Card: white, radius 10, padding 14px 16px 0, flex column; stacked label
 * (10.5px/800/.08em uppercase in band colour) over window (10.5px muted);
 * Anton numeral 34px in band colour; the 4px band rule is pinned to the
 * card's bottom edge (margin: auto -16px 0) so all four rules align
 * regardless of label length. Each tile filters the list (onSelect).
 */

import type { UrgencyBand } from "@/lib/urgency/bands";

export interface BandTileProps {
  band: UrgencyBand;
  count: number | null;
  /** True while the count is still loading — renders a skeleton, never 0
   *  (README §0.6: "A count still loading shows a skeleton, never 0"). */
  loading?: boolean;
  selected?: boolean;
  onSelect?: (bandKey: UrgencyBand["key"]) => void;
}

export function BandTile({ band, count, loading, selected, onSelect }: BandTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(band.key)}
      aria-pressed={selected}
      aria-label={`${band.label} — ${band.window}${count != null ? `, ${count} items` : ""}`}
      className="cl-band-tile"
      style={{
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        background: "var(--card)",
        border: `1px solid ${selected ? "var(--card-hover-line)" : "var(--line-1)"}`,
        borderRadius: "var(--radius-card)",
        padding: "14px 16px 0",
        overflow: "hidden",
        cursor: onSelect ? "pointer" : "default",
        fontFamily: "inherit",
        boxShadow: "var(--shadow-card)",
        minHeight: 112,
      }}
    >
      <span
        style={{
          fontSize: "var(--fs-105)",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: band.cssVar,
        }}
      >
        {band.label}
      </span>
      <span
        style={{
          fontSize: "var(--fs-105)",
          color: "var(--ink-3)",
          margin: "1px 0 0",
        }}
      >
        {band.window}
      </span>
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: 56,
            height: 34,
            margin: "4px 0 10px",
            borderRadius: 6,
            background: "var(--tag)",
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 34,
            lineHeight: 1,
            letterSpacing: "0.04em",
            color: band.cssVar,
            fontVariantNumeric: "tabular-nums",
            margin: "4px 0 10px",
          }}
        >
          {count ?? 0}
        </span>
      )}
      <span
        aria-hidden="true"
        style={{
          display: "block",
          height: 4,
          background: band.cssVar,
          margin: "auto -16px 0",
        }}
      />
    </button>
  );
}
