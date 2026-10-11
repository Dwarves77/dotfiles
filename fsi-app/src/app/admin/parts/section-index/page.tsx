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
