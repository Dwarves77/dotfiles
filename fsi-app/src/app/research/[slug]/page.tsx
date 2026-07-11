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
 *     source when theme is NULL (which is the case for the majority of
 *     rows today). Capped at 5.
 *
 * Layout: EditorialMasthead at the top (matching the regulations detail
 * shape) + ResearchFindingDetailSurface below.
 */

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
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
    (process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  if (!detail) {
    notFound();
  }

  const { resource: r } = detail;

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
  let related: ReturnType<typeof pickRelated>[] = [];
  let relatedReason: "theme" | "source" | "none" = "none";

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
      }
    } catch {
      // Soft-fail — surface renders the empty state.
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
      />
    </>
  );
}
