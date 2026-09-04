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
 */

import { getListingsOnly, getSurfaceCounts } from "@/lib/data";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { SystemErrorBanner } from "@/components/ui/SystemErrorBanner";
import { RegulationsLedger } from "@/components/regulations/RegulationsLedger";
import { toLedgerRowPayload } from "@/lib/list-pagination";
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
import { ObligationRegister } from "@/components/regulations/ObligationRegister";
// Spec 09 §1.8 (lane SPEC-09, wave 3, 2026-09-03): EUDR geo-traceability + book-and-claim custody, one
// self-contained server component covering both tables — see its own header for the shared blocking-
// severity classification and why they render as one block, not two.
import { EudrCustodyPanel } from "@/components/regulations/EudrCustodyPanel";
import { toDate } from "@/lib/relative-time";
import { REGULATIONS_DOMAIN } from "@/lib/domains";
import { LIST_FIRST_PAGE_SIZE } from "@/lib/list-pagination";

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; region?: string; owner?: string }>;
}) {
  const { priority: priorityParam, region: regionParam, owner: ownerParam } = await searchParams;

  // Listings (verified-gated server-side) for the ledger rows + the
  // single-SoT verified count bundle for the masthead / tiles / bands.
  // First-paint page only (60 rows, newest added_date first) — RegulationsLedger
  // fetches the rest client-side after paint via /api/listings/rest and
  // appends it, so the initial response ships ~60 rows instead of the entire
  // corpus. The masthead/tile counts below bind to `aggregates`, which is
  // sourced from get_surface_counts (or its scoped-aggregates fallback) —
  // both real RPCs, independent of how many rows are loaded — so the header
  // count stays honest at 60, at 754, and everywhere in between.
  const [data, aggregates] = await Promise.all([
    // PERF-11 (2026-09-04): domain-scoped when migration 305 is live (fail-soft to the unscoped call
    // otherwise — see ResourcePage.domain's own header in supabase-server.ts). Live measurement,
    // 2026-09-04: without this, the unscoped top-60 was only 39/60 (65%) actual Regulations rows — the
    // other 21 were Tech/Regional/Market/Research items this page fetched and serialised, then threw
    // away. The `.filter` below stays regardless of migration status: it is what makes the RENDER
    // correct even on the pre-305 fallback path, and is a no-op once 305 is live (every row already
    // matches).
    getListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0, domain: REGULATIONS_DOMAIN }),
    getSurfaceCounts("regulations"),
  ]);

  const regulationResources = data.resources.filter((r) => r.domain === REGULATIONS_DOMAIN);

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
          fix (migration 305) that makes the fetch itself narrow, not just this render. */}
      <RegulationsLedger
        initialResources={regulationResources.map(toLedgerRowPayload)}
        initialArchived={data.archived}
        initialOverrides={data.overrides}
        aggregates={aggregates}
        initialPriorityFilter={priorityParam ?? null}
        initialRegionFilter={regionParam ?? null}
        initialOwnerFilter={ownerParam ?? null}
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
