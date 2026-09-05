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
 *
 * PERF-10 (2026-09-04, root-cause fix, ADR-026 Follow-up): `force-dynamic` is REMOVED. It was set for
 * the reason the old comment above named (static generation has no cookies; resolveOrgIdFromCookies
 * would return null and bake in an empty total) — but get_market_intel_items/get_surface_counts BOTH
 * reject a NULL org_id via `_assert_org_membership` (Supabase, confirmed this lane), so force-dynamic
 * was never actually protecting a real degrade path here; it was masking the same root cause every
 * other route in this lane shared. getPublicMarketIntelItems / getPublicSurfaceCounts (src/lib/data.ts,
 * unstable_cache-wrapped, migration 306's `_public` RPC siblings) read no cookies and carry no
 * per-org-membership gate, so the page can render `○`/`◐` honestly instead of forcing dynamic to hide
 * a query that would have failed anyway. The market_series watch-membership batch read
 * (resolveViewerIdentityFromCookies + fetchWatchMembership) is also removed — see
 * MarketSeriesBoard.tsx's own PERF-10 header for how `watchMembership: null` is handled without ever
 * rendering a false "not watched" for a viewer who actually has watched a row.
 */

import { getPublicMarketIntelItems, getPublicSurfaceCounts } from "@/lib/data";
import { toLedgerRowPayload } from "@/lib/list-pagination";
import { fetchMarketSeriesBoard } from "@/lib/supabase-server";
import { formatLocaleDate } from "@/lib/format";
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
// Spec 09 §1.1/§1.2/§1.3/§1.7: four self-contained server components, each reading its own table via the
// request-scoped service client (no props from this page's own fetches, no client fetch, no polling — see
// each component's own header). Order follows spec 09 §4's sequencing: surcharge audit first ("the only
// [Market Intel component] with an immediate cash payback"), then OEM roadmap, then rerouting.
// IndexationPanel (§1.3, lane SPEC09-B, 2026-09-05) is the reader this table lacked at wave 3 — mechanics/
// arithmetic only (see that component's own header for why it never renders a computed "current" figure).
import { SurchargeAuditPanel } from "@/components/market/SurchargeAuditPanel";
import { OemRoadmapPanel } from "@/components/market/OemRoadmapPanel";
import { ReroutingPanel } from "@/components/market/ReroutingPanel";
import { IndexationPanel } from "@/components/market/IndexationPanel";

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
  // PERF-10 (2026-09-04): no per-viewer read runs here at all — see this file's header. The
  // market_series watch-membership batch read is gone; MarketSeriesBoard renders with
  // watchMembership: null, and each row's WatchButton resolves its own state client-side.
  const [marketIntel, aggregates, seriesBoard] = await Promise.all([
    getPublicMarketIntelItems(),
    getPublicSurfaceCounts("market"),
    fetchMarketSeriesBoard(),
  ]);

  const totalSignals = aggregates.totalItems || marketIntel.resources.length;
  const today = formatLocaleDate(new Date(), {
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
      {/* PERF-11 (2026-09-04): trimmed the same way /regulations' first-paint and remainder rows are —
          see toLedgerRowPayload's own header for the field accounting (confirmed by grep against
          MarketIntelLedger.tsx: it reads none of the fields the trim blanks). NOT a pagination change:
          live count, 2026-09-04, `surface_of()` grouped — market carries 55 verified items, under the
          60-row first-page convention this app uses elsewhere, so there is no "rest" to fetch on demand
          here the way there is on /regulations (1,316 verified items). PERF-MERGE: trim applies
          regardless of which RPC produced `marketIntel.resources` (toLedgerRowPayload is a generic
          Resource→Resource projection) — kept on top of PERF-10's org-independent
          getPublicMarketIntelItems() fetch. */}
      <MarketIntelLedger initialResources={marketIntel.resources.map(toLedgerRowPayload)} aggregates={aggregates} seriesBoard={seriesBoard} />
      {/* PERF-10 (2026-09-04): watchMembership is null — no per-viewer batch read runs on this page at
          all (see this file's header); each row's WatchButton resolves its own watch state
          client-side instead of arriving pre-seeded. */}
      <MarketSeriesBoard board={seriesBoard} watchMembership={null} />
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
          line when its table is empty rather than an empty card. IndexationPanel (§1.3, lane SPEC09-B,
          2026-09-05) added last — the CSV-upload customer-data reader this table lacked at wave 3. */}
      <SurchargeAuditPanel />
      <OemRoadmapPanel />
      <ReroutingPanel />
      <IndexationPanel />
    </>
  );
}
