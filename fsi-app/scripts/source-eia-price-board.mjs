/**
 * source-eia-price-board.mjs
 *
 * DATA PROGRAM (operator ruling 2026-07-07: run the price feed with REAL cited
 * figures, never faked ticks). Populates published_price_statistics (migration
 * 151) — the Signal-Detail price board — with LIVE, dated, authoritative EIA
 * spot prices, keyed to the price-intelligence signal items.
 *
 * PROVENANCE (integrity rule — no invented figures, no faked ticks):
 *   - Every figure is pulled at RUN TIME from the EIA v2 API (api.eia.gov) using
 *     EIA_API_KEY. EIA = U.S. Energy Information Administration, the federal
 *     energy-statistics agency (registered source, tier 3). The API returns the
 *     exact published value + its release PERIOD (a weekly spot statistic, not a
 *     live market tick — exactly what the schema wants). No web-snippet guessing;
 *     the value and its date come straight from the authoritative release.
 *   - released_at = the EIA period. next_release_at = period + 7d (the series is
 *     weekly — cadence is a fact from the API's frequency=weekly, not inferred).
 *   - source_tier = 3 (EIA). context_line states "EIA weekly spot, week of <date>".
 *   - Carbon allowances (EUA) are intentionally NOT populated: EIA does not
 *     publish EU carbon prices, and there is no vetted source wired for them —
 *     that board stays honest-pending rather than fabricated.
 *
 * This is a re-runnable FEED WRITER: each run refreshes the board to EIA's
 * latest release. Idempotent per item — existing rows for the item are guarded-
 * deleted, then the current set inserted (snapshots on both).
 *
 * SAFETY: DRY-RUN by default; --execute writes via guarded db.mjs helpers.
 *   ONE EIA API call per series (free, no Browserless). No Sonnet, no scrape.
 *
 * RUN:
 *   node scripts/source-eia-price-board.mjs            # dry-run (fetches, prints)
 *   node scripts/source-eia-price-board.mjs --execute  # write the board
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readAll, guardedInsert, guardedDelete } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(ROOT, ".env.local"));
} catch {
  // env may already be loaded.
}

const EXECUTE = process.argv.includes("--execute");
const KEY = process.env.EIA_API_KEY;
if (!KEY) {
  console.error("EIA_API_KEY missing — cannot source authoritative price data.");
  process.exit(1);
}

// EIA source rows (registered). Petroleum spot + natural-gas spot.
const EIA_PET_SOURCE = "6901afb7-faaf-4156-9492-9907a09c5daf"; // eia.gov/dnav/pet/pet_pri_spt_s1_d.htm
const EIA_NG_SOURCE = "63f3ac51-55b1-460e-bebd-bcce00413583"; // eia.gov/dnav/ng/ng_pri_fut_s1_d.htm

// Signal items that carry a price board (verified 2026-07-07).
const ITEM_CRUDE_JET = "0980d468-79aa-4343-b353-7bd6d5b75c2b"; // Crude Oil & Jet Fuel Price Intelligence
const ITEM_LNG_NG = "b8da154a-149e-483a-9198-7039850006fc";    // LNG & Natural Gas Price Intelligence

// Board plan: which EIA series feed which item, with display metadata.
const BOARD = [
  {
    itemId: ITEM_CRUDE_JET,
    route: "petroleum/pri/spt",
    sourceId: EIA_PET_SOURCE,
    figures: [
      { series: "RWTC", label: "WTI Crude · Cushing OK", unit: "/bbl", money: true },
      { series: "RBRTE", label: "Brent Crude · Europe", unit: "/bbl", money: true },
      { series: "EER_EPJK_PF4_RGC_DPG", label: "Jet Fuel · US Gulf Coast", unit: "/gal", money: true },
    ],
  },
  {
    itemId: ITEM_LNG_NG,
    route: "natural-gas/pri/fut",
    sourceId: EIA_NG_SOURCE,
    figures: [
      { series: "RNGWHHD", label: "Natural Gas · Henry Hub", unit: "/MMBtu", money: true },
    ],
  },
];

const cite = {
  skill: "source-credibility-model",
  reason: "Price feed data program — EIA weekly spot prices (live via EIA v2 API), dated to the release period, keyed to the price-intelligence signal items",
};

async function fetchEiaLatest(route, series) {
  const url =
    `https://api.eia.gov/v2/${route}/data/?api_key=${KEY}` +
    `&frequency=weekly&data[0]=value&facets[series][]=${encodeURIComponent(series)}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`EIA ${series}: HTTP ${r.status}`);
  const j = await r.json();
  const row = (j?.response?.data || [])[0];
  if (!row) throw new Error(`EIA ${series}: no data`);
  return { value: Number(row.value), units: row.units, period: row.period, description: row["series-description"] || "" };
}

/** period (YYYY-MM-DD) + 7 days, ISO date — the weekly series' next release. */
function nextWeek(periodIso) {
  const [y, m, d] = periodIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 7));
  return dt.toISOString().slice(0, 10);
}

function money(v) {
  // Faithful to EIA precision: 2dp for $/bbl and $/MMBtu, 3dp preserved for
  // fractional-dollar fuels where EIA reports them (e.g. jet fuel 2.788).
  const s = Number.isInteger(v * 100) ? v.toFixed(2) : String(v);
  return `$${s}`;
}

async function main() {
  console.log(`\nsource-eia-price-board — ${EXECUTE ? "EXECUTE" : "DRY-RUN"}\n`);

  for (const board of BOARD) {
    console.log(`item ${board.itemId}`);
    // Fetch all figures for this item (live, dated).
    const rows = [];
    let sort = 0;
    for (const fig of board.figures) {
      const eia = await fetchEiaLatest(board.route, fig.series);
      const weekOf = eia.period;
      const row = {
        item_id: board.itemId,
        label: fig.label,
        value_display: fig.money ? money(eia.value) : String(eia.value),
        unit: fig.unit,
        context_line: `EIA weekly spot · week of ${weekOf}`,
        severity_tone: "neutral",
        source_tier: 3,
        released_at: eia.period,
        next_release_at: nextWeek(eia.period),
        next_release_label: "EIA weekly spot",
        sort_order: sort++,
      };
      rows.push(row);
      console.log(`  ${fig.label.padEnd(28)} ${row.value_display}${fig.unit}  released ${row.released_at}  (${eia.description.slice(0, 40)})`);
    }

    if (!EXECUTE) continue;

    // Idempotent refresh: guarded-delete this item's existing board rows, insert fresh.
    const existing = await readAll("published_price_statistics", "id, item_id", {
      match: (q) => q.eq("item_id", board.itemId),
    });
    if (existing.length) {
      const del = await guardedDelete("published_price_statistics", existing.map((r) => r.id), { cite });
      console.log(`  cleared ${del.deleted} prior row(s)`);
    }
    for (const row of rows) {
      await guardedInsert("published_price_statistics", row, { cite });
    }
    console.log(`  wrote ${rows.length} figure(s)`);
  }

  console.log(`\n${EXECUTE ? "done — board refreshed to EIA's latest weekly release" : "dry-run complete — pass --execute to write"}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
