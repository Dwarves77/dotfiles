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
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { jurisdictionCount, jurisdictionCountInBand } from "@/lib/map/jurisdiction-rollup";
import { countNoun, formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";

/**
 * The page's data read, with its own timing.
 *
 * DELIBERATELY NOT INLINE IN THE COMPONENT. `react-hooks/purity` flags `Date.now()` called
 * inside a component body (watchlist/page.tsx's header is the canonical rationale this repo
 * carries for the pattern). Hosting the timer in a plain async function keeps the observability
 * and drops the violation instead of suppressing it.
 */
async function loadMapPageData(searchParamsPromise: Promise<{ region?: string }>) {
  const t0 = Date.now();
  const [{ region: regionParam }, data, coverageGaps] = await Promise.all([
    searchParamsPromise,
    getListingsMapData(),
    getCoverageGaps(),
  ]);
  console.log(`[perf] /map data ${Date.now() - t0}ms`);
  return { regionParam, data, coverageGaps };
}

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
  const { regionParam, data, coverageGaps } = await loadMapPageData(searchParams);

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
      />
    </>
  );
}
