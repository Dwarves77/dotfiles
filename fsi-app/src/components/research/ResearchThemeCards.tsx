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
 *
 * UNCLASSIFIED BAND (lane L8, 2026-10-02, spec 03's own-finding/docs/specs/03-research.md section 10
 * "Theme rendering"): ResearchLedger.tsx's `themeCards` derivation (its own `themeKeyOf` helper) skips
 * a row entirely - `if (!key) continue` - when `assignTheme` returns null (no DB theme column value and
 * no keyword match). That row is still counted in the ledger's total/band tiles (it renders as a list
 * row), but until this fix it had NO facet-row representation at all: "counted in the tiles and
 * rendered in zero bands... verified content is silently invisible" per the spec's own words. This is
 * a PERMANENT safety net, not a one-time cleanup artifact (the spec's own design intent) - it renders
 * whenever `unclassifiedCount` is nonzero at render time, every time, not only immediately after the
 * one-time backfill script (scripts/research/backfill-themes.mjs) closes today's 47 null rows. A
 * classification miss after this lane ships stays visible here, never silently re-absorbed into
 * invisibility.
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
  unclassifiedCount = 0,
}: {
  themes: ResearchThemeCard[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** Rows the theme classifier matched to no theme (null key from themeKeyOf). Honest absence state,
   *  never silently dropped - renders as its own pill, same anatomy as a real theme card, whenever
   *  nonzero. Optional/defaulted so an existing caller that has not threaded this yet (pre-wiring)
   *  still renders exactly as before - see this lane's report for the ResearchLedger.tsx wiring note. */
  unclassifiedCount?: number;
}) {
  if (themes.length === 0 && unclassifiedCount <= 0) return null;
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
      {unclassifiedCount > 0 && (() => {
        const isSelected = selected === "unclassified";
        return (
          <button
            key="unclassified"
            type="button"
            data-audit="theme-card-unclassified"
            aria-pressed={isSelected}
            title="Verified findings whose text matched none of the seven research themes."
            onClick={() => onSelect(isSelected ? null : "unclassified")}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              minHeight: 36,
              background: "var(--card)",
              // Dashed border (never the solid error-red treatment): an honest, expected absence
              // state, not a fault - same geometry and typography as every other pill, quieter color
              // only (UX compliance note, this lane's report).
              border: `1px dashed ${isSelected ? "var(--brand)" : "var(--line-1)"}`,
              borderRadius: "var(--radius-card)",
              padding: "6px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "var(--ink-2)",
            }}
          >
            <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 800 }}>
              Unclassified
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 18, whiteSpace: "nowrap" }}>
              {unclassifiedCount}
            </span>
          </button>
        );
      })()}
    </div>
  );
}
