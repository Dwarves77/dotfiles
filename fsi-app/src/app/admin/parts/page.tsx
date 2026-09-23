/**
 * /admin/parts: the parts index (lane w10-factcard-b, 2026-09-20; Amendment 1 section B.2;
 * re-derived lane W10-ListRow-2, 2026-09-23, remediation-discipline category 48).
 *
 * "Fixture picture: /admin/parts. One home for every part lane: a platform-admin route (same guard
 * and frame as the other /admin routes; operator ruling 7 puts admin routes inside the program) with
 * an index page listing parts and one page per part." This page is the index.
 *
 * REGISTRY IS A DIRECTORY (F51 check 1 / RD-75). The entry list is no longer a hand-written array
 * literal in this file -- that was a shared append point two part lanes both edited the same evening,
 * which is exactly the merge conflict that stopped the W10-ListRow push. Entries are now DERIVED at
 * request time from `part.json` descriptors under each `src/app/admin/parts/<slug>/` folder
 * (`src/lib/admin/parts-registry.ts::loadPartEntries`), the same "registry is a directory, one entry
 * one file" pattern this build already proved for harness families
 * (scripts/harness-runs/family-registry.mjs) and loop hops
 * (.discipline/governance/loop-manifest.mjs's loadLoopHops). Adding a new part lane means adding a new
 * `part.json` file under its own folder -- never an edit to this file.
 *
 * NO DATABASE READ (brief, verbatim). The index reads part.json files off the local filesystem, not a
 * query.
 *
 * F49 (parts-not-pages): this page imports PartsList (src/components/admin/PartsList.tsx) rather
 * than retyping any part's literal shell styles here.
 *
 * Platform-layer surface, not customer-facing (caros-ledge-platform-intent Value Delivery Check
 * applies; see this lane's final report).
 */
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { PageMasthead } from "@/components/shell/PageMasthead";
import { PartsList } from "@/components/admin/PartsList";
import { loadPartEntries } from "@/lib/admin/parts-registry";

export default async function AdminPartsIndexPage() {
  await requirePlatformAdmin("/admin/parts");

  const parts = loadPartEntries();

  return (
    <>
      <PageMasthead
        eyebrow="Platform admin · parts"
        title="Parts"
        meta={`${parts.length} part${parts.length === 1 ? "" : "s"} · fixture sign-off pages, no database read`}
      />
      <div style={{ padding: "28px 36px 80px" }}>
        <PartsList parts={parts} />
      </div>
    </>
  );
}
