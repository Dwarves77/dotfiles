import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { ListRow, ListRowColumnHeader } from "@/components/ui/ListRow";
import { ImpactMeter } from "@/components/ui/ImpactMeter";
import { GradeChip } from "@/components/ui/Chips";
import { LIST_ROW_FIXTURE_ROWS } from "@/components/ui/__fixtures__/list-row-fixture";

export default async function AdminPartsListRowPage() {
  await requirePlatformAdmin("/admin/parts/list-row");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="ListRow"
        meta={`${LIST_ROW_FIXTURE_ROWS.length} frozen real rows · impact meter at N=4/8/12/unscored · no database read`}
      />
      <div style={{ padding: "28px 36px 80px", maxWidth: 1100 }}>
        <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: "0 0 16px", maxWidth: "70ch" }}>
          Every row below is a real `intelligence_items.id` from a read-only SELECT (see
          `list-row-fixture.ts`); title, jurisdiction and timeline text are the frozen real values.
          Impact scores are set explicitly to the four brief-2.16 totals so the meter renders every
          named state on real row chrome.
        </p>

        <SectionCard padding="0" style={{ margin: "0 0 32px", overflow: "hidden" }} dataAudit="list-row-gallery">
          <ListRowColumnHeader />
          {LIST_ROW_FIXTURE_ROWS.map((row) => (
            <div key={row.id} style={{ position: "relative" }}>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--ink-3)",
                  padding: "6px 12px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                id {row.id} · N = {row.impactTotal}
              </div>
              <ListRow
                href={`/regulations/${row.id}`}
                band={row.band}
                jurisdiction={row.jurisdiction}
                title={row.title}
                meta={row.meta}
                kind={<GradeChip itemGrade={row.itemGrade} />}
                impact={row.impact}
                due={row.due}
                timeline={row.timeline}
                tier={row.tier}
              />
            </div>
          ))}
        </SectionCard>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "0 0 12px" }}>
          Impact meter, bare (the legend&apos;s own <code>total</code> usage)
        </h2>
        <SectionCard padding="20px" dataAudit="list-row-meter-gallery">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[4, 8, 12].map((n) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ width: 90, fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>N = {n}/12</span>
                <ImpactMeter total={n} />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 90, fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>Unscored</span>
              <ImpactMeter scores={null} />
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
