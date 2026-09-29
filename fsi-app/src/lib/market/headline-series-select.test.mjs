// headline-series-select.test.mjs - class coverage for the /market headline row (lane W2-F, WS10,
// 2026-09-29; rule 19 "examples are not scope").
//
// THE QUESTION this module answers: "which price series matter to this workspace's corridors and
// modes, for ANY series family the market_series registry carries, not just fuel." Before this file,
// selectHeadlineSeries() had ZERO tests (confirmed: no headline-series-select.test.mjs existed in this
// directory) even though it is the entire query-rule implementation the operator ruled on 2026-09-08,
// exactly the "proof that does not execute is not a proof" gap CLAUDE.md rule 15 names. The intent-vs-
// live audit (docs/archive/logs/intent-vs-live-and-competition-2026-09-24.md) found the /market page
// itself fuel-heavy in PRACTICE (2 of 3 built producers were fuel, live data on 2026-09-08 put 5 of 5
// headline slots on fuel), but the SELECTION MECHANISM in this module was already generalised by the
// 2026-09-08 ruling to read family/class from series-registry.mjs's producer table (fuel, carbon, fx,
// index), not from a fuel-only branch. What was missing was proof: nothing showed a non-fuel family
// could actually reach the headline row. This file supplies that proof with real registry keys,
// series-registry.mjs's own eex-eua (carbon) and ecb-fx (fx) producer entries, never invented names
// (rule 2), so a regression that silently made carbon or FX unselectable would fail here.

import test from "node:test";
import assert from "node:assert/strict";
import { selectHeadlineSeries, hasComputedDelta, HEADLINE_VISIBLE_CAP } from "./headline-series-select.mjs";

/** A minimal buildSeriesBoard-shaped row: enough fields for flattenBoardRows + the selection rules. */
function row(seriesKey, label, { delta1w = null, observationCount = 2 } = {}) {
  return {
    seriesKey,
    label,
    observationCount,
    deltas: { delta1w, delta1m: null, deltaYoY: null },
  };
}

function boardOf(...rows) {
  return { groups: [{ series: rows }], unregistered: [] };
}

const UP_1W = { value: 0.4, direction: "up" };

test("hasComputedDelta: true only when at least one window carries a numeric change", () => {
  assert.equal(hasComputedDelta(null), false);
  assert.equal(hasComputedDelta({ delta1w: null, delta1m: null, deltaYoY: null }), false);
  assert.equal(hasComputedDelta({ delta1w: { value: 0.1 } }), true);
  assert.equal(hasComputedDelta({ deltaYoY: { value: -0.2 } }), true);
});

// ── Class coverage: every family class the registry declares can reach the headline row ──────────
test("class coverage: a real carbon-class series (eex-eua, series-registry.mjs) headlines, not only fuel", () => {
  const board = boardOf(
    row("eu-oil-bulletin:automotive-diesel", "Diesel EU avg", { delta1w: UP_1W }),
    row("eex-eua:eua-primary", "EUA EU ETS auction clearing", { delta1w: UP_1W }),
  );
  const { visible } = selectHeadlineSeries(board);
  const classes = visible.map((c) => c.familyClass);
  assert.ok(classes.includes("carbon"), `expected a carbon card among ${JSON.stringify(classes)}`);
  assert.ok(classes.includes("fuel"), `expected a fuel card among ${JSON.stringify(classes)}`);
});

test("class coverage: a real fx-class series (ecb-fx, series-registry.mjs) headlines, not only fuel", () => {
  const board = boardOf(
    row("eu-oil-bulletin:eurosuper-95", "Euro-Super 95 EU avg", { delta1w: UP_1W }),
    row("ecb-fx:eur-usd", "EUR/USD ECB ref.", { delta1w: UP_1W }),
  );
  const { visible } = selectHeadlineSeries(board);
  const classes = visible.map((c) => c.familyClass);
  assert.ok(classes.includes("fx"), `expected an fx card among ${JSON.stringify(classes)}`);
});

test("class coverage: fuel, carbon and fx together sort fuel before carbon before fx (ruling step 2)", () => {
  const board = boardOf(
    row("ecb-fx:eur-usd", "EUR/USD ECB ref.", { delta1w: UP_1W }),
    row("eex-eua:eua-primary", "EUA EU ETS auction clearing", { delta1w: UP_1W }),
    row("eu-oil-bulletin:automotive-diesel", "Diesel EU avg", { delta1w: UP_1W }),
  );
  const { visible } = selectHeadlineSeries(board);
  const order = visible.map((c) => c.familyClass);
  const fuelIdx = order.indexOf("fuel");
  const carbonIdx = order.indexOf("carbon");
  const fxIdx = order.indexOf("fx");
  assert.ok(fuelIdx < carbonIdx, `fuel must sort before carbon: ${JSON.stringify(order)}`);
  assert.ok(carbonIdx < fxIdx, `carbon must sort before fx: ${JSON.stringify(order)}`);
});

test("an unregistered series (no producer prefix match) still reaches the board as its own family, class 'index'", () => {
  const board = boardOf(row("unclaimed-vendor:some-index", "Some unclaimed index", { delta1w: UP_1W }));
  const { visible } = selectHeadlineSeries(board);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].familyClass, "index");
});

test("rule 4: a series with no computed delta on any window never reaches the headline row", () => {
  const board = boardOf(
    row("eu-oil-bulletin:automotive-diesel", "Diesel EU avg", { delta1w: UP_1W }),
    row("ecb-fx:eur-gbp", "EUR/GBP ECB ref.", { delta1w: null }), // single observation, no delta yet
  );
  const { visible, excludedSeriesKeys } = selectHeadlineSeries(board);
  assert.equal(visible.some((c) => c.memberSeriesKeys.includes("ecb-fx:eur-gbp")), false);
  assert.ok(excludedSeriesKeys.includes("ecb-fx:eur-gbp"));
});

test("cap: never more than HEADLINE_VISIBLE_CAP families visible, extra families overflow rather than drop", () => {
  const rows = [];
  for (let i = 0; i < HEADLINE_VISIBLE_CAP + 3; i++) {
    rows.push(row(`unclaimed-${i}:index`, `Unclaimed index ${i}`, { delta1w: UP_1W }));
  }
  const { visible, overflow, cards } = selectHeadlineSeries(boardOf(...rows));
  assert.equal(visible.length, HEADLINE_VISIBLE_CAP);
  assert.equal(overflow.length, rows.length - HEADLINE_VISIBLE_CAP);
  assert.equal(cards.length, rows.length);
});
