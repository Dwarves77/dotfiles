/**
 * Regulation detail (`/regulations/[slug]`) — server component.
 *
 * The route segment is `[slug]` for back-compat with the existing
 * placeholder file. Functionally this serves the `[id]` route described
 * in the design handoff (TASKS.C); the param key is the only difference.
 * If the route segment is renamed to `[id]` in a follow-up, only this
 * file's destructure needs to change.
 *
 * Layout matches design_handoff_2026-04/preview/regulation-detail.html:
 *   - Editorial masthead with eyebrow ("Regulations · {jurisdiction}"),
 *     Anton title (the regulation name), and meta line (id · effective ·
 *     reviewed)
 *   - Hero card, 4-stat strip, tab bar, layout grid (handled by the
 *     RegulationDetailSurface client component)
 *
 * Data source: `fetchIntelligenceItem(id)` server-side, with seed
 * fallback if Supabase isn't reachable.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchIntelligenceItem } from "@/lib/supabase-server";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import { JURISDICTIONS } from "@/lib/constants";
import { getAppData } from "@/lib/data";

export const revalidate = 60;

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  const detail = await fetchIntelligenceItem(id);
  if (!detail) {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, xrefIds, refByIds } = detail;

  // Light lookup for related-items list — uses the workspace dataset
  // already cached by getAppData() so we don't N+1 to fetch each title.
  const all = await getAppData().catch(() => null);
  const resourceLookup: Record<string, { id: string; title: string; priority: string }> = {};
  if (all) {
    for (const x of [...all.resources, ...all.archived]) {
      resourceLookup[x.id] = { id: x.id, title: x.title, priority: x.priority };
    }
  }

  const jurisLabel =
    JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction || "Global";

  const effective = r.complianceDeadline
    ? `Effective ${formatDate(r.complianceDeadline)}`
    : null;
  const reviewed = r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : null;
  const metaParts = [r.id, effective, reviewed].filter(Boolean) as string[];

  return (
    <>
      <div style={{ padding: "10px 32px 0" }}>
        <Link
          href="/regulations"
          style={{
            color: "var(--muted)",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Regulations
        </Link>
      </div>
      <EditorialMasthead
        eyebrow={`Regulations · ${jurisLabel}`}
        title={r.title}
        meta={metaParts.join(" · ")}
      />
      <RegulationDetailSurface
        resource={r}
        changelog={changelog}
        dispute={dispute}
        supersessions={supersessions}
        xrefIds={xrefIds}
        refByIds={refByIds}
        resourceLookup={resourceLookup}
      />
    </>
  );
}

function formatDate(d: string): string {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
