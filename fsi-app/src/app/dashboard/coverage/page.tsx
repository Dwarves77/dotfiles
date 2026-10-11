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
