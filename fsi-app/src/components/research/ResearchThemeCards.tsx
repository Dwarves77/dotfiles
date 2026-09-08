"use client";

/**
 * ResearchThemeCards: the /research theme facet row (UI system handoff 2026-09-06, artboard
 * 06/id="p6", the region directly below the band tiles).
 *
 * The artboard's own caption for this page reads "themes are a second facet row, not a second
 * tile system": these cards ARE the theme facet (clicking one filters the list and the Window
 * row's count line says which theme is active), rendered as the four-across card row the artboard
 * draws: not a second BandTile-style urgency system, and not a duplicate of BandTile (no band
 * colour, no Anton numeral block, no bottom accent bar; a head row plus a description line).
 *
 * Mounted through ListSurfaceShell's existing `aboveRows` slot, the same slot Operations already
 * uses for its region x dimension matrix, so no new shell region was invented for it.
 *
 * Values are the artboard's own (id="p6"): grid repeat(4,1fr) gap 12px; card 1px rgba(0,0,0,.12),
 * radius 10px, padding 12px 14px, selected card's border #5A5552 (var(--brand)); label 10.5px /
 * .1em / uppercase / 800; count Anton 18px with a "+N new" suffix at 10px/800 in the body face;
 * description 11.5px var(--ink-2), margin-top 4px, line-height 1.45.
 */

import { THEME_DESCRIPTIONS, THEME_LABELS } from "@/lib/research/taxonomy.mjs";

export interface ResearchThemeCard {
  key: string;
  count: number;
  /** Items added inside the "new" window (ResearchLedger's NEW_WINDOW_DAYS), 0 renders nothing. */
  newCount: number;
}

export function ResearchThemeCards({
  themes,
  selected,
  onSelect,
}: {
  themes: ResearchThemeCard[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  if (themes.length === 0) return null;
  return (
    <div data-audit="theme-cards" className="cl-theme-cards" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {/* MOBILE-60 (2026-09-08) [CONFIRMED, measured at 390 by
          .discipline/rendering/audit/spec/mobile-06-research-list.json]: `repeat(4, 1fr)`
          is `minmax(auto, 1fr)` four times, and the auto minimum is each card's
          min-content width, so at 390 the row could not shrink below ~614px and the
          theme facet ran a quarter of a screen past the page edge. Below 768 it takes
          the same measure the mobile 390 spec gives the band tile row it sits under:
          two columns, gap 10, with an explicit zero floor so the track can actually
          shrink. */}
      <style>{`
        @media (max-width: 767px) {
          .cl-theme-cards { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
        }
      `}</style>
      {themes.map((theme) => {
        const isSelected = selected === theme.key;
        const description = (THEME_DESCRIPTIONS as Record<string, string | undefined>)[theme.key];
        return (
          <button
            key={theme.key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(isSelected ? null : theme.key)}
            style={{
              display: "block",
              textAlign: "left",
              width: "100%",
              minHeight: 44,
              background: "var(--card)",
              border: `1px solid ${isSelected ? "var(--brand)" : "var(--line-1)"}`,
              borderRadius: "var(--radius-card)",
              padding: "12px 14px",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--ink)",
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800 }}>
                {(THEME_LABELS as Record<string, string>)[theme.key] ?? theme.key}
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, whiteSpace: "nowrap" }}>
                {theme.count}
                {theme.newCount > 0 && (
                  <span style={{ fontSize: 10, color: "var(--ink)", fontFamily: "inherit", fontWeight: 800 }}>
                    {" "}
                    +{theme.newCount} new
                  </span>
                )}
              </span>
            </span>
            {description && (
              <span
                style={{
                  display: "block",
                  fontSize: "var(--fs-115)",
                  color: "var(--ink-2)",
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
