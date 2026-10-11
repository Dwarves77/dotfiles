import { skeletonBox as box, SkeletonPage } from "@/components/ui/skeleton-page";

export default function Loading() {
  return (
    <SkeletonPage>
      <div style={{ ...box(34, "50%"), marginBottom: 10 }} />
      <div style={{ ...box(13, "60%"), marginBottom: 20 }} />
      <div className="cl-mi-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={box(64)} />
        ))}
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="cl-row" style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "11px 0" }}>
          <div style={box(16, "60%")} />
          <div style={box(16, 100)} />
        </div>
      ))}
    </SkeletonPage>
  );
}
