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
