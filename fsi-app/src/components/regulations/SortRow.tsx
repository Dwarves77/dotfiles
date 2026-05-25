"use client";

/**
 * SortRow — sort selector for /regulations.
 *
 * Three sort options after Phase 4 strip (2026-05-25): newest, priority,
 * alphabetical. "Newest" sorts by `Resource.added` desc; "priority" uses
 * CRITICAL→LOW order; "alpha" by title.
 *
 * The "Confidence" sort option was stripped because authority_level is
 * unpopulated on ~95% of items, so the sort produced no differentiation
 * from priority. Restore once authority_level coverage improves or once
 * trust_score_overall becomes a meaningful per-item signal (Sprint 3
 * source-credibility work).
 */

export type SortKey = "newest" | "priority" | "alpha";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "newest",   label: "Newest" },
  { id: "priority", label: "Priority" },
  { id: "alpha",    label: "A → Z" },
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
