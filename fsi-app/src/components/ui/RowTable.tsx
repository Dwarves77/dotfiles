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
  /**
   * DOM id for the row element. Optional; lane community60 needs it so the
   * `#post-<id>` in-page anchors the community rail already emits keep
   * resolving after the stacked feed became this table.
   */
  id?: string;
  /**
   * Whole-row activation (the one click target rule, DP-1). When given, the
   * row becomes a keyboard-reachable button; a control INSIDE a cell must
   * stop propagation, exactly as `RowTableOverflow` does.
   */
  onActivate?: () => void;
  /** Accessible name for the activatable row. */
  activateLabel?: string;
  /** Rendered full-width directly under the row, inside the same rules. */
  below?: React.ReactNode;
}

/**
 * Per-table geometry. Defaults are artboard 13's (the admin tables this
 * component was born for); artboard 12's discussion table states different
 * values for the same anatomy, so they are passed rather than forked into a
 * second component (CLAUDE.md rule 13).
 *
 *   p13  padding-left 16 · rows 48 · no rule after the last row
 *   p12  padding-left 14 · rows 56 · a rule after the last row too
 */
export interface RowTableMetrics {
  /** Grid padding-left in px. Default 16 (dc.html p13). */
  paddingLeft?: number;
  /** Row min-height in px. Default 48 (dc.html p13). */
  rowMinHeight?: number;
  /** Draw the row divider under the last row as well. Default false. */
  ruleAfterLastRow?: boolean;
}

export interface RowTableProps {
  columns: RowTableColumn[];
  rows: RowTableRowSpec[];
  metrics?: RowTableMetrics;
}

function gridStyle(columns: RowTableColumn[], paddingLeft: number): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: columns.map((c) => c.width).join(" "),
    alignItems: "center",
    gap: "0 14px",
    padding: `0 12px 0 ${paddingLeft}px`,
  };
}

export function RowTable({ columns, rows, metrics }: RowTableProps) {
  const paddingLeft = metrics?.paddingLeft ?? 16;
  const rowMinHeight = metrics?.rowMinHeight ?? 48;
  const ruleAfterLastRow = metrics?.ruleAfterLastRow ?? false;
  return (
    <div>
      <div
        style={{
          ...gridStyle(columns, paddingLeft),
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
      {rows.map((r, i) => {
        const rule =
          i === rows.length - 1 && !ruleAfterLastRow
            ? undefined
            : "1px solid var(--line-3)";
        return (
          <div key={r.key}>
            <div
              id={r.id}
              role={r.onActivate ? "button" : undefined}
              tabIndex={r.onActivate ? 0 : undefined}
              aria-label={r.onActivate ? r.activateLabel : undefined}
              onClick={r.onActivate}
              onKeyDown={
                r.onActivate
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        r.onActivate?.();
                      }
                    }
                  : undefined
              }
              style={{
                ...gridStyle(columns, paddingLeft),
                minHeight: rowMinHeight,
                fontSize: "var(--fs-125)",
                borderBottom: r.below ? undefined : rule,
                cursor: r.onActivate ? "pointer" : undefined,
              }}
            >
              {r.cells.map((cell, ci) => (
                <span key={ci} style={ci === 0 ? { minWidth: 0 } : undefined}>
                  {cell}
                </span>
              ))}
            </div>
            {r.below && (
              <div style={{ padding: `0 12px 12px ${paddingLeft}px`, borderBottom: rule }}>
                {r.below}
              </div>
            )}
          </div>
        );
      })}
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
        onClick={(e) => {
          // The row itself may be the click target (RowTableRowSpec.onActivate);
          // opening the menu must not also activate the row.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
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
