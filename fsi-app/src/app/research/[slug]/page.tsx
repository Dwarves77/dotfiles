/**
 * Research finding detail (`/research/[slug]`) — server component.
 *
 * Mirrors `/regulations/[slug]/page.tsx`:
 *   - Slug resolves item by `legacy_id || id` via loadDetail.
 *   - UUID → legacy_id redirect (307) when the URL is a raw uuid AND the
 *     row has a legacy_id, so old uuid links converge on the canonical
 *     human-readable slug.
 *   - Related findings selected server-side: items sharing the row's
 *     `theme` column when populated, falling back to items from the same
 *     source when theme is NULL. Capped at 5. CORRECTED 2026-08-30 (WO-25):
 *     `theme` is NULL on ALL 38 live Research-surface rows today, not "the
 *     majority" — the theme-match step is currently dead in practice, and
 *     the fallback is what every populated panel is actually running. See
 *     the inline comment above the related-items block below.
 *   - Theme-brief card (WO-25, flywheel U6 surfacing, 2026-08-30): a
 *     read-only, $0 join from this item's id into `connection_themes` /
 *     `theme_briefs` — an already-synthesized editorial brief for the
 *     graph-derived cluster this item belongs to, when one exists.
 *     Renders nothing when the item is in no cluster or the cluster has no
 *     brief yet (honest omission). See src/lib/research/theme-brief.mjs.
 *
 * Layout: EditorialMasthead at the top (matching the regulations detail
 * shape) + ResearchFindingDetailSurface below.
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): every
 * read this page issues (connections lookup, related-items, theme brief,
 * peers-strip entity) is item-scoped and org-independent, so the whole
 * bundle runs inside ONE cached, parallel load via loadDetail
 * (src/lib/detail/load-detail.ts) — no loadViewerScoped: research has
 * nothing org-scoped beyond the always-on relevance lens.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { buildResourceLookup } from "@/lib/connections/resource-lookup";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { fetchWatchMembership, lookupWatchMembership } from "@/lib/watchlist/membership";
import { selectThemeBriefForItem } from "@/lib/research/theme-brief.mjs";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { ResearchFindingDetailSurface } from "@/components/research/ResearchFindingDetailSurface";
import { PeersDiscussingStrip } from "@/components/shared/PeersDiscussingStrip";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Related-findings cap. Matches the dispatch spec ("up to 5").
const RELATED_LIMIT = 5;

interface RelatedRow {
  id: string;
  legacy_id: string | null;
  title: string;
  summary: string | null;
  added_date: string | null;
  theme: string | null;
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
  peersEntityId: string | null;
  related: ReturnType<typeof pickRelated>[];
  relatedReason: "theme" | "source" | "none";
  themeBrief: ReturnType<typeof selectThemeBriefForItem>;
}

export default async function ResearchFindingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect — same shape as /regulations/[slug]. Must resolve
  // (or fall through) BEFORE fetchIntelligenceItem — cannot join loadDetail's
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
        redirectTo = `/research/${encodeURIComponent(byId.legacy_id)}`;
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
      itemType: "research",
      itemIds: [id],
    });
    return lookupWatchMembership(membership, id);
  })();

  const [result, watchEntry] = await Promise.all([
    loadDetail<ItemScoped>({
      surface: "research",
      id,
      // Item-scoped, org-independent: connections lookup, theme/source-matched
      // related findings, the theme-brief card, and the peers-strip entity.
      // Cached — shared across every org that views this item.
      loadItemScoped: async ({ supabase, resource, connections, supersessions }) => {
        const relatedIds = Array.from(
          new Set<string>([
            ...connections.map((c) => c.id),
            ...supersessions.flatMap((s) => [s.old, s.new]),
          ])
        ).filter(Boolean);

        // Related findings + theme brief — strategy:
        //   1. theme match (STEP 1 IS DEAD IN PRACTICE today, WO-25, 2026-08-30 —
        //      0 of 38 live rows populate `theme`; kept for when it's backfilled).
        //   2. same-source fallback when (1) yields nothing.
        //   3. [] when neither yields anything.
        const relatedAndBriefPromise: Promise<{
          related: ReturnType<typeof pickRelated>[];
          relatedReason: ItemScoped["relatedReason"];
          themeBrief: ItemScoped["themeBrief"];
          peersEntityId: string | null;
        }> = (async () => {
          let related: ReturnType<typeof pickRelated>[] = [];
          let relatedReason: ItemScoped["relatedReason"] = "none";
          let themeBrief: ItemScoped["themeBrief"] = null;
          let peersEntityId: string | null = null;
          try {
            const isUuid = UUID_RE.test(id);
            const orExpr = isUuid ? `legacy_id.eq.${id},id.eq.${id}` : `legacy_id.eq.${id}`;
            const { data: self } = await supabase
              .from("intelligence_items")
              .select("id, theme, source_id, instrument_entity_id")
              .or(orExpr)
              .maybeSingle();

            if (self) {
              peersEntityId = self.instrument_entity_id ?? null;

              if (self.theme) {
                const { data: themeRows } = await supabase
                  .from("intelligence_items")
                  .select(
                    "id, legacy_id, title, summary, added_date, theme, source_id, source:sources(id, name)"
                  )
                  .eq("theme", self.theme)
                  .eq("is_archived", false)
                  .eq("provenance_status", "verified")
                  .neq("id", self.id)
                  .order("added_date", { ascending: false })
                  .limit(RELATED_LIMIT);
                if (themeRows && themeRows.length > 0) {
                  related = (themeRows as unknown as RelatedRow[]).map(pickRelated);
                  relatedReason = "theme";
                }
              }

              if (related.length === 0 && self.source_id) {
                const { data: srcRows } = await supabase
                  .from("intelligence_items")
                  .select(
                    "id, legacy_id, title, summary, added_date, theme, source_id, source:sources(id, name)"
                  )
                  .eq("source_id", self.source_id)
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

              // Theme brief (WO-25, flywheel U6): connection_themes is small
              // (9 rows live) and public-read — read it all and match
              // in-process (same shape api/admin/themes/route.ts uses). A
              // second query for the theme_briefs row only runs when self.id
              // is actually a member of a live theme.
              const { data: themeRows } = await supabase
                .from("connection_themes")
                .select("id, member_ids");
              const matchedTheme =
                themeRows && themeRows.length > 0
                  ? (themeRows as { id: string; member_ids: string[] }[]).find(
                      (t) => Array.isArray(t.member_ids) && t.member_ids.includes(self.id)
                    )
                  : null;
              if (matchedTheme) {
                const { data: briefRows } = await supabase
                  .from("theme_briefs")
                  .select("theme_id, title, brief_md, member_hash, generated_at")
                  .eq("theme_id", matchedTheme.id)
                  .limit(1);
                themeBrief = selectThemeBriefForItem(self.id, [matchedTheme], briefRows || []);
              }
            }
          } catch {
            // Soft-fail — surface renders the empty state (no related findings, no theme-brief card).
          }
          return { related, relatedReason, themeBrief, peersEntityId };
        })();

        const [resourceLookup, relatedAndBrief] = await Promise.all([
          buildResourceLookup(supabase, relatedIds),
          relatedAndBriefPromise,
        ]);

        return {
          resourceLookup,
          peersEntityId: relatedAndBrief.peersEntityId,
          related: relatedAndBrief.related,
          relatedReason: relatedAndBrief.relatedReason,
          themeBrief: relatedAndBrief.themeBrief,
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
  const peersEntityId = result.itemScoped?.peersEntityId ?? null;
  const related = result.itemScoped?.related ?? [];
  const relatedReason = result.itemScoped?.relatedReason ?? "none";
  const themeBrief = result.itemScoped?.themeBrief ?? null;

  console.log(`[perf] /research/${id} data ${result.elapsedMs}ms`);

  // Masthead meta: severity is derived client-side inside the surface to
  // keep severity-vocab in one place; here we surface the source name +
  // added date, paralleling the "Effective · Reviewed" pattern on
  // /regulations.
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
      {/* Back-link — lane MOBILE-2, 2026-09-03 sweep: 32px side padding had no responsive step-down
          (same shape as the header padding fix item 1 addresses on Regulations) —
          --cl-detail-pad-x (globals.css) steps to 16px at <=767px. */}
      <div style={{ paddingTop: 10, paddingLeft: "var(--cl-detail-pad-x)", paddingRight: "var(--cl-detail-pad-x)" }}>
        <Link
          href="/research"
          prefetch={false}
          style={{
            color: "var(--color-text-muted, var(--muted))",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Research
        </Link>
      </div>
      <EditorialMasthead
        eyebrow="Research"
        title={r.title}
        meta={metaParts.join(" · ")}
      />
      <ResearchFindingDetailSurface
        resource={r}
        related={related}
        relatedReason={relatedReason}
        sections={sections}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        themeBrief={themeBrief}
        initialWatched={watchEntry.watched}
        initialTeamWatched={watchEntry.teamWatched}
        initialTeamAvailable={watchEntry.teamAvailable}
      />
      <PeersDiscussingStrip entityId={peersEntityId} />
    </>
  );
}
