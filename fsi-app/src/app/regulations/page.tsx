/**
 * Regulations index (`/regulations`) — server component.
 *
 * Replaces the previous Dashboard.tsx delegation (case "regulations").
 * Fetches data via getResourcesOnly() (slim fetcher — only resources +
 * overrides, no changelog/disputes/xrefs/supersessions/synopses) and
 * composes:
 *   - <EditorialMasthead> with title="Regulations", meta="<n> tracked · <j>
 *     jurisdictions · last sync ~"
 *   - <DashboardHero> 4-up tile strip in the masthead's belowSlot
 *   - <RegulationsSurface> client component for AI bar, search, chip
 *     filters, and the 4-column priority kanban.
 *
 * Layout matches design_handoff_2026-04/preview/regulations.html.
 */

import { getResourcesOnly } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { DashboardHero } from "@/components/home/DashboardHero";
import { RegulationsSurface } from "@/components/regulations/RegulationsSurface";

export default async function RegulationsPage() {
  const t0 = Date.now();
  const data = await getResourcesOnly();
  console.log(`[perf] /regulations data ${Date.now() - t0}ms`);

  const jurisdictionsCount = new Set(
    data.resources.map((r) => r.jurisdiction || "global")
  ).size;
  // No real "last sync" timestamp on the data shape today — placeholder
  // copy aligns with the design preview ("last sync 4 min ago"). Replace
  // with workspace.last_sync once that field surfaces from Supabase.
  const meta = `${data.resources.length} regulations tracked · ${jurisdictionsCount} jurisdictions · last sync 4 min ago`;

  return (
    <>
      <EditorialMasthead
        title="Regulations"
        meta={meta}
        belowSlot={<DashboardHero resources={data.resources} />}
      />
      <RegulationsSurface
        initialResources={data.resources}
        initialArchived={data.archived}
        initialOverrides={data.overrides}
      />
    </>
  );
}
