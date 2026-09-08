"use client";

/**
 * ListSurfaceSortRow — the count + segmented-control row that sits between
 * the facets and the band-grouped rows on artboards 02 (Regulations,
 * id="p2": "1,316 regulations · grouped by band · Show as one list" left,
 * "SORT Next date | Newest | A-Z | My order" right, active option filled)
 * and 04 (Market, id="p4": same row, three sort options — no "My order").
 * Research (06, id="p6") carries the SAME row with a different control:
 * "4 of 39 findings · Emissions accounting · Clear theme" left, "WINDOW 7d
 * | 30d | 90d | All" right (lane comp-06, 2026-09-08, the row is this one
 * component, not a research-local copy). Operations (08) goes straight from
 * the matrix into the band cards and passes no row at all: this component is
 * an opt-in slot (`ListSurfaceShellProps.sortRow`), not mounted by every
 * surface.
 *
 * A shared part, not a page-local row: both callers pass the same shape
 * (count text, a "grouped by band"/"flat" toggle, a labelled set of
 * mutually-exclusive options) and get byte-identical markup back.
 */

import type { ReactNode } from "react";

export interface ListSurfaceSortOption {
  key: string;
  label: string;
}

export function ListSurfaceSortRow({
  countLabel,
  linkLabel,
  onLink,
  controlLabel,
  options,
  active,
  onSelect,
}: {
  /** e.g. <>{total} regulations · grouped by band</>, the count text left of the link. */
  countLabel: ReactNode;
  /** The trailing link's own label: "Show as one list" / "Group by band" on artboards 02/04,
   *  "Clear theme" on artboard 06's Window row (lane comp-06, 2026-09-08, generalised from the
   *  original flat-toggle-only pair rather than adding a second, parallel link prop). Omit both
   *  `linkLabel` and `onLink` and the row renders the count text alone. */
  linkLabel?: string;
  onLink?: () => void;
  /** e.g. "Sort" or "Window" — the small-caps label left of the segmented options. */
  controlLabel: string;
  options: ListSurfaceSortOption[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      className="cl-sort-row"
      data-audit="sort-row"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "2px 4px",
        flexWrap: "wrap",
      }}
    >
      {/* D-M6 (lane mobfix61, 2026-09-08, operator: "all text spacing is off")
          [CONFIRMED, read off the 390 capture of /regulations]: this row had no mobile
          treatment at all, so at 390 its `flexWrap: wrap` broke the segmented control
          across two lines and stranded the last option ("My order") on a line of its own,
          separated from the SORT label that gives it meaning. The mobile 390 spec's FILTERS
          section states the rule for every labelled option set on the page: "chip groups
          scroll sideways as whole units so a group never loses its label". So below 768 the
          control group is one non-wrapping line that scrolls sideways — the same mechanism
          .cl-facets-mobile already uses for the facet chip groups — and the count line above
          it takes a full-width line of its own rather than competing for the same row. */}
      <style>{`
        @media (max-width: 767px) {
          .cl-sort-row { flex-wrap: nowrap !important; flex-direction: column; align-items: stretch !important; gap: 8px !important; }
          .cl-sort-row .cl-sort-options {
            flex-wrap: nowrap !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 2px;
          }
          .cl-sort-row .cl-sort-options > * { flex-shrink: 0; }
        }
      `}</style>
      <div style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)" }}>
        {countLabel}
        {linkLabel && onLink && (
          <>
            {" · "}
            <button
              type="button"
              onClick={onLink}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--ink)",
                fontWeight: 600,
                textDecoration: "underline",
                textDecorationColor: "rgba(0,0,0,.3)",
                cursor: "pointer",
                minHeight: 24,
              }}
            >
              {linkLabel}
            </button>
          </>
        )}
      </div>
      {/* FOLD-61: `data-guard-strip` is how a sideways scroller DECLARES itself to the rendering
          guard (ux-assert.mjs's detectClippedOverflow: an element past the viewport edge is a
          defect unless a declared strip ancestor carries it). D-M6's fix above makes this group
          scroll below 768, and the guard measured the last option, "My order", at right=410 on a
          375px viewport with no strip to carry it, so the fix read as three UX-smoke failures on
          /regulations. The convention already exists on .cl-facets-mobile, the ThemeStrip, the
          obligations strip, the community tabs and the detail chip row; this row is the same
          mechanism and had simply not said so. The attribute changes nothing visual. */}
      <div className="cl-sort-options" data-guard-strip="true" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "var(--fs-12)" }}>
        <span
          style={{
            color: "var(--ink-3)",
            fontSize: "var(--fs-105)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginRight: 4,
          }}
        >
          {controlLabel}
        </span>
        {options.map((opt) => {
          const isActive = opt.key === active;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelect(opt.key)}
              style={{
                padding: "5px 10px",
                minHeight: 24,
                borderRadius: 6,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: isActive ? "var(--brand)" : "transparent",
                color: isActive ? "#fff" : "var(--ink-2)",
                fontFamily: "inherit",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
