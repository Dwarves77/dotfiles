// Parser for the EU Weekly Oil Bulletin (WO-16's first market_series producer).
//
// SCOPE OF THIS LANE, STATED HONESTLY. This module parses a NORMALIZED CSV extract of the bulletin —
// week_ending;product_slug;price_eur;n_member_states — into market_series rows. It does NOT fetch the
// live publication from the European Commission (energy.ec.europa.eu). Building that fetch/normalize
// step requires verifying the live file's exact machine-readable shape against a real network read,
// which this lane does not perform (rule 0.15 / CLAUDE.md rule 2 — never fabricate a claim about an
// external format not actually read). scripts/producers/market/eu-weekly-oil-bulletin.mjs's own header
// names this as the specific, small follow-up a later pass adds (a `fetchBulletin()` that downloads the
// live file and normalizes it to the CSV contract below); this module and its CLI caller work from
// `--input <path>` (or stdin) today, and are fully testable against the committed fixture without it.
//
// THE PRODUCT LINE (public knowledge, not fabricated — the Bulletin's own published product set):
// Euro-Super 95, automotive gas oil (diesel), heating gas oil and LPG motor fuel are quoted in EUR per
// 1000 litres; residual/heavy fuel oil grades are quoted in EUR per tonne. PRODUCTS below is the closed
// vocabulary this parser recognises; an unrecognised product_slug is a WARNING (skipped, not thrown —
// a single bad row must never sink an entire week's upsert), never a silently-accepted guess at a unit.
//
// EVERY ROW GETS THE FULL ENVELOPE (WO-16 executor brief: "Every row it produces must carry a full
// envelope AND origin_class from day one"): derivation='observed' (these are the primary reported
// national-survey prices, not a calculation), origin_class='official' (European Commission publication).
// source_key names the registry's producer entry (src/lib/market/series-registry.mjs), a REGISTERED
// public.data_sources row since 2026-08-30 (CC BY 4.0, Decision 2011/833/EU — see the registry entry's
// note). Every row this parser emits carries it, so any future de-registration fails closed at the FK,
// never by this parser silently omitting provenance.
//
// PLAIN ESM, ZERO DEPENDENCIES. Pure — no fs, no fetch, no clock read (asAtDate/referencePeriod come
// straight from the input's own week_ending column, never from `new Date()`).

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
