/**
 * Research finding detail (`/research/[slug]`) — server component.
 *
 * Mirrors `/regulations/[slug]/page.tsx`:
 *   - Slug resolves item by `legacy_id || id` via fetchIntelligenceItem.
 *   - UUID → legacy_id redirect (307) when the URL is a raw uuid AND the
 *     row has a legacy_id, so old uuid links converge on the canonical
 *     human-readable slug.
 *   - Related findings selected server-side: items sharing the row's
 *     `theme` column when populated, falling back to items from the same
 *     source when theme is NULL. Capped at 5. CORRECTED 2026-08-30 (WO-25):
 *     `theme` is NULL on ALL 38 live Research-surface rows today, not "the
 *     majority" — the theme-match step is currently dead in practice, and
 *     the fallback is what every populated panel is actually running. See
 *     the inline comment above `relatedReason` below.
 *   - Theme-brief card (WO-25, flywheel U6 surfacing, 2026-08-30): a
 *     read-only, $0 join from this item's id into `connection_themes` /
 *     `theme_briefs` — an already-synthesized editorial brief for the
 *     graph-derived cluster this item belongs to, when one exists.
 *     Renders nothing when the item is in no cluster or the cluster has no
 *     brief yet (honest omission). See src/lib/research/theme-brief.mjs.
 *
 * Layout: EditorialMasthead at the top (matching the regulations detail
 * shape) + ResearchFindingDetailSurface below.
 */

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { getViewerRelevanceForItem } from "@/lib/workspace/viewer-relevance";
import { buildResourceLookup } from "@/lib/connections/resource-lookup";
import { selectThemeBriefForItem } from "@/lib/research/theme-brief.mjs";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { ResearchFindingDetailSurface } from "@/components/research/ResearchFindingDetailSurface";

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

export default async function ResearchFindingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect — same shape as /regulations/[slug] so old
  // uuid-shaped URLs converge on the canonical human-readable slug when
  // the row has a legacy_id. Service-role client because anon-key cannot
  // SELECT base-table intelligence_items rows under current RLS.
  let redirectTo: string | null = null;
  if (
    UUID_RE.test(id) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
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

  const detail = await fetchIntelligenceItem(id);
  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11). Until now the ONLY gate on
  // this route was fetchIntelligenceItem's `provenance_status='verified'` check,
  // so ANY verified item rendered here under the research chrome — and this
  // surface's heading map RELABELLED whatever section rows it found, silently
  // dropping keys outside its own range. `canonicalSurface` is computed from the
  // RAW (item_type, domain) by the same `surfaceOf` classifier that decides where
  // this item's links point (src/lib/item-links.ts), so a link emitted to this
  // surface always renders and an item belonging elsewhere always 404s.
  if (!detail || detail.canonicalSurface !== "research") {
    notFound();
  }

  const { resource: r, supersessions, connections, relevanceInput } = detail;

  // Flywheel U9 (D1): the viewer's relevance-to-your-operation lens (per-request, per-org — never
  // baked into the cached fetchIntelligenceItem result) and the connections card's gated title lookup
  // (covers both cross-references and any supersessions involving this item).
  const [relevance, resourceLookup] = await Promise.all([
    getViewerRelevanceForItem(relevanceInput),
    buildResourceLookup([
      ...connections.map((c) => c.id),
      ...supersessions.flatMap((s) => [s.old, s.new]),
    ]),
  ]);

  // Sprint 4: fetch section rows for section-aware display. Uses the same
  // id-or-legacy_id slug the item was resolved with. fetchIntelligenceItemSections
  // handles UUID resolution and provenance gating internally. Returns [] on
  // any error or when no sections have been generated yet (the surface renders
  // the legacy brief toggle in that case).
  const sections = await fetchIntelligenceItemSections(id);

  // Related findings — server-side selection.
  //
  // Strategy:
  //   1. If the row has a non-null `theme` column, query intelligence_items
  //      for other active rows with the same theme (cap = 5, excluding self).
  //   2. If theme is null on the row OR step 1 returned no other rows,
  //      fall back to items from the same source (cap = 5, excluding self).
  //   3. If neither yields anything (orphan or no peers), pass [] to the
  //      surface and let it render an empty state.
  //
  // STEP 1 IS DEAD IN PRACTICE (WO-25, 2026-08-30 — documented per the corrected spec,
  // docs/plans/research-lane-spec-from-repo.md §2.3 item 2, option (a): comment-only, no
  // behavior change). Live measurement this session: 0 of 38 verified/non-archived
  // Research-surface rows populate `theme` (same finding as the spec's §0 table). Step 1
  // can therefore never match today — every "Related findings" panel that shows anything
  // is running step 2 (the same-source fallback) exclusively. This is real fallback
  // behavior working as designed, not a bug; it is named here so a future reader does not
  // assume step 1 is exercised. Swapping the primary signal to the item_cross_references
  // graph instead of the inert `theme` column is a real design option (spec §2.3 item 2,
  // option (b)) deliberately NOT taken by this pass — see the spec's open ruling §2.7.2.
  let related: ReturnType<typeof pickRelated>[] = [];
  let relatedReason: "theme" | "source" | "none" = "none";
  // Theme-brief card (WO-25, flywheel U6 surfacing). Populated below, alongside `related`,
  // once `self.id` (the row's raw uuid) is resolved — read-only, $0, no generation. See
  // src/lib/research/theme-brief.mjs for the join contract and the U7-boundary note.
  let themeBrief: ReturnType<typeof selectThemeBriefForItem> = null;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // Resolve the row's uuid + theme + source_id once. fetchIntelligenceItem
      // returns a Resource shape that doesn't carry these directly, so we
      // re-query by the same id-or-legacy_id pattern (one extra round-trip;
      // could be inlined into fetchIntelligenceItem later for perf, but the
      // dispatch rule forbids modifying that helper).
      const isUuid = UUID_RE.test(id);
      const orExpr = isUuid ? `legacy_id.eq.${id},id.eq.${id}` : `legacy_id.eq.${id}`;
      const { data: self } = await supabase
        .from("intelligence_items")
        .select("id, theme, source_id")
        .or(orExpr)
        .maybeSingle();

      if (self) {
        // Step 1: theme match.
        if (self.theme) {
          const { data: themeRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, theme, source_id, source:sources(id, name)"
            )
            .eq("theme", self.theme)
            .eq("is_archived", false)
            .eq("provenance_status", "verified") // customer read gate — related rail must not leak quarantined items
            .neq("id", self.id)
            .order("added_date", { ascending: false })
            .limit(RELATED_LIMIT);
          if (themeRows && themeRows.length > 0) {
            related = (themeRows as unknown as RelatedRow[]).map(pickRelated);
            relatedReason = "theme";
          }
        }

        // Step 2: same-source fallback (only when theme yielded nothing).
        if (related.length === 0 && self.source_id) {
          const { data: srcRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, theme, source_id, source:sources(id, name)"
            )
            .eq("source_id", self.source_id)
            .eq("is_archived", false)
            .eq("provenance_status", "verified") // customer read gate — related rail must not leak quarantined items
            .neq("id", self.id)
            .order("added_date", { ascending: false })
            .limit(RELATED_LIMIT);
          if (srcRows && srcRows.length > 0) {
            related = (srcRows as unknown as RelatedRow[]).map(pickRelated);
            relatedReason = "source";
          }
        }

        // Theme brief (WO-25, flywheel U6). connection_themes is small (9 rows live) and
        // public-read (migration 253); reading all of it and matching in-process is the
        // same shape api/admin/themes/route.ts already uses, narrowed to one item. A
        // second query for the matching theme_briefs row only runs when self.id is
        // actually a member of a live theme, so an item outside every cluster (the
        // honest-omission case) costs one query, not two. NO write, NO LLM call, NO
        // regeneration — a pure read of rows a prior operator-directed pass produced.
        // See src/lib/research/theme-brief.mjs for the join/orphan/staleness contract.
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
  }

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

  console.log(`[perf] /research/${id} data ${Date.now() - t0}ms`);

  return (
    <>
      <div style={{ padding: "10px 32px 0" }}>
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
      />
    </>
  );
}
