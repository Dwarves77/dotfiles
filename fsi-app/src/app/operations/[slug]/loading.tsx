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
