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
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { MarketIntelLedger } from "@/components/market/MarketIntelLedger";
import { MarketSeriesBoard } from "@/components/market/MarketSeriesBoard";
import { MarketComparativeRibbon } from "@/components/market/MarketComparativeRibbon";
// Policy timeline (spec 02 §6 item 9): reuses the ALREADY-BUILT, RLS-scoped item_forward_events reader
// (src/lib/forward-events/read-upcoming.mjs, mounted here unmodified — see that component's own header
// for the read-layer contract). Genuinely dated and forward-looking ("days until" via formatEventDate),
// not a text brief — the distinction spec 02 §6 item 9 draws against Regulations' job. Scope is the
// workspace's tracked jurisdictions across ALL surfaces (the same feed Regulations mounts), not filtered
// to market-relevant mode/geography specifically — a market-scoped filter would need a new query
// parameter on read-upcoming.mjs (outside this lane's write set); stated honestly in the section's own
// copy below rather than presented as market-specific.
import { UpcomingObligationsStrip } from "@/components/regulations/UpcomingObligationsStrip";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies returns
// null; the category RPC early-returns empty and the static HTML would bake
// in total: 0. Force-dynamic renders on request with the cookie-auth context.
export const dynamic = "force-dynamic";

const BAND_VOCAB_SIZE = 3; // price / corporate / corridor (fixed taxonomy)

export default async function Market() {
  // Category-routed verified market rows (fail CLOSED) + the single-SoT
  // verified count bundle (by_severity tiles / by_band bands / total_items).
  // WO-16 layer 3: the market_series board runs alongside the category-routed rows above — a
  // separate table, separate fetcher (fetchMarketSeriesBoard fails soft to the empty/unpopulated
  // registry state, never throws), so its absence or emptiness never blocks the signal ledger.
  const [marketIntel, aggregates, seriesBoard] = await Promise.all([
    getMarketIntelItems(),
    getSurfaceCounts("market"),
    fetchMarketSeriesBoard(),
  ]);

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
      <MarketIntelLedger initialResources={marketIntel.resources} aggregates={aggregates} seriesBoard={seriesBoard} />
      <MarketSeriesBoard board={seriesBoard} />
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
    </>
  );
}
