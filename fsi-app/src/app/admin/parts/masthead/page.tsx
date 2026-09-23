/**
 * /admin/parts/masthead: the Masthead sign-off page (lane W10-Masthead, 2026-09-22).
 *
 * Renders the real `Masthead` part (`src/components/ui/Masthead.tsx`) against the same frozen real
 * record the SectionHeader fixture uses (`record-grade-fixture.ts`, intelligence_items.id =
 * f8268063-0e07-4562-82da-a1373d6dd797, EC 391/2009, EUR-Lex, frozen 2026-09-22 via a read-only
 * SELECT against `intelligence_item_sections`, project kwrsbpiseruzbfwjpvsp), no invented title
 * text, no second SELECT (operator ruling: "fixtures read from a frozen real record, never
 * invented strings"; reuse before construction: the same frozen fixture module every other W10
 * parts page already reads).
 *
 * Three states, matched to the real size/context calls live on the product's own routes:
 *   - size="list" (34px title): the shape every list surface (dashboard, regulations, market,
 *     research, operations, community, admin/factors) renders through.
 *   - size="detail" (28px title): the shape every detail surface (regulation/[slug],
 *     market/[slug], research/[slug], operations/[slug]) renders through, title set to the frozen
 *     record's own full instrument title (unabridged, per the operator's "no analysis text is ever
 *     cut to fit a layout" ruling, proves the Anton title wraps rather than truncating on a long
 *     legal name).
 *   - the AUTH-FRAME variant (amendment 1, ruling 1, 2026-09-22): the shape rendered inside
 *     AuthFrame's right panel on /login, /signup and every onboarding step, size="detail",
 *     narrower column (380px, matching AuthFrame's own form width), the page's own real text
 *     ("Sign in"), no command bar (the artboard draws none there).
 *
 * The record id and its own date fact are shown in the header line above each state, per the
 * operator's fixture convention (id and date visible, not just consumed).
 *
 * F49 (parts-not-pages): this page imports Masthead and renders fixtures through it; no masthead
 * literal style is retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { Masthead } from "@/components/ui/Masthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { PartsPageHeading } from "@/components/admin/PartsPageHeading";
import { formatLocaleDate } from "@/lib/format";
import { nowFrom, renderNowIso } from "@/lib/render-now";
import {
  RECORD_GRADE_FIXTURE_ITEM_ID,
  RECORD_GRADE_FIXTURE_TITLE,
  RECORD_GRADE_FIXTURE_DATE_FACTS,
} from "@/components/ui/__fixtures__/record-grade-fixture";

export default async function AdminPartsMastheadPage() {
  await requirePlatformAdmin("/admin/parts/masthead");

  const nowIso = renderNowIso();
  const dateLabel = formatLocaleDate(nowFrom(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const effectiveDateFact = RECORD_GRADE_FIXTURE_DATE_FACTS.find((f) => f.slotKey === "effective_date");

  return (
    <>
      <PartsPageHeading>
        Masthead, 2 states, frozen real record (EC 391/2009, id {RECORD_GRADE_FIXTURE_ITEM_ID}), no database read
      </PartsPageHeading>
      <div style={{ padding: "16px 36px 80px", maxWidth: 1000, display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="masthead-gallery-list">
          <div style={{ padding: "10px 20px 0", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            size=&quot;list&quot; (34px title), id {RECORD_GRADE_FIXTURE_ITEM_ID}
            {effectiveDateFact ? ` · effective_date fact: ${effectiveDateFact.text}` : ""}
          </div>
          <Masthead
            title="Jason's brief"
            size="list"
            dateLabel={dateLabel}
            nowIso={nowIso}
            dek="1 item across 5 surfaces · scoped to the fixture record above"
            commandBar={{ itemCount: 1, scope: "masthead-fixture" }}
          />
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="masthead-gallery-detail-long-title">
          <div style={{ padding: "10px 20px 0", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            size=&quot;detail&quot; (28px title, unabridged), id {RECORD_GRADE_FIXTURE_ITEM_ID}
            {effectiveDateFact ? ` · effective_date fact: ${effectiveDateFact.text}` : ""}
          </div>
          <Masthead
            title={RECORD_GRADE_FIXTURE_TITLE}
            size="detail"
            dateLabel={dateLabel}
            nowIso={nowIso}
            dek="European Commission · EUR-Lex"
            eyebrowSuffix="Regulations / European Union"
          />
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="masthead-gallery-auth-frame">
          <div style={{ padding: "10px 20px 0", fontSize: "var(--fs-11)", color: "var(--ink-3)" }}>
            auth-frame variant (size=&quot;detail&quot;, 380px column, no command bar), /login&apos;s own
            real text, as rendered inside AuthFrame&apos;s right panel
          </div>
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ width: 380 }}>
              <Masthead title="Sign in" size="detail" dateLabel={dateLabel} nowIso={nowIso} />
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
