// backfill-derivation-edges.test.mjs — proves runBackfill()'s orchestration (dry-vs-apply, per-candidate
// --limit, and that it delegates to the three producer chokepoints unmodified) with fully injected fakes.
// No DB, no network — importing backfill-derivation-edges.mjs itself must not touch the environment
// (its creds check lives inside main(), gated by IS_MAIN — this file proves that by importing cleanly).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runBackfill } from "./backfill-derivation-edges.mjs";

const EF_ROWS = [
  { factor_id: "ef-1", source_key: "desnz_ghg_factors" },
  { factor_id: "ef-2", source_key: "desnz_ghg_factors" },
];
const REGION_IDS = ["r1", "r2", "r3"];
const SERIES_KEYS = ["eia-v2:wti-crude-rwtc", "eia-v2:brent-crude-rbrte"];

const NO_MARKET_COUNTS = { authored: 0, skippedAlready: 0, insufficientHistory: 0, unitMismatch: 0, refused: 0, unknownMethod: 0, errored: 0 };
const NO_EF_COUNTS = { authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 };
const NO_REGION_COUNTS = { authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 };

function fakeDeps(overrides = {}) {
  return {
    loadEfFn: async () => EF_ROWS,
    loadRegionsFn: async () => REGION_IDS,
    loadSeriesKeysFn: async () => SERIES_KEYS,
    authorCarbonIntensityEdgesFn: async () => { throw new Error("must not be called in dry mode"); },
    authorAutomateVsHireForRegionsFn: async () => { throw new Error("must not be called in dry mode"); },
    authorMarketSeriesDeltaEdgesFn: async () => { throw new Error("must not be called in dry mode"); },
    sb: {}, // apply-mode tests that don't care about sb identity still must never construct a real client
    ...overrides,
  };
}

test("runBackfill: dry mode reports candidate counts and calls NONE of the three authoring delegates", async () => {
  const result = await runBackfill({ apply: false }, fakeDeps());
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(result.candidates, { emissionFactors: 2, regions: 3, marketSeries: 2 });
});

test("runBackfill: --limit bounds EACH candidate list independently, applied before any delegate is called", async () => {
  let seenEfRows = null;
  let seenRegionIds = null;
  let seenSeriesKeys = null;
  const result = await runBackfill({ apply: true, limit: 1 }, fakeDeps({
    authorCarbonIntensityEdgesFn: async (rows) => { seenEfRows = rows; return NO_EF_COUNTS; },
    authorAutomateVsHireForRegionsFn: async (ids) => { seenRegionIds = ids; return NO_REGION_COUNTS; },
    authorMarketSeriesDeltaEdgesFn: async (keys) => { seenSeriesKeys = keys; return NO_MARKET_COUNTS; },
  }));
  assert.equal(result.candidates.emissionFactors, 1);
  assert.equal(result.candidates.regions, 1);
  assert.equal(result.candidates.marketSeries, 1);
  assert.equal(seenEfRows.length, 1);
  assert.deepEqual(seenEfRows[0], EF_ROWS[0]);
  assert.deepEqual(seenRegionIds, ["r1"]);
  assert.deepEqual(seenSeriesKeys, [SERIES_KEYS[0]]);
});

test("runBackfill: apply mode delegates to authorCarbonIntensityEdges with writtenRows === insertRes.rows (same live array, no reshaping)", async () => {
  let seenWrittenRows = null, seenInsertRes = null;
  await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async (writtenRows, insertRes) => {
      seenWrittenRows = writtenRows;
      seenInsertRes = insertRes;
      return { ...NO_EF_COUNTS, authored: 2 };
    },
    authorAutomateVsHireForRegionsFn: async () => NO_REGION_COUNTS,
    authorMarketSeriesDeltaEdgesFn: async () => NO_MARKET_COUNTS,
  }));
  assert.deepEqual(seenWrittenRows, EF_ROWS);
  assert.deepEqual(seenInsertRes, { rows: EF_ROWS });
});

test("runBackfill: apply mode passes region ids to authorAutomateVsHireForRegions with mode 'apply'", async () => {
  let seenMode = null;
  await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async () => NO_EF_COUNTS,
    authorAutomateVsHireForRegionsFn: async (ids, mode) => { seenMode = mode; return { ...NO_REGION_COUNTS, authored: 3 }; },
    authorMarketSeriesDeltaEdgesFn: async () => NO_MARKET_COUNTS,
  }));
  assert.equal(seenMode, "apply");
});

test("runBackfill: apply mode passes series_keys to authorMarketSeriesDeltaEdges with mode 'apply'", async () => {
  let seenKeys = null, seenMode = null;
  await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async () => NO_EF_COUNTS,
    authorAutomateVsHireForRegionsFn: async () => NO_REGION_COUNTS,
    authorMarketSeriesDeltaEdgesFn: async (keys, mode) => { seenKeys = keys; seenMode = mode; return { ...NO_MARKET_COUNTS, authored: 1 }; },
  }));
  assert.deepEqual(seenKeys, SERIES_KEYS);
  assert.equal(seenMode, "apply");
});

test("runBackfill: apply mode result carries ALL THREE delegates' counts back to the caller, untouched", async () => {
  const efCounts = { ...NO_EF_COUNTS, authored: 2, skippedAlready: 5, licenceBlocked: 1 };
  const regionCounts = { ...NO_REGION_COUNTS, authored: 1, skippedIncomplete: 2 };
  const seriesCounts = { ...NO_MARKET_COUNTS, authored: 1, insufficientHistory: 1 };
  const result = await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async () => efCounts,
    authorAutomateVsHireForRegionsFn: async () => regionCounts,
    authorMarketSeriesDeltaEdgesFn: async () => seriesCounts,
  }));
  assert.equal(result.mode, "apply");
  assert.deepEqual(result.efCounts, efCounts);
  assert.deepEqual(result.regionCounts, regionCounts);
  assert.deepEqual(result.seriesCounts, seriesCounts);
});

test("runBackfill: apply mode with an explicit sb dep never constructs a real client", async () => {
  const sbSentinel = { marker: "fake-sb" };
  let sbSeenByEf = null, sbSeenByRegions = null, sbSeenBySeries = null;
  await runBackfill({ apply: true }, fakeDeps({
    sb: sbSentinel,
    readClientFn: () => { throw new Error("must not construct a real client — sb was already provided"); },
    authorCarbonIntensityEdgesFn: async (rows, insertRes, deps) => { sbSeenByEf = deps.sb; return NO_EF_COUNTS; },
    authorAutomateVsHireForRegionsFn: async (ids, mode, deps) => { sbSeenByRegions = deps.sb; return NO_REGION_COUNTS; },
    authorMarketSeriesDeltaEdgesFn: async (keys, mode, deps) => { sbSeenBySeries = deps.sb; return NO_MARKET_COUNTS; },
  }));
  assert.equal(sbSeenByEf, sbSentinel);
  assert.equal(sbSeenByRegions, sbSentinel);
  assert.equal(sbSeenBySeries, sbSentinel);
});
