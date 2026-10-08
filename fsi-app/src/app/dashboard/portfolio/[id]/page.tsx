/**
 * /dashboard/portfolio/[id]: one portfolio (lane S8-D, 2026-10-07; spec 00 section 5; migration 362).
 *
 * The members are read and hydrated on the server (src/lib/portfolio/read.ts) and the roll-ups are computed
 * there at read time from held data only; the client view only draws them. A portfolio id from another
 * workspace is a 404, exactly like a missing one: the read filters by the org resolved from the session.
 * Per-user, so force-dynamic. A signed-out reader is sent to sign in; a read failure shows the same
 * honest unavailable note as the index.
 */

import { notFound, redirect } from "next/navigation";
import { PortfolioDetailView } from "@/components/portfolio/PortfolioDetailView";
import { PortfolioIndexView } from "@/components/portfolio/PortfolioIndexView";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getServiceSupabase } from "@/lib/supabase-service";
import { readPortfolioDetail } from "@/lib/portfolio/read";
import { renderNowIso } from "@/lib/render-now";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio",
  description: "What one portfolio holds, and what needs attention first.",
};

/** The read, with failures turned into data so no JSX is built inside a try block. */
async function readDetail(orgId: string, id: string, nowIso: string) {
  try {
    const res = await readPortfolioDetail(getServiceSupabase(), orgId, id, new Date(nowIso));
    if (!res.ok) console.warn(`[portfolio] detail read failed: ${res.error}`);
    return res;
  } catch (e) {
    console.warn(`[portfolio] detail read threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export default async function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nowIso = renderNowIso();
  const orgId = await resolveOrgIdFromCookies();
  if (!orgId) redirect("/login");
  const res = await readDetail(orgId, id, nowIso);
  if (!res || !res.ok) return <PortfolioIndexView state="unavailable" portfolios={[]} nowIso={nowIso} />;
  if (!res.view) notFound();
  return <PortfolioDetailView view={res.view} nowIso={nowIso} />;
}
