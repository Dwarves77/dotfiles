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

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getResourcesOnly } from "@/lib/data";
import { APP_DATA_TAG } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { DashboardHero } from "@/components/home/DashboardHero";
import { RegulationsSurface } from "@/components/regulations/RegulationsSurface";

/**
 * Hotfix-3 Fix #3 (2026-05-07): platform-total count is workspace-agnostic
 * and identical for every viewer until items are archived. Cached for 60s
 * with the same APP_DATA_TAG used by getAppData — staged-update approval
 * and workspace-override mutation routes already call
 * revalidateTag(APP_DATA_TAG) so this stays consistent without a new tag.
 * Per audit doc § 4: this was the one server-side wart on /regulations.
 */
const cachedPlatformTotal = unstable_cache(
  async (): Promise<number | null> => {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return null;
    }
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { count } = await supabase
        .from("intelligence_items")
        .select("id", { count: "exact", head: true })
        .eq("domain", 1)
        .eq("is_archived", false);
      return typeof count === "number" ? count : null;
    } catch {
      // soft-fail: heading just shows the matched-count without tooltip
      return null;
    }
  },
  ["regulations-platform-total-v1"],
  { revalidate: 60, tags: [APP_DATA_TAG] }
);

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string }>;
}) {
  const t0 = Date.now();
  const { priority: priorityParam } = await searchParams;
  const data = await getResourcesOnly();

  // Resolve the platform-total regulation count for the count tooltip.
  // The audit flagged the gap between "123 REGULATIONS" (sector-filtered)
  // and "182 regulations tracked" (platform total) — we surface both
  // numbers via a tooltip on the count heading. Cached via unstable_cache
  // (60s TTL, APP_DATA_TAG revalidation) per Hotfix-3 Fix #3.
  const platformTotal = await cachedPlatformTotal();

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
        platformTotal={platformTotal}
        initialPriorityFilter={priorityParam ?? null}
      />
    </>
  );
}
