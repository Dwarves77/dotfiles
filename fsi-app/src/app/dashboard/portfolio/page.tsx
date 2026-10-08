/**
 * /dashboard/portfolio: the workspace's portfolios (lane S8-D, 2026-10-07; spec 00 section 5; migration 362).
 *
 * A workspace view UNDER the dashboard, never a sixth nav entry (PI-1). Per-user by definition (the org is
 * resolved from the session cookie), so it can never be prerendered: force-dynamic, for the same reason
 * /watchlist is. Reads fail soft: a signed-out reader gets the sign-in note, a read failure (including the
 * tables not existing before migration 362 is applied) gets an honest unavailable note, never a crash.
 */

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
