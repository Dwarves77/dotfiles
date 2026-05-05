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
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { fetchIntelligenceItem } from "@/lib/supabase-server";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import { JURISDICTIONS } from "@/lib/constants";

// Note: previous `export const revalidate = 60` was a no-op —
// fetchIntelligenceItem doesn't read cookies, but the lookup query path
// below uses createClient with anon key. Keeping the page dynamic for
// honesty; ISR refactor tracked in docs/PERF-WAVE-2.md.

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  const detail = await fetchIntelligenceItem(id);
  if (!detail) {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, xrefIds, refByIds } = detail;

  // Targeted lookup for related-items list — only fetch the titles +
  // priorities for the cross-referenced and superseded items, not the
  // full workspace payload. xrefIds/refByIds/supersession ids are UI-side
  // ids (legacy_id || uuid), so we look up each via legacy_id OR id.
  const resourceLookup: Record<string, { id: string; title: string; priority: string }> = {};
  const relatedIds = Array.from(
    new Set<string>([
      ...xrefIds,
      ...refByIds,
      ...supersessions.flatMap((s) => [s.old, s.new]),
    ])
  ).filter(Boolean);

  if (
    relatedIds.length > 0 &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidIds = relatedIds.filter((rid) => uuidRe.test(rid));
      const legacyIds = relatedIds.filter((rid) => !uuidRe.test(rid));

      const queries = [];
      if (legacyIds.length > 0) {
        queries.push(
          supabase
            .from("intelligence_items")
            .select("id, legacy_id, title, priority")
            .in("legacy_id", legacyIds)
        );
      }
      if (uuidIds.length > 0) {
        queries.push(
          supabase
            .from("intelligence_items")
            .select("id, legacy_id, title, priority")
            .in("id", uuidIds)
        );
      }
      const results = await Promise.all(queries);
      for (const result of results) {
        for (const row of (result.data ?? []) as Array<{
          id: string;
          legacy_id: string | null;
          title: string;
          priority: string;
        }>) {
          const uiId: string = row.legacy_id || row.id;
          resourceLookup[uiId] = {
            id: uiId,
            title: row.title,
            priority: row.priority,
          };
        }
      }
    } catch {
      // Soft-fail — RegulationDetailSurface tolerates a missing lookup
      // by falling back to raw ids in the related-items list.
    }
  }

  const jurisLabel =
    JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label || r.jurisdiction || "Global";

  const effective = r.complianceDeadline
    ? `Effective ${formatDate(r.complianceDeadline)}`
    : null;
  const reviewed = r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : null;
  const metaParts = [r.id, effective, reviewed].filter(Boolean) as string[];

  console.log(`[perf] /regulations/${id} data ${Date.now() - t0}ms`);

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
