// Route-level loading boundary for /operations (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Shape mirrors OperationsLedger's own section order (masthead, severity
// tiles, dimension chips, region rows) — reuses the SAME cl-ops-tiles /
// cl-row classes the real ledger renders, so layout does not jump.
const box = (h: number, w: string | number = "100%") => ({
  height: h,
  width: w,
  borderRadius: 6,
  background: "var(--color-surface-raised)",
});

export default function Loading() {
  return (
    <div className="animate-pulse" style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 32px" }}>
      <div style={{ ...box(34, "60%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "60%"), marginBottom: 20 }} />
      <div className="cl-ops-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={box(64)} />
        ))}
      </div>
      <div className="cl-ops-dims" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={box(34)} />
        ))}
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="cl-row" style={{ ...box(48), marginBottom: 10 }} />
      ))}
    </div>
  );
}
