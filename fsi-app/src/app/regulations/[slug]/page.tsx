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
import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { fetchIntelligenceItem, fetchIntelligenceItemSections } from "@/lib/supabase-server";
import { resolveOrgIdFromCookies } from "@/lib/api/org";
import { getViewerRelevanceForItem } from "@/lib/workspace/viewer-relevance";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
import { JURISDICTIONS } from "@/lib/constants";
import { isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import { PeersDiscussingStrip } from "@/components/shared/PeersDiscussingStrip";

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
  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11). Until now the ONLY gate on
  // this route was fetchIntelligenceItem's `provenance_status='verified'` check,
  // so ANY verified item rendered here under the regulations chrome — and this
  // surface's heading map RELABELLED whatever section rows it found, silently
  // dropping keys outside its own range. `canonicalSurface` is computed from the
  // RAW (item_type, domain) by the same `surfaceOf` classifier that decides where
  // this item's links point (src/lib/item-links.ts), so a link emitted to this
  // surface always renders and an item belonging elsewhere always 404s.
  if (!detail || detail.canonicalSurface !== "regulations") {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, connections, relevanceInput } = detail;

  // Flywheel U9 (D1): the viewer's relevance-to-your-operation lens. Per-request, per-org — never
  // baked into the cached fetchIntelligenceItem result (see viewer-relevance.ts's header for why).
  const relevance = await getViewerRelevanceForItem(relevanceInput);

  // Sprint 3 A5.3 (2026-05-27): fetch the 7 numbered sections backfilled
  // by A5.2. Empty array when the item has no parsed sections (the 2
  // misses from A5.2's coverage report, or non-D1 items that were never
  // backfilled). RegulationDetailSurface integrity-preserves silently
  // when sections is empty.
  const sections = await fetchIntelligenceItemSections(id);

  // Targeted lookup for related-items list — only fetch the titles +
  // priorities for the cross-referenced and superseded items, not the
  // full workspace payload. connections/supersession ids are UI-side
  // ids (legacy_id || uuid), so we look up each via legacy_id OR id.
  const resourceLookup: Record<string, { id: string; title: string; priority: string }> = {};
  const relatedIds = Array.from(
    new Set<string>([
      ...connections.map((c) => c.id),
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

  // Phase 1 ownership (migration 234): read this item's org-scoped assignee
  // server-side (mirroring the market detail's notes-read pattern) so
  // OwnerTeamCard renders the current owner on first paint — the client
  // override store hydrates on /regulations, not on a direct detail-page
  // load. Name resolution goes through org_memberships: a departed assignee
  // renders Unassigned, never a stale name. Fail-soft to null (card renders
  // Unassigned and assignment still works via the picker).
  let initialOwner: { userId: string; name: string } | null = null;
  try {
    const orgId = await resolveOrgIdFromCookies();
    if (
      orgId &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      const itemUuid = UUID_RE.test(r.id)
        ? r.id
        : (
            await supabase
              .from("intelligence_items")
              .select("id")
              .eq("legacy_id", r.id)
              .maybeSingle()
          ).data?.id ?? null;
      if (itemUuid) {
        const { data: ovr } = await supabase
          .from("workspace_item_overrides")
          .select("owner_user_id")
          .eq("org_id", orgId)
          .eq("item_id", itemUuid)
          .maybeSingle();
        const ownerId = ovr?.owner_user_id ?? null;
        if (ownerId) {
          const { data: member } = await supabase
            .from("org_memberships")
            .select("user_id, user:profiles!user_id(full_name, display_name, email)")
            .eq("org_id", orgId)
            .eq("user_id", ownerId)
            .maybeSingle();
          const u = (member as {
            user?: { full_name?: string | null; display_name?: string | null; email?: string | null } | null;
          } | null)?.user;
          if (member) {
            initialOwner = {
              userId: ownerId,
              name: u?.full_name ?? u?.display_name ?? u?.email ?? `${ownerId.slice(0, 8)}...`,
            };
          }
        }
      }
    }
  } catch {
    // Soft-fail — card renders Unassigned; the picker still assigns.
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

  // Lane COMMUNITY-B (wave3, 2026-09-03): the "peers are discussing this" strip's bound entity
  // (spec 05 §5 component 2 makes this reachable — a thread bound to this item's instrument entity
  // surfaces here regardless of which Community group it was posted in). Same service-role lookup
  // pattern already used above for the UUID redirect / related-items / initialOwner reads — RLS does
  // not grant anon SELECT on intelligence_items base columns. Fails soft to null: an item with no
  // resolved entity, or no service-role key configured, renders no strip at all (PeersDiscussingStrip
  // itself also renders nothing for a null entityId).
  let peersEntityId: string | null = null;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
      );
      const itemUuid = UUID_RE.test(r.id)
        ? r.id
        : (
            await supabase
              .from("intelligence_items")
              .select("id")
              .eq("legacy_id", r.id)
              .maybeSingle()
          ).data?.id ?? null;
      if (itemUuid) {
        const { data: itemRow } = await supabase
          .from("intelligence_items")
          .select("instrument_entity_id")
          .eq("id", itemUuid)
          .maybeSingle();
        peersEntityId = itemRow?.instrument_entity_id ?? null;
      }
    } catch {
      // Soft-fail — the strip just doesn't render.
    }
  }

  console.log(`[perf] /regulations/${id} data ${Date.now() - t0}ms`);

  return (
    <>
      <RegulationDetailSurface
        resource={r}
        changelog={changelog}
        dispute={dispute}
        supersessions={supersessions}
        connections={connections}
        relevance={relevance}
        resourceLookup={resourceLookup}
        sections={sections}
        groupLabel={groupLabel}
        deck={deck}
        initialOwner={initialOwner}
        upcomingObligations={<UpcomingObligationsStrip variant="detail" itemId={r.id} />}
      />
      {/* Lane OBLIG (2026-09-02): this item's own obligation-register rows (migration 290
          `obligations`, denormalized jurisdiction/mode/binding_position) — write-set-scoped to this
          page file only (RegulationDetailSurface.tsx is not in this lane's write set), so it renders as
          its own section below the surface rather than a meta-rail card. Honest omission (renders
          nothing) when this item has no register rows yet. */}
      <ObligationRegister itemId={r.id} variant="detail" />
      <PeersDiscussingStrip entityId={peersEntityId} />
    </>
  );
}

