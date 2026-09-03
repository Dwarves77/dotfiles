// Route-level loading boundary for /research/[slug] (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Renders on the very next frame after a click while loadDetail's
// Promise.all resolves. Shape mirrors ResearchFindingDetailSurface's own
// section order (back-link, masthead, finding body, related/theme-brief
// rail) so layout does not jump when real content lands — no data, no
// fetch, just proportioned placeholders.
const box = (h: number, w: string | number = "100%") => ({
  height: h,
  width: w,
  borderRadius: 6,
  background: "var(--color-surface-raised)",
});

export default function Loading() {
  return (
    <div className="animate-pulse" style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 32px" }}>
      <div style={{ ...box(11, 80), marginBottom: 14 }} />
      <div style={{ ...box(34, "70%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "45%"), marginBottom: 24 }} />
      <div style={{ ...box(160), marginBottom: 20 }} />
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...box(64), marginBottom: 12 }} />
      ))}
    </div>
  );
}
