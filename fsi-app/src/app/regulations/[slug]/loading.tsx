// Route-level loading boundary for /regulations/[slug] (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Renders on the very next frame after a click (law 6's "immediate
// acknowledgement") while loadDetail's Promise.all resolves. Shape mirrors
// RegulationDetailSurface's own section order (breadcrumb/title block, hero
// card, tab bar, content) so layout does not jump when real content lands —
// no data, no fetch, just proportioned placeholders.
import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
      <div style={{ ...box(11, 160), marginBottom: 14 }} />
      <div style={{ ...box(34, "70%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "40%"), marginBottom: 24 }} />
      <div style={{ ...box(140), marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={box(70)} />
        ))}
      </div>
      <div style={{ ...box(36, "50%"), marginBottom: 18 }} />
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...box(64), marginBottom: 12 }} />
      ))}
    </SkeletonPage>
  );
}
