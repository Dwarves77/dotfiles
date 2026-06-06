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
 */

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
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

export default async function OperationsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect (same as /research/[slug]).
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
        redirectTo = `/operations/${encodeURIComponent(byId.legacy_id)}`;
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

  // Fetch section rows (reuses fetchIntelligenceItemSections — not reimplemented).
  // Returns [] when no sections have been generated yet; surface renders the
  // legacy brief fallback in that case.
  const sections = await fetchIntelligenceItemSections(id);

  // Matrix eligibility check (server-side, read-only).
  // Soft-fails to undefined if Supabase is not configured; the surface
  // treats undefined as ineligible (fail-closed).
  let matrixEligibility: MatrixEligibility | undefined;
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
      // Build the item gate input from the resource.
      // resource.jurisdiction is the legacy single-string; the full array
      // is on intelligence_items.jurisdictions but not mapped to Resource.
      // We pass both so the resolver gets the best available signal.
      matrixEligibility = await checkMatrixEligibility(supabase, {
        jurisdictions: r.jurisdiction ? [r.jurisdiction] : [],
        jurisdiction: r.jurisdiction ?? null,
      });
    } catch {
      // Soft-fail — surface renders S3/S4 as ineligible (correct posture).
    }
  }

  // Related items — server-side selection.
  //
  // Strategy:
  //   1. If the row has jurisdiction(s), query intelligence_items for other
  //      active regional_data rows in the same jurisdiction (cap = 5).
  //   2. If no jurisdiction match OR step 1 returned nothing, fall back to
  //      same source (cap = 5).
  //   3. If neither yields anything, pass [] (empty state rendered by surface).
  let related: ReturnType<typeof pickRelated>[] = [];
  let relatedReason: "jurisdiction" | "source" | "none" = "none";

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

      // Resolve the row's uuid + jurisdictions + source_id.
      const isUuid = UUID_RE.test(id);
      const orExpr = isUuid
        ? `legacy_id.eq.${id},id.eq.${id}`
        : `legacy_id.eq.${id}`;
      const { data: self } = await supabase
        .from("intelligence_items")
        .select("id, jurisdictions, source_id")
        .or(orExpr)
        .maybeSingle();

      if (self) {
        // Step 1: jurisdiction match on other regional_data items.
        const selfJurisdictions: string[] = Array.isArray(self.jurisdictions)
          ? self.jurisdictions
          : r.jurisdiction
          ? [r.jurisdiction]
          : [];

        if (selfJurisdictions.length > 0) {
          // Use contains overlap: any item whose jurisdictions array overlaps
          // with selfJurisdictions qualifies. PostgREST: cs.{codes...} or
          // cd.{codes...}. Use overlap (&&) via a raw query isn't directly
          // available in the client; we use contains as a reasonable proxy.
          // For multi-jurisdiction items this may under-match; acceptable for
          // related-items which are a convenience affordance, not a critical path.
          const { data: jurRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, jurisdictions, source_id, source:sources(id, name)"
            )
            .contains("jurisdictions", selfJurisdictions)
            .eq("item_type", "regional_data")
            .eq("is_archived", false)
            .neq("id", self.id)
            .order("added_date", { ascending: false })
            .limit(RELATED_LIMIT);
          if (jurRows && jurRows.length > 0) {
            related = (jurRows as unknown as RelatedRow[]).map(pickRelated);
            relatedReason = "jurisdiction";
          }
        }

        // Step 2: same-source fallback.
        if (related.length === 0 && self.source_id) {
          const { data: srcRows } = await supabase
            .from("intelligence_items")
            .select(
              "id, legacy_id, title, summary, added_date, jurisdictions, source_id, source:sources(id, name)"
            )
            .eq("source_id", self.source_id)
            .eq("item_type", "regional_data")
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
      // Soft-fail — surface renders empty state.
    }
  }

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

  console.log(`[perf] /operations/${id} data ${Date.now() - t0}ms`);

  return (
    <>
      {/* Back-link — points to /operations, not /research */}
      <div style={{ padding: "10px 32px 0" }}>
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
      />
    </>
  );
}
