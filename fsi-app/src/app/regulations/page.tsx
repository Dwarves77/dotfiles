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
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
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
    getListingsOnly({ limit: LIST_FIRST_PAGE_SIZE, offset: 0 }),
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
  const lastSyncLabel = lastSync
    ? lastSync.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

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
      <RegulationsLedger
        initialResources={data.resources}
        initialArchived={data.archived}
        initialOverrides={data.overrides}
        aggregates={aggregates}
        initialPriorityFilter={priorityParam ?? null}
        initialRegionFilter={regionParam ?? null}
        initialOwnerFilter={ownerParam ?? null}
      />
    </>
  );
}
