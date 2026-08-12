// Proof for the number envelope (Track F2, 2026-08-12).
//
// Run standalone:
//   node --experimental-strip-types --test fsi-app/src/__tests__/contracts-envelope.test.mjs
// Covered by the `fsi-app/src/__tests__/*.test.mjs` glob in run-test-suite.sh.
//
// WHAT THIS LOCKS. Two live defects motivated this module and both are asserted against here:
//   1. Market Intel renders a key-figure column bound to `marketData`, a field with NO producer
//      anywhere in src, so every row shows a permanent em-dash that looks like "no movement".
//   2. The Operations masthead claims "every fact carries a source and date" over fact rows that have
//      no date field and a NULL source_id.
// Both are a number rendered without the jacket that says what it is. makeEnvelope makes that state
// unconstructable rather than discouraged.
//
// Time is injected everywhere, so these tests are deterministic and contain no clock reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DERIVATION, DERIVATIONS, isContractable, isStatutory,
  makeEnvelope, validateEnvelope,
  REFRESH_PERIOD_DAYS, stalenessOf, isDegraded,
  significantFigures, roundToSampleSupport, formatDelta,
  propagate,
} from "../lib/contracts/envelope.mjs";

const NOW = "2026-08-12T00:00:00Z";

/** A minimal valid envelope, for mutation in individual tests. */
const base = (over = {}) => ({
  value: 1.23,
  unit: "EUR/tCO2e",
  derivation: "observed",
  as_of: { event_date: "2026-08-11", source_published_at: "2026-08-11", ingested_at: "2026-08-12" },
  ...over,
});

// ── the three required fields ────────────────────────────────────────────

test("a valid envelope constructs and is frozen", () => {
  const e = makeEnvelope(base());
  assert.equal(e.value, 1.23);
  assert.ok(Object.isFrozen(e));
});

test("an envelope missing derivation, unit or as_of throws", () => {
  for (const f of ["derivation", "unit", "as_of"]) {
    const input = base();
    delete input[f];
    assert.throws(() => makeEnvelope(input), /invalid number envelope/, `missing ${f} must throw`);
  }
});

test("the bare-number case is unconstructable", () => {
  // This is the `marketData` defect: a figure with no jacket at all.
  assert.throws(() => makeEnvelope({ value: 47.83 }), /invalid number envelope/);
});

test("an unknown derivation, obs_status or origin_class is rejected", () => {
  assert.throws(() => makeEnvelope(base({ derivation: "vibes" })), /unknown derivation/);
  assert.throws(() => makeEnvelope(base({ obs_status: "ZZ" })), /unknown obs_status/);
  assert.throws(() => makeEnvelope(base({ origin_class: "trust_me" })), /unknown origin_class/);
});

// ── the as-of triple ─────────────────────────────────────────────────────

test("as_of requires a real event_date", () => {
  assert.throws(() => makeEnvelope(base({ as_of: { event_date: "last Tuesday" } })), /event_date/);
  assert.throws(() => makeEnvelope(base({ as_of: "2026-08-11" })), /as_of must be an object/);
});

test("as_of keeps three distinct timestamps rather than one last-updated", () => {
  const e = makeEnvelope(base({
    as_of: { event_date: "2026-08-03", source_published_at: "2026-08-10", ingested_at: "2026-08-12" },
  }));
  // A weekly bulletin read today about last week has three different answers, and conflating them
  // is what makes a reader unable to tell "late" from "about the past".
  assert.notEqual(e.as_of.event_date, e.as_of.source_published_at);
  assert.notEqual(e.as_of.source_published_at, e.as_of.ingested_at);
});

// ── the zero-fill guard ──────────────────────────────────────────────────

test("a missing observation may not carry a value", () => {
  // The single most damaging silent failure available to an emissions product: a missing factor
  // rendered as 0, which is a real and very wrong number.
  assert.throws(
    () => makeEnvelope(base({ obs_status: "M", value: 0 })),
    /zero-fill guard/
  );
  assert.throws(() => makeEnvelope(base({ obs_status: "O", value: 12 })), /zero-fill guard/);
});

test("a missing observation with a null value is valid", () => {
  const e = makeEnvelope(base({ obs_status: "H", value: null }));
  assert.equal(e.value, null);
  assert.equal(e.obs_status, "H");
});

// ── ranges ───────────────────────────────────────────────────────────────

test("low and high must be provided together, ordered, and must bracket the value", () => {
  assert.throws(() => makeEnvelope(base({ low: 1 })), /together/);
  assert.throws(() => makeEnvelope(base({ low: 5, high: 2 })), /low must be <= high/);
  assert.throws(() => makeEnvelope(base({ value: 9, low: 1, high: 2 })), /within/);
  const ok = makeEnvelope(base({ value: 1.5, low: 1, high: 2 }));
  assert.equal(ok.low, 1);
});

test("n and contributor_count must be non-negative integers", () => {
  assert.throws(() => makeEnvelope(base({ n: -1 })), /n must be/);
  assert.throws(() => makeEnvelope(base({ n: 2.5 })), /n must be/);
  assert.throws(() => makeEnvelope(base({ contributor_count: -3 })), /contributor_count/);
});

test("validateEnvelope reports every error at once rather than the first", () => {
  const errs = validateEnvelope({ derivation: "nope" });
  assert.ok(errs.length >= 3, `expected several errors, got ${JSON.stringify(errs)}`);
});

// ── derivation and contractability ───────────────────────────────────────

test("observed, transacted_index, assessed and calculated are contractable; the rest are not", () => {
  for (const d of ["observed", "transacted_index", "assessed", "calculated"]) {
    assert.equal(isContractable(d), true, d);
  }
  for (const d of ["interpolated", "modelled", "estimated"]) {
    assert.equal(isContractable(d), false, d);
  }
  assert.equal(isContractable("__unknown__"), false);
});

// ── statutory classes (added 2026-08-12 after external review) ───────────

test("statutory classes exist, are contractable, and outrank observed", () => {
  for (const d of ["statutory_fixed", "statutory_formula"]) {
    assert.equal(isStatutory(d), true, d);
    assert.equal(isContractable(d), true, d);
    assert.ok(DERIVATION[d].order < DERIVATION.observed.order, `${d} must outrank observed`);
  }
});

test("our own arithmetic is NOT statutory, which is the whole point of the split", () => {
  // `calculated` used to cover both "we computed it" and "the statute prescribes it". A FuelEU penalty
  // is the statute's arithmetic, not ours, and a compliance reader must see which.
  assert.equal(isStatutory("calculated"), false);
  assert.equal(isStatutory("observed"), false);
  assert.equal(isStatutory("modelled"), false);
  assert.equal(isStatutory("__unknown__"), false);
});

test("a statutory input beats an observed one in aggregate propagation ordering", () => {
  const mk = (d) => makeEnvelope(base({ derivation: d }));
  // propagate() keeps the LEAST contractable, so mixing statutory with modelled must yield modelled.
  assert.equal(propagate([mk("statutory_formula"), mk("modelled")], NOW).derivation, "modelled");
  // ...and an all-statutory aggregate stays statutory and contractable.
  const allStat = propagate([mk("statutory_fixed"), mk("statutory_formula")], NOW);
  assert.equal(allStat.derivation, "statutory_formula");
  assert.equal(isContractable(allStat.derivation), true);
});

test("derivation orders are unique, so propagation is deterministic", () => {
  const orders = DERIVATIONS.map((d) => DERIVATION[d].order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order breaks least-contractable selection");
});

test("every derivation carries a label, an order and an explanatory note", () => {
  for (const d of DERIVATIONS) {
    const e = DERIVATION[d];
    assert.equal(e.code, d);
    assert.ok(e.label && e.note && typeof e.order === "number", d);
  }
});

// ── freshness, derived not asserted ──────────────────────────────────────

test("staleness moves current -> ageing -> stale -> frozen with age", () => {
  const at = (d) => makeEnvelope(base({
    expected_refresh: "weekly",
    as_of: { event_date: d, source_published_at: d },
  }));
  assert.equal(stalenessOf(at("2026-08-09"), NOW), "current"); //  3d, within 7
  assert.equal(stalenessOf(at("2026-08-01"), NOW), "ageing");  // 11d, within 14
  assert.equal(stalenessOf(at("2026-07-20"), NOW), "stale");   // 23d, within 28
  assert.equal(stalenessOf(at("2026-05-01"), NOW), "frozen");  //103d, beyond 28
});

test("frozen is reachable and distinct from stale", () => {
  // The state everyone forgets and the one that matters most: the source STOPPED PUBLISHING.
  // Operations' regional_data_facts producer is frozen today; without this state the surface
  // renders a dead feed as though data were merely pending.
  const dead = makeEnvelope(base({
    expected_refresh: "monthly",
    as_of: { event_date: "2025-01-01", source_published_at: "2025-01-01" },
  }));
  assert.equal(stalenessOf(dead, NOW), "frozen");
});

test("no declared cadence yields unknown, which is degraded rather than clean", () => {
  const e = makeEnvelope(base());
  assert.equal(stalenessOf(e, NOW), "unknown");
  assert.equal(isDegraded(e, NOW), true);
  const irregular = makeEnvelope(base({ expected_refresh: "irregular" }));
  assert.equal(stalenessOf(irregular, NOW), "unknown");
});

test("staleness prefers source_published_at over event_date", () => {
  // What matters is when the SOURCE last spoke, not when the event happened.
  const e = makeEnvelope(base({
    expected_refresh: "weekly",
    as_of: { event_date: "2020-01-01", source_published_at: "2026-08-11" },
  }));
  assert.equal(stalenessOf(e, NOW), "current");
});

test("a forward-dated release never reports a negative age", () => {
  const e = makeEnvelope(base({
    expected_refresh: "daily",
    as_of: { event_date: "2026-09-01", source_published_at: "2026-09-01" },
  }));
  assert.equal(stalenessOf(e, NOW), "current");
});

test("current and ageing are not degraded; stale and frozen are", () => {
  const at = (d) => makeEnvelope(base({
    expected_refresh: "weekly", as_of: { event_date: d, source_published_at: d },
  }));
  assert.equal(isDegraded(at("2026-08-09"), NOW), false);
  assert.equal(isDegraded(at("2026-08-01"), NOW), false);
  assert.equal(isDegraded(at("2026-07-20"), NOW), true);
  assert.equal(isDegraded(at("2026-05-01"), NOW), true);
});

test("every declared cadence has a period or is explicitly irregular", () => {
  for (const [k, v] of Object.entries(REFRESH_PERIOD_DAYS)) {
    assert.ok(v === null || (Number.isInteger(v) && v > 0), k);
  }
});

// ── false precision ──────────────────────────────────────────────────────

test("significant figures are driven by sample size", () => {
  assert.equal(significantFigures(undefined), 1);
  assert.equal(significantFigures(0), 1);
  assert.equal(significantFigures(3), 2);
  assert.equal(significantFigures(12), 3);
  assert.equal(significantFigures(500), 4);
});

test("rounding refuses to publish more precision than the sample supports", () => {
  // EUR 47.8312 on a sample of 2 is the false-precision failure.
  assert.equal(roundToSampleSupport(47.8312, 2), 48);
  assert.equal(roundToSampleSupport(47.8312, 12), 47.8);
  assert.equal(roundToSampleSupport(47.8312, 500), 47.83);
  assert.equal(roundToSampleSupport(0, 500), 0);
  assert.equal(roundToSampleSupport(null, 500), null);
});

// ── pp vs % ──────────────────────────────────────────────────────────────

test("ratios render in percentage points and quantities in percent", () => {
  assert.equal(formatDelta(2, "ratio"), "+2.0 pp");
  assert.equal(formatDelta(5.5, "quantity"), "+5.5%");
  assert.equal(formatDelta(-1.25, "quantity", 2), "−1.25%");
  assert.equal(formatDelta(0, "ratio"), "0.0 pp");
});

test("formatDelta refuses to guess the kind", () => {
  // A default here would silently pick a side, which is exactly the load-factor "+2%" bug.
  assert.throws(() => formatDelta(2), /kind must be/);
  assert.throws(() => formatDelta(2, "percent"), /kind must be/);
  assert.equal(formatDelta(NaN, "ratio"), null);
});

// ── propagation to the weakest ───────────────────────────────────────────

test("aggregate origin_class propagates to the weakest constituent", () => {
  const mk = (origin) => makeEnvelope(base({ origin_class: origin }));
  const r = propagate([mk("official"), mk("verified"), mk("modelled")], NOW);
  assert.equal(r.origin_class, "modelled");
  assert.equal(r.count, 3);
});

test("one modelled input makes the aggregate non-contractable", () => {
  const mk = (d) => makeEnvelope(base({ derivation: d }));
  const r = propagate([mk("observed"), mk("observed"), mk("modelled")], NOW);
  assert.equal(r.derivation, "modelled");
  assert.equal(isContractable(r.derivation), false);
});

test("one frozen input is visible in the aggregate's freshness", () => {
  const fresh = makeEnvelope(base({
    expected_refresh: "weekly", as_of: { event_date: "2026-08-11", source_published_at: "2026-08-11" },
  }));
  const dead = makeEnvelope(base({
    expected_refresh: "weekly", as_of: { event_date: "2025-01-01", source_published_at: "2025-01-01" },
  }));
  assert.equal(propagate([fresh, dead], NOW).freshness, "frozen");
});

test("an empty aggregate invents nothing", () => {
  const r = propagate([], NOW);
  assert.equal(r.origin_class, null);
  assert.equal(r.derivation, null);
  assert.equal(r.count, 0);
});

test("an unknown origin_class in an aggregate fails to the weakest", () => {
  const good = makeEnvelope(base({ origin_class: "official" }));
  const rogue = { origin_class: "__mystery__", derivation: "observed" };
  assert.equal(propagate([good, rogue], NOW).origin_class, "community");
});

test("propagation is order-independent", () => {
  const a = makeEnvelope(base({ origin_class: "official", derivation: "observed" }));
  const b = makeEnvelope(base({ origin_class: "modelled", derivation: "estimated" }));
  const fwd = propagate([a, b], NOW);
  const rev = propagate([b, a], NOW);
  assert.deepEqual(fwd, rev);
});
