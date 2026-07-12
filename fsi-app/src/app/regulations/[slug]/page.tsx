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

import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Note: previous `export const revalidate = 60` was a no-op —
// fetchIntelligenceItem doesn't read cookies, but the lookup query path
// below uses createClient with the SERVICE-ROLE key (fail-closed, C1 —
// never the anon key). Keeping the page dynamic for
// honesty; ISR refactor tracked in docs/PERF-WAVE-2.md.

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t0 = Date.now();
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  // UUID → slug redirect. When the URL is a raw uuid AND the matching
  // intelligence_items row has a legacy_id, redirect (307) to the
  // human-readable slug URL. If the row has no legacy_id we fall through
  // and render at the uuid URL — graceful degradation. Per the audit:
  // post-migration-045 every active item should have a legacy_id, so
  // the fallback path is a thin safety net for rows materialized after
  // 045 but before the orchestrator's slug-generation step runs.
  //
  // Note: redirect() throws a Next-internal NEXT_REDIRECT error to
  // perform the redirect, so it must be called OUTSIDE the try/catch
  // (otherwise the catch swallows the redirect).
  // RLS doesn't grant anon access to direct base-table SELECTs on
  // intelligence_items, so this lookup uses the service-role key (server
  // file, never exposed to client). Without it, every UUID lookup
  // returned null and the redirect never fired — every old UUID URL 404'd.
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
        redirectTo = `/regulations/${encodeURIComponent(byId.legacy_id)}`;
      }
      // No legacy_id — fall through to render-by-uuid below.
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid.
    }
  }
  if (redirectTo) redirect(redirectTo);

  const detail = await fetchIntelligenceItem(id);
  if (!detail) {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, xrefIds, refByIds } = detail;

  // Sprint 3 A5.3 (2026-05-27): fetch the 7 numbered sections backfilled
  // by A5.2. Empty array when the item has no parsed sections (the 2
  // misses from A5.2's coverage report, or non-D1 items that were never
  // backfilled). RegulationDetailSurface integrity-preserves silently
  // when sections is empty.
  const sections = await fetchIntelligenceItemSections(id);

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
    (process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    try {
      // Service-role for the related-items lookup — same RLS reasoning as
      // the UUID redirect above. The lookup is by id/legacy_id only,
      // returns title + priority, no sensitive fields.
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidIds = relatedIds.filter((rid) => uuidRe.test(rid));
      const legacyIds = relatedIds.filter((rid) => !uuidRe.test(rid));

      const queries = [];
      // Customer read gate: only verified items may surface titles in the
      // related-items list. A quarantined xref/supersession target falls
      // back to its raw id (the surface tolerates a missing lookup entry)
      // rather than leaking its title.
      if (legacyIds.length > 0) {
        queries.push(
          supabase
            .from("intelligence_items")
            .select("id, legacy_id, title, priority")
            .eq("provenance_status", "verified")
            .in("legacy_id", legacyIds)
        );
      }
      if (uuidIds.length > 0) {
        queries.push(
          supabase
            .from("intelligence_items")
            .select("id, legacy_id, title, priority")
            .eq("provenance_status", "verified")
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

  // Eyebrow jurisdiction label — prefer ISO data (e.g. ["US-CA"] →
  // "California, United States") so the masthead matches the detail
  // surface metadata. Fall back to the legacy `jurisdiction` string
  // when ISO data isn't yet populated.
  const jurisLabel =
    r.jurisdictionIso && r.jurisdictionIso.length > 0
      ? r.jurisdictionIso.map(isoToDisplayLabel).join(" · ")
      : JURISDICTIONS.find((j) => j.id === r.jurisdiction)?.label ||
        r.jurisdiction ||
        "Global";

  // Redesign T03: the hero (breadcrumb + title + deck + actions + tabs)
  // now lives inside RegulationDetailSurface per the approved mock
  // (Pages - 03 Regulation Detail). The prior EditorialMasthead + separate
  // back-link are replaced by the in-hero breadcrumb. We compute the
  // breadcrumb middle segment ("Global · IMO") and the deck sub-line here
  // (server-side) from real fields and pass them down.
  const publisher = r.enforcementBody || r.sourceName || null;
  const groupLabel = publisher ? `${jurisLabel} · ${publisher}` : jurisLabel;

  const effective = r.complianceDeadline
    ? `Effective ${formatDate(r.complianceDeadline)}`
    : null;
  const reviewed = r.lastVerifiedDate ? `Reviewed ${formatDate(r.lastVerifiedDate)}` : null;
  const modesLabel =
    r.modes && r.modes.length > 0
      ? r.modes.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" · ")
      : null;
  const deck = [
    r.legalInstrument || publisher,
    effective,
    reviewed,
    jurisLabel,
    modesLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  console.log(`[perf] /regulations/${id} data ${Date.now() - t0}ms`);

  return (
    <RegulationDetailSurface
      resource={r}
      changelog={changelog}
      dispute={dispute}
      supersessions={supersessions}
      xrefIds={xrefIds}
      refByIds={refByIds}
      resourceLookup={resourceLookup}
      sections={sections}
      groupLabel={groupLabel}
      deck={deck}
    />
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
