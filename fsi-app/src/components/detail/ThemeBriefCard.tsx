/**
 * ThemeBriefCard: artboard 07's CLUSTER SYNTHESIS rail card, moved out of ResearchFindingDetailSurface.tsx
 * into a shared home (lane S3-B). Its markup is UNCHANGED: the artboard draws exactly the 3px rule cap,
 * a head row, the theme title and one meta line ("85 items · density 0.180 · STALE · MEMBERSHIP CHANGED"),
 * and the rendering audit and layout guard measure those values. The brief's TEXT (meaning, what follows
 * on this page, what to watch, the other members) is the shared "Across pages" section's job
 * (CrossPageSection.tsx), mounted on all four detail pages; this card stays the Research rail's pointer.
 *
 * Renders nothing when the theme has no brief (no title): the section below names that absence in words.
 */
import { SectionCard } from "@/components/ui/SectionCard";

export interface ThemeBriefCardView {
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
          {typeof brief.density === "number" ? ` · density ${brief.density.toFixed(3)}` : ""}
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
