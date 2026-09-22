/**
 * /admin/parts/item-group: the ItemGroup sign-off page (lane w10-factcard-d, 2026-09-21, build
 * item 5's "Add /admin/parts/item-group to the index").
 *
 * NO DATABASE READ. Every group on this page comes from src/lib/detail/fact-card-fixtures.ts's
 * PANEL_21C_GROUPS (the same panel-21c fixture /admin/parts/fact-card renders) plus one extra
 * overflow demo group built from KIND_FIXTURES so the "N more facts" disclosure (build item 3,
 * reusing MoreBelowDisclosure, closed by default per F43) has something to show past 4 cards.
 *
 * F49 (parts-not-pages): this page imports ItemGroup/FactCard and renders fixtures through them;
 * no group or card literal shell style is retyped here.
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { FactCard } from "@/components/ui/FactCard";
import { ItemGroup } from "@/components/ui/ItemGroup";
import { KIND_FIXTURES } from "@/lib/detail/fact-card-fixtures";
import { PANEL_21C_GROUPS } from "@/lib/detail/fact-card-panel21c-fixture";
import { band as urgencyBand } from "@/lib/urgency/bands";
import { RecordFactCard } from "@/components/detail/primitives";
import {
  RECORD_GRADE_FIXTURE_DATE_FACTS,
  RECORD_GRADE_FIXTURE_OTHER_FACTS,
} from "@/components/ui/__fixtures__/record-grade-fixture";

export default async function AdminPartsItemGroupPage() {
  await requirePlatformAdmin("/admin/parts/item-group");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="ItemGroup"
        meta={`${PANEL_21C_GROUPS.length} panel-21c groups · 1 overflow demo group · 2 record-grade groups (frozen real record) · no database read`}
      />
      <div style={{ padding: "28px 36px 80px" }}>
        <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit="item-group-gallery-panel-21c">
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>Panel 21c groups</p>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)", margin: "0 0 16px" }}>
            Band pill header, up to 4 visible cards, ACTION strip - the same fixture /admin/parts/fact-card renders.
          </p>
          {PANEL_21C_GROUPS.map((g) => (
            <ItemGroup key={g.title} title={g.title} qualifier={g.qualifier} band={g.band} actionStrip={g.actionStrip}>
              {g.cards.map((f) => (
                <FactCard key={f.label} model={f.model} />
              ))}
            </ItemGroup>
          ))}
        </SectionCard>

        <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit="item-group-gallery-overflow">
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>Overflow demo</p>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)", margin: "0 0 16px" }}>
            9 cards in one group: 4 visible, 5 behind &quot;N more facts&quot; (closed by default, F43).
          </p>
          <ItemGroup title="Overflow demo group" band={urgencyBand("monitor")}>
            {KIND_FIXTURES.map((f) => (
              <FactCard key={f.label} model={f.model} />
            ))}
          </ItemGroup>
        </SectionCard>

        <SectionCard padding={20} style={{ margin: "0 0 24px" }} dataAudit="item-group-gallery-headerless">
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>Headerless group</p>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)", margin: "0 0 16px" }}>
            No title, no band, no action strip - the shape FactBlocks.tsx renders on a real detail page today (integrity
            rule: omit rather than invent per-item title/band/action-strip data that does not exist yet).
          </p>
          <ItemGroup>
            {KIND_FIXTURES.slice(0, 2).map((f) => (
              <FactCard key={f.label} model={f.model} />
            ))}
          </ItemGroup>
        </SectionCard>

        {/* lane W10-SectionHeader, 2026-09-22, build item 1 verification: the record-grade path
            (RegulationDetailSurface.tsx's own local ItemGroup wrap, and the shared RecordFactsBody
            primitive Market/Research use) against the frozen real record
            (record-grade-fixture.ts, intelligence_items.id = f8268063-0e07-4562-82da-a1373d6dd797,
            EC 391/2009). Confirms the finding this lane verified ("record-grade fact cards now
            render inside ItemGroup", PR #784) with a real fixture on this sign-off page too. */}
        <SectionCard padding={20} dataAudit="item-group-gallery-record-grade">
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>Record-grade (frozen real record)</p>
          <p style={{ fontSize: "var(--fs-12)", color: "var(--ink-3)", margin: "0 0 16px" }}>
            EC 391/2009, EUR-Lex, frozen 2026-09-22. The exact two-group shape
            RegulationDetailSurface.tsx and the shared RecordFactsBody primitive both render.
          </p>
          <ItemGroup title="Key dates">
            {RECORD_GRADE_FIXTURE_DATE_FACTS.map((f) => (
              <RecordFactCard key={f.slotKey} fact={f} />
            ))}
          </ItemGroup>
          <ItemGroup title="Verbatim facts">
            {RECORD_GRADE_FIXTURE_OTHER_FACTS.map((f) => (
              <RecordFactCard key={f.slotKey} fact={f} />
            ))}
          </ItemGroup>
        </SectionCard>
      </div>
    </>
  );
}
