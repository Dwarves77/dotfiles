import { SectionCard } from "@/components/ui/SectionCard";

interface ThemeBriefCardView {
  title?: string | null;
  memberCount: number;
  density?: number | null;
  stale?: boolean;
}

export function ThemeBriefCard({ brief }: { brief: ThemeBriefCardView | null | undefined }) {
  if (!brief || !brief.title) return null;
  return (
    <SectionCard>
      <div style={{ padding: "12px 16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>
            Cluster synthesis
          </span>
        </div>
        <div style={{ fontSize: "var(--fs-125)", fontWeight: 600, lineHeight: 1.4, color: "var(--ink)" }}>{brief.title}</div>
        <div style={{ fontSize: "var(--fs-11)", color: "var(--ink-3)", marginTop: 6 }}>
          {brief.memberCount} item{brief.memberCount === 1 ? "" : "s"}
          {brief.stale && (
            <>
              {" · "}
              <span style={{ fontSize: "var(--fs-105)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>
                stale · membership changed
              </span>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
