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
import { EditorialMasthead } from "@/components/ui/EditorialMasthead";
import { MarketIntelLedger } from "@/components/market/MarketIntelLedger";

// Sprint 3 (2026-05-27): force-dynamic per /community precedent. Static
// generation at build time has no cookies; resolveOrgIdFromCookies returns
// null; the category RPC early-returns empty and the static HTML would bake
// in total: 0. Force-dynamic renders on request with the cookie-auth context.
export const dynamic = "force-dynamic";

const BAND_VOCAB_SIZE = 3; // price / corporate / corridor (fixed taxonomy)

export default async function Market() {
  // Category-routed verified market rows (fail CLOSED) + the single-SoT
  // verified count bundle (by_severity tiles / by_band bands / total_items).
  const [marketIntel, aggregates] = await Promise.all([
    getMarketIntelItems(),
    getSurfaceCounts("market"),
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
      <MarketIntelLedger initialResources={marketIntel.resources} aggregates={aggregates} />
    </>
  );
}
