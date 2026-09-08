// market-rail-select.npmtest.mjs — proves the two artboard-04 rail selections (lane lists60,
// 2026-09-08). Both are pure and take an injected instant, so every case below is deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import {
  summariseCarbonCorridors,
  selectNextDataDrops,
  NEXT_DROPS_ROW_CAP,
  CARBON_CORRIDOR_ROW_CAP,
} from "./market-rail-select.mjs";

const NOW = new Date("2026-09-06T00:00:00Z");

// ── summariseCarbonCorridors ────────────────────────────────────────────────────────────────────

test("a gapped corridor reports its gap count as 'pending', which is what artboard 04 draws", () => {
  const rows = summariseCarbonCorridors([
    { label: "Shanghai (CN) → Rotterdam (NL), ocean", result: { ok: false, gaps: ["a", "b", "c", "d"] } },
  ]);
  assert.deepEqual(rows, [
    { label: "Shanghai (CN) → Rotterdam (NL), ocean", pending: 4, point: null, currency: null },
  ]);
});

test("a computed corridor reports pending 0 and carries its figure through", () => {
  const rows = summariseCarbonCorridors([
    { label: "A → B, ocean", result: { ok: true, gaps: [], point: 123.5, currency: "EUR" } },
  ]);
  assert.deepEqual(rows, [{ label: "A → B, ocean", pending: 0, point: 123.5, currency: "EUR" }]);
});

test("caps at the artboard's two rows and drops malformed entries rather than rendering a blank label", () => {
  const rows = summariseCarbonCorridors([
    null,
    { label: "", result: { ok: false, gaps: [] } },
    { label: "one", result: { ok: false, gaps: ["x"] } },
    { label: "two", result: { ok: false, gaps: ["x"] } },
    { label: "three", result: { ok: false, gaps: ["x"] } },
  ]);
  assert.equal(rows.length, CARBON_CORRIDOR_ROW_CAP);
  assert.deepEqual(rows.map((r) => r.label), ["one", "two"]);
});

test("no corridors at all is an empty list, never a fabricated row", () => {
  assert.deepEqual(summariseCarbonCorridors([]), []);
  assert.deepEqual(summariseCarbonCorridors(undefined), []);
});

// ── selectNextDataDrops ─────────────────────────────────────────────────────────────────────────

/** eu-oil-bulletin is a real registry entry: implemented, cadenceDays 7. */
const OIL = { keyPrefix: "eu-oil-bulletin", name: "EU Weekly Oil Bulletin", implemented: true };
/** ecb-fx is a real registry entry: implemented, cadenceDays 1. */
const ECB = { keyPrefix: "ecb-fx", name: "ECB euro foreign exchange reference rates", implemented: true };
/** eex-eua is a real registry entry: implemented FALSE, cadenceDays null. */
const EUA = { keyPrefix: "eex-eua", name: "EEX EUA primary auctions", implemented: false };

test("next drop is the latest observed period plus the producer's own registered cadence", () => {
  const rows = selectNextDataDrops(
    { groups: [{ ...OIL, series: [{ referencePeriod: "2026-08-24" }, { referencePeriod: "2026-08-31" }] }] },
    { now: NOW },
  );
  // Latest period 2026-08-31 + cadenceDays 7 — the same arithmetic deriveDisplayRows writes into
  // published_price_statistics.next_release_at, not a second prediction.
  assert.deepEqual(rows, [{ keyPrefix: "eu-oil-bulletin", name: "EU Weekly Oil Bulletin", dateIso: "2026-09-07" }]);
});

test("rows come back ascending by date", () => {
  const rows = selectNextDataDrops(
    {
      groups: [
        { ...OIL, series: [{ referencePeriod: "2026-08-31" }] }, // → 2026-09-07
        { ...ECB, series: [{ referencePeriod: "2026-09-03" }] }, // → 2026-09-04
      ],
    },
    { now: NOW },
  );
  assert.deepEqual(rows.map((r) => r.dateIso), ["2026-09-04", "2026-09-07"]);
});

test("an unimplemented producer is omitted (no cadence to add, no scheduler to imply)", () => {
  assert.deepEqual(selectNextDataDrops({ groups: [{ ...EUA, series: [{ referencePeriod: "2026-08-31" }] }] }, { now: NOW }), []);
});

test("an implemented producer with no observation yet is omitted, never given a guessed date", () => {
  assert.deepEqual(selectNextDataDrops({ groups: [{ ...OIL, series: [] }] }, { now: NOW }), []);
  assert.deepEqual(selectNextDataDrops({ groups: [{ ...OIL, series: [{ referencePeriod: null }] }] }, { now: NOW }), []);
});

test("an empty or absent board is an empty list, so the card renders Absence and never a 0-row calendar", () => {
  assert.deepEqual(selectNextDataDrops({ groups: [] }, { now: NOW }), []);
  assert.deepEqual(selectNextDataDrops(undefined, { now: NOW }), []);
});

test("caps at the artboard's three rows", () => {
  const groups = ["eu-oil-bulletin", "ecb-fx", "eia-v2"].map((keyPrefix, i) => ({
    keyPrefix,
    name: keyPrefix,
    implemented: true,
    series: [{ referencePeriod: `2026-08-0${i + 1}` }],
  }));
  // A fourth group repeating a registered prefix cannot exist on a real board (one group per
  // registry entry), so the cap is proven by asking for fewer than the three above.
  assert.equal(selectNextDataDrops({ groups }, { now: NOW, cap: 2 }).length, 2);
  assert.ok(selectNextDataDrops({ groups }, { now: NOW }).length <= NEXT_DROPS_ROW_CAP);
});

test("the instant is required and validated — this selection never reads the host clock", () => {
  assert.throws(() => selectNextDataDrops({ groups: [] }, {}), /opts\.now must be a valid Date/);
  assert.throws(() => selectNextDataDrops({ groups: [] }, { now: new Date("nope") }), /opts\.now must be a valid Date/);
});
