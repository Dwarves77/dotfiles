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

// Updated 2026-09-02 (Lane PROD, system-completion train): series-registry.mjs's eia-v2 entry flipped
// implemented:true, correcting the stale flag docs/plans/system-completion-plan-2026-09-02.md §0 row 4
// named live ("series-registry.mjs says eia-v2 implemented:false (stale)") — the producer script itself
// (eia-v2-petroleum-spot-producer.mjs) already shipped 2026-09-01 with its own fixture proof
// (src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs); only the registry flag was wrong. Updated
// 2026-08-31 before that (lane P2, build/wave-p2): ecb-fx-producer.mjs shipped, flipping ecb-fx to
// implemented:true. eex-eua remains the one true stub (no licence, no producer).
test("exactly THREE producers are implemented: EU Weekly Oil Bulletin, ECB FX, EIA v2", () => {
  const impl = implementedProducers();
  assert.deepEqual(impl.map((p) => p.keyPrefix), ["eu-oil-bulletin", "ecb-fx", "eia-v2"]);
});

test("the one remaining stub (eex-eua) carries NO producerScript/parserModule — documented, not half-built", () => {
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => !p.implemented)) {
    assert.equal(p.producerScript, null, `${p.name}: a stub must not name a producer script`);
    assert.equal(p.parserModule, null, `${p.name}: a stub must not name a parser module`);
  }
});

test("every implemented producer names its real producer script and parser module paths", () => {
  const eu = producerFor("eu-oil-bulletin");
  assert.equal(eu.producerScript, "scripts/producers/market/eu-weekly-oil-bulletin.mjs");
  assert.equal(eu.parserModule, "src/lib/market/parsers/eu-weekly-oil-bulletin.mjs");

  const ecbFx = producerFor("ecb-fx");
  assert.equal(ecbFx.producerScript, "scripts/producers/market/ecb-fx-producer.mjs");

  const eiaV2 = producerFor("eia-v2");
  assert.equal(eiaV2.producerScript, "scripts/producers/market/eia-v2-petroleum-spot-producer.mjs");
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
