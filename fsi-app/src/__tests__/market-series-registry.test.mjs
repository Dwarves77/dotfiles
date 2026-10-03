// Proof for src/lib/market/series-registry.mjs (WO-16 steps 1 + 5: the 4-series registry, one
// implemented producer + three documented stubs).
//
// LOCATION: same reasoning as the other new market tests in this directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_SERIES_PRODUCERS, producerFor, isImplementedSeriesKey, implementedProducers,
} from "../lib/market/series-registry.mjs";

// Entries that are NOT genuinely code-absent stubs, declared once up top (used by multiple tests below).
// See the HELD_NOT_UNBUILT-adjacent comment further down for the full "why" per entry.
const HELD_NOT_UNBUILT = new Set(["carrier-ets", "sbti"]);

// Updated 2026-09-28 (lane ETS-PROXY): the WO-16 four plus the decision-1/2 ETS-proxy entry
// (carrier-ets), the ruled licence-clear alternative to the eex-eua stub. carrier-ets has no single
// sourceUrl (per-carrier, resolved at run time), named as the one documented exception below.
// Updated 2026-10-03 (lane L11): added `sbti`, the SBTi Target Dashboard per-sector lead-time +
// survivorship aggregator, a SECOND R14/licence-held entry alongside carrier-ets (see
// HELD_NOT_UNBUILT below), not a fourth fully-implemented producer.
test("the WO-16 four plus the ETS-proxy entry (carrier-ets) plus sbti, in registry order", () => {
  assert.deepEqual(
    MARKET_SERIES_PRODUCERS.map((p) => p.keyPrefix),
    ["eu-oil-bulletin", "eex-eua", "carrier-ets", "ecb-fx", "eia-v2", "sbti"],
  );
});

// carrier-ets is the one documented exception to "every entry names a single sourceUrl": it resolves a
// source PER CARRIER at run time (classTierForHost, never a single shared URL), see its own registry
// comment.
const NO_SINGLE_SOURCE_URL = new Set(["carrier-ets"]);

test("every entry names series_key prefix, source and cadence (WO-16 step 5's registry-entry contract)", () => {
  for (const p of MARKET_SERIES_PRODUCERS) {
    assert.ok(p.keyPrefix, `${p.name}: missing keyPrefix`);
    assert.ok(p.sourceName, `${p.name}: missing sourceName`);
    if (!NO_SINGLE_SOURCE_URL.has(p.keyPrefix)) {
      assert.ok(p.sourceUrl, `${p.name}: missing sourceUrl`);
    } else {
      assert.equal(p.sourceUrl, null, `${p.name}: documented no-single-source-url entry must be explicit null, not missing`);
    }
    assert.ok(p.cadence, `${p.name}: missing cadence`);
    assert.ok("cadenceDays" in p, `${p.name}: missing cadenceDays (null is fine; the key must be present)`);
    assert.ok(typeof p.implemented === "boolean", `${p.name}: implemented must be boolean`);
  }
});

// Updated 2026-10-03 (lane L11): the "every stub's cadenceDays is null" half now excludes
// HELD_NOT_UNBUILT entries, a stub with NO producer at all genuinely has no cadence to assert, but
// `sbti` has a real, spec-stated cadence (weekly, Thursdays, spec 02 section 7) despite being
// licence-held; asserting null there would understate a known fact to satisfy this test's shape rather
// than the other way around. carrier-ets still asserts null on its own merits (no fixed cadence exists
// for a per-carrier surcharge revision), unaffected by this exclusion.
test("the implemented producer's cadenceDays is a positive integer; every genuine (code-absent) stub's is null", () => {
  const eu = producerFor("eu-oil-bulletin");
  assert.equal(eu.cadenceDays, 7);
  const sbti = producerFor("sbti");
  assert.equal(sbti.cadenceDays, 7, "sbti's cadence is spec-stated (weekly) even though it is licence-held");
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => !p.implemented && !HELD_NOT_UNBUILT.has(p.keyPrefix))) {
    assert.equal(p.cadenceDays, null, `${p.name}: a stub must not assert a cadenceDays it hasn't built a producer to honour`);
  }
});

// Updated 2026-09-02 (Lane PROD, system-completion train): series-registry.mjs's eia-v2 entry flipped
// implemented:true, correcting the stale flag docs/plans/system-completion-plan-2026-09-02.md section 0 row 4
// named live ("series-registry.mjs says eia-v2 implemented:false (stale)"), the producer script itself
// (eia-v2-petroleum-spot-producer.mjs) already shipped 2026-09-01 with its own fixture proof
// (src/__tests__/market-eia-v2-petroleum-spot-parser.test.mjs); only the registry flag was wrong. Updated
// 2026-08-31 before that (lane P2, build/wave-p2): ecb-fx-producer.mjs shipped, flipping ecb-fx to
// implemented:true. eex-eua remains the one true stub (no licence, no producer).
test("exactly THREE producers are implemented: EU Weekly Oil Bulletin, ECB FX, EIA v2", () => {
  const impl = implementedProducers();
  assert.deepEqual(impl.map((p) => p.keyPrefix), ["eu-oil-bulletin", "ecb-fx", "eia-v2"]);
});

// Updated 2026-09-28 (lane ETS-PROXY): eex-eua stays the one true "no code at all" stub. carrier-ets is
// a DIFFERENT kind of not-implemented: its producer script and envelope module exist and are
// fixture-tested (R14 hold gates the LIVE-WRITE path only, via its own ENABLED=false, not this registry
// flag), so it is named as a documented exception here, never silently lumped with eex-eua's "nothing
// built yet" case. Updated 2026-10-03 (lane L11): `sbti` joins this set for a THIRD reason, distinct
// from carrier-ets's ordinary R14 hold, its producer's own `decideApply` refuses --apply
// UNCONDITIONALLY, citing a registered-prohibited licence entry (source-licence.mjs 'sbti_dashboard'),
// not an unarmed kill switch. Same registry-flag shape (producerScript/parserModule present,
// implemented:false), different and stronger reason, see the producer's own header.
// (HELD_NOT_UNBUILT itself is declared once, near the top of this file.)

test("the one true no-code stub (eex-eua) carries NO producerScript/parserModule, documented, not half-built", () => {
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => !p.implemented && !HELD_NOT_UNBUILT.has(p.keyPrefix))) {
    assert.equal(p.producerScript, null, `${p.name}: a stub must not name a producer script`);
    assert.equal(p.parserModule, null, `${p.name}: a stub must not name a parser module`);
  }
});

test("carrier-ets is R14-held, not unbuilt: it names real producer/parser paths while implemented stays false", () => {
  const carrierEts = producerFor("carrier-ets");
  assert.equal(carrierEts.implemented, false);
  assert.equal(carrierEts.producerScript, "scripts/producers/market/carrier-ets-surcharge-producer.mjs");
  assert.equal(carrierEts.parserModule, "src/lib/market/carrier-ets-surcharge-envelope.mjs");
});

test("sbti is LICENCE-held, not unbuilt: it names a real producer path while implemented stays false", () => {
  const sbti = producerFor("sbti");
  assert.equal(sbti.implemented, false);
  assert.equal(sbti.producerScript, "scripts/producers/market/sbti-target-dashboard-producer.mjs");
  assert.equal(sbti.sourceKey, "sbti_dashboard");
  assert.match(sbti.licenceStatus, /PROHIBITED/);
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
