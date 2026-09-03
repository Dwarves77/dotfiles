/**
 * Market Intel index (`/market`) — server component.
 *
 * Redesign TEMPLATE 04. Composes:
 *   - <EditorialMasthead> — 4px brand rule (shell) + blue VOL eyebrow +
 *     Anton "Market Intelligence" title + a muted sub-line whose key counts
 *     are bold ink (HANDOFF §5). Market signals are unverified by design, so
 *     the sub-line states that plainly.
 *   - <MarketIntelLedger> — five severity tiles → three-band strip → Ask bar
 *     → severity-banded signal ledger (HANDOFF §6.4). Reuses the TEMPLATE 02
 *     index archetype.
 *   - <MarketSeriesBoard> — WO-16 layer 3: the missing reader for `market_series`, a
 *     different table from the intelligence-item rows above (dated numeric observations —
 *     EU oil bulletin product prices, EEX/ECB/EIA once built — not signal cards). Grouped
 *     by registry producer (src/lib/market/series-registry.mjs) via the pure
 *     buildSeriesBoard transform (src/lib/market/series-board-view-model.mjs); renders the
 *     honest "registered, not yet populated" state per producer instead of a blank hole.
 *
 * COUNTS (binding — THE severity card-swap): the tiles read
 * get_surface_counts('market').by_severity, the band strip reads .by_band,
 * and the masthead + header total read .total_items — migrations 148 + 149
 * are applied to prod so these are the live primary path. The ledger renders
 * ONLY the verified, category-routed market rows (fail CLOSED — never falls
 * through to the ungated seed). Counts are fail-soft (the ledger derives from
 * the loaded rows if the RPC bundle is absent) but never throw and are never
 * hard-coded to the mock snapshot.
 */

import { getMarketIntelItems, getSurfaceCounts } from "@/lib/data";
import { fetchMarketSeriesBoard } from "@/lib/supabase-server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { resolveServerBootstrap } from "@/lib/api/server-bootstrap";
import { fetchWatchMembership, type WatchMembershipEntry } from "@/lib/watchlist/membership";
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { MarketIntelLedger } from "@/components/market/MarketIntelLedger";
import { MarketSeriesBoard } from "@/components/market/MarketSeriesBoard";
import { MarketComparativeRibbon } from "@/components/market/MarketComparativeRibbon";
// Carbon cost per FEU overlay (spec 02 §6 item 3, lane CORR, 2026-09-02): "the single most defensible
// 'only we do this' component available to us." No fetch lives in CarbonCostOverlay itself (CORR write
// set) — this page assembles the per-corridor result via the pure carbonCostPerFeu() computation
// (src/lib/market/carbon-cost-per-feu.mjs) from data already checked into the repo: the DESNZ emission-
// factor fixture (scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json, an F34-compliant
// static import, never a runtime fs read) and CARBON_COST_CORRIDORS below — the same ADR-024 §4 worked
// example (CNSHA-NLRTM, ocean) scripts/entities/seed-corridors.mjs seeds into the entity spine, restated
// here rather than imported from that scripts/ module (this page stays inside src/, matching every other
// import on this file). Distance, payload and an EU ETS/FuelEU carbon price are the three inputs no
// licence-clear live source in this product carries yet (see carbon-cost-per-feu.mjs's own header for why
// each is a named GAP, not fabricated) — the overlay therefore renders today's honest state, and lights
// up with a real range the moment any lane adds a distance producer, a licence-clear payload convention,
// or the eex-eua market_series producer, with zero further code change here.
import { carbonCostPerFeu } from "@/lib/market/carbon-cost-per-feu.mjs";
import { CarbonCostOverlay, type CarbonCostOverlayEntry } from "@/components/market/CarbonCostOverlay";
import desnzEmissionFactors from "../../../scripts/gen/fixtures/emission-factors/desnz-modal-defaults-2025.json";
// Policy timeline (spec 02 §6 item 9): reuses the ALREADY-BUILT, RLS-scoped item_forward_events reader
// (src/lib/forward-events/read-upcoming.mjs, mounted here unmodified — see that component's own header
// for the read-layer contract). Genuinely dated and forward-looking ("days until" via formatEventDate),
// not a text brief — the distinction spec 02 §6 item 9 draws against Regulations' job. Scope is the
// workspace's tracked jurisdictions across ALL surfaces (the same feed Regulations mounts), not filtered
// to market-relevant mode/geography specifically — a market-scoped filter would need a new query
// parameter on read-upcoming.mjs (outside this lane's write set); stated honestly in the section's own
// copy below rather than presented as market-specific.
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";
// Spec 09 §1.1/§1.2/§1.7 (lane SPEC-09, wave 3, 2026-09-03): three self-contained server components, each
// reading its own table via the request-scoped service client (no props from this page's own fetches, no
// client fetch, no polling — see each component's own header). Order follows spec 09 §4's sequencing:
// surcharge audit first ("the only [Market Intel component] with an immediate cash payback"), then OEM
// roadmap, then rerouting. Indexation (§1.3) has no dedicated index-page component in this lane's write
// set — mechanics/arithmetic only, no customer-facing clause surface yet.
import { SurchargeAuditPanel } from "@/components/market/SurchargeAuditPanel";
import { OemRoadmapPanel } from "@/components/market/OemRoadmapPanel";
import { ReroutingPanel } from "@/components/market/ReroutingPanel";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies returns
// null; the category RPC early-returns empty and the static HTML would bake
// in total: 0. Force-dynamic renders on request with the cookie-auth context.
export const dynamic = "force-dynamic";

const BAND_VOCAB_SIZE = 3; // price / corporate / corridor (fixed taxonomy)

// The corridor(s) this overlay renders. ADR-024 §4's own worked example ("Shanghai–Rotterdam, ocean" —
// CNSHA/NLRTM) — the same pair seed-corridors.mjs's ADR_EXAMPLE_CORRIDORS falls back to when no live
// market_series/regional_data_facts row names a corridor (true for every run against today's live data;
// see that script's own header). Not invented for this page: it is the ADR's own illustration, restated
// here so this page never has to reach into scripts/ to render it.
const CARBON_COST_CORRIDORS: ReadonlyArray<{ label: string; origin: string; dest: string; mode: string }> = [
  { label: "Shanghai – Rotterdam, ocean", origin: "CNSHA", dest: "NLRTM", mode: "ocean" },
];

interface DesnzFixtureRow {
  mode: string;
  vehicle_class: string;
  quantity_basis: string;
  ttw_co2e: number | null;
  wtw_co2e?: number | null;
  wtt_co2e?: number | null;
  derivation: string | null;
  source_key?: string;
  factor_id?: string;
  [key: string]: unknown;
}

/** The DESNZ modal-default row matching a corridor's mode, or null when none exists (today: every ocean
 *  row in this fixture is a `needs_runner_fetch` shell with `ttw_co2e: null` — carbonCostPerFeu() itself
 *  turns that into the honest NO_FACTOR gap; this helper only narrows by mode, it never fabricates a row). */
function findFactorForMode(mode: string): DesnzFixtureRow | null {
  const rows = (desnzEmissionFactors as { source_key: string; rows: DesnzFixtureRow[] }).rows;
  return rows.find((r) => r.mode === mode) ?? null;
}

/** Builds the overlay entries for CARBON_COST_CORRIDORS. Pure composition of already-fetched/imported
 *  data through carbonCostPerFeu() — no I/O here, matching that module's own zero-dependency contract.
 *  distanceKm/payloadTonnesPerFeu/carbonPrice are null across the board today: no licence-clear distance
 *  dataset, no licence-clear tonnes-per-FEU convention, and market_series carries no eex-eua row yet (see
 *  carbon-cost-per-feu.mjs's header) — each renders as its own named GAP, never a fabricated number. */
function buildCarbonCostOverlays(): CarbonCostOverlayEntry[] {
  return CARBON_COST_CORRIDORS.map(({ label, origin, dest, mode }) => ({
    label,
    result: carbonCostPerFeu({
      corridor: { origin, dest, mode },
      factor: findFactorForMode(mode),
      distanceKm: null,
      payloadTonnesPerFeu: null,
      carbonPrice: null,
    }),
  }));
}

export default async function Market() {
  // Category-routed verified market rows (fail CLOSED) + the single-SoT
  // verified count bundle (by_severity tiles / by_band bands / total_items).
  // WO-16 layer 3: the market_series board runs alongside the category-routed rows above — a
  // separate table, separate fetcher (fetchMarketSeriesBoard fails soft to the empty/unpopulated
  // registry state, never throws), so its absence or emptiness never blocks the signal ledger.
  const [marketIntel, aggregates, seriesBoard, bootstrap] = await Promise.all([
    getMarketIntelItems(),
    getSurfaceCounts("market"),
    fetchMarketSeriesBoard(),
    // React.cache()-scoped (src/lib/api/server-bootstrap.ts) — the root layout already resolved
    // this once for the current request (or will, for a full document load); this call reuses that
    // same result rather than paying a second Supabase round trip.
    resolveServerBootstrap(),
  ]);

  // PERF-3 (2026-09-03, docs/audits/perf-load-times-2026-09-03.md item 2): one batched watchlist
  // read for every populated market_series row on this page, instead of each row's <WatchButton>
  // firing its own GET /api/watchlist on mount (six near-simultaneous requests, measured). See
  // src/lib/watchlist/membership.ts's header.
  const marketSeriesIds = seriesBoard.groups
    .filter((g) => g.state === "populated")
    .flatMap((g) => g.series.map((s) => s.id))
    .filter((id): id is string => !!id);
  const marketSeriesWatchMembership: Map<string, WatchMembershipEntry> = marketSeriesIds.length
    ? await fetchWatchMembership(getServiceSupabase(), {
        userId: bootstrap.user?.id ?? null,
        orgId: bootstrap.orgId,
        itemType: "market_series",
        itemIds: marketSeriesIds,
      })
    : new Map();

  const totalSignals = aggregates.totalItems || marketIntel.resources.length;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const boldInk = { fontWeight: 800, color: "var(--color-text-primary)" } as const;

  const meta = (
    <span>
      {today} · <span style={boldInk}>{totalSignals}</span> active{" "}
      {totalSignals === 1 ? "signal" : "signals"} · <span style={boldInk}>{BAND_VOCAB_SIZE}</span> signal
      bands · signals are unverified by design — timely first, confirmed later
    </span>
  );

  return (
    <>
      <EditorialMasthead title="Market Intelligence" meta={meta} />
      {/* Comparative ribbon (spec 02 §6 item 1): the 15-second "has anything moved" read, ahead of
          the signal ledger and the full series board. Renders nothing when no series is populated yet
          (MarketComparativeRibbon's own null-return), never an empty shell. */}
      <MarketComparativeRibbon board={seriesBoard} />
      {/* Carbon cost per FEU overlay (spec 02 §6 item 3): built from a static fixture + the ADR-024
          example corridor, never a fetch inside the component itself (CORR write set). Renders today's
          honest gap state until a distance producer, a licence-clear payload convention, or the eex-eua
          market_series producer lands. */}
      <CarbonCostOverlay overlays={buildCarbonCostOverlays()} />
      <MarketIntelLedger initialResources={marketIntel.resources} aggregates={aggregates} seriesBoard={seriesBoard} />
      <MarketSeriesBoard board={seriesBoard} watchMembership={marketSeriesWatchMembership} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 36px 0" }}>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            margin: "0 0 4px",
          }}
        >
          Policy timeline
        </p>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px", maxWidth: "82ch" }}>
          Dated, forward-looking obligations across your workspace&apos;s tracked jurisdictions — the same
          feed Regulations mounts, not yet filtered to market-relevant modes specifically.
        </p>
      </div>
      <UpcomingObligationsStrip variant="list" />
      {/* Spec 09 §1.2/§1.1/§1.7 (lane SPEC-09, wave 3, 2026-09-03): surcharge audit first per spec §4's
          own sequencing, then OEM roadmap, then rerouting. Each renders a single short "no rows yet"
          line when its table is empty (today's live state for all three — see scripts/spec09/SOURCES.md)
          rather than an empty card. */}
      <SurchargeAuditPanel />
      <OemRoadmapPanel />
      <ReroutingPanel />
    </>
  );
}
