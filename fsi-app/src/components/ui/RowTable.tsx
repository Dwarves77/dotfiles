"use client";

/**
 * RowTable, the one tabular row anatomy the handoff draws (dc.html p13, the
 * "SOURCES · PROVISIONAL REVIEW" and "ORGANIZATIONS" cards on artboard 13).
 *
 * It is the table sibling of ListRow: ListRow is the LIST-page row (band spine,
 * impact meter, due date, workspace tags); RowTable is the ADMIN-page row, a
 * fixed column grid under a small-caps header strip, with the trailing 44px
 * overflow cell both anatomies share.
 *
 * Geometry, read off dc.html p13 verbatim:
 *   header  grid, gap 0 14px, padding 0 12px 0 16px, height 30px,
 *           9.5px / .12em / uppercase / 700 / --ink-3, 1px bottom rule
 *   row     same grid, min-height 48px, 12.5px, 1px bottom rule on every row
 *           but the last
 *   ⋯ cell  44px column, a 1px x 32px divider at its left edge then the 28px
 *           glyph box, right-aligned
 *
 * The ⋯ control is a full 44x44 button (DP-1 / the 44px hit-target rule) whose
 * VISIBLE parts are the artboard's 32px divider and 28px glyph, so the drawing
 * and the touch target are both honoured rather than one traded for the other.
 *
 * The overflow MENU is deliberately minimal: the operator audit (2026-09-07)
 * lists row-overflow overlays under "unchanged and undesigned, do not invent",
 * so this renders the caller's items on plain system tokens and gets restyled
 * when Claude Design ships the overlay. It is here rather than absent because
 * the actions it carries are real writes that must stay reachable.
 */

import { useEffect, useRef, useState } from "react";

export interface RowTableColumn {
  /** Header label. Empty string for the action and overflow columns, which the artboard leaves blank. */
  label: string;
  /** CSS grid track for this column, e.g. "1fr", "160px". */
  width: string;
}

export interface RowTableRowSpec {
  key: string;
  /** One node per column, in column order. */
  cells: React.ReactNode[];
}

export interface RowTableProps {
  columns: RowTableColumn[];
  rows: RowTableRowSpec[];
}

function gridStyle(columns: RowTableColumn[]): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns.map((c) => c.width).join(" "),
    alignItems: "center",
    gap: "0 14px",
    padding: "0 12px 0 16px",
  };
}

export function RowTable({ columns, rows }: RowTableProps) {
  return (
    <div>
      <div
        style={{
          ...gridStyle(columns),
          height: 30,
          fontSize: "var(--fs-95)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 700,
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        {columns.map((c, i) => (
          <span key={`${c.label}-${i}`}>{c.label}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            ...gridStyle(columns),
            minHeight: 48,
            fontSize: "var(--fs-125)",
            borderBottom: i === rows.length - 1 ? undefined : "1px solid var(--line-3)",
          }}
        >
          {r.cells.map((cell, ci) => (
            <span key={ci} style={ci === 0 ? { minWidth: 0 } : undefined}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The row's outline action button (dc.html p13: 8px 14px, radius 6, 1px rgba(0,0,0,.25)). */
export function RowTableAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px",
        borderRadius: 6,
        border: "1px solid rgba(0,0,0,.25)",
        background: "var(--surface)",
        fontFamily: "inherit",
        fontSize: "var(--fs-125)",
        fontWeight: 600,
        color: "var(--ink)",
        whiteSpace: "nowrap",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        minHeight: 44,
      }}
    >
      {label}
    </button>
  );
}

export interface RowTableOverflowItem {
  key: string;
  label: string;
  onSelect: () => void;
}

/**
 * The trailing ⋯ cell. `items` are the row's secondary actions; `extra` renders
 * below them inside the same menu (the provisional table's tier picker uses it).
 */
export function RowTableOverflow({
  label,
  items,
  extra,
}: {
  label: string;
  items: RowTableOverflowItem[];
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "block" }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ width: 1, height: 32, background: "var(--line-2)" }} />
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            color: "var(--ink-3)",
          }}
        >
          &#8943;
        </span>
      </button>
      {open && (
        <span
          role="menu"
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            zIndex: 40,
            minWidth: 180,
            display: "block",
            padding: 6,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--surface)",
            boxShadow: "0 4px 14px rgba(26,26,26,.12)",
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              style={{
                display: "block",
                width: "100%",
                minHeight: 44,
                textAlign: "left",
                padding: "0 10px",
                border: "none",
                borderRadius: 6,
                background: "none",
                fontFamily: "inherit",
                fontSize: "var(--fs-125)",
                fontWeight: 600,
                color: "var(--ink)",
                cursor: "pointer",
              }}
            >
              {it.label}
            </button>
          ))}
          {extra}
        </span>
      )}
    </span>
  );
}
