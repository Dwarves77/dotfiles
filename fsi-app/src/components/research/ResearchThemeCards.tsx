"use client";

/**
 * ResearchThemeCards: the /research theme facet row (UI system handoff 2026-09-06, artboard
 * 06/id="p6", the region directly below the band tiles).
 *
 * The artboard's own caption for this page reads "themes are a second facet row, not a second
 * tile system": these cards ARE the theme facet (clicking one filters the list and the Window
 * row's count line says which theme is active).
 *
 * FIXED (lane W10-NavCard, 2026-09-23, bundle ruling 6 + the 2026-09-20 measurement): this
 * component's own header carried the caption's words while its layout still used `display: grid,
 * gridTemplateColumns: repeat(4, 1fr)`, a tile grid, exactly the shape the caption disclaims. No
 * artboard region for this defect exists to re-measure against (the caption itself is the
 * authority here, not a pixel spec), so the fix is structural: a single wrapping FACET ROW
 * (`display: flex; flexWrap: wrap`), compact pill controls rather than four-across large cards, no
 * fixed column count to overflow at any width. Selection, counts and the "+N new" badge are
 * unchanged; the longer description line (previously always visible under the count) now shows as
 * a native `title` tooltip on the pill instead of a permanent second row, since a facet row's
 * pills are a compact control, not a card.
 *
 * Mounted through ListSurfaceShell's existing `aboveRows` slot, the same slot Operations already
 * uses for its region x dimension matrix, so no new shell region was invented for it.
 *
 * Values carried over from the artboard where they still apply: card 1px rgba(0,0,0,.12), radius
 * 10px, selected pill's border #5A5552 (var(--brand)); label 10.5px / .1em / uppercase / 800;
 * count Anton 18px with a "+N new" suffix at 10px/800 in the body face.
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
    <div
      data-audit="theme-cards"
      data-part="theme-facet-row"
      className="cl-theme-cards"
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      {themes.map((theme) => {
        const isSelected = selected === theme.key;
        const description = (THEME_DESCRIPTIONS as Record<string, string | undefined>)[theme.key];
        return (
          <button
            key={theme.key}
            type="button"
            aria-pressed={isSelected}
            title={description}
            onClick={() => onSelect(isSelected ? null : theme.key)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              minHeight: 36,
              background: "var(--card)",
              border: `1px solid ${isSelected ? "var(--brand)" : "var(--line-1)"}`,
              borderRadius: "var(--radius-card)",
              padding: "6px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--ink)",
            }}
          >
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
          </button>
        );
      })}
    </div>
  );
}
