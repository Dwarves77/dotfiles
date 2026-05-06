"use client";

/**
 * ViewToggles — three view modes for /regulations.
 *
 * - kanban (default): the 4-column priority kanban already in production.
 * - list: dense single-column rows; ID + jurisdiction + due date inline.
 * - table: tabular grid with sortable headers (visual only — sort row
 *   above the toggles drives the actual order).
 */

import { LayoutGrid, List, Table } from "lucide-react";

export type ViewMode = "kanban" | "list" | "table";

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
  { id: "kanban", label: "Card grid", icon: <LayoutGrid size={13} /> },
  { id: "list",   label: "Dense list", icon: <List size={13} /> },
  { id: "table",  label: "Table",      icon: <Table size={13} /> },
];

export interface ViewTogglesProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export function ViewToggles({ value, onChange }: ViewTogglesProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 0,
        padding: 3,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
      role="radiogroup"
      aria-label="View mode"
    >
      {VIEW_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.id)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 10px",
              borderRadius: 4,
              border: 0,
              background: isActive ? "var(--accent-bg)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-2)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {opt.icon}
            <span style={{ display: "none" }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
