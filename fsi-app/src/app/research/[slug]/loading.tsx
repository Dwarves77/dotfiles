// Route-level loading boundary for /research/[slug] (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Renders on the very next frame after a click while loadDetail's
// Promise.all resolves. Shape mirrors ResearchFindingDetailSurface's own
// section order (back-link, masthead, finding body, related/theme-brief
// rail) so layout does not jump when real content lands — no data, no
// fetch, just proportioned placeholders.
import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
      <div style={{ ...box(11, 80), marginBottom: 14 }} />
      <div style={{ ...box(34, "70%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "45%"), marginBottom: 24 }} />
      <div style={{ ...box(160), marginBottom: 20 }} />
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...box(64), marginBottom: 12 }} />
      ))}
    </SkeletonPage>
  );
}
