import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateBenchmarkResponses, scopeBenchmarksForReader, isOpenForResponses } from "./benchmark.mjs";

const NOW = new Date("2026-09-03T00:00:00Z");

test("aggregateBenchmarkResponses: refuses below k-anonymity floor", () => {
  const instrument = { key: "saf-premium-eu-us-air-2026-q2", periodEnd: "2026-06-30" };
  const responses = ["a", "b", "c"].map((organisationKey, i) => ({
    organisationKey, valueNumeric: 10 + i, submittedAt: "2026-06-15",
  }));
  const r = aggregateBenchmarkResponses(instrument, responses, NOW);
  assert.equal(r.publishable, false);
  assert.match(r.reason, /k-anonymity/);
  assert.equal(r.value, null);
});

test("aggregateBenchmarkResponses: publishes a mean once all three gates clear", () => {
  const instrument = { key: "saf-premium-eu-us-air-2026-q2", periodEnd: "2026-05-01" };
  const responses = ["a", "b", "c", "d", "e"].map((organisationKey, i) => ({
    organisationKey, valueNumeric: 10 + i, submittedAt: "2026-06-15",
  }));
  const r = aggregateBenchmarkResponses(instrument, responses, NOW);
  assert.equal(r.publishable, true);
  assert.equal(r.value, (10 + 11 + 12 + 13 + 14) / 5);
  assert.equal(r.reason, null);
});

test("aggregateBenchmarkResponses: dedupes repeat submissions from the same organisation, keeping the latest", () => {
  const instrument = { key: "x", periodEnd: "2026-05-01" };
  const responses = [
    { organisationKey: "a", valueNumeric: 1, submittedAt: "2026-04-01" },
    { organisationKey: "a", valueNumeric: 5, submittedAt: "2026-04-10" }, // same org, later — should win
    { organisationKey: "b", valueNumeric: 4, submittedAt: "2026-04-01" },
    { organisationKey: "c", valueNumeric: 4, submittedAt: "2026-04-01" },
    { organisationKey: "d", valueNumeric: 4, submittedAt: "2026-04-01" },
    { organisationKey: "e", valueNumeric: 4, submittedAt: "2026-04-01" },
  ];
  const r = aggregateBenchmarkResponses(instrument, responses, NOW);
  assert.equal(r.distinctOrganisations, 5);
  assert.equal(r.responseCount, 5);
  assert.equal(r.value, (5 + 4 + 4 + 4 + 4) / 5);
});

test("aggregateBenchmarkResponses: refuses when the period is too recent (not yet historical)", () => {
  const instrument = { key: "x", periodEnd: "2026-08-25" };
  const responses = ["a", "b", "c", "d", "e"].map((organisationKey) => ({
    organisationKey, valueNumeric: 10, submittedAt: "2026-08-20",
  }));
  const r = aggregateBenchmarkResponses(instrument, responses, NOW);
  assert.equal(r.publishable, false);
  assert.match(r.reason, /lag/);
});

test("aggregateBenchmarkResponses: refuses when one organisation dominates the pool", () => {
  const instrument = { key: "x", periodEnd: "2026-01-01" };
  const responses = [
    { organisationKey: "dominant", valueNumeric: 1000, submittedAt: "2025-12-01" },
    { organisationKey: "b", valueNumeric: 10, submittedAt: "2025-12-01" },
    { organisationKey: "c", valueNumeric: 10, submittedAt: "2025-12-01" },
    { organisationKey: "d", valueNumeric: 10, submittedAt: "2025-12-01" },
    { organisationKey: "e", valueNumeric: 10, submittedAt: "2025-12-01" },
  ];
  const r = aggregateBenchmarkResponses(instrument, responses, NOW);
  assert.equal(r.publishable, false);
  assert.match(r.reason, /dominance/);
});

// ── scopeBenchmarksForReader ────────────────────────────────────────────────────────────────────
test("scopeBenchmarksForReader: a global (sectorProfile null) instrument is visible to everyone", () => {
  const instruments = [{ key: "global-1", sectorProfile: null, region: null }];
  const kept = scopeBenchmarksForReader(instruments, { sectorProfile: ["cold-chain"], region: "EU" });
  assert.equal(kept.length, 1);
});

test("scopeBenchmarksForReader: a sector-scoped instrument is only visible to a reader carrying that sector", () => {
  const instruments = [
    { key: "cold-chain-1", sectorProfile: "cold-chain", region: null },
    { key: "pharma-1", sectorProfile: "pharma", region: null },
  ];
  const kept = scopeBenchmarksForReader(instruments, { sectorProfile: ["cold-chain"], region: "EU" });
  assert.deepEqual(kept.map((i) => i.key), ["cold-chain-1"]);
});

test("scopeBenchmarksForReader: a region-scoped instrument respects region; GLOBAL region is always visible", () => {
  const instruments = [
    { key: "eu-1", sectorProfile: null, region: "EU" },
    { key: "us-1", sectorProfile: null, region: "US" },
    { key: "global-1", sectorProfile: null, region: "GLOBAL" },
  ];
  const kept = scopeBenchmarksForReader(instruments, { sectorProfile: [], region: "EU" });
  assert.deepEqual(kept.map((i) => i.key).sort(), ["eu-1", "global-1"]);
});

// ── isOpenForResponses ──────────────────────────────────────────────────────────────────────────
test("isOpenForResponses: true inside the window, false before/after", () => {
  const instrument = { opensAt: "2026-09-01T00:00:00Z", closesAt: "2026-09-30T00:00:00Z" };
  assert.equal(isOpenForResponses(instrument, new Date("2026-08-31T00:00:00Z")), false);
  assert.equal(isOpenForResponses(instrument, new Date("2026-09-15T00:00:00Z")), true);
  assert.equal(isOpenForResponses(instrument, new Date("2026-09-30T00:00:00Z")), false); // half-open at close
});

test("isOpenForResponses: unparseable dates never open", () => {
  assert.equal(isOpenForResponses({ opensAt: "x", closesAt: "y" }, NOW), false);
});
