"use client";

/**
 * IssueFilterCaption — small banner shown on a tab body when the user
 * arrived via an IssuesQueue tap-through (W2.E). Communicates the
 * requested sub-filter (e.g. "Showing: materialization-failed only") and
 * offers a clear button. The actual filter logic lives in the per-tab
 * body (SourceHealthDashboard / staged-updates list); this just surfaces
 * the requested scope so the W2.E flow doesn't silently reset.
 */
export function IssueFilterCaption({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md, 8px)",
        background: "var(--color-active-bg)",
        fontSize: 12,
        color: "var(--color-text-primary)",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>Filter:</span>
      <strong style={{ fontWeight: 700 }}>{label}</strong>
      <button
        type="button"
        onClick={onClear}
        style={{
          marginLeft: "auto",
          fontSize: 11,
          padding: "2px 10px",
          borderRadius: 999,
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
      >
        Clear
      </button>
    </div>
  );
}

export function issueFilterLabel(filter: string): string {
  switch (filter) {
    case "provisional":
      return "Provisional sources";
    case "materialization-failed":
      return "Materialization failures";
    case "attribution-mismatch":
      return "Source attribution mismatches";
    case "recently-approved":
      return "Recently auto-approved (spot-check)";
    default:
      return filter;
  }
}
