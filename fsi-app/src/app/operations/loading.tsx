import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
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
    </SkeletonPage>
  );
}
