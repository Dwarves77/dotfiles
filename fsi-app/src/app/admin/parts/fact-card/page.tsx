import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { FactCardGallery } from "@/components/admin/FactCardGallery";
import { DEFAULT_DENSITY_FIXTURES, MATRIX_FIXTURES } from "@/lib/detail/fact-card-fixtures";
import { PANEL_21C_GROUPS } from "@/lib/detail/fact-card-panel21c-fixture";

export default async function AdminPartsFactCardPage() {
  await requirePlatformAdmin("/admin/parts/fact-card");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="FactCard"
        meta={`panel 21c · ${DEFAULT_DENSITY_FIXTURES.length} default-density variants · ${MATRIX_FIXTURES.length} density="matrix" variants · no database read`}
      />
      <div style={{ padding: "28px 36px 80px" }}>
        <FactCardGallery panelGroups={PANEL_21C_GROUPS} defaultFixtures={DEFAULT_DENSITY_FIXTURES} matrixFixtures={MATRIX_FIXTURES} />
      </div>
    </>
  );
}
