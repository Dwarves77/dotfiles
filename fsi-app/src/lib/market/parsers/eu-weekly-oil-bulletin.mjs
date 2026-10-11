import { producerFor } from "../series-registry.mjs";

const REGISTRY_ENTRY = producerFor("eu-oil-bulletin");

// slug -> { label, unit } — the closed product vocabulary. Unit is EUR/1000L for the automotive-fuel
// grades the Bulletin reports per 1000 litres, and EUR/tonne for the heavy-grade fuels it reports per
// tonne (the Bulletin's own dual-unit convention; a parser that assumed one unit for all six products
// would silently misstate five of them the first time a heavy-fuel-oil row arrived).
export const PRODUCTS = Object.freeze({
  "eurosuper-95": { label: "Euro-Super 95 (EU average, before taxes)", unit: "EUR/1000L" },
  "automotive-diesel": { label: "Automotive gas oil / diesel (EU average, before taxes)", unit: "EUR/1000L" },
  "heating-gas-oil": { label: "Heating gas oil (EU average, before taxes)", unit: "EUR/1000L" },
  "lpg-motor-fuel": { label: "LPG motor fuel (EU average, before taxes)", unit: "EUR/1000L" },
  "residual-fuel-oil-1pct": { label: "Residual fuel oil 1%S (EU average, before taxes)", unit: "EUR/tonne" },
  "heavy-fuel-oil-3-5pct": { label: "Heavy fuel oil 3.5%S (EU average, before taxes)", unit: "EUR/tonne" },
});

const WEEK_ENDING_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse one normalized CSV extract into market_series-shaped rows.
 *
 * Input contract (semicolon-delimited, header required, order-insensitive by name):
 *   week_ending;product;price_eur;n_member_states
 *   2026-08-24;automotive-diesel;1543.21;24
 *
 *   week_ending      ISO date (YYYY-MM-DD), the Monday the bulletin covers (its own "week of" date).
 *   product          one of the PRODUCTS keys above.
 *   price_eur        the before-tax EU-average price, decimal, '.' separator, no thousands separator.
 *   n_member_states  count of member states whose survey fed this week's average (envelope
 *                    n_observations — sample size behind the aggregate).
 *
 * @param {string} csvText
 * @returns {{ rows: Array<object>, warnings: string[] }}
 */
export function parseEuWeeklyOilBulletinCsv(csvText) {
  const warnings = [];
  const rows = [];
  const lines = String(csvText ?? "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) return { rows, warnings: ["empty input: no header, no data rows"] };

  const header = lines[0].split(";").map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const iWeek = col("week_ending");
  const iProduct = col("product");
  const iPrice = col("price_eur");
  const iN = col("n_member_states");

  if (iWeek < 0 || iProduct < 0 || iPrice < 0) {
    return {
      rows,
      warnings: [
        `header missing required column(s) — need week_ending, product, price_eur (n_member_states ` +
          `optional); got: ${header.join(", ")}`,
      ],
    };
  }

  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1; // 1-indexed, header counted
    const cells = lines[li].split(";").map((c) => c.trim());
    const weekEnding = cells[iWeek];
    const product = cells[iProduct];
    const priceRaw = cells[iPrice];
    const nRaw = iN >= 0 ? cells[iN] : undefined;

    if (!WEEK_ENDING_RE.test(weekEnding)) {
      warnings.push(`line ${lineNo}: bad week_ending "${weekEnding}" (expected YYYY-MM-DD) — row skipped`);
      continue;
    }
    const productDef = PRODUCTS[product];
    if (!productDef) {
      warnings.push(`line ${lineNo}: unrecognised product "${product}" — row skipped (not a fabricated unit)`);
      continue;
    }
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price <= 0) {
      warnings.push(`line ${lineNo}: bad price_eur "${priceRaw}" for ${product} — row skipped`);
      continue;
    }
    let nObservations = null;
    if (nRaw !== undefined && nRaw !== "") {
      const n = Number(nRaw);
      if (Number.isInteger(n) && n > 0) nObservations = n;
      else warnings.push(`line ${lineNo}: bad n_member_states "${nRaw}" for ${product} — n_observations left NULL`);
    }

    rows.push({
      series_key: `eu-oil-bulletin:${product}`,
      label: productDef.label,
      value_numeric: price,
      unit: productDef.unit,
      currency: "EUR",
      derivation: "observed",
      origin_class: "official",
      source_key: REGISTRY_ENTRY?.sourceKey ?? "ec_weekly_oil_bulletin",
      source_ref: `Weekly Oil Bulletin, week of ${weekEnding}`,
      n_observations: nObservations,
      method_version: null,
      as_at_date: weekEnding,
      reference_period: weekEnding,
    });
  }

  return { rows, warnings };
}
