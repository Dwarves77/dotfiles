// Run: node --test src/lib/figures/format-range.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRange, formatNumber, FIXED_LOCALE } from "./format-range.mjs";

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

// ── HYDRATION-59 (2026-09-07) ───────────────────────────────────────────────────────────────────
test("the display locale is pinned, and pinned to the SAME value as src/lib/format.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const formatTs = readFileSync(resolve(here, "../format.ts"), "utf8");
  const m = formatTs.match(/export const FIXED_LOCALE = "([^"]+)"/);
  assert.ok(m, "src/lib/format.ts must still export FIXED_LOCALE");
  assert.equal(FIXED_LOCALE, m[1], "two display locales would render two different numbers");
  // The defect itself: an unpinned locale renders a different string per viewer, which is a
  // hydration text mismatch on every load for every non-en-US browser.
  assert.equal(formatNumber(375545), "375,545");
  assert.notEqual((375545).toLocaleString("de-DE", { maximumFractionDigits: 0 }), formatNumber(375545));
});
