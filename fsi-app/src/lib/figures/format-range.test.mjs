// Run: node --test src/lib/figures/format-range.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRange, formatNumber } from "./format-range.mjs";

test("a companion metric renders with its OWN unit, never the primary's currency (payback in years, /operations 2026-09-02)", () => {
  assert.equal(formatRange(2.08, 1.83, 1.64, "years", null), "1.64 years – 1.83 years – 2.08 years");
  assert.equal(formatRange(4.63, 4.7, 4.77, "USD/hour", null), "4.63 USD/hour – 4.7 USD/hour – 4.77 USD/hour");
});

test("a currency figure renders the currency as a prefix and prints ascending", () => {
  assert.equal(formatRange(375545, 460670, 545794, null, "USD"), "USD 375,545 – USD 460,670 – USD 545,794");
  assert.equal(formatRange(545794, 460670, 375545, null, "USD"), "USD 375,545 – USD 460,670 – USD 545,794");
});

test("a point-only figure and a partial triple render honestly (— for the missing band)", () => {
  assert.equal(formatRange(null, 12.5, null, "t CO2e", null), "12.5 t CO2e");
  assert.equal(formatRange(1, null, 3, "years", null), "1 years – — years – 3 years");
  assert.equal(formatNumber(null), "—");
});
