"use client";

/**
 * CitationCountChip, citation count with optional click-to-expand.
 *
 * Per Q9: citation count is a primary signal on the Research surface (how
 * many briefs and other sources cite this source) and a secondary signal on
 * Operations and the Assistant provenance panel.
 *
 * Behavior:
 *   - Zero count renders nothing (no signal worth surfacing).
 *   - When `expandable` AND `onExpand` are set, the chip renders as a button
 *     that triggers expansion. The parent owns the panel rendering (typically
 *     ProvenancePanel) per DP-1 single-pane review.
 *   - When `recency` is present, it composes inline (via RecencyChip) so a
 *     reader sees "N citations, freshest 2 weeks ago" in one glance.
 *
 * Stable contract: the chip does NOT render the citation list itself. That
 * is the parent's responsibility, keeps this component composable across
 * surfaces (sidebar, inline, modal).
 */

import type { CSSProperties, KeyboardEvent } from "react";
import { RecencyChip } from "./RecencyChip";

export interface CitationCountChipProps {
  /** Count of 0 renders nothing. */
  count: number;
  /** Optional freshest citation timestamp shown alongside the count. */
  recency?: string | Date | null;
  /** Source identifier passed through to onExpand. */
  sourceId?: string;
  /** When true AND onExpand is provided, chip becomes a button. */
  expandable?: boolean;
  /** Expand handler. Parent renders the panel; this component triggers. */
  onExpand?: (sourceId: string) => void;
}

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--color-text-secondary)",
  backgroundColor: "var(--color-surface-overlay)",
  border: "1px solid var(--color-border-subtle)",
  padding: "2px 6px",
  borderRadius: 3,
  lineHeight: 1.2,
  fontVariantNumeric: "tabular-nums",
};

const BUTTON_STYLE: CSSProperties = {
  ...BASE_STYLE,
  cursor: "pointer",
  font: "inherit",
};

export function CitationCountChip({
  count,
  recency = null,
  sourceId,
  expandable = false,
  onExpand,
}: CitationCountChipProps) {
  if (!count || count <= 0) return null;

  const label = `${count} citation${count === 1 ? "" : "s"}`;
  const canExpand = expandable && typeof onExpand === "function";

  const inner = (
    <>
      <span>{label}</span>
      {recency && (
        <>
          <span aria-hidden="true" style={{ opacity: 0.5 }}>
            ·
          </span>
          <RecencyChip timestamp={recency} size="sm" />
        </>
      )}
    </>
  );

  if (!canExpand) {
    return (
      <span aria-label={label} style={BASE_STYLE}>
        {inner}
      </span>
    );
  }

  const handleClick = () => onExpand!(sourceId ?? "");
  const handleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onExpand!(sourceId ?? "");
    }
  };

  return (
    <button
      type="button"
      aria-label={`${label}, expand for details`}
      aria-expanded={false}
      onClick={handleClick}
      onKeyDown={handleKey}
      style={BUTTON_STYLE}
    >
      {inner}
      <span aria-hidden="true" style={{ opacity: 0.6, fontSize: 9 }}>
        ▾
      </span>
    </button>
  );
}
