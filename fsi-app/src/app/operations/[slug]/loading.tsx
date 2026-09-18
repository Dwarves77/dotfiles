// Route-level loading boundary for /operations/[slug] (perf lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md §6 "loading.tsx per route" item).
// Renders on the very next frame after a click while loadDetail's
// Promise.all resolves. Shape mirrors OperationsDetailSurface's own section
// order (back-link, masthead, 8-section body) so layout does not jump when
// real content lands — no data, no fetch, just proportioned placeholders.
import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
      <div style={{ ...box(11, 90), marginBottom: 14 }} />
      <div style={{ ...box(34, "70%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "45%"), marginBottom: 24 }} />
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ ...box(84), marginBottom: 14 }} />
      ))}
    </SkeletonPage>
  );
}
