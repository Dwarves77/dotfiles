"use client";

// MtdSpendTile, read-only month-to-date agent spend summary.
//
// Mounted in AdminDashboard between the navy admin-view banner and the
// tab strip. Styled to match the navy banner (same accent palette,
// same spacing rhythm) so it reads as part of the same surface.
//
// Feeds:
//   - usd                 sum of agent_runs.cost_usd_estimated where
//                         created_at >= date_trunc('month', now())
//   - runs                count of agent_runs rows for the same window
//   - errors              count of agent_runs rows with status='error'
//
// The component is purely presentational. The /admin server page
// computes the aggregates and passes them in. No client-side fetch.

interface MtdSpendTileProps {
  usd: number;
  runs: number;
  errors: number;
}

export function MtdSpendTile({ usd, runs, errors }: MtdSpendTileProps) {
  const usdFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
  const runsFmt = new Intl.NumberFormat("en-US").format(runs);
  const errorsFmt = new Intl.NumberFormat("en-US").format(errors);

  return (
    <div
      role="status"
      aria-label="Month-to-date agent spend"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-bd)",
        borderRadius: "var(--r-md)",
        padding: "10px 16px",
        marginBottom: 18,
        fontSize: 12,
        color: "var(--text)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--accent)",
          flexShrink: 0,
        }}
      />
      <span>
        <b style={{ color: "var(--accent)" }}>{usdFmt} month-to-date</b>
        {" , "}
        {runsFmt} agent runs , {errorsFmt} errors. Read-only.
      </span>
    </div>
  );
}
