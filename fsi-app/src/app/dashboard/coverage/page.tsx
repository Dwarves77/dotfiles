/**
 * Coverage (`/dashboard/coverage`): the generated Coverage surface, server component (lane COV-1, 2026-10-08; spec 00 section 4).
 *
 * Reachable from each intelligence surface's coverage denominator line and from the portfolio-add flow; not in the
 * navigation, because it is not a sixth customer surface (PI-1). Every cell has a static URL: `?data_class=`,
 * `?geography=`, `?mode=` (all default to "all"), so a link names exactly the view it opens.
 *
 * The matrix is read through the cached loader (src/lib/coverage/matrix-data.ts), which is the first caller of
 * getCoverageIndex / getCoverageEntries on a customer path. The view for the requested axes is built HERE, on the
 * server, so the client receives only the rows it draws and the version facts, never the whole cell list.
 *
 * Authenticated like every page not on the public list. force-dynamic because the axes arrive in the query string.
 */

import { CoveragePageView } from "@/components/coverage/CoveragePageView";
import { getCoverageMatrix } from "@/lib/coverage/matrix-data";
import { buildCoverageView, parseCoverageQuery } from "@/lib/coverage/coverage-matrix.mjs";
import { formatLocaleDate } from "@/lib/format";
import { renderNowIso } from "@/lib/render-now";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coverage",
  description: "What the platform watches and what it does not, by surface, place and mode.",
};

export default async function CoveragePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = parseCoverageQuery(params);
  const { matrix, error } = await getCoverageMatrix();
  const nowIso = renderNowIso();
  // HYDRATION-59: one server instant, UTC-pinned, so the masthead's date and week number agree with the server render.
  const dateLabel = formatLocaleDate(new Date(nowIso), { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  return <CoveragePageView matrix={matrix} view={buildCoverageView(matrix, query)} query={query} error={error} dateLabel={dateLabel} nowIso={nowIso} />;
}
