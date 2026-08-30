// market-producer-composition.test.mjs — the seam proof scripts/producers/market/eu-weekly-oil-bulletin.mjs
// never had.
//
// WHY THIS EXISTS (2026-08-30). Both halves of this producer's composition were already proven in
// ISOLATION: market-eu-oil-bulletin-parser.test.mjs proves parseEuWeeklyOilBulletinCsv against a fixture,
// and market-write-market-series.test.mjs proves planMarketSeriesUpsert against hand-built row objects.
// Neither test imports the other module. The SEAM between them — real parser output flowing straight
// into the planner, the exact composition eu-weekly-oil-bulletin.mjs performs (csvText ->
// parseEuWeeklyOilBulletinCsv -> rows -> planMarketSeriesUpsert -> toCreate/toUpdate) — was proven by
// NOTHING except the live run of 2026-08-30 that actually wrote these six rows to market_series.
//
// THIS IS THE WO-9 DEFECT CLASS, ONE LANE OVER. On 2026-08-30 the first live --apply of a WO-17 regional
// producer died on `null value in column "value" of relation "regional_data_facts" violates not-null
// constraint` (see scripts/producers/regional/run-envelope-producer.test.mjs's header for the full
// story): the orchestrator never called buildEnvelopeRow, every layer had a green proof in isolation, and
// the untested SEAM between them was the only place the miss could hide. A row that satisfies the parser
// and a row that satisfies the planner can each be correct in isolation and still not be the row the
// LIVE TABLE will accept — market_series.label is NOT NULL exactly the way regional_data_facts.value was,
// and a row-shape assumption that silently drops it (a bypassed field, a renamed key, a planner that
// forgets to carry a column through the patch) is invisible to either isolated proof and visible only
// here, where real parser output is planned and checked against the table's actual constraints.
//
// PRODUCTION-VERIFIED VALUES (2026-08-24 week, EU averages before tax; confirmed by two independent
// reads on 2026-08-30 — a live producers-run extraction and a direct read of the live workbook — and by
// this session's own read of the live market_series constraints via information_schema/pg_constraint):
//   eurosuper-95              1007.6789945404676  EUR/1000L
//   automotive-diesel         1237.8490597499774  EUR/1000L
//   heating-gas-oil           1035.5363425598018  EUR/1000L
//   residual-fuel-oil-1pct     634.6094537147175  EUR/tonne
//   heavy-fuel-oil-3-5pct      582.8206501573814  EUR/tonne
//   lpg-motor-fuel             541.6235127447238  EUR/1000L
//
// CSV CONTRACT: semicolon-delimited, header `week_ending;product;price_eur` — read verbatim from
// fetch-oil-bulletin.mjs's own toCsv() (its emitted header has no n_member_states column; the parser
// treats that column as optional) and from the parser's own JSDoc, not assumed.
//
// $0: pure, in-process, no database, no network — exactly the composition the producer script performs,
// minus the guarded I/O boundary (scripts/lib/db.mjs), which is out of scope for a seam proof between
// src/lib/market modules.
//
// LOCATION: same reasoning as every other new market proof in this directory (see
// market-eu-oil-bulletin-parser.test.mjs's header) — run-test-suite.sh globs
// `fsi-app/src/__tests__/*.test.mjs` but has no glob over `src/lib/market/**`, so this lives here to be
// execution-wired without editing the suite list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEuWeeklyOilBulletinCsv } from "../lib/market/parsers/eu-weekly-oil-bulletin.mjs";
import { planMarketSeriesUpsert } from "../lib/market/write-market-series.mjs";
import { producerFor } from "../lib/market/series-registry.mjs";
import { DERIVATION_VALUES, ORIGIN_CLASS_VALUES } from "../lib/contracts/provenance-envelope.mjs";

// Mirrors migration 268's market_series_series_key_format_check — same regex
// market-eu-oil-bulletin-parser.test.mjs pins on the parser alone; pinned again here because this proof
// is not allowed to assume the parser's own test still holds.
const SERIES_KEY_FORMAT_RE = /^[a-z0-9]+(?:[:_-][a-z0-9]+)*$/;

const REGISTRY_ENTRY = producerFor("eu-oil-bulletin");

// The 2026-08-24 week, six products, exactly the CSV shape fetch-oil-bulletin.mjs emits on stdout.
const WEEK_ENDING = "2026-08-24";
const PRODUCTION_CSV = [
  "week_ending;product;price_eur",
  `${WEEK_ENDING};eurosuper-95;1007.6789945404676`,
  `${WEEK_ENDING};automotive-diesel;1237.8490597499774`,
  `${WEEK_ENDING};heating-gas-oil;1035.5363425598018`,
  `${WEEK_ENDING};residual-fuel-oil-1pct;634.6094537147175`,
  `${WEEK_ENDING};heavy-fuel-oil-3-5pct;582.8206501573814`,
  `${WEEK_ENDING};lpg-motor-fuel;541.6235127447238`,
].join("\n");

test("the full composition: real CSV -> parser -> planner -> 6 creates, 0 updates, 0 skipped, 0 warnings", () => {
  const { rows, warnings } = parseEuWeeklyOilBulletinCsv(PRODUCTION_CSV);
  assert.equal(warnings.length, 0, `parser produced unexpected warning(s): ${JSON.stringify(warnings)}`);
  assert.equal(rows.length, 6);

  const { toCreate, toUpdate, skippedNoReferencePeriod } = planMarketSeriesUpsert([], rows);
  assert.equal(toCreate.length, 6);
  assert.equal(toUpdate.length, 0);
  assert.equal(skippedNoReferencePeriod.length, 0);
});

test("every planned CREATE satisfies the LIVE market_series constraints — not just the planner's own shape", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(PRODUCTION_CSV);
  const { toCreate } = planMarketSeriesUpsert([], rows);
  assert.equal(toCreate.length, 6);

  for (const r of toCreate) {
    // series_key: NOT NULL, non-empty, CHECK series_key_format_check.
    assert.equal(typeof r.series_key, "string");
    assert.ok(r.series_key.length > 0, "series_key must not be empty");
    assert.match(r.series_key, SERIES_KEY_FORMAT_RE, `series_key "${r.series_key}" fails the format CHECK`);

    // label: NOT NULL — the market analogue of regional_data_facts.value. This is exactly the field a
    // bypassed row-builder would drop (the WO-9 shape): the planner and parser can each be internally
    // consistent while silently producing a row the live table's NOT NULL constraint rejects.
    assert.equal(typeof r.label, "string");
    assert.ok(r.label.length > 0, `row ${r.series_key} is missing NOT-NULL "label" — this insert would fail closed against the live table`);

    // value_numeric: must be a real, finite number (never NaN/Infinity/string).
    assert.equal(typeof r.value_numeric, "number");
    assert.ok(Number.isFinite(r.value_numeric), `row ${r.series_key} has a non-finite value_numeric`);

    // unit: non-empty.
    assert.equal(typeof r.unit, "string");
    assert.ok(r.unit.length > 0, `row ${r.series_key} is missing "unit"`);

    // reference_period: present (UNIQUE(series_key, reference_period) is the sole idempotency key; a
    // NULL here would silently multiply duplicate rows on every re-run, per write-market-series.mjs's
    // own header).
    assert.ok(r.reference_period, `row ${r.series_key} is missing reference_period`);

    // derivation / origin_class: CHECK IN (...) — checked against the live vocabulary modules, not a
    // hand-copied list that could drift from them.
    assert.ok(DERIVATION_VALUES.includes(r.derivation), `row ${r.series_key} has illegal derivation "${r.derivation}"`);
    assert.ok(ORIGIN_CLASS_VALUES.includes(r.origin_class), `row ${r.series_key} has illegal origin_class "${r.origin_class}"`);

    // n_observations: CHECK (n_observations IS NULL OR n_observations > 0).
    assert.ok(
      r.n_observations === null || (Number.isInteger(r.n_observations) && r.n_observations > 0),
      `row ${r.series_key} has illegal n_observations ${JSON.stringify(r.n_observations)}`,
    );

    // source_key: FK -> data_sources(source_key). Read from the registry, never hardcoded here — a
    // hardcoded guess in this proof would not catch the registry and the parser drifting from each other.
    assert.equal(r.source_key, REGISTRY_ENTRY.sourceKey, `row ${r.series_key} source_key does not match the registry's declared sourceKey`);
  }
});

test("idempotency: planning the parser's own prior output against itself yields 0 creates and 0 value-changing updates", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(PRODUCTION_CSV);
  const first = planMarketSeriesUpsert([], rows);
  assert.equal(first.toCreate.length, 6);

  // Simulate the six rows now existing, as they would after the guarded inserts (id assigned by the DB;
  // series_key/reference_period carried through unchanged).
  const existingAfterFirstRun = first.toCreate.map((r, i) => ({
    id: `row-${i}`,
    series_key: r.series_key,
    reference_period: r.reference_period,
  }));

  const second = planMarketSeriesUpsert(existingAfterFirstRun, rows);
  assert.equal(second.toCreate.length, 0, "a second run of the SAME week must plan zero creates");
  assert.equal(second.toUpdate.length, 6, "a second run still refreshes each row (not a silent no-op skip)");

  // "0 value-changing updates": every refresh patch must carry the SAME value the row already has —
  // re-running the identical input must never drift a price.
  const byKey = new Map(rows.map((r) => [r.series_key, r]));
  for (const u of second.toUpdate) {
    const original = byKey.get(existingAfterFirstRun.find((e) => e.id === u.id).series_key);
    assert.equal(u.patch.value_numeric, original.value_numeric, `update for id=${u.id} changed value_numeric on an unchanged input`);
    assert.equal(u.patch.label, original.label, `update for id=${u.id} changed label on an unchanged input`);
  }
});

test("a row with no reference_period lands in skippedNoReferencePeriod, never a duplicate under the UNIQUE key", () => {
  const { rows } = parseEuWeeklyOilBulletinCsv(PRODUCTION_CSV);
  // The parser itself never emits a row like this (a malformed week_ending is a parse-time warning +
  // skip, never a row without reference_period) — this constructs the shape directly to prove the
  // planner's OWN defense holds, independent of whether the parser continues to guarantee it upstream.
  const malformed = { ...rows[0], series_key: "eu-oil-bulletin:eurosuper-95-malformed", reference_period: null };

  const { toCreate, skippedNoReferencePeriod } = planMarketSeriesUpsert([], [...rows, malformed]);
  assert.equal(toCreate.length, 6, "the malformed row must not be planned as a create");
  assert.equal(skippedNoReferencePeriod.length, 1);
  assert.equal(skippedNoReferencePeriod[0].series_key, "eu-oil-bulletin:eurosuper-95-malformed");
});
