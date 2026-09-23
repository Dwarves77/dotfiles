/**
 * /admin/parts/rail-card: the RailCard sign-off page (lane W10-RailCard, 2026-09-22).
 *
 * Renders the real `RailCard` part (`src/components/ui/RailCard.tsx`) in each of its four head
 * variants (plain title, `headLink`, `headRight`, `titleHref`+`titleCount`) against the frozen
 * real records already captured by lane W10-ListRow (`list-row-fixture.ts`, project
 * kwrsbpiseruzbfwjpvsp, frozen 2026-09-22 via read-only SELECT). No new database read: this page
 * reuses that existing frozen fixture (retrieval-before-generation, CLAUDE.md "Retrieval before
 * generation", the answer already existed in the repo) rather than staging a second frozen-record
 * file for the same underlying rows. No invented title, jurisdiction or tier text.
 *
 * The Legend variant is ALSO the ruling-5 proof: "legend rail card: one live ImpactMeter frozen at
 * N = 8 next to the text, no diagram." `LegendRailCard` (`list-surface/ListSurfaceRailCards.tsx`)
 * is mounted here unmodified, and it renders `<ImpactMeter total={8} />` beside the Impact/Timeline/
 * Source-tier text, confirmed by reading that component's own source (no diagram element exists in
 * it).
 *
 * F49 (parts-not-pages): this page imports RailCard/LegendRailCard/StatBlock and renders the
 * fixture through them; no rail-card shell literal (SectionCard padding, the 10.5px/800/.12em
 * uppercase header) is retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { RailCard } from "@/components/ui/RailCard";
import { LegendRailCard } from "@/components/list-surface/ListSurfaceRailCards";
import { LIST_ROW_FIXTURE_ROWS } from "@/components/ui/__fixtures__/list-row-fixture";

export default async function AdminPartsRailCardPage() {
  await requirePlatformAdmin("/admin/parts/rail-card");

  const rows = LIST_ROW_FIXTURE_ROWS;
  const totalCount = rows.length;
  const distinctJurisdictions = Array.from(new Set(rows.map((r) => r.jurisdiction))).length;

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="RailCard"
        meta={`${totalCount} frozen real rows · 4 head variants · no database read`}
      />
      <div style={{ padding: "28px 36px 80px", maxWidth: 1100 }}>
        <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: "0 0 20px", maxWidth: "70ch" }}>
          Every label/value below reuses the four real `intelligence_items` rows frozen by lane
          W10-ListRow (see `list-row-fixture.ts`): title, jurisdiction and tier are the frozen real
          values; counts ({totalCount}, {distinctJurisdictions}) are computed from those same rows,
          not invented.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "300px 300px", gap: 20, alignItems: "start" }}>
          {/* Plain title, no head trailing: the ruling-5 proof. */}
          <div>
            <h2 style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px" }}>
              Plain title (Legend, ruling 5: live ImpactMeter frozen at N=8)
            </h2>
            <LegendRailCard />
          </div>

          {/* headLink variant. */}
          <div>
            <h2 style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px" }}>
              headLink (artboard 02/id=&quot;p2&quot; &quot;Calendar →&quot; shape)
            </h2>
            <RailCard title="At a glance" dataAudit="rail-card-fixture-headlink" headLink={{ label: "Full list →", href: "/regulations" }}>
              <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "7px 12px", fontSize: "var(--fs-12)" }}>
                <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>Item</span>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{rows[0].title}</span>
                <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>Jurisdiction</span>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{rows[0].jurisdiction}</span>
                <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>Tier</span>
                <span style={{ color: "var(--ink)", fontWeight: 600 }}>{rows[0].tier ?? "—"}</span> {/* glyph:verbatim */}
              </div>
            </RailCard>
          </div>

          {/* headRight variant. */}
          <div>
            <h2 style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px" }}>
              headRight (AdminIssuesRail&apos;s computed-total shape)
            </h2>
            <RailCard
              title="Fixture rows"
              dataAudit="rail-card-fixture-headright"
              headRight={
                // F49 (parts-not-pages): the Anton numeral treatment lives at the real call site
                // (AdminIssuesRail.tsx's own `totalBadge`, a component, not a page.tsx). This
                // fixture demonstrates the headRight SLOT with a plain tabular-nums span rather
                // than retyping the Anton literal here.
                <span
                  data-guard-display="stat-block-numeral"
                  style={{
                    fontSize: "var(--fs-13)",
                    fontWeight: 800,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--ink)",
                  }}
                >
                  {totalCount}
                </span>
              }
            >
              <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0 }}>
                {distinctJurisdictions} distinct jurisdiction{distinctJurisdictions === 1 ? "" : "s"} across the
                frozen set.
              </p>
            </RailCard>
          </div>

          {/* titleHref + titleCount variant. */}
          <div>
            <h2 style={{ fontSize: "var(--fs-11)", fontWeight: 700, color: "var(--ink-3)", margin: "0 0 8px" }}>
              titleHref + titleCount (dashboard Watchlist shape)
            </h2>
            <RailCard title="Watchlist" dataAudit="rail-card-fixture-titlehref" titleHref="/watchlist" titleCount={`3 of ${totalCount}`}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {rows.slice(0, 3).map((r) => (
                  <li key={r.id} style={{ fontSize: "var(--fs-12)", color: "var(--ink)" }}>
                    {r.title}
                  </li>
                ))}
              </ul>
            </RailCard>
          </div>
        </div>

        <h2 style={{ fontSize: "var(--fs-14)", fontWeight: 700, color: "var(--ink)", margin: "32px 0 12px" }}>
          Card shell (SectionCard 3px rule, border, radius, shadow)
        </h2>
        <SectionCard padding="16px" dataAudit="rail-card-shell-note" style={{ maxWidth: 600 }}>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-2)", margin: 0 }}>
            Every card above renders through the shared `SectionCard` shell (border, radius 10, the
            3px graduated rule, and the shadow). RailCard adds no chrome of its own beyond the
            10.5px/800/.12em uppercase header row.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
