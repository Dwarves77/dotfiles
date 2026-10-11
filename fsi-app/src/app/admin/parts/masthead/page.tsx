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
