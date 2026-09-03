// antitrust.test.mjs — constructed fixtures, no database (spec 05 §1, §6 acceptance criterion 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { kAnonymity, dominanceCap, threeMonthLag, evaluateAntitrustGuard, SENSITIVE_FIELDS } from "./antitrust.mjs";

// ── kAnonymity ──────────────────────────────────────────────────────────────────────────────────
test("kAnonymity: below floor is not satisfied", () => {
  const r = kAnonymity(["org-a", "org-b", "org-c"]);
  assert.equal(r.distinctOrganisations, 3);
  assert.equal(r.minContributors, 5);
  assert.equal(r.satisfied, false);
});

test("kAnonymity: counts DISTINCT organisations, not rows (repeat contributor never inflates the count)", () => {
  const r = kAnonymity(["org-a", "org-a", "org-a", "org-b", "org-c"]);
  assert.equal(r.distinctOrganisations, 3);
  assert.equal(r.satisfied, false);
});

test("kAnonymity: exactly at the floor satisfies", () => {
  const r = kAnonymity(["a", "b", "c", "d", "e"]);
  assert.equal(r.distinctOrganisations, 5);
  assert.equal(r.satisfied, true);
});

test("kAnonymity: accepts {organisationKey} row objects", () => {
  const pool = ["a", "b", "c", "d", "e"].map((organisationKey) => ({ organisationKey }));
  assert.equal(kAnonymity(pool).satisfied, true);
});

// ── dominanceCap ────────────────────────────────────────────────────────────────────────────────
test("dominanceCap: count-weighted, one org over the cap", () => {
  const pool = [
    { organisationKey: "big" }, { organisationKey: "big" }, { organisationKey: "big" },
    { organisationKey: "small1" }, { organisationKey: "small2" },
  ];
  const r = dominanceCap(pool);
  assert.equal(r.dominantOrganisation, "big");
  assert.equal(Math.round(r.maxShare * 100), 60);
  assert.equal(r.satisfied, false);
});

test("dominanceCap: count-weighted, evenly split five orgs satisfies (20% each)", () => {
  const pool = ["a", "b", "c", "d", "e"].map((organisationKey) => ({ organisationKey }));
  const r = dominanceCap(pool);
  assert.equal(Math.round(r.maxShare * 100), 20);
  assert.equal(r.satisfied, true);
});

test("dominanceCap: value-weighted, one org holds 92.6% (mirrors migration 287's own fixture)", () => {
  const pool = [
    { organisationKey: "c1", value: 1000 },
    { organisationKey: "c2", value: 20 },
    { organisationKey: "c3", value: 20 },
    { organisationKey: "c4", value: 20 },
    { organisationKey: "c5", value: 20 },
  ];
  const r = dominanceCap(pool);
  assert.equal(r.dominantOrganisation, "c1");
  assert.ok(r.maxShare > 0.92 && r.maxShare < 0.93);
  assert.equal(r.satisfied, false);
});

test("dominanceCap: value-weighted, balanced 20% shares satisfies", () => {
  const pool = ["c1", "c2", "c3", "c4", "c5"].map((organisationKey) => ({ organisationKey, value: 200 }));
  const r = dominanceCap(pool);
  assert.equal(Math.round(r.maxShare * 100), 20);
  assert.equal(r.satisfied, true);
});

test("dominanceCap: empty pool is vacuously satisfied", () => {
  assert.equal(dominanceCap([]).satisfied, true);
});

// ── threeMonthLag ───────────────────────────────────────────────────────────────────────────────
test("threeMonthLag: data from today does not satisfy the lag", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = threeMonthLag("2026-09-01", now);
  assert.equal(r.satisfied, false);
});

test("threeMonthLag: data exactly 3 calendar months old satisfies (boundary is inclusive)", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = threeMonthLag("2026-06-03", now);
  assert.equal(r.satisfied, true);
});

test("threeMonthLag: one day short of 3 months does not satisfy", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = threeMonthLag("2026-06-04", now);
  assert.equal(r.satisfied, false);
});

test("threeMonthLag: crosses a leap-February boundary correctly", () => {
  // 2028 is a leap year; three months back from 2028-05-31 lands on 2028-02-29 (not 2028-03-02).
  const now = new Date("2028-05-31T00:00:00Z");
  assert.equal(threeMonthLag("2028-02-29", now).satisfied, true);
  assert.equal(threeMonthLag("2028-03-01", now).satisfied, false);
});

test("threeMonthLag: unparseable date is never satisfied (fail closed)", () => {
  const r = threeMonthLag("not-a-date", new Date("2026-09-03"));
  assert.equal(r.satisfied, false);
});

// ── evaluateAntitrustGuard ──────────────────────────────────────────────────────────────────────
test("evaluateAntitrustGuard: an ordinary post with no sensitive field is always allowed", () => {
  const r = evaluateAntitrustGuard({ sensitivityField: null });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, null);
  assert.equal(r.aggregateRoute, null);
});

test("evaluateAntitrustGuard: an individual disclosure of a sensitive field is refused at write time, always, regardless of pool", () => {
  const r = evaluateAntitrustGuard({
    sensitivityField: "rate_per_feu",
    isAggregate: false,
    pool: Array.from({ length: 50 }, (_, i) => ({ organisationKey: `org-${i}` })), // even a huge pool doesn't help
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /never permitted/);
  assert.deepEqual(r.aggregateRoute, {
    type: "benchmark_instrument",
    field: "rate_per_feu",
    endpoint: "/api/community/benchmarks/current",
  });
});

test("evaluateAntitrustGuard: an aggregate result refused when k-anonymity is not met", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evaluateAntitrustGuard({
    sensitivityField: "saf_premium_pct",
    isAggregate: true,
    pool: ["a", "b", "c"].map((organisationKey) => ({ organisationKey })),
    asOfDate: "2026-05-01",
    now,
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /more contributing organisation/);
  assert.equal(r.aggregateRoute.pending, true);
});

test("evaluateAntitrustGuard: an aggregate result refused when one org dominates, even with 5+ contributors", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evaluateAntitrustGuard({
    sensitivityField: "capacity_teu",
    isAggregate: true,
    pool: [
      { organisationKey: "dominant", value: 1000 },
      { organisationKey: "b", value: 10 },
      { organisationKey: "c", value: 10 },
      { organisationKey: "d", value: 10 },
      { organisationKey: "e", value: 10 },
    ],
    asOfDate: "2026-01-01",
    now,
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /one organisation would hold/);
});

test("evaluateAntitrustGuard: an aggregate result refused when the data is too recent (current, not historical)", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evaluateAntitrustGuard({
    sensitivityField: "wage_per_hour",
    isAggregate: true,
    pool: ["a", "b", "c", "d", "e"].map((organisationKey) => ({ organisationKey })),
    asOfDate: "2026-08-15",
    now,
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /must be older than 3 months/);
});

test("evaluateAntitrustGuard: an aggregate result that clears all three gates is allowed", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evaluateAntitrustGuard({
    sensitivityField: "rate_per_feu",
    isAggregate: true,
    pool: ["a", "b", "c", "d", "e", "f"].map((organisationKey) => ({ organisationKey, value: 100 })),
    asOfDate: "2026-01-01",
    now,
  });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, null);
  assert.equal(r.aggregateRoute.pending, false);
});

test("evaluateAntitrustGuard: reports every failing gate together, not just the first", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evaluateAntitrustGuard({
    sensitivityField: "pricing",
    isAggregate: true,
    pool: [{ organisationKey: "only-one", value: 100 }],
    asOfDate: "2026-08-20",
    now,
  });
  assert.equal(r.allowed, false);
  assert.match(r.reason, /more contributing organisation/);
  assert.match(r.reason, /must be older than 3 months/);
});

test("SENSITIVE_FIELDS names the dangerous categories spec 05 §1 lists", () => {
  assert.ok(SENSITIVE_FIELDS.includes("rate_per_feu"));
  assert.ok(SENSITIVE_FIELDS.includes("wage_per_hour"));
  assert.ok(SENSITIVE_FIELDS.includes("capacity_teu"));
  assert.ok(SENSITIVE_FIELDS.includes("pricing"));
});
