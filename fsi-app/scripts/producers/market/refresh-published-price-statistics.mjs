#!/usr/bin/env node
// refresh-published-price-statistics.mjs — WO-16 step 4. The WO-16.2 ruling (option a, held —
// docs/plans/connection-redesign-and-build-scope-2026-08-29.md §4): FEED published_price_statistics
// from market_series with a small, separate refresher. PriceBoard and its query
// (fsi-app/src/app/market/[slug]/page.tsx:149-168, fsi-app/src/components/pages/
// MarketSignalDetailSurface.tsx PriceBoard) are UNCHANGED by this WO — verified by reading both files
// this session; neither needs a code change because this script writes into the SAME table shape they
// already read.
//
// SHAPE: read market_series (src/lib/market/refresh-published-price-statistics.mjs deriveDisplayRows,
// pure) -> guarded upsert into published_price_statistics (scripts/lib/db.mjs — readAll/guardedInsert/
// guardedUpdate). DRY-BY-DEFAULT (WO-16 executor brief step 4): --apply required to write. No kill-switch
// env var of its own — SERIES_ITEM_MAP (the series -> item attachment, src/lib/market/
// series-item-map.mjs) carries every oil-bulletin series but every entry is UNRATIFIED (`item_id: null`,
// pending ruling R-D — see that JSON file's own header), so this script currently plans and writes ZERO
// rows regardless of --apply; the unratified map IS the switch until an operator ratifies an entry.
//
// Usage:
//   node scripts/producers/market/refresh-published-price-statistics.mjs                 # dry (default)
//   node scripts/producers/market/refresh-published-price-statistics.mjs --apply         # write (plans 0 rows today)
//   node scripts/producers/market/refresh-published-price-statistics.mjs --propose-items # print the 6 R-D mint payloads, no write
// Exit 0 done (including "nothing to do, map has no ratified entries") · 1 no DB creds on --apply.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProposedItemPayloads } from "./propose-series-items.mjs";
import {
  deriveDisplayRows, unmappedSeriesKeys, isRatified, SERIES_ITEM_MAP,
} from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected, or no creds needed for --dry */ }

const APPLY = process.argv.includes("--apply");
const PROPOSE_ITEMS = process.argv.includes("--propose-items");

const cite = {
  skill: "market-series-spine (WO-16.2)",
  reason: "Refresh published_price_statistics display rows from the latest market_series observation per ratified series->item mapping.",
};

// ── --propose-items: the captured page text buildProposedItemPayloads needs ────────────────────────────
// Captured via WebFetch on 2026-09-02 (lane PROD-FIX) against https://energy.ec.europa.eu/data-and-
// analysis/weekly-oil-bulletin_en — this container's egress proxy denies a direct curl to
// energy.ec.europa.eu (org policy, same denial fetch-oil-bulletin.mjs's own header already documents for
// this exact host), so WebFetch (Anthropic's own fetch path, not this container's egress) is how every
// live gov/EU fetch in this lane was performed; see that script's header and this lane's report for the
// full account. Embedded here (not a new fixture file) because this lane's write set names this CLI
// script, not a new fixtures/ path. record-facts.mjs's market_signal required slots (action_now,
// conversion_trigger, driving_parties, signal_event) have no SLOT_TRIGGERS entry, so every proposed
// payload's slot claims are honest GAP claims regardless of this text's exact content — see that file's
// own header ("Other item_types' required slots ... have no entry below and always resolve to an honest
// GAP claim"); what this text supports is the identity/citation half (search_results[0], a genuine
// capture of the real page), not slot coverage.
const CAPTURED_BULLETIN_PAGE_TEXT = `Weekly Oil Bulletin

Information and maps showing weekly updates on prices of petroleum products in all EU countries

To improve the transparency of oil prices and to strengthen the internal market, the European Commission's Oil Bulletin presents weekly consumer prices for petroleum products in EU countries. The national data and prices are submitted to the Commission on Wednesdays and our subscribers receive the bulletin per mail every Thursday.

Users can subscribe to receive the bulletin via email.

Available downloads (all dated 27 August 2026): Prices with taxes (XLSX), Prices without taxes (XLSX), Eurosuper 95 map (PDF), Diesel map (PDF).

Taxes on Petroleum Products: documentation covering value added taxes, excise duties, and other indirect taxes applicable to petroleum products across EU member states, provided in spreadsheet format.

Price Developments: historical pricing information spanning from 2005 onward, including data on taxes, duties, and consumption patterns across EU nations.

Methodological Documentation: the page provides country-specific methodology notes for all 27 EU member states explaining their individual price reporting approaches.

Additional Resources: historical regulatory documents from 1999-2013 addressing crude oil supply costs and petroleum product pricing procedures are included.`;

async function main() {
  if (PROPOSE_ITEMS) {
    const payloads = buildProposedItemPayloads({ capturedText: CAPTURED_BULLETIN_PAGE_TEXT });
    console.log(
      `refresh-published-price-statistics --propose-items: ${payloads.length} record-grade mint payload(s) ` +
      `drafted for ruling R-D (none minted — every source.id is a placeholder, see each payload's ` +
      `_proof_note)`,
    );
    console.log(JSON.stringify(payloads, null, 2));
    process.exit(0);
  }

  const ratifiedCount = SERIES_ITEM_MAP.filter(([, entry]) => isRatified(entry)).length;
  const pendingCount = SERIES_ITEM_MAP.length - ratifiedCount;
  console.log(
    `refresh-published-price-statistics: SERIES_ITEM_MAP has ${ratifiedCount} ratified entr${ratifiedCount === 1 ? "y" : "ies"} ` +
    `and ${pendingCount} pending (unratified)${APPLY ? "" : " (DRY RUN)"}`,
  );
  if (ratifiedCount === 0) {
    const pendingKeys = SERIES_ITEM_MAP.filter(([, entry]) => !isRatified(entry)).map(([key]) => key);
    console.log(
      `no ratified series->item mapping yet — nothing to refresh (this is the honest default; see ` +
        `src/lib/market/refresh-published-price-statistics.mjs's header for why one is not guessed here). ` +
        `unmapped (pending, not silently skipped): ${pendingKeys.join(", ")}. Exiting.`,
    );
    process.exit(0);
  }

  if (APPLY && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("refresh-published-price-statistics: --apply requires DB creds — none found (exit 1).");
    process.exit(1);
  }

  const seriesKeys = SERIES_ITEM_MAP.map(([key]) => key);
  const marketSeriesRows = APPLY
    ? (await readAll("market_series", "series_key, reference_period, label, value_numeric, unit, currency, as_at_date")).filter((r) => seriesKeys.includes(r.series_key))
    : [];

  const displayRows = deriveDisplayRows(marketSeriesRows);
  const unmapped = unmappedSeriesKeys(marketSeriesRows);
  console.log(`refresh-published-price-statistics: ${displayRows.length} display row(s) derived from ${marketSeriesRows.length} market_series row(s) read`);
  if (unmapped.length) {
    console.log(`refresh-published-price-statistics: unmapped series, not silently skipped (${unmapped.length}): ${unmapped.join(", ")}`);
  }

  if (!APPLY) {
    for (const r of displayRows) console.log(`  would upsert  item_id=${r.item_id}  ${r.label}: ${r.value_display}${r.unit ?? ""}`);
    console.log("DRY RUN — nothing written. Pass --apply to write (once SERIES_ITEM_MAP has ratified entries).");
    process.exit(0);
  }

  // Idempotent on (item_id, label) — published_price_statistics has no UNIQUE constraint of its own
  // (Appendix A schema truth: 13 cols, sort_order + created_at, no unique key beyond id), so this
  // refresher owns its own idempotency key exactly the way source-state-min-wage.mjs owns
  // (state_code,dimension,fact_label) over a table with the same shape of gap.
  const existing = await readAll("published_price_statistics", "id, item_id, label");
  const byKey = new Map(existing.map((r) => [`${r.item_id}|${r.label}`, r]));

  let created = 0, updated = 0;
  for (const r of displayRows) {
    const key = `${r.item_id}|${r.label}`;
    const prior = byKey.get(key);
    if (prior) {
      await guardedUpdate("published_price_statistics", (qb) => qb.eq("id", prior.id), r, { cite });
      updated += 1;
    } else {
      await guardedInsert("published_price_statistics", r, { cite });
      created += 1;
    }
  }
  console.log(`done — ${created} created, ${updated} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
