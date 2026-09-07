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
 *
 * MOBILE 390 (lane mobframe, 2026-09-07, mobile-390 spec, BAND TILES):
 * below 768, card padding 12px 14px 0, label 10px/800/.06em, window 10px,
 * numeral 30px, margin "6px 0 8px", band rule pinned with "auto -14px 0"
 * (matches the smaller side padding) — `.cl-band-tile` media query below,
 * same component, no variant prop needed since every value is a fixed
 * override at this one breakpoint.
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
      {/* Mobile spec (BAND TILES): below 768 (theme.css's documented
          --bp-mobile), card padding 12/14/0, label 10px/.06em, window 10px,
          numeral 30px with margin 6px 0 8px, band rule at -14px (matches
          the smaller side padding). */}
      <style>{`
        @media (max-width: 767px) {
          .cl-band-tile { padding: 12px 14px 0 !important; }
          .cl-band-tile .cl-band-tile-label { font-size: 10px !important; letter-spacing: 0.06em !important; }
          .cl-band-tile .cl-band-tile-window { font-size: 10px !important; }
          .cl-band-tile .cl-band-tile-numeral { font-size: 30px !important; margin: 6px 0 8px !important; }
          .cl-band-tile .cl-band-tile-rule { margin: auto -14px 0 !important; }
        }
      `}</style>
      <span
        className="cl-band-tile-label"
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
        className="cl-band-tile-window"
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
          className="cl-band-tile-numeral"
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
        className="cl-band-tile-rule"
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
