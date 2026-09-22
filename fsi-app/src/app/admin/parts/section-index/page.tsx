/**
 * /admin/parts/section-index: the SectionIndex sign-off page (lane W10-ActionCard-a, 2026-09-21,
 * operator review items 4 and 6). Renders `REGULATION_SECTION_INDEX` through the real
 * `SectionIndex` part, from static fixture data, NO database read.
 *
 * F49 (parts-not-pages): this page imports SectionIndex (via SectionIndexGallery) and renders the
 * fixture through it; no part's literal shell styles are retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { SectionIndexGallery } from "@/components/admin/SectionIndexGallery";
import { REGULATION_SECTION_INDEX } from "@/lib/detail/section-index-data";

export default async function AdminPartsSectionIndexPage() {
  await requirePlatformAdmin("/admin/parts/section-index");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="SectionIndex"
        meta={`${REGULATION_SECTION_INDEX.length} sections · no database read`}
      />
      <div style={{ padding: "28px 36px 80px", maxWidth: 900 }}>
        <SectionIndexGallery />
      </div>
    </>
  );
}
