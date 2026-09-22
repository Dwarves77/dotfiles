/**
 * /admin/parts: the parts index (lane w10-factcard-b, 2026-09-20; Amendment 1 section B.2).
 *
 * "Fixture picture: /admin/parts. One home for every part lane: a platform-admin route (same guard
 * and frame as the other /admin routes; operator ruling 7 puts admin routes inside the program) with
 * an index page listing parts and one page per part." This page is the index. One part exists today
 * (FactCard); later part lanes add a row each here and their own page under /admin/parts/<slug>.
 *
 * NO DATABASE READ (brief, verbatim). The index is a static list of part entries, not a query.
 *
 * F49 (parts-not-pages): this page imports PartsList (src/components/admin/PartsList.tsx) rather
 * than retyping any part's literal shell styles here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { PartsList, type PartEntry } from "@/components/admin/PartsList";

const PARTS: PartEntry[] = [
  {
    slug: "fact-card",
    name: "FactCard",
    summary: "The one part for a sourced claim: kind band, figure lead, claim, provenance column. Nine kinds, three forms, a density=\"matrix\" variant for the operations panel.",
  },
  {
    slug: "item-group",
    name: "ItemGroup",
    summary: "Wraps fact cards inside an S-section: band pill header, up to 4 visible cards then an \"N more facts\" disclosure, and an optional ACTION strip.",
  },
  {
    slug: "action-card",
    name: "ActionCard",
    summary: "The merged detail-page card (panel 21b): pill row, action row, EXPOSURE, TIMELINE with its callout. Replaces the three separate header/exposure/timeline cards.",
  },
  {
    slug: "section-index",
    name: "SectionIndex",
    summary: "The detail-page section strip: Sn plus a short name that never truncates, the Summary | Full brief depth switch at its right end, no standalone switch row.",
  },
];

export default async function AdminPartsIndexPage() {
  await requirePlatformAdmin("/admin/parts");

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="Parts"
        meta={`${PARTS.length} part${PARTS.length === 1 ? "" : "s"} · fixture sign-off pages, no database read`}
      />
      <div style={{ padding: "28px 36px 80px" }}>
        <PartsList parts={PARTS} />
      </div>
    </>
  );
}
