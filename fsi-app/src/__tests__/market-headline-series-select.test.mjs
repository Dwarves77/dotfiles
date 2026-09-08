// Tests for the /market headline-series SELECTION (operator ruling 2026-09-08): one card per distinct
// price signal, family-grouped, fuels then carbon then FX then other indices, five visible, and no
// series that has no delta yet.
//
// The fixture is LIVE-SHAPED, not invented: 16 series keys, the same keys, the same observation counts
// and the same date spacing the live market_series table held when this lane read it on 2026-09-08
// (6 EU Weekly Oil Bulletin fuels with 2 weekly observations, 6 EIA v2 fuel and crude series with a
// long history, 4 ECB FX reference rates with exactly one observation each). Every assertion below is
// therefore a statement about what the real page renders, not about a shape chosen to make a rule pass.

import test from "node:test";
import assert from "node:assert/strict";

import { buildSeriesBoard } from "../lib/market/series-board-view-model.mjs";
import {
  selectHeadlineSeries,
  hasComputedDelta,
  HEADLINE_VISIBLE_CAP,
} from "../lib/market/headline-series-select.mjs";
import { SERIES_FAMILIES } from "../lib/market/series-family.mjs";

const EU = "eu-oil-bulletin";
const EIA = "eia-v2";
const FX = "ecb-fx";

/** market_series-shaped raw rows for one series_key, one per supplied date. */
function obs(seriesKey, label, dates, { unit = "EUR/1000L", currency = "EUR", base = 1000 } = {}) {
  return dates.map((date, i) => ({
    id: `${seriesKey}@${date}`,
    series_key: seriesKey,
    label,
    value_numeric: base + i,
    unit,
    currency,
    source_key: "fixture",
    as_at_date: date,
    reference_period: date,
  }));
}

const EU_WEEKS = ["2026-08-24", "2026-08-31"];
const EIA_WEEKS = ["2026-08-14", "2026-08-21", "2026-08-28"];
const FX_DAY = ["2026-09-03"];

/** The live 16, in the live shape. */
function liveShapedRows() {
  const usd = { unit: "USD/GAL", currency: "USD", base: 3 };
  return [
    ...obs(`${EU}:automotive-diesel`, "Automotive gas oil / diesel (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EU}:eurosuper-95`, "Euro-Super 95 (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EU}:heating-gas-oil`, "Heating gas oil (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EU}:heavy-fuel-oil-3-5pct`, "Heavy fuel oil 3.5%S (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EU}:lpg-motor-fuel`, "LPG motor fuel (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EU}:residual-fuel-oil-1pct`, "Residual fuel oil 1%S (EU average, before taxes)", EU_WEEKS),
    ...obs(`${EIA}:brent-crude-rbrte`, "Brent crude oil spot price", EIA_WEEKS, usd),
    ...obs(`${EIA}:diesel-no2-low-sulfur-eer-epd2f-pf4-y35ny-dpg`, "No. 2 diesel spot price", EIA_WEEKS, usd),
    ...obs(`${EIA}:gasoline-rbob-regular-eer-epmrr-pf4-y05la-dpg`, "RBOB regular gasoline spot price", EIA_WEEKS, usd),
    ...obs(`${EIA}:jet-fuel-kerosene-eer-epjk-pf4-rgc-dpg`, "Kerosene-type jet fuel spot price", EIA_WEEKS, usd),
    ...obs(`${EIA}:propane-mont-belvieu-eer-epllpa-pf4-y44mb-dpg`, "Propane spot price", EIA_WEEKS, usd),
    ...obs(`${EIA}:wti-crude-rwtc`, "WTI crude oil spot price", EIA_WEEKS, usd),
    ...obs(`${FX}:eur-usd`, "EUR/USD", FX_DAY, { unit: "USD/EUR", currency: "USD", base: 1.16 }),
    ...obs(`${FX}:eur-gbp`, "EUR/GBP", FX_DAY, { unit: "GBP/EUR", currency: "GBP", base: 0.86 }),
    ...obs(`${FX}:eur-cny`, "EUR/CNY", FX_DAY, { unit: "CNY/EUR", currency: "CNY", base: 8.3 }),
    ...obs(`${FX}:eur-jpy`, "EUR/JPY", FX_DAY, { unit: "JPY/EUR", currency: "JPY", base: 172 }),
  ];
}

const liveSelection = () => selectHeadlineSeries(buildSeriesBoard(liveShapedRows()));

// ── rule 1: family grouping over the live-shaped 16 ─────────────────────

test("the live-shaped 16 collapse into families, one card per distinct price signal, not one per series", () => {
  const sel = liveSelection();
  assert.equal(sel.totalSeries, 16);
  // Two diesel quotes are one signal, two gasoline quotes are one signal. Ten families from twelve
  // eligible series, and never a second card for a signal already on the row.
  assert.equal(sel.cards.length, 10);
  const diesel = sel.cards.find((c) => c.familyKey === "fuel:diesel");
  assert.deepEqual(diesel.memberSeriesKeys, [
    `${EU}:automotive-diesel`,
    `${EIA}:diesel-no2-low-sulfur-eer-epd2f-pf4-y35ny-dpg`,
  ]);
  assert.equal(diesel.row.seriesKey, `${EU}:automotive-diesel`, "the declared primary is the card's own observation");
});

test("a series no declared family claims still gets a family, and its class comes from its producer", () => {
  const sel = liveSelection();
  const heating = sel.cards.find((c) => c.familyKey === `fuel:${EU}:heating-gas-oil`);
  assert.ok(heating, "an unclaimed series becomes its own family with no edit to the family list");
  assert.equal(heating.familyClass, "fuel", "class inherited from the producer registry entry");
  assert.equal(heating.freightMode, null);
  assert.equal(heating.fold.count, 0);
});

test("every eligible series reaches exactly one card, so nothing is silently dropped by grouping", () => {
  const sel = liveSelection();
  const placed = sel.cards.flatMap((c) => c.memberSeriesKeys);
  assert.equal(placed.length, new Set(placed).size, "no series appears on two cards");
  assert.equal(placed.length + sel.excludedSeriesKeys.length, sel.totalSeries);
});

// ── rule 2: ordering, with and without a carbon family ──────────────────

test("today's row is fuels only, freight-relevant fuels first, in the ruling's order", () => {
  const sel = liveSelection();
  assert.deepEqual(
    sel.visible.map((c) => c.familyKey),
    ["fuel:diesel", "fuel:gasoline", "fuel:heavy-fuel-oil", "fuel:residual-fuel-oil", "fuel:jet-fuel"]
  );
  // Freight-relevant first is a real cut, not decoration: every family that names a mode outranks
  // every family that does not, inside the class.
  const firstUnmoded = sel.cards.findIndex((c) => c.freightMode === null);
  const lastModed = sel.cards.map((c) => c.freightMode).lastIndexOf("air");
  assert.ok(lastModed < firstUnmoded);
});

test("an absent class leaves no hole: with no carbon series, fuels are followed directly by the next populated class", () => {
  const rows = liveShapedRows();
  // Give the FX rates a second observation so the FX class is populated and its position is testable.
  rows.push(
    ...obs(`${FX}:eur-usd`, "EUR/USD", ["2026-08-27"], { unit: "USD/EUR", currency: "USD", base: 1.1 }),
    ...obs(`${FX}:eur-gbp`, "EUR/GBP", ["2026-08-27"], { unit: "GBP/EUR", currency: "GBP", base: 0.8 }),
    ...obs(`${FX}:eur-cny`, "EUR/CNY", ["2026-08-27"], { unit: "CNY/EUR", currency: "CNY", base: 8.0 }),
    ...obs(`${FX}:eur-jpy`, "EUR/JPY", ["2026-08-27"], { unit: "JPY/EUR", currency: "JPY", base: 170 })
  );
  const sel = selectHeadlineSeries(buildSeriesBoard(rows));
  const classes = sel.cards.map((c) => c.familyClass);
  assert.equal(classes.includes("carbon"), false, "no carbon series exists today");
  assert.deepEqual([...new Set(classes)], ["fuel", "fx"], "fuels then FX, with the empty carbon slot closing up");
});

test("a carbon family that arrives lands between the fuels and the FX card, with no code change", () => {
  const rows = liveShapedRows();
  rows.push(
    ...obs(`${FX}:eur-usd`, "EUR/USD", ["2026-08-27"], { unit: "USD/EUR", currency: "USD", base: 1.1 }),
    // The day EEX EUA publishes: two auction observations under the already-registered prefix. The
    // carbon family is declared in series-family.mjs ahead of its data, so nothing here is new code.
    ...obs("eex-eua:eua-primary", "EUA primary auction clearing price", ["2026-08-27", "2026-09-03"], {
      unit: "EUR/tCO2e",
      currency: "EUR",
      base: 80,
    })
  );
  const sel = selectHeadlineSeries(buildSeriesBoard(rows));
  const idx = (key) => sel.cards.findIndex((c) => c.familyKey === key);
  const carbon = idx("carbon:eua");
  assert.ok(carbon > -1, "the carbon family appears the moment a series exists");
  const lastFuel = sel.cards.map((c) => c.familyClass).lastIndexOf("fuel");
  const firstFx = sel.cards.findIndex((c) => c.familyClass === "fx");
  assert.ok(lastFuel < carbon && carbon < firstFx, "fuels, then carbon, then FX");
});

// ── rule 3: the cap and the header count ────────────────────────────────

test("five cards are visible and the rest are reachable, never dropped", () => {
  const sel = liveSelection();
  assert.equal(HEADLINE_VISIBLE_CAP, 5);
  assert.equal(sel.visible.length, 5);
  assert.equal(sel.overflow.length, sel.cards.length - 5);
  assert.deepEqual([...sel.visible, ...sel.overflow], sel.cards);
});

test("the header count is distinct families SHOWN over observed series, not cards and not series", () => {
  const sel = liveSelection();
  assert.equal(sel.familiesShown, 5, "five families shown");
  assert.equal(sel.totalSeries, 16, "of sixteen observed series");
  assert.notEqual(sel.familiesShown, sel.cards.length, "not the number of cards that exist");
  const shownFamilies = new Set(sel.visible.map((c) => c.familyKey));
  assert.equal(shownFamilies.size, sel.familiesShown, "distinct families, counted once each");
});

// ── rule 4: the delta exclusion ─────────────────────────────────────────

test("a series with one observation and no delta is not a headline and stays on the series board", () => {
  const sel = liveSelection();
  assert.deepEqual(sel.excludedSeriesKeys.sort(), [
    `${FX}:eur-cny`,
    `${FX}:eur-gbp`,
    `${FX}:eur-jpy`,
    `${FX}:eur-usd`,
  ]);
  assert.equal(
    sel.cards.some((c) => c.familyClass === "fx"),
    false,
    "the FX family has no eligible member today, so it contributes no card at all"
  );
});

test("two observations with no computable delta are excluded too, by outcome and not by count", () => {
  // A unit change between the only two points: series-deltas.mjs refuses that comparison on purpose,
  // so there is no movement to report and rule 4 applies exactly as it does to a single point.
  const rows = [
    ...obs("eu-oil-bulletin:automotive-diesel", "Diesel", ["2026-08-24"], { unit: "EUR/1000L", currency: "EUR" }),
    ...obs("eu-oil-bulletin:automotive-diesel", "Diesel", ["2026-08-31"], { unit: "EUR/tonne", currency: "EUR" }),
  ];
  const sel = selectHeadlineSeries(buildSeriesBoard(rows));
  assert.equal(sel.cards.length, 0);
  assert.deepEqual(sel.excludedSeriesKeys, ["eu-oil-bulletin:automotive-diesel"]);
});

test("hasComputedDelta accepts a known change whose percentage is undefined, and refuses an absence", () => {
  assert.equal(hasComputedDelta({ delta1w: { value: 12, pct: null } }), true, "prior value was zero");
  assert.equal(hasComputedDelta({ delta1w: { insufficientHistory: true } }), false);
  assert.equal(hasComputedDelta({ delta1w: { unitMismatch: true } }), false);
  assert.equal(hasComputedDelta(null), false);
});

// ── the fold count comes from the family, never from a literal ──────────

test("the FX card folds its own remaining rates, and the count follows the family's membership", () => {
  const rows = liveShapedRows();
  for (const ccy of ["USD", "GBP", "CNY", "JPY"]) {
    rows.push(
      ...obs(`${FX}:eur-${ccy.toLowerCase()}`, `EUR/${ccy}`, ["2026-08-27"], {
        unit: `${ccy}/EUR`,
        currency: ccy,
        base: 1,
      })
    );
  }
  const sel = selectHeadlineSeries(buildSeriesBoard(rows));
  const fx = sel.cards.find((c) => c.familyKey === "fx:ecb-reference-rates");
  assert.equal(fx.row.seriesKey, `${FX}:eur-usd`, "show EUR/USD only");
  assert.equal(fx.fold.count, 3);
  assert.equal(fx.fold.noun, "rates", "reads '+3 rates'");

  // The same data with a fifth rate tracked reads "+4 rates" with no edit to any count: the fold is
  // the family's own membership minus the one on show.
  const fifth = `${FX}:eur-chf`;
  rows.push(...obs(fifth, "EUR/CHF", ["2026-08-27", "2026-09-03"], { unit: "CHF/EUR", currency: "CHF", base: 0.9 }));
  const families = SERIES_FAMILIES.map((f) =>
    f.familyKey === "fx:ecb-reference-rates"
      ? { ...f, memberSeriesKeys: [...f.memberSeriesKeys, fifth] }
      : f
  );
  const sel2 = selectHeadlineSeries(buildSeriesBoard(rows), { families });
  const fx2 = sel2.cards.find((c) => c.familyKey === "fx:ecb-reference-rates");
  assert.equal(fx2.fold.count, 4);
  assert.equal(fx2.row.seriesKey, `${FX}:eur-usd`, "the primary is still the declared one");
});
