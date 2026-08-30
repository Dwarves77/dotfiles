// regional-eurostat-nrg-pc-205-composition.test.mjs — the seam proof
// scripts/producers/regional/eurostat-nrg-pc-205-producer.mjs never had.
//
// WHY THIS EXISTS (2026-08-30). eurostat-nrg-pc-205-producer.mjs composes THREE first-party seams: its
// own parser (src/lib/regional/eurostat-nrg-pc-205-parser.mjs) and two exports of the shared
// orchestration shell (scripts/producers/regional/run-envelope-producer.mjs: toCandidateRows,
// latestPerNaturalKey — the producer calls runEnvelopeProducer(), which calls both internally). Before
// this file, each half had its own proof — eurostat-nrg-pc-205-parser.npmtest.mjs proves the parser
// against a fixture; run-envelope-producer.test.mjs proves toCandidateRows/latestPerNaturalKey against a
// HAND-BUILT observation shaped LIKE this parser's output ("field-for-field, from run #1's log" per that
// file's own comment) — but never THIS parser, and nothing imported both halves together. F27
// (producer-seam-proof) is the gate that mechanized finding this gap; this file is what closes it.
//
// THE INCIDENT THIS GUARDS AGAINST, and why THIS producer is where it was actually discovered
// (run-envelope-producer.mjs's own header carries the full story). The first live --apply of a
// regional_data_facts producer died on its first row:
//   `null value in column "value" of relation "regional_data_facts" violates not-null constraint`
// The parser had a green fixture proof. buildEnvelopeRow (which derives `value`, TEXT NOT NULL, migration
// 106) had a green proof. planUpsert had a green proof. The orchestrator simply never called
// buildEnvelopeRow on real parser output. The asserts below on candidate.value are the regression guard
// for exactly that miss.
//
// THE SECOND HALF OF THE SAME INCIDENT — the reason latestPerNaturalKey exists at all — was found in
// THIS producer specifically: the Eurostat fact_label carries the consumption band but NOT the semester,
// so one live payload (283 observations = ~7 bands x ~40 semesters, run #1 2026-08-30) held ~40
// candidates per natural key. planUpsert dedupes candidates against EXISTING rows only, never against
// each other, so an apply would have inserted one semester and then died with 23505 unique_violation on
// the second. The multi-period test below reproduces that shape directly (2 bands x 2 periods, from the
// committed fixture — not invented for this proof) and asserts the reduction.
//
// LOCATION: same reasoning as every other proof in this directory — run-test-suite.sh globs
// `fsi-app/src/__tests__/*.test.mjs`, which has no equivalent glob over `src/lib/regional/**`.
//
// $0: pure, in-process, no database, no network — the exact composition eurostat-nrg-pc-205-producer.mjs
// performs via runEnvelopeProducer(), minus the guarded I/O boundary (scripts/lib/db.mjs) and region_id
// resolution (resolveRegionIds), which happen strictly AFTER latestPerNaturalKey and are out of scope for
// a seam proof between src/lib/regional and the orchestrator's pure core.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseNrgPc205 } from "../lib/regional/eurostat-nrg-pc-205-parser.mjs";
import { toCandidateRows, latestPerNaturalKey } from "../../scripts/producers/regional/run-envelope-producer.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

// Live regional_data_facts_dimension_check (supabase/migrations/106_regions_and_facts.sql) — same
// constant, same reasoning, as regional-bls-oews-composition.test.mjs's own copy: no shared vocabulary
// module exports it, so it is pinned against the migration rather than invented.
const DIMENSION_VALUES = Object.freeze([
  "regulatory_feasibility", "regional_resources", "labor_markets",
  "materials_sourcing", "infrastructure", "operational_cost",
]);
const TREND_VALUES = Object.freeze(["up", "down", "flat"]);

const HERE = dirname(fileURLToPath(import.meta.url));
// The SAME committed fixture eurostat-nrg-pc-205-parser.npmtest.mjs is proven against — real Eurostat
// JSON-stat 2.0 SHAPE, illustrative band codes/values (see the fixture's own "_test_fixture_note":
// outbound access to ec.europa.eu is blocked in the sandbox that authored both this file and the
// fixture). It carries 2 consumption bands x 2 semesters (2025-S1, 2025-S2) for geo=EU27_2020 — the exact
// multi-period-per-band shape the live 2026-08-30 incident hit. Not invented for this proof.
const FIXTURE = JSON.parse(
  readFileSync(join(HERE, "..", "lib", "regional", "fixtures", "eurostat-nrg-pc-205-sample.json"), "utf8"),
);

test("the full composition: real Eurostat fixture -> parser -> toCandidateRows -> latestPerNaturalKey", () => {
  const observations = parseNrgPc205(FIXTURE, { geo: "EU27_2020", regionCode: "EU" });
  // 2 consumption bands x 2 semesters present in the fixture for EU27_2020 (see the fixture's own
  // dimension/value block: MWH20-499 and MWH500-1999, 2025-S1 and 2025-S2 both populated for this geo).
  assert.equal(observations.length, 4, "expected 2 bands x 2 semesters for geo=EU27_2020");

  const candidates = toCandidateRows(observations);
  assert.equal(candidates.length, 4, "toCandidateRows must not drop or add rows");
});

// ── the exact incident: the SAME (region, dimension, fact_label) across multiple periods ───────────
test("multi-period reduction: 2 bands x 2 semesters collapse to exactly 2 rows, newest semester winning per band", () => {
  const observations = parseNrgPc205(FIXTURE, { geo: "EU27_2020", regionCode: "EU" });
  const candidates = toCandidateRows(observations);
  const reduced = latestPerNaturalKey(candidates);

  assert.equal(reduced.length, 2, "one row per consumption band — the 23505 UNIQUE-violation guard: reduction must collapse periods, not multiply them");

  const byBandLabel = new Map(reduced.map((r) => [r.fact_label, r]));
  const lowBand = byBandLabel.get("EU — Electricity price for non-household consumers, 20 MWh < Consumption < 500 MWh (all taxes and levies)");
  const highBand = byBandLabel.get("EU — Electricity price for non-household consumers, 500 MWh < Consumption < 2 000 MWh (all taxes and levies)");
  assert.ok(lowBand, "the low-consumption band must survive the reduction");
  assert.ok(highBand, "the high-consumption band must survive the reduction");

  // 2025-S2 (as_at_date 2025-07-01) is newer than 2025-S1 (2025-01-01) — it must win over the older
  // semester for BOTH bands, not just whichever happened to be reduced first.
  assert.equal(lowBand.reference_period, "2025-S2");
  assert.equal(lowBand.value_numeric, 0.2087);
  assert.equal(highBand.reference_period, "2025-S2");
  assert.equal(highBand.value_numeric, 0.1856);

  // The dropped 2025-S1 rows must actually be GONE, not merged/averaged — reduction is "keep the
  // newest", never a silent aggregation that would misstate the reported price.
  for (const r of reduced) assert.notEqual(r.reference_period, "2025-S1");
});

test("every reduced candidate row satisfies the LIVE regional_data_facts constraints", () => {
  const observations = parseNrgPc205(FIXTURE, { geo: "EU27_2020", regionCode: "EU" });
  const reduced = latestPerNaturalKey(toCandidateRows(observations));
  assert.equal(reduced.length, 2);

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

    // source_key: FK -> data_sources(source_key). This producer's whole run is scoped to
    // sourceKey:"eurostat" (eurostat-nrg-pc-205-producer.mjs's own runEnvelopeProducer call) and the
    // parser stamps the same literal — asserted equal rather than merely non-empty, so a drift between
    // the two is caught.
    assert.equal(r.source_key, "eurostat", `row ${r.fact_label} source_key does not match the producer's declared source`);

    // region_id is intentionally NOT asserted here: it is resolved from region_code by
    // resolveRegionIds()/runEnvelopeProducer AFTER latestPerNaturalKey, immediately before the guarded
    // insert — same scoping run-envelope-producer.test.mjs's own REQUIRED_FROM_CANDIDATE uses, for the
    // same reason (region_id is not this seam's output to prove).
    assert.equal(typeof r.region_code, "string");
    assert.ok(r.region_code.length > 0, `row ${r.fact_label} is missing region_code (resolved to region_id one step later)`);
  }
});
