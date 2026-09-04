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
 * Data source: fetchIntelligenceItem(id) server-side, via loadDetail
 * (src/lib/detail/load-detail.ts) — see that module's header for why the
 * data load is shaped the way it is below (item-scoped/cached vs.
 * viewer-scoped/uncached, run in parallel).
 *
 * PERF lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md): this
 * page used to run 6 sequential Supabase round trips per render (UUID
 * redirect lookup, fetchIntelligenceItem, relevance, sections, related-items
 * lookup, owner lookup — each opening its own createClient()). It now runs
 * the item-scoped related-items + peers-entity reads behind ONE cached
 * bundle (shared with every other viewer of this item) and the org-scoped
 * owner lookup uncached, in parallel with sections + relevance, via
 * loadDetail. related-items lookup now calls the shared buildResourceLookup
 * (src/lib/connections/resource-lookup.ts) instead of a hand-mirrored inline
 * copy — see that file's PERF-lane header note.
 *
 * PERF-2 lane (2026-09-03, docs/audits/perf-load-times-2026-09-03.md §8
 * "(A)"): even after the PERF lane's fix above, this page stayed slower
 * than /market, /operations, /research because it alone rendered TWO MORE
 * async Server Components (<ObligationRegister>, <UpcomingObligationsStrip
 * variant="detail">) that ran strictly AFTER `await loadDetail(...)`
 * resolved — a hard JS-execution-order fact, not a scheduling nuance: this
 * function's body cannot construct the JSX tree containing them until the
 * await above it returns. loadRegulationDetailObligations
 * (src/lib/detail/regulation-obligations.ts) replaces those two component
 * calls with their underlying reads, run via Promise.all ALONGSIDE
 * loadDetail below, and the fetched rows are handed straight to the two
 * components' pure presentational halves (ObligationRegisterFilterBar,
 * UpcomingObligationsStripView) — same rendered output, same soft-fail/
 * honest-omission behavior, same request-scoped (RLS) client, collapsed
 * from "loadDetail + obligations" to "max(loadDetail, obligations)".
 * ObligationRegister.tsx / UpcomingObligationsStrip.tsx are UNCHANGED —
 * still used by /regulations' list page (`variant="list"`, out of this
 * lane's write set).
 */

import { formatDate } from "@/lib/format";
import { notFound, redirect } from "next/navigation";
import { loadDetail } from "@/lib/detail/load-detail";
import { fetchClaimTierMap } from "@/lib/detail/load-detail-core";
import { loadRegulationDetailObligations } from "@/lib/detail/regulation-obligations";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveViewerIdentityFromCookies } from "@/lib/api/org";
import { fetchWatchMembership, lookupWatchMembership } from "@/lib/watchlist/membership";
import {
  buildResourceLookup,
  resolveItemUuid,
  fetchInstrumentEntityId,
} from "@/lib/connections/resource-lookup";
import { RegulationDetailSurface } from "@/components/regulations/RegulationDetailSurface";
import type { ClaimTierMap } from "@/lib/agent/parse-record-sections";
import { UpcomingObligationsStripView } from "@/components/regulations/UpcomingObligationsStripView";
import { ObligationRegisterFilterBar } from "@/components/regulations/ObligationRegisterFilterBar";
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

interface ItemScoped {
  resourceLookup: Awaited<ReturnType<typeof buildResourceLookup>>;
  peersEntityId: string | null;
  /** TIER-CHIP lane (2026-09-04): a record-grade item's FACT claims' ratings — see
   *  load-detail-core.ts's fetchClaimTierMap header for the query/derivation. Item-scoped (no
   *  org/viewer dependency, so it belongs in the SAME cached bundle as resourceLookup/peersEntityId
   *  above), read unconditionally (never gated on item_grade — a brief-grade item's query legitimately
   *  returns no rows, resolving to {} at zero extra cost since fetchClaimTierMap never throws). */
  claimTiers: ClaimTierMap;
}

interface ViewerScoped {
  owner: { userId: string; name: string } | null;
}

export default async function RegulationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
  // (otherwise the catch swallows the redirect). This one lookup can't be
  // folded into loadDetail's item-scoped bundle: it must run and resolve
  // (or fall through) BEFORE fetchIntelligenceItem, not in parallel with it.
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
        redirectTo = `/regulations/${encodeURIComponent(byId.legacy_id)}`;
      }
      // No legacy_id — fall through to render-by-uuid below.
    } catch {
      // Soft-fail; fetchIntelligenceItem still tries by uuid.
    }
  }
  if (redirectTo) redirect(redirectTo);

  // PERF-4 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md dispatch item (2)): the viewer's
  // watch membership for THIS item shares no data dependency with loadDetail/obligations either — id
  // (already resolved above, and provably equal to the eventual result.resource.id: see
  // fetchIntelligenceItemUncached's `resourceId = row.legacy_id || row.id`, and the redirect above
  // already sent a mismatched uuid→legacy_id URL elsewhere before this point) is all it needs, plus
  // the viewer's userId/orgId. Threading this through RegulationDetailSurface → WatchButton as
  // initialWatched/initialTeamWatched/initialTeamAvailable means WatchButton renders its real state
  // on first paint and fires ZERO client fetch on mount (membership.ts's header, case 1).
  //
  // PERF-9 (2026-09-04, item 4, ADR-026 §3): was `resolveServerBootstrap()` — three SEQUENTIAL
  // round trips (getClaims → org_memberships+profiles → workspace_settings), the last one entirely
  // wasted here (workspaceSectors is never read below). React `cache()` made that free on a
  // DOCUMENT load (the root layout's own BootstrapResolver call is shared), but on an RSC
  // (client-side) navigation — the exact "click an item in the ledger" path the perf brief measured
  // at 4.25s server render for an 18 KB payload — the root layout skips calling
  // resolveServerBootstrap() at all (isRscNavigation), so this was the ONLY caller and paid the
  // full three-stage cost fresh, on the critical path. resolveViewerIdentityFromCookies (org.ts) is
  // the two-stage (getClaims → org_memberships) alternative that returns exactly userId+orgId and
  // nothing else — same cache()/fail-soft contract, one fewer sequential round trip on every click.
  const watchMembershipPromise = (async () => {
    const identity = await resolveViewerIdentityFromCookies();
    const membership = await fetchWatchMembership(getServiceSupabase(), {
      userId: identity.userId,
      orgId: identity.orgId,
      itemType: "reg",
      itemIds: [id],
    });
    return lookupWatchMembership(membership, id);
  })();

  const [result, obligations, watchEntry] = await Promise.all([
    loadDetail<ItemScoped, ViewerScoped>({
      surface: "regulations",
      id,
      // Item-scoped, org-independent: related-item titles for the connections/
      // supersessions rail, and the peers-discussing strip's bound entity.
      // Cached — shared across every org that views this item.
      loadItemScoped: async ({ supabase, resource, connections, supersessions }) => {
        const relatedIds = Array.from(
          new Set<string>([
            ...connections.map((c) => c.id),
            ...supersessions.flatMap((s) => [s.old, s.new]),
          ])
        ).filter(Boolean);
        const itemUuid = await resolveItemUuid(supabase, resource.id);
        const [resourceLookup, peersEntityId, claimTiers] = await Promise.all([
          buildResourceLookup(supabase, relatedIds),
          itemUuid ? fetchInstrumentEntityId(supabase, itemUuid) : Promise.resolve(null),
          itemUuid ? fetchClaimTierMap(supabase, itemUuid) : Promise.resolve({}),
        ]);
        return { resourceLookup, peersEntityId, claimTiers };
      },
      // Viewer-scoped, per-org: this item's assignee (migration 234). Uncached —
      // one org's assignment must never render for another org.
      loadViewerScoped: async ({ supabase, orgId, resource }) => {
        let owner: ViewerScoped["owner"] = null;
        if (orgId) {
          const itemUuid = await resolveItemUuid(supabase, resource.id);
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
                owner = {
                  userId: ownerId,
                  name: u?.full_name ?? u?.display_name ?? u?.email ?? `${ownerId.slice(0, 8)}...`,
                };
              }
            }
          }
        }
        return { owner };
      },
    }),
    loadRegulationDetailObligations(id),
    watchMembershipPromise,
  ]);

  // SURFACE ADMISSION GUARD (Phase 0.1, 2026-08-11). Until now the ONLY gate on
  // this route was fetchIntelligenceItem's `provenance_status='verified'` check,
  // so ANY verified item rendered here under the regulations chrome — and this
  // surface's heading map RELABELLED whatever section rows it found, silently
  // dropping keys outside its own range. canonicalSurface (checked inside
  // loadDetail) is computed from the RAW (item_type, domain) by the same
  // surfaceOf classifier that decides where this item's links point
  // (src/lib/item-links.ts), so a link emitted to this surface always renders
  // and an item belonging elsewhere always 404s.
  if (result.notFound) {
    notFound();
  }

  const { resource: r, changelog, dispute, supersessions, connections, sections, relevance } = result;
  const resourceLookup = result.itemScoped?.resourceLookup ?? {};
  const peersEntityId = result.itemScoped?.peersEntityId ?? null;
  const claimTiers = result.itemScoped?.claimTiers ?? {};
  const initialOwner = result.viewerScoped?.owner ?? null;

  console.log(`[perf] /regulations/${id} data ${result.elapsedMs}ms`);

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
        claimTiers={claimTiers}
        groupLabel={groupLabel}
        deck={deck}
        initialOwner={initialOwner}
        initialWatched={watchEntry.watched}
        initialTeamWatched={watchEntry.teamWatched}
        initialTeamAvailable={watchEntry.teamAvailable}
        upcomingObligations={
          obligations.upcomingEvents.length > 0 ? (
            <UpcomingObligationsStripView variant="detail" events={obligations.upcomingEvents} />
          ) : null
        }
      />
      {/* Lane OBLIG (2026-09-02): this item's own obligation-register rows (migration 290
          `obligations`, denormalized jurisdiction/mode/binding_position) — write-set-scoped to this
          page file only (RegulationDetailSurface.tsx is not in this lane's write set), so it renders as
          its own section below the surface rather than a meta-rail card. Honest omission (renders
          nothing) when this item has no register rows yet. PERF-2: rows are now fetched in parallel
          with loadDetail (see this file's header) and handed straight to the presentational
          ObligationRegisterFilterBar — ObligationRegister.tsx itself is unchanged and still serves the
          list page. */}
      {obligations.registerRows.length > 0 && (
        <ObligationRegisterFilterBar rows={obligations.registerRows} variant="detail" />
      )}
      <PeersDiscussingStrip entityId={peersEntityId} />
    </>
  );
}
