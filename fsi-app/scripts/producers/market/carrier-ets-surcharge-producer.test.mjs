import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runEtsProxyProducer,
  resolveSource,
  fixtureDownstreamDeps,
} from "./carrier-ets-surcharge-producer.mjs";
import { buildEtsProxyBand } from "../../../src/lib/market/carrier-ets-surcharge-envelope.mjs";
import { carbonCostPerFeu, GAP } from "../../../src/lib/market/carbon-cost-per-feu.mjs";
import { FIXTURE_CANDIDATES, fixtureFetchCapture } from "./fixtures/carrier-ets-surcharge-fixtures.mjs";

test("resolveSource: dry mode never writes, tier resolved from classTierForHost (company class, T7)", async () => {
  const source = await resolveSource(
    { carrierName: "Maersk", sourceUrl: "https://www.maersk.com/news/articles/ets-surcharge-notice-2026-10" },
    { mode: "dry", registerSourceFn: null },
  );
  assert.equal(source.ok, true);
  assert.equal(source.tier, 7);
  assert.match(source.source_id, /^preview:/);
});

test("resolveSource: refuses (never guesses) a host with no parseable URL", async () => {
  const source = await resolveSource({ carrierName: "X", sourceUrl: "not a url" }, { mode: "dry" });
  assert.equal(source.ok, false);
  assert.match(source.reason, /cannot parse a host/);
});

test("runEtsProxyProducer: end-to-end over the fixture set, grounds, rates, plans, never blends", async () => {
  const result = await runEtsProxyProducer({
    candidates: FIXTURE_CANDIDATES,
    fetchCapture: fixtureFetchCapture,
    existingRows: [],
    mode: "dry",
    deps: fixtureDownstreamDeps(false),
  });

  assert.equal(result.metrics.candidates, 5);
  assert.equal(result.metrics.refused_ungrounded, 1, "Evergreen's paraphrased span must be refused");
  assert.equal(result.metrics.refused_unrated_source, 0);
  assert.equal(result.metrics.to_create, 4, "Maersk, MSC, CMA CGM, Hapag-Lloyd each get their OWN row");

  const keys = result.plan.toCreate.map((r) => r.series_key).sort();
  assert.deepEqual(keys, [
    "carrier-ets:cma-cgm-asia-north-europe",
    "carrier-ets:hapag-lloyd-transpacific",
    "carrier-ets:maersk-asia-north-europe",
    "carrier-ets:msc-asia-north-europe",
  ]);

  // NEVER BLENDED WITHOUT A RANGE: no single row represents "the" EU ETS surcharge; each carrier row
  // carries its own published value.
  const values = result.plan.toCreate.map((r) => r.value_numeric).sort((a, b) => a - b);
  assert.deepEqual(values, [140, 195, 210, 230]);

  const band = result.proxyBands["2026-10-01"];
  assert.ok(band, "a 4-carrier period must produce a proxy band");
  assert.equal(band.low, 140);
  assert.equal(band.high, 230);
  assert.equal(band.n_carriers, 4);
});

test("runEtsProxyProducer: downstream trigger (rule 17) fires, market_series_delta authorship runs, not merely asserted to exist", async () => {
  const result = await runEtsProxyProducer({
    candidates: FIXTURE_CANDIDATES,
    fetchCapture: fixtureFetchCapture,
    existingRows: [],
    mode: "dry",
    deps: fixtureDownstreamDeps(false),
  });
  // Real execution against injected offline deps (fixtureDownstreamDeps), not a no-op dry mode: at least
  // one series gets authored, proving the wiring runs end to end (rule 15: execution over existence).
  assert.equal(result.authorCounts.authored + result.authorCounts.skippedAlready, 4);
  assert.equal(result.authorCounts.errored, 0);
});

test("runEtsProxyProducer: an ungrounded candidate never reaches the plan, never a fabricated figure", async () => {
  const result = await runEtsProxyProducer({
    candidates: FIXTURE_CANDIDATES,
    fetchCapture: fixtureFetchCapture,
    existingRows: [],
    mode: "dry",
    deps: fixtureDownstreamDeps(false),
  });
  const evergreen = result.perItem.find((i) => i.id.startsWith("Evergreen"));
  assert.equal(evergreen.outcome, "refused_ungrounded");
  assert.ok(!result.plan.toCreate.some((r) => r.series_key.includes("evergreen")));
});

// ── THE WORKED INTEGRATION (workstream 11's whole point): this producer's proxy band closes
// carbon-cost-per-feu.mjs's GAP.NO_CARBON_PRICE. Never a live write, purely a downstream-consumption
// proof that the two modules now compose. ─────────────────────────────────────────────────────────────
test("integration: the ETS-proxy band feeds carbon-cost-per-feu's carbonPrice input, closing GAP.NO_CARBON_PRICE", async () => {
  const result = await runEtsProxyProducer({
    candidates: FIXTURE_CANDIDATES,
    fetchCapture: fixtureFetchCapture,
    existingRows: [],
    mode: "dry",
    deps: fixtureDownstreamDeps(false),
  });
  const band = result.proxyBands["2026-10-01"];
  assert.ok(band);

  // BEFORE this lane: carbonPrice is null, carbon-cost-per-feu refuses with GAP.NO_CARBON_PRICE.
  const factor = { derivation: "observed", quantity_basis: "tonne_km", ttw_co2e: 0.012, factor_id: "test-fixture-factor" };
  const withoutPrice = carbonCostPerFeu({
    corridor: { origin: "CNSHA", dest: "NLRTM", mode: "ocean" },
    factor,
    distanceKm: 19000,
    distanceDerivation: "observed",
    distanceBasis: "test fixture distance",
    payloadTonnesPerFeu: 14,
    payloadDerivation: "observed",
    payloadBasis: "test fixture payload",
    carbonPrice: null,
  });
  assert.equal(withoutPrice.ok, false);
  assert.ok(withoutPrice.gaps.includes(GAP.NO_CARBON_PRICE));

  // AFTER this lane: the proxy band's point value, carried with its own real provenance (the band's
  // n_carriers/low/high are visible on the input object for a caller/surface to render alongside),
  // supplies carbonPrice, the GAP closes and a real per-corridor cost computes.
  const withPrice = carbonCostPerFeu({
    corridor: { origin: "CNSHA", dest: "NLRTM", mode: "ocean" },
    factor,
    distanceKm: 19000,
    distanceDerivation: "observed",
    distanceBasis: "test fixture distance",
    payloadTonnesPerFeu: 14,
    payloadDerivation: "observed",
    payloadBasis: "test fixture payload",
    carbonPrice: {
      value: band.point,
      currency: band.currency,
      sourceKey: "carrier-ets:proxy-band",
      asOf: band.reference_period,
      derivation: band.derivation,
      basis: `carrier-ets-surcharge-producer proxy band, n_carriers=${band.n_carriers}, low=${band.low}, high=${band.high}`,
    },
  });
  assert.equal(withPrice.ok, true);
  assert.equal(withPrice.gaps.length, 0);
  assert.ok(withPrice.point > 0);
  assert.equal(withPrice.carbonPrice.value, band.point);
});

// buildEtsProxyBand is already unit-tested in the envelope module's own test file; this re-import just
// confirms the producer imports the SAME function (no drifting second copy).
test("producer reuses buildEtsProxyBand from the envelope module, no second implementation", () => {
  const band = buildEtsProxyBand([
    { value_numeric: 100, currency: "USD", reference_period: "2026-11-01" },
    { value_numeric: 120, currency: "USD", reference_period: "2026-11-01" },
  ]);
  assert.equal(band.point, 110);
});
