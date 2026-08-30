// regional-bls-oews-composition.test.mjs — the seam proof scripts/producers/regional/bls-oews-producer.mjs
// never had.
//
// WHY THIS EXISTS (2026-08-30). bls-oews-producer.mjs composes THREE first-party seams: its own parser
// (src/lib/regional/bls-oews-parser.mjs) and two exports of the shared orchestration shell
// (scripts/producers/regional/run-envelope-producer.mjs: toCandidateRows, latestPerNaturalKey — the
// producer itself calls runEnvelopeProducer(), which calls both internally). Before this file, each half
// had its own proof — bls-oews-parser.npmtest.mjs proves the parser against a fixture;
// run-envelope-producer.test.mjs proves toCandidateRows/latestPerNaturalKey against a HAND-BUILT
// observation shaped like the Eurostat parser's output, never against this parser's real output — and
// nothing imported both halves together. F27 (producer-seam-proof) is the gate that mechanized finding
// this gap; this file is what closes it.
//
// THE INCIDENT THIS GUARDS AGAINST (WO-17, 2026-08-30, run-envelope-producer.mjs's own header carries the
// full story). The first live --apply of a regional_data_facts producer died on its first row:
//   `null value in column "value" of relation "regional_data_facts" violates not-null constraint`
// The parser had a green fixture proof. buildEnvelopeRow (which derives `value`, TEXT NOT NULL, migration
// 106) had a green proof. planUpsert had a green proof. The orchestrator simply never called
// buildEnvelopeRow on real parser output — every layer was independently correct and the chain still
// could not write a row, because nothing exercised parser-output -> toCandidateRows together. The
// asserts below on candidate.value are the regression guard for exactly that miss: a composition proof
// that only checked "the row has SOME value field" would not have caught it (a stale/wrong-shaped
// buildEnvelopeRow could still leave `value` present-but-empty); this checks it is a non-empty string on
// every row this producer's real parser output produces.
//
// LOCATION: same reasoning as every other proof in this directory — run-test-suite.sh globs
// `fsi-app/src/__tests__/*.test.mjs`, which has no equivalent glob over `src/lib/regional/**`.
//
// $0: pure, in-process, no database, no network — the exact composition bls-oews-producer.mjs performs
// via runEnvelopeProducer(), minus the guarded I/O boundary (scripts/lib/db.mjs) and region_id resolution
// (resolveRegionIds), which happen strictly AFTER latestPerNaturalKey and are out of scope for a seam
// proof between src/lib/regional and the orchestrator's pure core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseOewsResponse, buildOewsSeriesId, OEWS_OCCUPATIONS } from "../lib/regional/bls-oews-parser.mjs";
import { toCandidateRows, latestPerNaturalKey } from "../../scripts/producers/regional/run-envelope-producer.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

// Live regional_data_facts_dimension_check (supabase/migrations/106_regions_and_facts.sql) — the six
// Operations dimensions. No shared vocabulary module exports this list (unlike derivation/origin_class,
// which do — imported above), so it is pinned here the way market-eu-oil-bulletin-parser.test.mjs pins
// its series_key format regex: against the migration, not invented.
const DIMENSION_VALUES = Object.freeze([
  "regulatory_feasibility", "regional_resources", "labor_markets",
  "materials_sourcing", "infrastructure", "operational_cost",
]);
const TREND_VALUES = Object.freeze(["up", "down", "flat"]);

const HERE = dirname(fileURLToPath(import.meta.url));
// The SAME committed fixture bls-oews-parser.npmtest.mjs is proven against — real upstream SHAPE (the
// documented BLS Public Data API v2 timeseries response format), illustrative wage VALUES (see the
// fixture's own "_test_fixture_note": outbound access to api.bls.gov is blocked in the sandbox that
// authored both this file and the fixture). Not invented for this proof.
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "..", "lib", "regional", "fixtures", "bls-oews-sample.json"), "utf8"),
);

test("the full composition: real BLS fixture -> parser -> toCandidateRows -> latestPerNaturalKey", () => {
  const observations = parseOewsResponse(FIXTURE);
  assert.equal(observations.length, OEWS_OCCUPATIONS.length, "one observation per catalogued occupation");

  const candidates = toCandidateRows(observations);
  assert.equal(candidates.length, observations.length, "toCandidateRows must not drop or add rows");

  const reduced = latestPerNaturalKey(candidates);
  // The fixture's 3 occupations have 3 distinct fact_labels within the same (region_code, dimension) —
  // no natural-key collision, so the reduction is a no-op here. The collision case (same key, multiple
  // periods) is exercised directly below with a constructed payload shaped like a real one.
  assert.equal(reduced.length, 3, "no natural-key collisions in this fixture — reduction must not drop a distinct fact_label");
});

test("every reduced candidate row satisfies the LIVE regional_data_facts constraints", () => {
  const candidates = toCandidateRows(parseOewsResponse(FIXTURE));
  const reduced = latestPerNaturalKey(candidates);
  assert.ok(reduced.length > 0);

  for (const r of reduced) {
    // value: TEXT NOT NULL (migration 106) — THE REGRESSION GUARD for the WO-17 2026-08-30 incident:
    // buildEnvelopeRow was never called, `value` stayed unset, and the first live --apply died on this
    // exact NOT NULL constraint. toCandidateRows (which calls buildEnvelopeRow) is what derives it.
    assert.equal(typeof r.value, "string");
    assert.ok(r.value.length > 0, `row ${r.fact_label} is missing NOT-NULL "value" — this is the exact WO-17 2026-08-30 regression`);

    // dimension / fact_label: NOT NULL, non-empty.
    assert.ok(DIMENSION_VALUES.includes(r.dimension), `row has illegal dimension "${r.dimension}"`);
    assert.equal(typeof r.fact_label, "string");
    assert.ok(r.fact_label.length > 0);

    // value_numeric: finite number backing `value`.
    assert.equal(typeof r.value_numeric, "number");
    assert.ok(Number.isFinite(r.value_numeric));

    // unit: non-empty (formatDisplayValue would already have thrown before this if it were not).
    assert.equal(typeof r.unit, "string");
    assert.ok(r.unit.length > 0);

    // derivation / origin_class: CHECK IN (...), checked against the live vocabulary modules.
    assert.ok(DERIVATION_VALUES.includes(r.derivation), `row ${r.fact_label} has illegal derivation "${r.derivation}"`);
    assert.ok(ORIGIN_CLASS_VALUES.includes(r.origin_class), `row ${r.fact_label} has illegal origin_class "${r.origin_class}"`);

    // n_observations: CHECK (n_observations IS NULL OR n_observations > 0).
    assert.ok(
      r.n_observations === null || (Number.isInteger(r.n_observations) && r.n_observations > 0),
      `row ${r.fact_label} has illegal n_observations ${JSON.stringify(r.n_observations)}`,
    );

    // trend: CHECK (trend IS NULL OR trend IN ('up','down','flat')). Neither parser nor buildEnvelopeRow
    // ever sets trend — it is not part of the WO-17 envelope — so every row must leave it unset/null.
    assert.ok(r.trend === undefined || r.trend === null || TREND_VALUES.includes(r.trend), `row ${r.fact_label} has illegal trend ${JSON.stringify(r.trend)}`);

    // source_key: FK -> data_sources(source_key). This producer's whole run is scoped to sourceKey:"bls"
    // (bls-oews-producer.mjs's own runEnvelopeProducer call) and the parser stamps the same literal —
    // asserted equal to that literal rather than merely non-empty, so a drift between the two is caught.
    assert.equal(r.source_key, "bls", `row ${r.fact_label} source_key does not match the producer's declared source`);

    // region_id is intentionally NOT asserted here: it is resolved from region_code by
    // resolveRegionIds()/runEnvelopeProducer AFTER latestPerNaturalKey, immediately before the guarded
    // insert — same scoping run-envelope-producer.test.mjs's own REQUIRED_FROM_CANDIDATE uses, for the
    // same reason (region_id is not this seam's output to prove).
    assert.equal(typeof r.region_code, "string");
    assert.ok(r.region_code.length > 0, `row ${r.fact_label} is missing region_code (resolved to region_id one step later)`);
  }
});

// ── the UNIQUE(region_id, dimension, fact_label) guard: latestPerNaturalKey exists for this ────────
// parseOewsResponse itself already picks one (latest-year) observation per BLS series before returning
// (see its own JSDoc), so a single real fetch through THIS parser never itself hands toCandidateRows two
// observations sharing a fact_label — unlike the Eurostat lane, where one payload naturally contains
// several periods per band (see regional-eurostat-nrg-pc-205-composition.test.mjs). latestPerNaturalKey
// is still a real step in this producer's own composition (runEnvelopeProducer calls it unconditionally
// on whatever toCandidateRows returns), so its collapsing behaviour is proven here directly against two
// hand-built observations shaped exactly like this parser's real output (same fact_label convention,
// same unit/currency/derivation) — not routed back through parseOewsResponse, since that would silently
// mask the very collision this test needs to construct. Values are synthetic, marked so.
test("two observations sharing a natural key collapse to exactly one row, newest as_at_date winning — the 23505 UNIQUE-violation guard", () => {
  const occ = OEWS_OCCUPATIONS[0];
  const baseObservation = (year, asAtDate, value) => ({
    region_code: "US",
    dimension: "labor_markets",
    fact_label: `US — ${occ.title} annual median wage (OEWS)`, // parseOewsResponse's own fact_label shape
    value_numeric: value,
    unit: "USD/year",
    currency: "USD",
    derivation: "observed",
    origin_class: "official",
    source_key: "bls",
    source_ref: buildOewsSeriesId(occ.socCode),
    method_version: "bls-oews-parser@1",
    as_at_date: asAtDate,
    reference_period: year,
    n_observations: null,
  });
  const observations = [
    baseObservation("2022", "2022-05-01", 50000),
    baseObservation("2024", "2024-05-01", 54320), // newest — must win
    baseObservation("2023", "2023-05-01", 52620),
  ];
  const reduced = latestPerNaturalKey(toCandidateRows(observations));
  assert.equal(reduced.length, 1, "same fact_label across snapshots must never yield two candidate rows");
  assert.equal(reduced[0].reference_period, "2024");
  assert.equal(reduced[0].value_numeric, 54320);
  assert.equal(reduced[0].value, "54320 USD/year");
});
