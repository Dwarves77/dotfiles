/**
 * section-index-styles: the shared style-object core behind a sticky S1 . S2 . S3 section index
 * bar. F45 duplicate-code (lane W10-ActionCard-a, 2026-09-21): `DetailShell.tsx`'s existing
 * `SectionIndex` and the new `src/components/ui/SectionIndex.tsx` (this lane's fixed part, review
 * items 4 and 6) draw the SAME outer chrome (the sticky nav row, the bordered pill-group strip, the
 * per-tab link's base look) and differ only in the ONE property review item 4 changes (the old
 * component clamps each tab to a fixed `maxWidth` with an ellipsis; the new one never truncates and
 * lets the strip itself scroll). Extracting that shared 90% into pure, no-JSX style functions lets
 * both components spread the base and layer their own one differing property, instead of each
 * retyping the whole object.
 */
import type { CSSProperties } from "react";

export function sectionIndexNavStyle(): CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "var(--page)",
    padding: "6px 0",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
  };
}

/** The bordered pill-group strip. `overflow` is the ONE point of difference between the two
 *  callers (the old component holds a fixed row and lets an individual tab ellipsise; this lane's
 *  fixed part scrolls the strip itself and never truncates a tab), passed in by the caller. */
export function sectionIndexStripStyle(overflow: CSSProperties): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "var(--card)",
    border: "1px solid var(--line-1)",
    borderRadius: 8,
    padding: 4,
    fontSize: "12.5px",
    minWidth: 0,
    ...overflow,
  };
}

/** A single tab link's base look. `sizing` is the ONE point of difference (the old component's
 *  `maxWidth` + ellipsis truncation vs this lane's untruncated tab), passed in by the caller. */
export function sectionIndexLinkStyle(isActive: boolean, sizing: CSSProperties): CSSProperties {
  return {
    fontSize: "12.5px",
    fontWeight: isActive ? 700 : 600,
    color: isActive ? "#FFFFFF" : "var(--ink-2)",
    background: isActive ? "var(--brand)" : "transparent",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    borderRadius: 6,
    padding: "6px 12px",
    whiteSpace: "nowrap",
    flexShrink: 0,
    ...sizing,
  };
}
