/**
 * Operations item detail (`/operations/[slug]`) — server component.
 *
 * Cloned from /research/[slug]/page.tsx; adapted for regional_data items.
 * Differences from the research page:
 *   - Back-link points to /operations (not /research).
 *   - Related items selected by jurisdiction match (not theme), falling back
 *     to same source.
 *   - Matrix eligibility checked server-side via checkMatrixEligibility and
 *     passed to OperationsDetailSurface as a prop.
 *   - Eyebrow label: "Operations" (not "Research").
 *
 * Slug resolves by legacy_id OR uuid (same pattern as /research/[slug]).
 * UUID → legacy_id redirect (307) when the URL is a raw uuid and the row
 * has a legacy_id.
 *
 * Section data: fetched via fetchIntelligenceItemSections (reused, not
 * reimplemented). Passed to OperationsDetailSurface which renders the 8
 * Operations sections, gating S3/S4 on the matrix result.
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): every
 * read this page issues (matrix eligibility, related-items, source fetch
 * status, connections lookup) is item-scoped and org-independent, so the
 * whole bundle runs inside ONE cached, parallel load via loadDetail
 * (src/lib/detail/load-detail.ts) — no loadViewerScoped: operations has
 * nothing org-scoped beyond the always-on relevance lens.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { buildResourceLookup } from "@/lib/connections/resource-lookup";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { fetchWatchMembership, lookupWatchMembership } from "@/lib/watchlist/membership";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { OperationsDetailSurface } from "@/components/operations/OperationsDetailSurface";
import { checkMatrixEligibility } from "@/lib/agent/formats/operations-matrix";
import type { MatrixEligibility } from "@/lib/agent/formats/operations-matrix";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Related items cap.
const RELATED_LIMIT = 5;

interface RelatedRow {
  id: string;
  legacy_id: string | null;
  title: string;
  summary: string | null;
  added_date: string | null;
  jurisdictions: string[] | null;
  source_id: string | null;
  source: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
}

function pickRelated(row: RelatedRow): {
  id: string;
  title: string;
  summary: string | null;
  sourceName: string | null;
  addedDate: string | null;
} {
  const src = Array.isArray(row.source) ? row.source[0] : row.source;
  return {
    id: row.legacy_id || row.id,
    title: row.title,
    summary: row.summary,
    sourceName: src?.name ?? null,
    addedDate: row.added_date,
  };
}

interface ItemScoped {
  resourceLookup: Awaited<ReturnType<typeof buildResourceLookup>>;
  matrixEligibility: MatrixEligibility | undefined;
  related: ReturnType<typeof pickRelated>[];
  relatedReason: "jurisdiction" | "source" | "none";
  sourceFetchStatus: string | null;
}

export default async function OperationsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect (same as /research/[slug]). Must resolve (or fall
  // through) BEFORE fetchIntelligenceItem — cannot join loadDetail's
  // parallel bundle.
  let redirectTo: string | null = null;
  if (UUID_RE.test(id)) {
    try {
      const supabase = getServiceSupabase();
      const { data: byId } = await supabase
        .from("intelligence_items")
        .select("legacy_id")
        .eq("id", id)
        .maybeSingle();
      if (byId?.legacy_id) {
        redirectTo = `/operations/${encodeURIComponent(byId.legacy_id)}`;
      }
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid below.
    }
  }
  if (redirectTo) redirect(redirectTo);

  // PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (2)): the viewer's
  // watch membership for THIS item shares no data dependency with loadDetail — id (already resolved
  // above, and provably equal to the eventual result.resource.id — see the same note in
  // regulations/[slug]/page.tsx) is all it needs, plus the viewer's userId/orgId.
  // resolveServerBootstrap() is React.cache()-scoped, reusing the root layout's own request-scoped
  // result (no second Supabase round trip).
  const watchMembershipPromise = (async () => {
    const bootstrap = await resolveServerBootstrap();
    const membership = await fetchWatchMembership(getServiceSupabase(), {
      userId: bootstrap.user?.id ?? null,
      orgId: bootstrap.orgId,
      itemType: "operations",
      itemIds: [id],
    });
    return lookupWatchMembership(membership, id);
  })();

  const [result, watchEntry] = await Promise.all([
    loadDetail<ItemScoped>({
      surface: "operations",
      id,
      // Item-scoped, org-independent: connections lookup, matrix eligibility,
      // jurisdiction/source-matched related items, and the source's fetch
      // status. Cached — shared across every org that views this item.
      loadItemScoped: async ({ supabase, resource, connections, supersessions }) => {
        const relatedIds = Array.from(
          new Set<string>([
            ...connections.map((c) => c.id),
            ...supersessions.flatMap((s) => [s.old, s.new]),
          ])
        ).filter(Boolean);

        const matrixPromise: Promise<MatrixEligibility | undefined> = checkMatrixEligibility(supabase, {
          jurisdictions: resource.jurisdiction ? [resource.jurisdiction] : [],
          jurisdiction: resource.jurisdiction ?? null,
        }).catch(() => undefined);

        // Related items — strategy:
        //   1. jurisdiction match on other active regional_data rows (cap 5).
        //   2. same-source fallback when (1) yields nothing.
        //   3. [] when neither yields anything.
        const relatedPromise: Promise<{
          related: ReturnType<typeof pickRelated>[];
          relatedReason: ItemScoped["relatedReason"];
          sourceFetchStatus: string | null;
        }> = (async () => {
          let related: ReturnType<typeof pickRelated>[] = [];
          let relatedReason: ItemScoped["relatedReason"] = "none";
          let sourceFetchStatus: string | null = null;
          try {
            const isUuid = UUID_RE.test(id);
            const orExpr = isUuid ? `legacy_id.eq.${id},id.eq.${id}` : `legacy_id.eq.${id}`;
            const { data: self } = await supabase
              .from("intelligence_items")
              .select("id, jurisdictions, source_id")
              .or(orExpr)
              .maybeSingle();

            if (self) {
              if (self.source_id) {
                const { data: srcMeta } = await supabase
                  .from("sources")
                  .select("fetch_status")
                  .eq("id", self.source_id)
                  .maybeSingle();
                sourceFetchStatus =
                  (srcMeta as { fetch_status?: string | null } | null)?.fetch_status ?? null;
              }

              const selfJurisdictions: string[] = Array.isArray(self.jurisdictions)
                ? self.jurisdictions
                : resource.jurisdiction
                ? [resource.jurisdiction]
                : [];

              if (selfJurisdictions.length > 0) {
                const { data: jurRows } = await supabase
                  .from("intelligence_items")
                  .select(
                    "id, legacy_id, title, summary, added_date, jurisdictions, source_id, source:sources(id, name)"
                  )
                  .contains("jurisdictions", selfJurisdictions)
                  .eq("item_type", "regional_data")
                  .eq("is_archived", false)
                  .eq("provenance_status", "verified")
                  .neq("id", self.id)
                  .order("added_date", { ascending: false })
                  .limit(RELATED_LIMIT);
                if (jurRows && jurRows.length > 0) {
                  related = (jurRows as unknown as RelatedRow[]).map(pickRelated);
                  relatedReason = "jurisdiction";
                }
              }

              if (related.length === 0 && self.source_id) {
                const { data: srcRows } = await supabase
                  .from("intelligence_items")
                  .select(
                    "id, legacy_id, title, summary, added_date, jurisdictions, source_id, source:sources(id, name)"
                  )
                  .eq("source_id", self.source_id)
                  .eq("item_type", "regional_data")
                  .eq("is_archived", false)
                  .eq("provenance_status", "verified")
                  .neq("id", self.id)
                  .order("added_date", { ascending: false })
                  .limit(RELATED_LIMIT);
                if (srcRows && srcRows.length > 0) {
                  related = (srcRows as unknown as RelatedRow[]).map(pickRelated);
                  relatedReason = "source";
                }
              }
            }
          } catch {
            // Soft-fail — surface renders empty state.
          }
          return { related, relatedReason, sourceFetchStatus };
        })();

        const [resourceLookup, matrixEligibility, relatedResult] = await Promise.all([
          buildResourceLookup(supabase, relatedIds),
          matrixPromise,
          relatedPromise,
        ]);

        return {
          resourceLookup,
          matrixEligibility,
          related: relatedResult.related,
          relatedReason: relatedResult.relatedReason,
          sourceFetchStatus: relatedResult.sourceFetchStatus,
        };
      },
    }),
    watchMembershipPromise,
  ]);

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11) — see regulations/[slug]
  // for the full rationale; checked inside loadDetail via canonicalSurface.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const matrixEligibility = result.itemScoped?.matrixEligibility;
  const related = result.itemScoped?.related ?? [];
  const relatedReason = result.itemScoped?.relatedReason ?? "none";
  const sourceFetchStatus = result.itemScoped?.sourceFetchStatus ?? null;

  console.log(`[perf] /operations/${id} data ${result.elapsedMs}ms`);

  // Masthead meta: source name + published date.
  const metaParts = [
    r.sourceName,
    r.added
      ? `Published ${new Date(r.added).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* Back-link — points to /operations, not /research. Lane MOBILE-2, 2026-09-03 sweep: 32px
          side padding had no responsive step-down (same shape as the header padding fix item 1
          addresses on Regulations) — --cl-detail-pad-x (globals.css) steps to 16px at <=767px. */}
      <div style={{ paddingTop: 10, paddingLeft: "var(--cl-detail-pad-x)", paddingRight: "var(--cl-detail-pad-x)" }}>
        <Link
          href="/operations"
          prefetch={false}
          style={{
            color: "var(--color-text-muted, var(--muted))",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Operations
        </Link>
      </div>
      <EditorialMasthead
        eyebrow="Operations"
        title={r.title}
        meta={metaParts.join(" · ")}
      />
      <OperationsDetailSurface
        resource={r}
        related={related}
        relatedReason={relatedReason}
        sections={sections}
        matrixEligibility={matrixEligibility}
        sourceFetchStatus={sourceFetchStatus}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        initialWatched={watchEntry.watched}
        initialTeamWatched={watchEntry.teamWatched}
        initialTeamAvailable={watchEntry.teamAvailable}
      />
    </>
  );
}
