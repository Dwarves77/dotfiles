/**
 * /admin/parts/stat-block: the StatBlock sign-off page (lane W10-RailCard, 2026-09-22).
 *
 * `StatBlock` (`src/components/ui/StatBlock.tsx`) already existed as a shared part before this
 * lane (parts-brief 2.13: "Profile, admin counters: label / Anton numeral / note. Never a band
 * tile"). This lane added `data-part="stat-block"` to its root so the presence report and the
 * layout guard can address it by attribute like every other part, and built this sign-off page,
 * which did not exist. Every count on this page is computed from the same frozen real records lane
 * W10-ListRow captured (`list-row-fixture.ts`); no invented figure.
 *
 * F49 (parts-not-pages): this page imports StatBlock/SectionCard and renders the fixture through
 * them; no label/numeral/note literal is retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatBlock } from "@/components/ui/StatBlock";
import { LIST_ROW_FIXTURE_ROWS } from "@/components/ui/__fixtures__/list-row-fixture";

export default async function AdminPartsStatBlockPage() {
  await requirePlatformAdmin("/admin/parts/stat-block");

  const rows = LIST_ROW_FIXTURE_ROWS;
  const totalCount = rows.length;
  const distinctJurisdictions = Array.from(new Set(rows.map((r) => r.jurisdiction))).length;
  const scoredCount = rows.filter((r) => r.impactTotal !== "unscored").length;

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="StatBlock"
        meta={`${totalCount} frozen real rows · stack / row / tile layouts · no database read`}
      />
      <div style={{ padding: "28px 36px 80px", maxWidth: 1100 }}>
        <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: "0 0 20px", maxWidth: "70ch" }}>
          Every figure below is computed from the four real `intelligence_items` rows frozen by lane
          W10-ListRow (see `list-row-fixture.ts`): {totalCount} fixture rows, {distinctJurisdictions}
          {" "}distinct jurisdictions, {scoredCount} of {totalCount} carrying a scored impact total.
          None are invented.
        </p>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "0 0 12px" }}>
          layout=&quot;stack&quot; (default, profile / admin counter card)
        </h2>
        <SectionCard padding="16px" dataAudit="stat-block-stack-gallery" style={{ marginBottom: 24, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <StatBlock label="Fixture rows" value={totalCount} note="frozen real intelligence_items rows" />
            <StatBlock label="Jurisdictions" value={distinctJurisdictions} note="distinct, across the fixture" />
            <StatBlock label="Scored" value={`${scoredCount}/${totalCount}`} note="carrying an impact total" />
          </div>
        </SectionCard>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "0 0 12px" }}>
          layout=&quot;row&quot; (inline in a list, the dashboard rail shape)
        </h2>
        <SectionCard padding="16px" dataAudit="stat-block-row-gallery" style={{ marginBottom: 24, maxWidth: 400 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => (
              <StatBlock
                key={r.id}
                layout="row"
                label={r.title}
                note={r.jurisdiction}
                value={r.impactTotal === "unscored" ? "—" : `${r.impactTotal}/12`} // glyph:verbatim
              />
            ))}
          </div>
        </SectionCard>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "0 0 12px" }}>
          size=&quot;tile&quot; (Platform admin 4-up summary grid), tone=&quot;critical&quot;
        </h2>
        <SectionCard padding="16px" dataAudit="stat-block-tile-gallery" style={{ maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <StatBlock size="tile" label="Fixture rows" value={totalCount} note="frozen real rows" />
            <StatBlock size="tile" label="Needs attention" value={0} note="tone=critical only paints when nonzero" tone="critical" />
          </div>
        </SectionCard>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "24px 0 12px" }}>
          loading state
        </h2>
        <SectionCard padding="16px" dataAudit="stat-block-loading-gallery" style={{ maxWidth: 300 }}>
          <StatBlock label="Fixture rows" value={totalCount} loading />
        </SectionCard>
      </div>
    </>
  );
}
