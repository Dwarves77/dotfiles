/**
 * Map (`/map`) — server component.
 *
 * UI system handoff 2026-09-06 (docs/design/handoff-2026-09-06, README
 * screen 10 / artboard "Map"; lane uimapcomm): Masthead + command bar
 * (the frame convention, README §0.3), body from <MapPageView/> — see
 * that component's header for what it's assembled from.
 */

import { describeFallbackTrigger } from "@/lib/supabase-server";
import { getListingsMapData } from "@/lib/data";
import { getCoverageGaps } from "@/lib/coverage-gaps";
import { MapPageView } from "@/components/map/MapPageView";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { Masthead } from "@/components/ui/Masthead";
import { createSupabaseServerClient } from "@/lib/supabase-server-client";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { jurisdictionCount, jurisdictionCountInBand } from "@/lib/map/jurisdiction-rollup";
import { countNoun, formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";
import type { CommunityActivityRow } from "@/components/map/MapView";

export default async function MapRoute({
  searchParams,
}: {
  // `?region=us-ca` accepts any Tier 1 ISO sub-national or national code
  // (case-insensitive) and pre-filters the map + register to items whose
  // `jurisdictionIso[]` array contains that code. The `?region-filter=<id>`
  // link from the Coverage gaps card targets a different scope (region
  // group id, resolved client-side in MapPageView) and is untouched.
  searchParams: Promise<{ region?: string }>;
}) {
  const t0 = Date.now();
  // Phase 6 (2026-05-25): community activity by region, aggregated
  // top-level community_posts by community_groups.region; powers the
  // community-activity dot overlay on the map.
  const supabase = await createSupabaseServerClient();
  const [{ region: regionParam }, data, coverageGaps, communityActivity] = await Promise.all([
    searchParams,
    getListingsMapData(),
    getCoverageGaps(),
    fetchCommunityActivityByRegion(supabase),
  ]);
  console.log(`[perf] /map data ${Date.now() - t0}ms`);

  // COUNTS-61 (production defect, click-through audit 2026-09-08): both jurisdiction figures below
  // come from src/lib/map/jurisdiction-rollup.ts, the SAME module <MapPageView/> rolls its register
  // and its Immediate rail card up with. They used to be keyed here as `r.jurisdiction || "global"`
  // and there as `r.jurisdiction || getJurisdiction(r) || "global"`, which is why this masthead read
  // "6 jurisdictions live" over a register headed "8 jurisdictions", and "4 jurisdictions with
  // immediate items" beside a rail card reading "IMMEDIATE · 3 JURISDICTIONS". See that module.
  const regs = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);
  const liveJurisdictions = jurisdictionCount(regs);
  const immediateJurisdictions = jurisdictionCountInBand(regs, "immediate");

  // HYDRATION-59: one server instant (render-now.ts), UTC-pinned, and threaded into <Masthead/>
  // so its VOL week number is computed from the SAME instant this label is — never from the
  // browser's own clock during hydration.
  const nowIso = renderNowIso();
  const dateStr = formatLocaleDate(new Date(nowIso), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <SystemErrorBanner message={data._error} reason={describeFallbackTrigger(data._fallbackTrigger)} />
      <div style={{ padding: "20px 40px 0" }}>
        <Masthead
          title="Regulatory map"
          dateLabel={dateStr}
          nowIso={nowIso}
          dek={
            <>
              {countNoun(liveJurisdictions, "jurisdiction")} live · {countNoun(regs.length, "active item")} ·{" "}
              {countNoun(immediateJurisdictions, "jurisdiction")} with immediate items · marker size = item
              count · colour = highest band present
            </>
          }
          commandBar={{
            itemCount: data.resources.length,
            scope: "map",
            placeholder: 'Search a jurisdiction — or ask "where are my immediate items?"',
          }}
        />
      </div>
      <MapPageView
        resources={data.resources}
        coverageGaps={coverageGaps}
        initialRegionFilter={regionParam ?? null}
        communityActivity={communityActivity}
      />
    </>
  );
}

// Aggregate top-level community posts by their group's region. RLS
// scopes the visible posts to the caller's workspace; service-role
// is not used here. Returns empty array on RLS-denied (anon / not
// signed in) or query failure so the map still renders without dots.
async function fetchCommunityActivityByRegion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<CommunityActivityRow[]> {
  try {
    const { data, error } = await supabase
      .from("community_posts")
      .select("group_id, community_groups!inner(region)")
      .is("parent_post_id", null)
      .limit(1000);
    if (error || !data) return [];
    const counts = new Map<string, number>();
    for (const row of data as Array<{ community_groups: { region: string } | { region: string }[] | null }>) {
      const cg = Array.isArray(row.community_groups)
        ? row.community_groups[0]
        : row.community_groups;
      if (!cg?.region) continue;
      counts.set(cg.region, (counts.get(cg.region) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([regionCode, count]) => ({ regionCode, count }));
  } catch {
    return [];
  }
}
