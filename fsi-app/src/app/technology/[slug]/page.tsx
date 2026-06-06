/**
 * Technology item detail (`/technology/[slug]`) — server component.
 *
 * Mirrors `/research/[slug]/page.tsx`:
 *   - Slug resolves item by `legacy_id || id` via fetchIntelligenceItem.
 *   - UUID → legacy_id redirect (307) when the URL is a raw uuid AND the
 *     row has a legacy_id, so old uuid links converge on the canonical
 *     human-readable slug.
 *   - Related items selected server-side: items sharing the row's
 *     `item_type` (same technology type) when there are peers, falling
 *     back to items from the same source. Capped at 5.
 *
 * Layout: EditorialMasthead at the top + TechnologyDetailSurface below.
 *
 * Back-link: points to /technology (the Technology surface),
 * NOT /research — do not copy the /research back-link from the template.
 */

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { TechnologyDetailSurface } from "@/components/technology/TechnologyDetailSurface";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Technology item types routed to this surface.
const TECHNOLOGY_ITEM_TYPES = new Set(["technology", "innovation", "tool"]);

// Related items cap.
const RELATED_LIMIT = 5;

interface RelatedRow {
  id: string;
  legacy_id: string | null;
  title: string;
  summary: string | null;
  added_date: string | null;
  item_type: string | null;
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

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect — same shape as /research/[slug] so old
  // uuid-shaped URLs converge on the canonical human-readable slug.
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
        redirectTo = `/technology/${encodeURIComponent(byId.legacy_id)}`;
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

  // Fetch section rows for section-aware display. fetchIntelligenceItemSections
  // handles UUID resolution and provenance gating internally. Returns [] on
  // any error or when no sections have been generated yet.
  const sections = await fetchIntelligenceItemSections(id);

  // Related items — server-side selection.
  //
  // Strategy:
  //   1. If the row has a non-null item_type in TECHNOLOGY_ITEM_TYPES, query
  //      for other active rows with the same item_type (cap = 5, excluding self).
  //   2. If step 1 returned no other rows, fall back to items from the same
  //      source (cap = 5, excluding self).
  //   3. If neither yields anything, pass [] and render the empty state.
  let related: ReturnType<typeof pickRelated>[] = [];
  let relatedReason: "type" | "source" | "none" = "none";

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

      // Resolve the row's uuid + item_type + source_id once.
      const isUuid = UUID_RE.test(id);
      const orExpr = isUuid ? `legacy_id.eq.${id},id.eq.${id}` : `legacy_id.eq.${id}`;
      const { data: self } = await supabase
        .from("intelligence_items")
        .select("id, item_type, source_id")
        .or(orExpr)
        .maybeSingle();

      if (self) {
        // Step 1: same item_type match (within the technology surface types).
        if (self.item_type && TECHNOLOGY_ITEM_TYPES.has(self.item_type)) {
          const { data: typeRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, item_type, source_id, source:sources(id, name)"
            )
            .eq("item_type", self.item_type)
            .eq("is_archived", false)
            .neq("id", self.id)
            .order("added_date", { ascending: false })
            .limit(RELATED_LIMIT);
          if (typeRows && typeRows.length > 0) {
            related = (typeRows as unknown as RelatedRow[]).map(pickRelated);
            relatedReason = "type";
          }
        }

        // Step 2: same-source fallback (only when type yielded nothing).
        if (related.length === 0 && self.source_id) {
          const { data: srcRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, item_type, source_id, source:sources(id, name)"
            )
            .eq("source_id", self.source_id)
            .eq("is_archived", false)
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

  console.log(`[perf] /technology/${id} data ${Date.now() - t0}ms`);

  return (
    <>
      <div style={{ padding: "10px 32px 0" }}>
        <Link
          href="/technology"
          prefetch={false}
          style={{
            color: "var(--color-text-muted, var(--muted))",
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          ← Technology
        </Link>
      </div>
      <EditorialMasthead
        eyebrow="Technology"
        title={r.title}
        meta={metaParts.join(" · ")}
      />
      <TechnologyDetailSurface
        resource={r}
        related={related}
        relatedReason={relatedReason}
        sections={sections}
      />
    </>
  );
}
