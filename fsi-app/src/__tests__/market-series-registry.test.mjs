// Proof for src/lib/market/series-registry.mjs (WO-16 steps 1 + 5: the 4-series registry, one
// implemented producer + three documented stubs).
//
// LOCATION: same reasoning as the other new market tests in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_SERIES_PRODUCERS, producerFor, isImplementedSeriesKey, implementedProducers,
} from "../lib/market/series-registry.mjs";

test("exactly the 4 series the master plan names, in WO-16 order: EU Weekly Oil Bulletin, EEX EUA, ECB FX, EIA v2", () => {
  assert.deepEqual(
    MARKET_SERIES_PRODUCERS.map((p) => p.keyPrefix),
    ["eu-oil-bulletin", "eex-eua", "ecb-fx", "eia-v2"],
  );
});

test("every entry names series_key prefix, source and cadence (WO-16 step 5's registry-entry contract)", () => {
  for (const p of MARKET_SERIES_PRODUCERS) {
    assert.ok(p.keyPrefix, `${p.name}: missing keyPrefix`);
    assert.ok(p.sourceName, `${p.name}: missing sourceName`);
    assert.ok(p.sourceUrl, `${p.name}: missing sourceUrl`);
    assert.ok(p.cadence, `${p.name}: missing cadence`);
    assert.ok("cadenceDays" in p, `${p.name}: missing cadenceDays (null is fine; the key must be present)`);
    assert.ok(typeof p.implemented === "boolean", `${p.name}: implemented must be boolean`);
  }
});

test("the implemented producer's cadenceDays is a positive integer; every stub's is null (not decided)", () => {
  const eu = producerFor("eu-oil-bulletin");
  assert.equal(eu.cadenceDays, 7);
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => !p.implemented)) {
    assert.equal(p.cadenceDays, null, `${p.name}: a stub must not assert a cadenceDays it hasn't built a producer to honour`);
  }
});

test("exactly ONE producer is implemented in this lane: EU Weekly Oil Bulletin", () => {
  const impl = implementedProducers();
  assert.equal(impl.length, 1);
  assert.equal(impl[0].keyPrefix, "eu-oil-bulletin");
});

test("the three stubs carry NO producerScript/parserModule — documented, not half-built", () => {
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => !p.implemented)) {
    assert.equal(p.producerScript, null, `${p.name}: a stub must not name a producer script`);
    assert.equal(p.parserModule, null, `${p.name}: a stub must not name a parser module`);
  }
});

test("the implemented producer names its real producer script and parser module paths", () => {
  const eu = producerFor("eu-oil-bulletin");
  assert.equal(eu.producerScript, "scripts/producers/market/eu-weekly-oil-bulletin.mjs");
  assert.equal(eu.parserModule, "src/lib/market/parsers/eu-weekly-oil-bulletin.mjs");
});

test("isImplementedSeriesKey is true only for a full key under the implemented prefix", () => {
  assert.equal(isImplementedSeriesKey("eu-oil-bulletin:automotive-diesel"), true);
  assert.equal(isImplementedSeriesKey("eex-eua:eua-primary"), false);
  assert.equal(isImplementedSeriesKey("not-a-registered-prefix:x"), false);
  assert.equal(isImplementedSeriesKey(""), false);
});

test("every implemented producer's sourceKey is a non-empty string (the FK target it writes)", () => {
  for (const p of implementedProducers()) {
    assert.equal(typeof p.sourceKey, "string");
    assert.ok(p.sourceKey.length > 0);
  }
});

test("producerFor returns undefined for an unknown prefix, never throws or guesses", () => {
  assert.equal(producerFor("does-not-exist"), undefined);
});
