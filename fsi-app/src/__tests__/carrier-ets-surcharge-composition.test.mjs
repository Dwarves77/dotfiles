// carrier-ets-surcharge-composition.test.mjs, the F27 seam proof for
// scripts/producers/market/carrier-ets-surcharge-producer.mjs (lane ETS-PROXY, 2026-09-28).
//
// WHY THIS EXISTS. market-producer-composition.test.mjs already proves the SAME class of seam (parser ->
// planMarketSeriesUpsert -> authorMarketSeriesDeltaEdges) for eu-weekly-oil-bulletin/ecb-fx/eia-v2, but
// it never imports carrier-ets-surcharge-envelope.mjs, so it does not cover THIS producer's seam set
// (F27's own gate: "a proof per module is not enough... some file imports every seam TOGETHER"). Rather
// than widen an unrelated file into a fifth producer's proof, this is a dedicated proof mirroring that
// file's exact shape (real grounding + row-build -> real planner -> real DAG authorship, checked against
// the LIVE market_series constraints, not just each module's own output shape), the same WO-9-class
// defect this whole gate exists to catch (a row that satisfies the row-builder and a row that satisfies
// the planner can each be correct in isolation and still not be the row the live table would accept).
//
// $0: pure, in-process, no database, no network, no live carrier fetch (the fixture set stands in for a
// real capture, same posture as every other market/regional composition proof in this directory).

import { test } from "node:test";
import assert from "node:assert/strict";
import { groundCandidate, buildCarrierEtsSurchargeRow, buildEtsProxyBand } from "../lib/market/carrier-ets-surcharge-envelope.mjs";
import { planMarketSeriesUpsert } from "../lib/market/write-market-series.mjs";
import { producerFor } from "../lib/market/series-registry.mjs";
import { authorMarketSeriesDeltaEdges } from "../../scripts/producers/market/author-market-series-delta.mjs";
import { ORIGIN_CLASSES as ORIGIN_CLASS_VALUES } from "../lib/contracts/vocabularies.mjs";
import { DERIVATIONS as DERIVATION_VALUES } from "../lib/contracts/envelope.mjs";

// Mirrors migration 268's market_series_series_key_format_check, pinned again here per
// market-producer-composition.test.mjs's own rule: this proof does not assume another file's pin holds.
const SERIES_KEY_FORMAT_RE = /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/;

const REGISTRY_ENTRY = producerFor("carrier-ets");

const CAPTURE = "the EU ETS surcharge on Asia-North Europe services is USD 210 per FEU, effective 1 October 2026.";
const CANDIDATES = [
  { carrierName: "Maersk", tradeLane: "Asia-North Europe", currency: "USD", value: "210", unit: "USD/FEU", effectivePeriod: "2026-10-01", surchargeType: "EU ETS", span_text: "the EU ETS surcharge on Asia-North Europe services is USD 210 per FEU" },
  { carrierName: "MSC", tradeLane: "Asia-North Europe", currency: "USD", value: "195", unit: "USD/FEU", effectivePeriod: "2026-10-01", surchargeType: "EU ETS", span_text: "the EU ETS surcharge on Asia-North Europe services is USD 210 per FEU" },
];
const SOURCES = [
  { source_id: "preview:maersk.com", source_key: "maersk_com_ets_notice", tier: 7 },
  { source_id: "preview:msc.com", source_key: "msc_com_ets_notice", tier: 7 },
];

test("the full composition: grounded candidates -> row-build -> planner -> 2 creates, 0 updates, 0 skipped", () => {
  const grounded = CANDIDATES.map((c) => ({ c, g: groundCandidate(c, CAPTURE) }));
  assert.ok(grounded.every(({ g }) => g.ok), "both fixture candidates must ground against the shared capture");

  const rows = grounded.map(({ c }, i) => buildCarrierEtsSurchargeRow(c, SOURCES[i]));
  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert([], rows);
  assert.equal(toCreate.length, 2);
  assert.equal(toUpdate.length, 0);
  assert.equal(skippedNoReferencePeriod.length, 0);
});

test("every planned CREATE satisfies the LIVE market_series constraints, not just the row-builder's own shape", () => {
  const rows = CANDIDATES.map((c, i) => buildCarrierEtsSurchargeRow(c, SOURCES[i]));
  const { toCreate } = planMarketSeriesUpsert([], rows);
  assert.equal(toCreate.length, 2);

  for (const r of toCreate) {
    assert.equal(typeof r.series_key, "string");
    assert.ok(r.series_key.length > 0, "series_key must not be empty");
    assert.match(r.series_key, SERIES_KEY_FORMAT_RE, `series_key "${r.series_key}" fails the format CHECK`);

    assert.equal(typeof r.label, "string");
    assert.ok(r.label.length > 0, `row ${r.series_key} is missing NOT-NULL "label"`);

    assert.equal(typeof r.value_numeric, "number");
    assert.ok(Number.isFinite(r.value_numeric), `row ${r.series_key} has a non-finite value_numeric`);

    assert.equal(typeof r.unit, "string");
    assert.ok(r.unit.length > 0, `row ${r.series_key} is missing "unit"`);

    assert.ok(r.reference_period, `row ${r.series_key} is missing reference_period`);

    assert.ok(DERIVATION_VALUES.includes(r.derivation), `row ${r.series_key} has illegal derivation "${r.derivation}"`);
    assert.ok(ORIGIN_CLASS_VALUES.includes(r.origin_class), `row ${r.series_key} has illegal origin_class "${r.origin_class}"`);

    assert.ok(
      r.n_observations === null || (Number.isInteger(r.n_observations) && r.n_observations > 0),
      `row ${r.series_key} has illegal n_observations ${JSON.stringify(r.n_observations)}`,
    );

    // Unlike the single-sourceKey producers, carrier-ets registers a PER-CARRIER source_key at run time
    // (registry.sourceKey is deliberately null, see series-registry.mjs's own carrier-ets comment); the
    // live constraint this proof checks instead is that source_key is a non-empty string (the FK target),
    // never null/empty for a row this producer actually plans to write.
    assert.equal(REGISTRY_ENTRY.sourceKey, null, "carrier-ets's registry entry itself must not carry a single shared sourceKey");
    assert.equal(typeof r.source_key, "string");
    assert.ok(r.source_key.length > 0, `row ${r.series_key} is missing its per-carrier source_key`);
  }
});

test("never blended without a range: two carriers' rows never collapse into one series_key", () => {
  const rows = CANDIDATES.map((c, i) => buildCarrierEtsSurchargeRow(c, SOURCES[i]));
  const keys = new Set(rows.map((r) => r.series_key));
  assert.equal(keys.size, 2, "each carrier keeps its own series_key, never averaged into one row");

  const band = buildEtsProxyBand(rows);
  assert.equal(band.low, 195);
  assert.equal(band.high, 210);
});

test("idempotency: planning the row-builder's own prior output against itself yields 0 creates, 2 refreshing updates", () => {
  const rows = CANDIDATES.map((c, i) => buildCarrierEtsSurchargeRow(c, SOURCES[i]));
  const first = planMarketSeriesUpsert([], rows);
  assert.equal(first.toCreate.length, 2);

  const existingAfterFirstRun = first.toCreate.map((r, i) => ({ id: `row-${i}`, series_key: r.series_key, reference_period: r.reference_period }));
  const second = planMarketSeriesUpsert(existingAfterFirstRun, rows);
  assert.equal(second.toCreate.length, 0, "a second run of the SAME period must plan zero creates");
  assert.equal(second.toUpdate.length, 2, "a second run still refreshes each row");

  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  for (const u of second.toUpdate) {
    const original = byKey.get(existingAfterFirstRun.find((e) => e.id === u.id).series_key);
    assert.equal(u.patch.value_numeric, original.value_numeric, `update for id=${u.id} changed value_numeric on an unchanged input`);
  }
});

test("the fourth seam: real row-build -> planner output IS consumable by authorMarketSeriesDeltaEdges (DAG authorship)", async () => {
  const rows = CANDIDATES.map((c, i) => buildCarrierEtsSurchargeRow(c, SOURCES[i]));
  const { toCreate } = planMarketSeriesUpsert([], rows);
  assert.equal(toCreate.length, 2);

  const latest = { ...toCreate[0], id: "row-latest" };
  const prior = { ...toCreate[0], id: "row-prior", reference_period: "2026-09-24", value_numeric: toCreate[0].value_numeric - 5 };

  const authorCalls = [];
  const counts = await authorMarketSeriesDeltaEdges([latest.series_key], "apply", {
    readAllFn: async () => [latest, prior],
    authorEdgesFn: async (sb, figure) => { authorCalls.push(figure); return { ok: true, action: "authored", valueId: "v-composition" }; },
    sb: {},
    now: () => new Date("2026-10-02T00:00:00Z"),
  });

  assert.equal(counts.authored, 1, "the real row-builder->planner row shape must be authorable, not refused by an unexpected field mismatch");
  assert.equal(authorCalls.length, 1);
  assert.equal(authorCalls[0].table, "market_series");
  assert.equal(authorCalls[0].method.id, "market_series_delta");
});
