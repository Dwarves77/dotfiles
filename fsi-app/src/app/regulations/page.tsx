/**
 * Regulations index (`/regulations`) — server component.
 *
 * Redesign TEMPLATE 02 (the archetype for all index pages). Composes:
 *   - <EditorialMasthead> — 4px brand rule (shell) + blue VOL eyebrow +
 *     Anton "Regulations" title + a muted sub-line whose key counts are
 *     bold ink (HANDOFF §5).
 *   - <RegulationsLedger> — the banded ledger (severity tiles → Ask bar →
 *     search + sort + Filters → four severity bands). Kanban is retired.
 *
 * COUNTS (binding): the sub-line total, the tiles, and the band headers all
 * read get_surface_counts('regulations') via getSurfaceCounts (migration
 * 148/#173) — verified-gated, and fail-soft to the scoped-aggregates RPC /
 * row-derived counts because migrations 148/149 are not applied yet. Counts
 * are never recomputed from the visible rows and the mock snapshot numbers
 * are never hard-coded.
 *
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): this page no longer accepts a
 * `searchParams` prop. Reading it is itself a Dynamic API under classical (non-PPR) rendering — using
 * it forces the WHOLE route dynamic at build time, independent of every other fix, exactly like
 * cookies()/headers(). The `?priority=`/`?region=`/`?owner=` deep-link filters it used to read are now
 * resolved CLIENT-SIDE, inside RegulationsLedger itself, via useSearchParams() wrapped in its own
 * small Suspense boundary (see RegulationsLedger.tsx's SearchParamsFilterBridge for the full
 * mechanism and why only that tiny piece suspends, not the whole ledger).
 *
 * getListingsOnly()/getSurfaceCounts() are also replaced: their org-scoped resolveOrgIdFromCookies()
 * internals were a SECOND, independent Dynamic API dependency on this route (get_workspace_
 * intelligence_slim rejects a NULL org_id via _assert_org_membership — confirmed this lane via
 * Supabase MCP). getPublicListingsOnly()/getPublicSurfaceCounts() (migration 306's `_public` RPC
 * siblings, unstable_cache-wrapped, no cookies) replace them — same platform-wide-not-per-org-override
 * trade-off already accepted for /market, /operations, /research's own list pages this lane.
 */

import { getPublicListingsOnly, getPublicSurfaceCounts } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { RegulationsLedger } from "@/components/regulations/RegulationsLedger";
import {
  toLedgerRowPayload,
  LIST_PAGE_SIZE,
  FIRST_LISTING_CURSOR,
  cursorAfter,
  encodeListingCursor,
} from "@/lib/list-pagination";
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
// Spec 09 §1.8 (lane SPEC-09, wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody, one
// self-contained server component covering both tables — see its own header for the shared blocking-
// severity classification and why they render as one block, not two.
import { EudrCustodyPanel } from "@/components/regulations/EudrCustodyPanel";
import { toDate } from "@/lib/relative-time";
import { REGULATIONS_DOMAIN } from "@/lib/domains";

export default async function RegulationsPage() {
  // Listings (verified-gated server-side) for the ledger rows + the
  // single-SoT verified count bundle for the masthead / tiles / bands.
  // First-paint page only (PERF-12, 2026-09-04, ADR-027 §2: LIST_PAGE_SIZE rows, newest-priority-
  // first — RegulationsLedger takes over via useLedgerInfiniteQuery/fetchNextPage as the user
  // scrolls, calling /api/listings/cursor page-at-a-time; the old one-shot LIST_REMAINDER_LIMIT
  // remainder fetch is gone, see list-pagination.ts's own header). The masthead/tile counts below
  // bind to `aggregates`, which is sourced from get_surface_counts (or its scoped-aggregates
  // fallback) — both real RPCs, independent of how many rows are loaded — so the header count
  // stays honest at 30, at 754, and everywhere in between.
  const [data, aggregates] = await Promise.all([
    // RECONCILE (2026-09-04, item 1) of PERF-10 (org-independent, cacheable, cookie-free — keeps
    // this route static) and PERF-11's domain scoping, unified with PERF-12's cursor page size:
    // the SSR first page is now exactly LIST_PAGE_SIZE (30) rows, the SAME size every subsequent
    // /api/listings/cursor page fetches — so the cursor computed below (`cursorAfter`) is anchored
    // on precisely the rows this page actually rendered, never a size mismatch between "what SSR
    // shipped" and "what the first client-driven fetchNextPage asks for". getPublicListingsOnly()
    // is PERF-10's architecture: no resolveOrgIdFromCookies() Dynamic API, so this page builds `○`
    // instead of `ƒ`. `domain: REGULATIONS_DOMAIN` is PERF-11's fix, folded into migration 306's
    // `get_workspace_intelligence_listings_public` (its own header). Live measurement, 2026-09-04:
    // without domain-scoping, the unscoped top-N across all seven intelligence_items.domain values
    // was only 65% actual Regulations rows — the rest were Tech/Regional/Market/Research items this
    // page fetched and serialised, then threw away. The `.filter` below stays regardless: it is
    // what makes the RENDER correct even if the domain predicate is ever a no-op for a stray row.
    getPublicListingsOnly({ limit: LIST_PAGE_SIZE, offset: 0, domain: REGULATIONS_DOMAIN }),
    getPublicSurfaceCounts("regulations"),
  ]);

  const regulationResources = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);

  // PERF-12 (2026-09-04, ADR-027 §2): the cursor for "the page after this one", computed with the
  // SAME `cursorAfter` math /api/listings/cursor's own route uses over the SAME raw (pre-domain-
  // filter) `data.resources` array — see that route's own comment for why raw, not filtered, is
  // the correct basis (a domain-filtered page can legitimately contain fewer than LIST_PAGE_SIZE
  // regulations while the raw corpus still has more rows past this window, since the RPC's own
  // p_domain predicate runs INSIDE the same ORDER BY/LIMIT the cursor math assumes).
  const hasMoreRegulations = data.resources.length >= LIST_PAGE_SIZE;
  const nextRegulationsCursor = hasMoreRegulations
    ? encodeListingCursor(cursorAfter(FIRST_LISTING_CURSOR, data.resources))
    : null;

  // Fail-soft: prefer RPC scalars; fall back to the in-view rows only when
  // the RPC returned nothing (pre-apply / anon / error).
  const activeRegulationsCount = aggregates.totalItems || regulationResources.length;
  const jurisdictionsCount =
    aggregates.totalJurisdictions ||
    new Set(regulationResources.map((r) => r.jurisdiction || "global")).size;

  // "Last sync" — RPC MAX(updated_at) preferred, else the most recent row.
  const rpcSync = aggregates.lastUpdatedAt ? toDate(aggregates.lastUpdatedAt) : null;
  const rowSync = regulationResources
    .map((r) => toDate(r.added))
    .filter((d): d is Date => d !== null)
    .reduce<Date | null>((acc, d) => (acc === null || d > acc ? d : acc), null);
  const lastSync = rpcSync ?? rowSync;
  // HYDRATION-418 follow-on (2026-09-04): this is a Server Component (no client re-render, so no
  // hydration-diff risk from this call specifically), but it renders on the SAME page under
  // investigation and the same unpinned-timeZone call is genuinely TZ-dependent — a Vercel Lambda (UTC)
  // and a viewer's local browser would disagree about which calendar day "last sync" falls on for a
  // sync near local midnight. Pinned for correctness and consistency with the fix in
  // RegulationsLedger.tsx / RegulationDetailSurface.tsx just below this page in the tree.
  const lastSyncLabel = lastSync
    ? lastSync.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  const boldInk = { fontWeight: 800, color: "var(--color-text-primary)" } as const;
  const meta = (
    <span>
      {today} · <span style={boldInk}>{activeRegulationsCount}</span> active regulations ·{" "}
      <span style={boldInk}>{jurisdictionsCount}</span> jurisdictions · workspace verticals: Live
      events · Fine art
      {lastSyncLabel && (
        <>
          {" · "}
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--brass)",
            }}
          >
            Last sync · {lastSyncLabel}
          </span>
        </>
      )}
    </span>
  );

  return (
    <>
      <SystemErrorBanner message={data._error} />
      <EditorialMasthead title="Regulations" meta={meta} />
      {/* Lane SURF (2026-09-01): customer-facing top strip for item_forward_events ("what is due,
          when") — see UpcomingObligationsStrip.tsx's own header. Self-contained server component: reads
          its own data via the request-scoped client, so it needs no props from this page's own fetches
          and soft-fails to nothing (never breaks the page) on a read error. */}
      <UpcomingObligationsStrip variant="list" />
      {/* PAYLOAD lane (2026-09-04, item 2 of the perf brief): the first-paint SSR payload used to ship
          the FULL Resource object for all 60 first-page rows — including keyData/reasoning (both
          detail-page-only fields RegulationsLedger never reads, per toLedgerRowPayload's own header,
          already trusted by /api/listings/rest's remainder fetch for this exact ledger). Trimming the
          first-page rows the same way the remainder fetch already is closes the gap that trim's header
          flagged as untouched ("the first-paint SSR payload (page.tsx) is unaffected").
          PERF-11 correction (2026-09-04): this used to map `data.resources` (the UNFILTERED, possibly
          cross-domain fetch) instead of `regulationResources` (the domain-filtered set used everywhere
          else on this page for counts) — every non-Regulations row the unscoped RPC call returned was
          being shipped to and rendered by a component whose own bands/cards assume every row is a
          regulation. Fixed to the filtered set; see the fetch comment above for the matching data-layer
          fix (migration 306, PERF-MERGE fold-in) that makes the fetch itself narrow, not just this
          render. */}
      {/* PERF-10 (2026-09-04): initialOverrides is no longer passed — getPublicListingsOnly() (the
          org-independent, cookie-free listing this page now uses) carries no per-org override rows to
          seed. Overrides now arrive exclusively client-side via useWorkspaceOverridesHydration
          (mounted globally in AppShell.tsx), the same source RegulationsLedger's own override-hydration
          effect already merges from — one extra client round trip before overrides are visible,
          instead of arriving pre-seeded in the SSR payload, the same trade-off this lane accepts
          everywhere a per-org read left a route's server render. initialPriorityFilter/
          initialRegionFilter/initialOwnerFilter are also no longer passed — see this file's header and
          RegulationsLedger.tsx's SearchParamsFilterBridge for why those are now resolved client-side. */}
      <RegulationsLedger
        initialResources={regulationResources.map(toLedgerRowPayload)}
        initialArchived={data.archived}
        aggregates={aggregates}
        initialNextCursor={nextRegulationsCursor}
        initialHasMore={hasMoreRegulations}
      />
      {/* Lane OBLIG (2026-09-02): the obligation register section — spec-01 §2's atomic unit ("the
          obligation, not the document"), migration 290's `obligations` table (item_forward_events
          denormalized with jurisdiction / mode / binding_position). Self-contained server component:
          reads its own data via the request-scoped client, so it needs no props from this page's own
          fetches, and soft-fails to nothing (never breaks the page) on a read error. */}
      <ObligationRegister variant="list" />
      {/* Lane SPEC-09 (wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody (spec 09 §1.8).
          Renders a single short "no rows yet" line per sub-table when empty (today's live state — see
          scripts/spec09/SOURCES.md) rather than an empty card. */}
      <EudrCustodyPanel />
    </>
  );
}
