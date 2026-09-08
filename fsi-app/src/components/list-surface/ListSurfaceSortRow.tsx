"use client";

/**
 * ListSurfaceSortRow — the count + segmented-control row that sits between
 * the facets and the band-grouped rows on artboards 02 (Regulations,
 * id="p2": "1,316 regulations · grouped by band · Show as one list" left,
 * "SORT Next date | Newest | A-Z | My order" right, active option filled)
 * and 04 (Market, id="p4": same row, three sort options — no "My order").
 * Research (06) and Operations (08) do not carry this row (Research has its
 * own "Window" 7d/30d/90d/All row instead, built separately; Operations
 * goes straight from the matrix into the band cards) — this component is
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
  flatToggleLabel,
  flat,
  onToggleFlat,
  controlLabel,
  options,
  active,
  onSelect,
}: {
  /** e.g. <>{total} regulations · grouped by band</> — the count text left of the toggle link. */
  countLabel: ReactNode;
  /** e.g. "Show as one list" / "Group by band" — the link's own label, current-state-dependent. */
  flatToggleLabel: string;
  flat: boolean;
  onToggleFlat: () => void;
  /** e.g. "Sort" or "Window" — the small-caps label left of the segmented options. */
  controlLabel: string;
  options: ListSurfaceSortOption[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
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
      <div style={{ fontSize: "var(--fs-125)", color: "var(--ink-2)" }}>
        {countLabel}
        {" · "}
        <button
          type="button"
          onClick={onToggleFlat}
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
          {flatToggleLabel}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "var(--fs-12)" }}>
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
