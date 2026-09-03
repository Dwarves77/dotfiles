// Route-level loading boundary for /regulations (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item —
// the four index routes are the other half of that item, alongside the four
// detail routes). Shape mirrors RegulationsLedger's own section order
// (masthead, severity tiles, banded rows) — reuses the SAME cl-reg-tiles /
// cl-row-grid classes the real ledger renders, so layout does not jump.
const box = (h: number, w: string | number = "100%") => ({
  height: h,
  width: w,
  borderRadius: 6,
  background: "var(--color-surface-raised)",
});

export default function Loading() {
  return (
    <div className="animate-pulse" style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 32px" }}>
      <div style={{ ...box(34, "50%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "60%"), marginBottom: 20 }} />
      <div className="cl-reg-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={box(64)} />
        ))}
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="cl-row-grid" style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 14, padding: "11px 0" }}>
          <div style={box(16)} />
          <div style={box(16, "70%")} />
          <div style={box(16, 60)} />
        </div>
      ))}
    </div>
  );
}
