// @ts-check
// Goldens for the OPERATOR-PRICED-LINE gate (operator final spend rulings 2026-07-13). The machine never
// proposes/defaults/anchors a price; spend authority is solely the operator's per-line cost, and the paid path
// refuses without a data-existence (inventory-miss) citation. Pure, env-free — red-then-green node --test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPricedLine, pricedLineHalts, PricedLineError } from "./priced-line.mjs";

// ── (a) DATA-EXISTENCE-BEFORE-ACQUISITION: no inventory-miss citation → REFUSED ──
test("(a) a priced line with NO inventory-miss citation is REFUSED", () => {
  assert.throws(() => assertPricedLine({ operatorCostUsd: 2.5 }), PricedLineError);
  assert.throws(() => assertPricedLine({ operatorCostUsd: 2.5, inventoryMiss: "" }), /INVENTORY_MISS/);
  assert.throws(() => assertPricedLine({ operatorCostUsd: 2.5, inventoryMiss: "   " }), /INVENTORY_MISS/);
});

// ── (b) OPERATOR-SETS-COST: citation but NO operator price → REFUSED (no default/anchor) ──
test("(b) a priced line with a citation but NO operator price is REFUSED (machine never defaults a price)", () => {
  const miss = "checked snapshot_store + provisional_sources for src-9; no stored enacted text (miss)";
  assert.throws(() => assertPricedLine({ inventoryMiss: miss }), PricedLineError);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: null }), /NO_COST/);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: 0 }), /NO_COST/);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: -1 }), /NO_COST/);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: Number.NaN }), /NO_COST/);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: Number.POSITIVE_INFINITY }), /NO_COST/);
  assert.throws(() => assertPricedLine({ inventoryMiss: miss, operatorCostUsd: "2.5" }), /NO_COST/);
});

test("assertPricedLine refuses a null/non-object line entirely", () => {
  assert.throws(() => assertPricedLine(undefined), /PRICED_LINE_REQUIRED/);
  assert.throws(() => assertPricedLine(null), /PRICED_LINE_REQUIRED/);
});

// ── (c) citation + price → PERMITTED, and permitted UP TO the price ──
test("(c) a priced line with BOTH an inventory-miss citation AND an operator price is PERMITTED up to the price", () => {
  const line = { operatorCostUsd: 3.0, inventoryMiss: "checked holdings for item-x enacted text; miss" };
  assert.doesNotThrow(() => assertPricedLine(line));
  // permitted while item spend is under the operator price
  assert.equal(pricedLineHalts(0, line), false);
  assert.equal(pricedLineHalts(2.99, line), false);
});

// ── (d) item ledger REACHING the price → HALT (>=, at the price too) ──
test("(d) item ledger reaching the operator price HALTS the line", () => {
  const line = { operatorCostUsd: 3.0, inventoryMiss: "miss cited" };
  assert.equal(pricedLineHalts(3.0, line), true);   // exactly at the price halts (>=)
  assert.equal(pricedLineHalts(4.25, line), true);  // over the price halts
});

// ── NO DEFAULT TOLERANCE: absent tolerance behaves as 0; a supplied tolerance shifts the halt point ──
test("tolerance defaults to 0 (never anchored) and, when supplied, shifts the halt threshold", () => {
  const noTol = { operatorCostUsd: 1.0, inventoryMiss: "miss" };
  assert.equal(pricedLineHalts(1.0, noTol), true);          // 1.0 >= 1.0 + 0
  const withTol = { operatorCostUsd: 1.0, inventoryMiss: "miss", toleranceUsd: 0.5 };
  assert.equal(pricedLineHalts(1.0, withTol), false);       // 1.0 < 1.0 + 0.5
  assert.equal(pricedLineHalts(1.5, withTol), true);        // 1.5 >= 1.0 + 0.5
  assert.doesNotThrow(() => assertPricedLine(withTol));
  // a malformed tolerance is refused (never silently defaulted)
  assert.throws(() => assertPricedLine({ operatorCostUsd: 1, inventoryMiss: "m", toleranceUsd: -0.1 }), /TOLERANCE/);
  assert.throws(() => assertPricedLine({ operatorCostUsd: 1, inventoryMiss: "m", toleranceUsd: "0.5" }), /TOLERANCE/);
});

test("assertPricedLine returns the validated line (usable inline in the guard chain)", () => {
  const line = { operatorCostUsd: 0.5, inventoryMiss: "miss" };
  assert.equal(assertPricedLine(line), line);
});
