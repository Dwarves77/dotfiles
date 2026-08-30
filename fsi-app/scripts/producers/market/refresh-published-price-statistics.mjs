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
// env var of its own — SERIES_ITEM_MAP (the ratified series -> item attachment) is EMPTY today (see that
// module's header for why guessing an attachment would misattribute a benchmark), so this script
// currently plans and writes ZERO rows regardless of --apply; the empty map IS the switch until an
// operator ratifies an entry.
//
// Usage:
//   node scripts/producers/market/refresh-published-price-statistics.mjs           # dry (default)
//   node scripts/producers/market/refresh-published-price-statistics.mjs --apply   # write (plans 0 rows today)
// Exit 0 done (including "nothing to do, map is empty") · 1 no DB creds on --apply.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveDisplayRows, SERIES_ITEM_MAP } from "../../../src/lib/market/refresh-published-price-statistics.mjs";
import { readAll, guardedInsert, guardedUpdate } from "../../lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected, or no creds needed for --dry */ }

const APPLY = process.argv.includes("--apply");

const cite = {
  skill: "market-series-spine (WO-16.2)",
  reason: "Refresh published_price_statistics display rows from the latest market_series observation per ratified series->item mapping.",
};

async function main() {
  const mappedCount = Object.keys(SERIES_ITEM_MAP).length;
  console.log(`refresh-published-price-statistics: SERIES_ITEM_MAP has ${mappedCount} ratified entr${mappedCount === 1 ? "y" : "ies"}${APPLY ? "" : " (DRY RUN)"}`);
  if (mappedCount === 0) {
    console.log(
      "no ratified series->item mapping yet — nothing to refresh (this is the honest default; see " +
        "src/lib/market/refresh-published-price-statistics.mjs's header for why one is not guessed here). Exiting.",
    );
    process.exit(0);
  }

  if (APPLY && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("refresh-published-price-statistics: --apply requires DB creds — none found (exit 1).");
    process.exit(1);
  }

  const seriesKeys = Object.keys(SERIES_ITEM_MAP);
  const marketSeriesRows = APPLY
    ? (await readAll("market_series", "series_key, reference_period, label, value_numeric, unit, currency, as_at_date")).filter((r) => seriesKeys.includes(r.series_key))
    : [];

  const displayRows = deriveDisplayRows(marketSeriesRows);
  console.log(`refresh-published-price-statistics: ${displayRows.length} display row(s) derived from ${marketSeriesRows.length} market_series row(s) read`);

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
