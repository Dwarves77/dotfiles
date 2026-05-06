"use client";

/**
 * BulkSelectBar — bulk-action toolbar for /regulations.
 *
 * Renders only when bulk mode is active. Shows selection count and
 * exposes:
 *   - Add to watchlist (writes to localStorage `fsi-watchlist` set —
 *     a server-backed watchlist table is dispatch E3 / future work).
 *   - Export (CSV download via the existing Blob downloadFile helper —
 *     no new infrastructure required).
 *   - Clear selection.
 *
 * The CSV export uses tab-delimited fields with the resource id, title,
 * priority, jurisdiction, topic, and authority level so it imports
 * cleanly into Excel/Sheets.
 */

import { downloadFile, safeName } from "@/lib/export/download";
import type { Resource } from "@/types/resource";

export interface BulkSelectBarProps {
  active: boolean;
  selected: Set<string>;
  resources: Resource[];
  onClear: () => void;
  onExitBulkMode: () => void;
  onAddToWatchlist: (ids: string[]) => void;
}

export function BulkSelectBar({
  active,
  selected,
  resources,
  onClear,
  onExitBulkMode,
  onAddToWatchlist,
}: BulkSelectBarProps) {
  if (!active) return null;

  const selectedResources = resources.filter((r) => selected.has(r.id));

  function exportCsv() {
    if (selectedResources.length === 0) return;
    const header = [
      "id",
      "title",
      "priority",
      "jurisdiction",
      "topic",
      "authority_level",
      "added",
      "url",
    ].join("\t");
    const rows = selectedResources.map((r) =>
      [
        r.id,
        csvCell(r.title),
        r.priority,
        r.jurisdiction || "",
        r.topic || r.sub || "",
        r.authorityLevel || "",
        r.added,
        r.url || "",
      ].join("\t")
    );
    const tsv = [header, ...rows].join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(
      tsv,
      `regulations_${safeName(`${selectedResources.length}_items_${stamp}`)}.tsv`,
      "text/tab-separated-values"
    );
  }

  function addToWatchlist() {
    if (selectedResources.length === 0) return;
    onAddToWatchlist(selectedResources.map((r) => r.id));
  }

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-bd)",
        borderRadius: "var(--r-md)",
        marginBottom: 16,
        boxShadow: "var(--shadow)",
      }}
    >
      <strong
        style={{
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        {selected.size} selected
      </strong>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={addToWatchlist}
        disabled={selected.size === 0}
        style={bulkBtnStyle(selected.size === 0)}
      >
        Add to watchlist
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={selected.size === 0}
        style={bulkBtnStyle(selected.size === 0)}
      >
        Export TSV
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={selected.size === 0}
        style={bulkBtnStyle(selected.size === 0)}
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onExitBulkMode}
        style={{
          ...bulkBtnStyle(false),
          background: "transparent",
          border: "1px solid var(--accent-bd)",
        }}
      >
        Done
      </button>
    </div>
  );
}

function bulkBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "6px 12px",
    borderRadius: 4,
    border: "1px solid var(--accent-bd)",
    background: disabled ? "transparent" : "var(--surface)",
    color: disabled ? "var(--muted)" : "var(--accent)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    opacity: disabled ? 0.5 : 1,
  };
}

function csvCell(value: string | undefined | null): string {
  if (!value) return "";
  return String(value).replace(/[\r\n\t]+/g, " ").trim();
}

// ── Watchlist helpers (localStorage-backed) ────────────────────────────
//
// Server-side watchlist persistence is dispatch E2/E3 follow-up work.
// For now the bulk action writes to localStorage and surfaces a toast
// from the parent surface so users see immediate feedback.

const WATCHLIST_LS_KEY = "fsi-watchlist";

export function loadWatchlist(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WATCHLIST_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveWatchlist(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WATCHLIST_LS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be full or disabled — silent
  }
}
