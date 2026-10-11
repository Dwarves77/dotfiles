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
