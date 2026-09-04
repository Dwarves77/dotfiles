// backfill-derivation-edges.test.mjs — proves runBackfill()'s orchestration (dry-vs-apply, per-candidate
// --limit, and that it delegates to the two producer chokepoints unmodified) with fully injected fakes.
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

function fakeDeps(overrides = {}) {
  return {
    loadEfFn: async () => EF_ROWS,
    loadRegionsFn: async () => REGION_IDS,
    authorCarbonIntensityEdgesFn: async () => { throw new Error("must not be called in dry mode"); },
    authorAutomateVsHireForRegionsFn: async () => { throw new Error("must not be called in dry mode"); },
    sb: {}, // apply-mode tests that don't care about sb identity still must never construct a real client
    ...overrides,
  };
}

test("runBackfill: dry mode reports candidate counts and calls NEITHER authoring delegate", async () => {
  const result = await runBackfill({ apply: false }, fakeDeps());
  assert.equal(result.mode, "dry-run");
  assert.deepEqual(result.candidates, { emissionFactors: 2, regions: 3 });
});

test("runBackfill: --limit bounds EACH candidate list independently, applied before either delegate is called", async () => {
  let seenEfRows = null;
  let seenRegionIds = null;
  const result = await runBackfill({ apply: true, limit: 1 }, fakeDeps({
    authorCarbonIntensityEdgesFn: async (rows) => { seenEfRows = rows; return { authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 }; },
    authorAutomateVsHireForRegionsFn: async (ids) => { seenRegionIds = ids; return { authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 }; },
  }));
  assert.equal(result.candidates.emissionFactors, 1);
  assert.equal(result.candidates.regions, 1);
  assert.equal(seenEfRows.length, 1);
  assert.deepEqual(seenEfRows[0], EF_ROWS[0]);
  assert.deepEqual(seenRegionIds, ["r1"]);
});

test("runBackfill: apply mode delegates to authorCarbonIntensityEdges with writtenRows === insertRes.rows (same live array, no reshaping)", async () => {
  let seenWrittenRows = null, seenInsertRes = null;
  await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async (writtenRows, insertRes) => {
      seenWrittenRows = writtenRows;
      seenInsertRes = insertRes;
      return { authored: 2, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 };
    },
    authorAutomateVsHireForRegionsFn: async () => ({ authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 }),
  }));
  assert.deepEqual(seenWrittenRows, EF_ROWS);
  assert.deepEqual(seenInsertRes, { rows: EF_ROWS });
});

test("runBackfill: apply mode passes region ids to authorAutomateVsHireForRegions with mode 'apply'", async () => {
  let seenMode = null;
  await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async () => ({ authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 }),
    authorAutomateVsHireForRegionsFn: async (ids, mode) => { seenMode = mode; return { authored: 3, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 }; },
  }));
  assert.equal(seenMode, "apply");
});

test("runBackfill: apply mode result carries BOTH delegates' counts back to the caller, untouched", async () => {
  const efCounts = { authored: 2, skippedAlready: 5, licenceBlocked: 1, refused: 0, unknownMethod: 0, errored: 0 };
  const regionCounts = { authored: 1, skippedAlready: 0, skippedIncomplete: 2, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 };
  const result = await runBackfill({ apply: true }, fakeDeps({
    authorCarbonIntensityEdgesFn: async () => efCounts,
    authorAutomateVsHireForRegionsFn: async () => regionCounts,
  }));
  assert.equal(result.mode, "apply");
  assert.deepEqual(result.efCounts, efCounts);
  assert.deepEqual(result.regionCounts, regionCounts);
});

test("runBackfill: apply mode with an explicit sb dep never constructs a real client", async () => {
  const sbSentinel = { marker: "fake-sb" };
  let sbSeenByEf = null, sbSeenByRegions = null;
  await runBackfill({ apply: true }, fakeDeps({
    sb: sbSentinel,
    readClientFn: () => { throw new Error("must not construct a real client — sb was already provided"); },
    authorCarbonIntensityEdgesFn: async (rows, insertRes, deps) => { sbSeenByEf = deps.sb; return { authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 }; },
    authorAutomateVsHireForRegionsFn: async (ids, mode, deps) => { sbSeenByRegions = deps.sb; return { authored: 0, skippedAlready: 0, skippedIncomplete: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, refused: 0, unknownMethod: 0, errored: 0 }; },
  }));
  assert.equal(sbSeenByEf, sbSentinel);
  assert.equal(sbSeenByRegions, sbSentinel);
});
