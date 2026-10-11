import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionCard } from "@/components/ui/SectionCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  RECORD_GRADE_FIXTURE_TITLE,
  RECORD_GRADE_FIXTURE_OTHER_FACTS,
} from "@/components/ui/__fixtures__/record-grade-fixture";

export default async function AdminPartsSectionHeaderPage() {
  await requirePlatformAdmin("/admin/parts/section-header");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="SectionHeader"
        meta="3 states · frozen real record (EC 391/2009) · no database read"
      />
      <div style={{ padding: "28px 36px 80px", maxWidth: 900 }}>
        <SectionCard padding="0" style={{ margin: "0 0 24px", overflow: "hidden" }} dataAudit="section-header-gallery-summary">
          <SectionHeader index="S1" title="Summary" meta="Generated · 30-second read" />
          <div style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: 0 }}>
              The regulation surface&apos;s Summary section head shape: ordinal + title + right meta.
            </p>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ margin: "0 0 24px", overflow: "hidden" }} dataAudit="section-header-gallery-sources">
          <SectionHeader
            title="Sources"
            meta={`${RECORD_GRADE_FIXTURE_OTHER_FACTS.length} · tier = provenance, never urgency`}
          />
          <div style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: 0 }}>
              No ordinal (honest omission, no per-surface ordinal source for this call site yet) - title
              plus right meta only.
            </p>
          </div>
        </SectionCard>

        <SectionCard padding="0" style={{ overflow: "hidden" }} dataAudit="section-header-gallery-long-title">
          <SectionHeader title={RECORD_GRADE_FIXTURE_TITLE} />
          <div style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--ink-3)", margin: 0 }}>
              The frozen record&apos;s own full instrument title, unabridged - the layout wraps, the
              title is never cut to fit.
            </p>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
