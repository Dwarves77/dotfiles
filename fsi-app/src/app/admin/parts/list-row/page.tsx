/**
 * /admin/parts/list-row: the ListRow sign-off page (lane W10-ListRow, 2026-09-22).
 *
 * Renders the real `ListRow` part (`src/components/ui/ListRow.tsx`) plus `ListRowColumnHeader`
 * against four frozen real records (`list-row-fixture.ts`, project kwrsbpiseruzbfwjpvsp, frozen
 * 2026-09-22 via read-only SELECT; see that file's header for the exact queries). NO invented
 * title, jurisdiction or timeline text (operator ruling: "fixtures render from a frozen real
 * record ... never invented strings"). NO database read at render time; the fixture module is a
 * frozen snapshot, same convention as every other /admin/parts page.
 *
 * This is also the Impact meter fixture the brief asks for ("Impact meter fixture at N = 4, 8, 12
 * and unscored ... lives on /admin/parts/list-row", the W10-A2 remainder): the four rows are
 * ordered N=4, N=8, N=12, unscored, and a second strip below repeats the same four states on the
 * bare `ImpactMeter` component alone (the legend's own usage, `<ImpactMeter total={N}/>`, brief
 * 2.16) so the meter geometry is checkable independent of the row chrome around it.
 *
 * F49 (parts-not-pages): this page imports ListRow/ListRowColumnHeader/ImpactMeter/GradeChip and
 * renders the fixture through them; no row, chip or meter literal style is retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
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
