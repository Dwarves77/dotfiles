"use client";

/**
 * SortRow — sort selector for /regulations.
 *
 * Four sort options per dispatch: newest, priority, confidence,
 * alphabetical. "Newest" sorts by `Resource.added` desc; "priority"
 * uses CRITICAL→LOW order; "confidence" uses authority-level rank
 * (primary_text highest, unconfirmed lowest); "alpha" by title.
 */

export type SortKey = "newest" | "priority" | "confidence" | "alpha";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "newest",     label: "Newest" },
  { id: "priority",   label: "Priority" },
  { id: "confidence", label: "Confidence" },
  { id: "alpha",      label: "A → Z" },
];

export interface SortRowProps {
  value: SortKey;
  onChange: (next: SortKey) => void;
}

export function SortRow({ value, onChange }: SortRowProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 4,
        padding: 3,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
      role="radiogroup"
      aria-label="Sort regulations"
    >
      {SORT_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              padding: "5px 10px",
              borderRadius: 4,
              border: 0,
              background: isActive ? "var(--accent-bg)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Authority-level rank for confidence sort ────────────────────────────
const AUTHORITY_RANK: Record<string, number> = {
  primary_text:       0,
  official_guidance:  1,
  intergovernmental:  2,
  expert_analysis:    3,
  unconfirmed:        4,
};

export function authorityRank(level?: string | null): number {
  if (!level) return 99;
  return AUTHORITY_RANK[level] ?? 99;
}
