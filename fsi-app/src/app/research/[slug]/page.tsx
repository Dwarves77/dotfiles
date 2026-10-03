/**
 * Research finding detail (`/research/[slug]`) - server component.
 *
 * Mirrors `/regulations/[slug]/page.tsx`:
 *   - Slug resolves item by `legacy_id || id` via loadDetail.
 *   - UUID → legacy_id redirect (307) when the URL is a raw uuid, so old uuid
 *     links converge on the canonical human-readable slug, and ONLY to a URL
 *     that renders (applyIdRedirect, src/lib/detail/id-redirect.ts; lane
 *     REG-REDIRECT 2026-09-24): an item no surface admits 404s at the uuid URL.
 *   - Related findings selected server-side: items sharing the row's
 *     `theme` column when populated, falling back to items from the same
 *     source when theme is NULL. Capped at 5. CORRECTED 2026-08-30 (WO-25):
 *     `theme` is NULL on ALL 38 live Research-surface rows today, not "the
 *     majority" - the theme-match step is currently dead in practice, and
 *     the fallback is what every populated panel is actually running. See
 *     the inline comment above the related-items block below.
 *   - Theme-brief card (WO-25, flywheel U6 surfacing, 2026-08-30): a
 *     read-only, $0 join from this item's id into `connection_themes` /
 *     `theme_briefs` - an already-synthesized editorial brief for the
 *     graph-derived cluster this item belongs to, when one exists.
 *     Renders nothing when the item is in no cluster or the cluster has no
 *     brief yet (honest omission). See src/lib/research/theme-brief.mjs.
 *
 * Layout: EditorialMasthead at the top (matching the regulations detail
 * shape) + ResearchFindingDetailSurface below.
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): every
 * read this page issues (connections lookup, related-items, theme brief)
 * is item-scoped and org-independent, so the whole
 * bundle runs inside ONE cached, parallel load via loadDetail
 * (src/lib/detail/load-detail.ts) - no loadViewerScoped: research has
 * nothing org-scoped beyond the always-on relevance lens.
 *
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): the ONE remaining cookie read on this
 * route was watchMembershipPromise's resolveViewerIdentityFromCookies() - a Dynamic API call forcing
 * `ƒ` regardless of the item-scoped bundle above already being fully cacheable. Removed:
 * initialWatched/initialTeamWatched/initialTeamAvailable are no longer passed to
 * ResearchFindingDetailSurface → WatchButton, which already falls back to a client-side
 * getClientWatchMembership() call when they're omitted (see regulations/[slug]/page.tsx's identical
 * PERF-10 note for the full mechanism).
 */

import { notFound } from "next/navigation";
import { applyIdRedirect, loadDetail } from "@/lib/detail/load-detail";
import { itemIdColumn } from "@/lib/detail/item-id-filter";
import { getPublicSurfaceSlugs } from "@/lib/data";
import { slugsOrEmpty } from "@/lib/perf/static-params-fallback.mjs";
import { fetchClaimTierMap } from "@/lib/detail/load-detail-core";
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";
import { buildResourceLookup } from "@/lib/connections/resource-lookup";
import { selectThemeBriefForItem } from "@/lib/research/theme-brief.mjs";
import { selectAssessmentView } from "@/lib/research/read-assessments.mjs";
import { fetchSignpostsForAssessment, fetchAssessmentHistoryChain } from "@/lib/research/read-signposts.mjs";
import { ResearchFindingDetailSurface } from "@/components/research/ResearchFindingDetailSurface";
import { NoticesRail } from "@/components/figures/NoticesRail";

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
  related: ReturnType<typeof pickRelated>[];
  relatedReason: "theme" | "source" | "none";
  themeBrief: ReturnType<typeof selectThemeBriefForItem>;
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings - see
   *  load-detail-core.ts's fetchClaimTierMap header. Item-scoped, read unconditionally (a brief-grade
   *  finding's query legitimately returns no rows, resolving to {} at zero extra cost). Reuses `self.id`
   *  (already resolved below, inside relatedAndBriefPromise) as the item uuid - no second uuid lookup. */
  claimTiers: ClaimTierMap;
  /** Lane W2-R (2026-10-01): migration 336's `research_assessments_current` row for this item, shaped by
   *  src/lib/research/read-assessments.mjs. null when no assessment has been computed yet (honest
   *  absence - the producer has not run over this item, or the migration has not been applied) - the
   *  surface renders what it produces (R14); it never fabricates a reading. */
  assessment: ReturnType<typeof selectAssessmentView>;
  /** Lane L5 (2026-10-02, extended scope after lane L6/PR #890 merged): migration 346's `signposts`
   *  rows watching this item's current assessment, shaped by read-signposts.mjs. [] when no
   *  assessment exists yet or no signpost has been registered - honest absence, never fabricated. */
  signposts: Awaited<ReturnType<typeof fetchSignpostsForAssessment>>;
  /** Lane L5 (2026-10-02, extended scope): the real `supersedes` chain for this item's assessment,
   *  newest first, walked by read-signposts.mjs's fetchAssessmentHistoryChain using this SAME
   *  service-role client. One entry (the current row) when no prior version exists, or when the
   *  client cannot see priors (see that module's own header for the named RLS/privilege limit). */
  assessmentHistory: Awaited<ReturnType<typeof fetchAssessmentHistoryChain>>;
}

// PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): the remaining reason this route still
// built `ƒ` after every Dynamic API call was removed from its render tree - a dynamic segment
// (`[slug]`) with no `generateStaticParams` is unconditionally server-rendered per request under
// classical (non-PPR) rendering, independent of Dynamic API usage. See
// regulations/[slug]/page.tsx's identical-shape comment for the full explanation of why `[]` (not a
// full slug enumeration) is the correct return value here: an unbounded, continuously-growing corpus,
// with `dynamicParams` at its default `true` so every slug is rendered on first request and served
// from the Full Route Cache thereafter.
//
// PERF-13 (2026-09-04, ADR-027 §1): SUPERSEDES the decision above (kept verbatim, not deleted, per
// CLAUDE.md rule 14) - see regulations/[slug]/page.tsx's own generateStaticParams comment for the
// full measurement this correction is based on. This surface's own corpus is 39 verified,
// non-archived items (Supabase MCP, `get_research_items_public()` row count, 2026-09-04) - small,
// not "unbounded" - enumerated at build time via `getPublicSurfaceSlugs("research")`
// (src/lib/data.ts, the SAME function every `[slug]` route now calls). `dynamicParams` stays `true`
// for an item minted after the last build; the deploy-time warm step
// (docs/runbooks/warm-static-detail-routes.md) closes that gap before a real viewer's first click.
// D32 (defect-fix-plan-2026-09-12.md, lane L21, part (d)): guarded by slugsOrEmpty
// (src/lib/perf/static-params-fallback.mjs) - see regulations/[slug]/page.tsx's own comment for the full
// incident/citation. A rejected or slow (>10s) read falls back to [] with a build warning; the route
// already renders on demand via dynamicParams.
export async function generateStaticParams() {
  const slugs = await slugsOrEmpty(() => getPublicSurfaceSlugs("research"), { route: "/research/[slug]" });
  return slugs.map((slug) => ({ slug }));
}

export default async function ResearchFindingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug step (lane REG-REDIRECT, 2026-09-24): redirects only to a URL that renders, 404s an
  // item no surface admits at the uuid URL. See regulations/[slug]/page.tsx and
  // src/lib/detail/id-redirect.ts. Outside any try/catch (redirect()/notFound() throw).
  await applyIdRedirect("research", id);

  const result = await loadDetail<ItemScoped>({
      surface: "research",
      id,
      // Item-scoped, org-independent: connections lookup, theme/source-matched
      // related findings, and the theme-brief card.
      // Cached - shared across every org that views this item.
      loadItemScoped: async ({ supabase, connections, supersessions }) => {
        const relatedIds = Array.from(
          new Set<string>([
            ...connections.map((c) => c.id),
            ...supersessions.flatMap((s) => [s.old, s.new]),
          ])
        ).filter(Boolean);

        // Related findings + theme brief - strategy:
        //   1. theme match (STEP 1 IS DEAD IN PRACTICE today, WO-25, 2026-08-30  - 
        //      0 of 38 live rows populate `theme`; kept for when it's backfilled).
        //   2. same-source fallback when (1) yields nothing.
        //   3. [] when neither yields anything.
        const relatedAndBriefPromise: Promise<{
          related: ReturnType<typeof pickRelated>[];
          relatedReason: ItemScoped["relatedReason"];
          themeBrief: ItemScoped["themeBrief"];
          claimTiers: ClaimTierMap;
          assessment: ItemScoped["assessment"];
          signposts: ItemScoped["signposts"];
          assessmentHistory: ItemScoped["assessmentHistory"];
        }> = (async () => {
          let related: ReturnType<typeof pickRelated>[] = [];
          let relatedReason: ItemScoped["relatedReason"] = "none";
          let themeBrief: ItemScoped["themeBrief"] = null;
          let claimTiers: ClaimTierMap = {};
          let assessment: ItemScoped["assessment"] = null;
          let signposts: ItemScoped["signposts"] = [];
          let assessmentHistory: ItemScoped["assessmentHistory"] = [];
          try {
            const { data: self } = await supabase
              .from("intelligence_items")
              .select("id, theme, source_id")
              .eq(itemIdColumn(id), id)
              .eq("provenance_status", "verified") // customer read gate (parity with fetchIntelligenceItem)
              .maybeSingle();

            if (self) {
              // TIER-CHIP lane (2026-09-04): kicked off here (self.id is the item uuid - no separate
              // resolveItemUuid call needed) and awaited just before the return below, so it runs
              // alongside the theme/source-fallback queries below rather than adding a fully serial
              // extra round trip.
              const claimTiersPromise = fetchClaimTierMap(supabase, self.id);

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
              // (9 rows live) and public-read - read it all and match
              // in-process (same shape api/admin/themes/route.ts uses). A
              // second query for the theme_briefs row only runs when self.id
              // is actually a member of a live theme.
              const { data: themeRows } = await supabase
                .from("connection_themes")
                .select("id, member_ids, density");
              const matchedTheme =
                themeRows && themeRows.length > 0
                  ? (themeRows as { id: string; member_ids: string[]; density: number | null }[]).find(
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

              // fetchClaimTierMap never throws (soft-fails internally to {} - see its own header), so
              // awaiting it here cannot trip this block's own catch below.
              claimTiers = await claimTiersPromise;

              // Research assessment (lane W2-R, 2026-10-01, migration 336): the one current row for
              // this item, read through research_assessments_current (the RLS-granted view - see that
              // migration's own header for why the raw table is denied). Soft-fails to null (no
              // assessment yet) rather than tripping this block's shared catch - a missing/not-yet-
              // applied migration must not break the rest of the detail page's item-scoped bundle.
              try {
                // Lane L5 (2026-10-02, extended scope): `id`, `supersedes`, `is_current`, `lifecycle_state`
                // added to this existing select (migration 346's own columns on the same view) so the
                // SAME lookup also seeds the signposts fetch (needs the row's real uuid, not item_id) and
                // the history-chain walk (needs id/supersedes) - no second redundant query against this
                // view. Soft-fails together with the assessment read below (same try/catch, same
                // "missing/not-yet-applied migration must not break the rest of the page" posture).
                const { data: assessmentRow } = await supabase
                  .from("research_assessments_current")
                  .select(
                    "id, supersedes, is_current, lifecycle_state, item_id, technical_maturity_low, technical_maturity_high, technical_maturity_method, " +
                      "commercial_maturity_low, commercial_maturity_high, commercial_maturity_method, " +
                      "horizon_kind, horizon_band, horizon_rule, horizon_confidence, horizon_trigger_note, " +
                      "refusal_reason, credibility_evidence_score, credibility_authority_score, status_token, computed_at",
                  )
                  .eq("item_id", self.id)
                  .maybeSingle();
                assessment = selectAssessmentView(
                  assessmentRow as unknown as Parameters<typeof selectAssessmentView>[0],
                );
                if (assessmentRow) {
                  const row = assessmentRow as unknown as { id: string; supersedes: string | null };
                  [signposts, assessmentHistory] = await Promise.all([
                    fetchSignpostsForAssessment(supabase, row.id),
                    fetchAssessmentHistoryChain(supabase, row as Parameters<typeof fetchAssessmentHistoryChain>[1]),
                  ]);
                }
              } catch {
                assessment = null;
                signposts = [];
                assessmentHistory = [];
              }
            }
          } catch {
            // Soft-fail - surface renders the empty state (no related findings, no theme-brief card).
          }
          return { related, relatedReason, themeBrief, claimTiers, assessment, signposts, assessmentHistory };
        })();

        const [resourceLookup, relatedAndBrief] = await Promise.all([
          buildResourceLookup(supabase, relatedIds),
          relatedAndBriefPromise,
        ]);

        return {
          resourceLookup,
          related: relatedAndBrief.related,
          relatedReason: relatedAndBrief.relatedReason,
          themeBrief: relatedAndBrief.themeBrief,
          claimTiers: relatedAndBrief.claimTiers,
          assessment: relatedAndBrief.assessment,
          signposts: relatedAndBrief.signposts,
          assessmentHistory: relatedAndBrief.assessmentHistory,
        };
      },
    });

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11) - see regulations/[slug]
  // for the full rationale; checked inside loadDetail via canonicalSurface.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const related = result.itemScoped?.related ?? [];
  const relatedReason = result.itemScoped?.relatedReason ?? "none";
  const themeBrief = result.itemScoped?.themeBrief ?? null;
  const claimTiers = result.itemScoped?.claimTiers ?? {};
  const assessment = result.itemScoped?.assessment ?? null;
  const signposts = result.itemScoped?.signposts ?? [];
  const assessmentHistory = result.itemScoped?.assessmentHistory ?? [];

  console.log(`[perf] /research/${id} data ${result.elapsedMs}ms`);

  // UI SYSTEM HANDOFF (lane uidetails2, 2026-09-07): the back-link +
  // EditorialMasthead pair is REMOVED - the ONE detail architecture's
  // DetailHeader (inside ResearchFindingDetailSurface) now owns the
  // title/meta/breadcrumb-equivalent for this route, matching the
  // regulations/market/operations detail surfaces.
  return (
    <>
      <ResearchFindingDetailSurface
        resource={r}
        related={related}
        relatedReason={relatedReason}
        sections={sections}
        claimTiers={claimTiers}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        themeBrief={themeBrief}
        assessment={assessment}
        signposts={signposts}
        assessmentHistory={assessmentHistory}
      />
      {/* Recalculation notices (complete-system build plan W4.3, lane NOTICES 2026-09-05): see
          NoticesRail's own header for scope (org-watchlist-wide, not narrowed to this item). */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 var(--cl-detail-pad-x) 28px" }}>
        <NoticesRail />
      </div>
    </>
  );
}
