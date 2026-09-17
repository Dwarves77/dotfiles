// Route-level loading boundary for /market/[slug] (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Renders on the very next frame after a click while loadDetail's
// Promise.all resolves. Shape mirrors MarketSignalDetailSurface's own
// section order (breadcrumb/title block, hero card, price/carbon panels,
// content) so layout does not jump when real content lands — no data, no
// fetch, just proportioned placeholders.
import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
      <div style={{ ...box(11, 160), marginBottom: 14 }} />
      <div style={{ ...box(34, "70%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "40%"), marginBottom: 24 }} />
      <div style={{ ...box(140), marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div style={box(120)} />
        <div style={box(120)} />
      </div>
      <div style={{ ...box(36, "50%"), marginBottom: 18 }} />
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...box(64), marginBottom: 12 }} />
      ))}
    </SkeletonPage>
  );
}
