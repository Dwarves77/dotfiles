import { PortfolioIndexView } from "@/components/portfolio/PortfolioIndexView";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { readPortfolioIndex } from "@/lib/portfolio/read";
import { renderNowIso } from "@/lib/render-now";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolios",
  description: "The items, corridors and entities your workspace holds together.",
};

/** The read, with failures turned into data so no JSX is built inside a try block. */
async function readIndex(orgId: string) {
  try {
    const res = await readPortfolioIndex(getServiceSupabase(), orgId);
    if (!res.ok) console.warn(`[portfolio] index read failed: ${res.error}`);
    return res;
  } catch (e) {
    console.warn(`[portfolio] index read threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export default async function PortfolioIndexPage() {
  const nowIso = renderNowIso();
  const orgId = await resolveOrgIdFromCookies();
  if (!orgId) return <PortfolioIndexView state="signed-out" portfolios={[]} nowIso={nowIso} />;
  const res = await readIndex(orgId);
  if (!res || !res.ok) return <PortfolioIndexView state="unavailable" portfolios={[]} nowIso={nowIso} />;
  return <PortfolioIndexView state="ok" portfolios={res.portfolios} countsTruncated={res.countsTruncated} nowIso={nowIso} />;
}
