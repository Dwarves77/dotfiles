"use client";

/**
 * ConfidenceFacet — confidence-level filter chips for /regulations.
 *
 * Wired to `Resource.authorityLevel` (5 levels from the
 * environmental-policy-and-innovation skill source hierarchy). Items
 * without an authority level are grouped under "Unclassified" so the
 * facet never silently drops rows.
 *
 * Visual: same chip pattern as the sector filter, but uses the
 * authority-level palette (green primary text → amber unconfirmed).
 */

import { AUTHORITY_LEVELS } from "@/lib/constants";

export interface ConfidenceFacetProps {
  active: Set<string>;
  counts?: Record<string, number>;
  onToggle: (level: string) => void;
}

const UNCLASSIFIED_ID = "unclassified";

const CONFIDENCE_OPTIONS: Array<{
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  description?: string;
}> = [
  ...AUTHORITY_LEVELS.map((a) => ({
    id: a.id,
    label: a.short,
    color: a.color,
    bg: a.bg,
    border: a.border,
    description: a.description,
  })),
  {
    id: UNCLASSIFIED_ID,
    label: "Unclassified",
    color: "var(--muted)",
    bg: "var(--surface)",
    border: "var(--border)",
    description: "Items without an authority-level tag.",
  },
];

export function ConfidenceFacet({
  active,
  counts = {},
  onToggle,
}: ConfidenceFacetProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "6px 2px",
        borderTop: "1px solid var(--border-sub)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted)",
          paddingTop: 8,
        }}
      >
        Confidence
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {CONFIDENCE_OPTIONS.map((opt) => {
          const isActive = active.has(opt.id);
          const n = counts[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              aria-pressed={isActive}
              title={opt.description}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${isActive ? opt.border : "var(--border)"}`,
                background: isActive ? opt.bg : "var(--surface)",
                color: isActive ? opt.color : "var(--text-2)",
                cursor: "pointer",
                fontFamily: "inherit",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isActive ? opt.color : "var(--text-2)",
                  display: "inline-block",
                }}
              />
              {opt.label}
              {n !== undefined && (
                <span style={{ opacity: 0.7, fontWeight: 600, fontSize: 10.5 }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { UNCLASSIFIED_ID as CONFIDENCE_UNCLASSIFIED_ID };
