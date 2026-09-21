/**
 * /admin/parts/fact-card: the FactCard sign-off page (lane w10-factcard-b, 2026-09-20;
 * Amendment 1 section B.2): "The part page renders, from static fixture models and NO database
 * read: every one of the nine kinds, every form, the no-lead case, density="matrix", a long claim,
 * and a card with no provenance."
 *
 * NO DATABASE READ. Every model on this page comes from src/lib/detail/fact-card-fixtures.ts,
 * hand-built fixture data - not a query.
 *
 * F49 (parts-not-pages): this page imports FactCard (@/components/ui/FactCard) and renders each
 * fixture through it; no part's literal shell styles are retyped here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
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
