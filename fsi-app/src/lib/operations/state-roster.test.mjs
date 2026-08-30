// state-roster.test.mjs — proofs for the Operations By-state roster helpers (WO-10).
// Executed via the src/lib/operations glob in fsi-app/.discipline/run-test-suite.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATE_LABELS, buildStateRoster, formatFactStatus } from "./state-roster.mjs";

// Live-confirmed 2026-08-30 (SELECT DISTINCT state_code FROM state_cost_facts): exactly these 13
// codes carry a sourced cost fact today. This test locks that population in as the contract
// buildStateRoster's union depends on — a regression here is a real product regression, not just a
// stale fixture, per this WO's own "the true number is worse than estimated" finding.
const LIVE_STATE_COST_CODES = [
  "US-AZ", "US-CA", "US-CO", "US-FL", "US-GA", "US-IL", "US-MA",
  "US-NJ", "US-NY", "US-OH", "US-PA", "US-TX", "US-WA",
];

test("STATE_LABELS carries a label for every live state_cost_facts code, plus NC", () => {
  for (const code of LIVE_STATE_COST_CODES) {
    assert.equal(typeof STATE_LABELS[code], "string", `missing label for ${code}`);
    assert.ok(STATE_LABELS[code].length > 0);
  }
  assert.equal(STATE_LABELS["US-NC"], "North Carolina");
  assert.equal(Object.keys(STATE_LABELS).length, 14, "13 cost-fact states + NC, no silent extras");
});

test("buildStateRoster is the UNION of regulation-matched and cost-fact states, not the intersection", () => {
  const regionEntries = [
    { code: "US-NC", label: "North Carolina", regs: [{ id: "r1" }, { id: "r2" }] },
  ];
  const costCodes = ["US-CA", "US-NY"]; // neither matched by a regulation here
  const roster = buildStateRoster(regionEntries, costCodes);
  const codes = roster.map((s) => s.code).sort();
  assert.deepEqual(codes, ["US-CA", "US-NC", "US-NY"]);
});

test("a cost-only state renders with an honest empty regs array, never dropped", () => {
  const roster = buildStateRoster([], ["US-WA"]);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].code, "US-WA");
  assert.equal(roster[0].label, "Washington");
  assert.deepEqual(roster[0].regs, []);
});

test("a regulation-only state (no cost fact) still renders, with its real regs and label", () => {
  const roster = buildStateRoster(
    [{ code: "US-NC", label: "North Carolina", regs: [{ id: "r1" }] }],
    []
  );
  assert.equal(roster.length, 1);
  assert.equal(roster[0].code, "US-NC");
  assert.equal(roster[0].regs.length, 1);
});

test("a state present in both sides keeps its real regs, not an empty array", () => {
  const roster = buildStateRoster(
    [{ code: "US-CA", label: "California", regs: [{ id: "a" }, { id: "b" }, { id: "c" }] }],
    ["US-CA"]
  );
  assert.equal(roster.length, 1);
  assert.equal(roster[0].regs.length, 3, "the union must not clobber the real regulation list with the cost-only empty default");
});

test("all 13 live state_cost_facts codes surface even with zero regulation matches", () => {
  const roster = buildStateRoster([], LIVE_STATE_COST_CODES);
  assert.equal(roster.length, 13, "the pre-fix code could only ever surface 2 of these 13 (CA, NY)");
  const codes = new Set(roster.map((s) => s.code));
  for (const code of LIVE_STATE_COST_CODES) assert.ok(codes.has(code), `${code} missing from roster`);
});

test("roster sort is deterministic regardless of input order: regs count desc, then code asc", () => {
  const regionEntries = [
    { code: "US-TX", label: "Texas", regs: [{ id: "1" }] },
    { code: "US-NY", label: "New York", regs: [{ id: "1" }, { id: "2" }] },
  ];
  const costCodes = ["US-AZ", "US-CA"]; // both 0 regs, tie broken by code
  const a = buildStateRoster(regionEntries, costCodes);
  const b = buildStateRoster(regionEntries.slice().reverse(), Array.from(costCodes).reverse());
  const order = (r) => r.map((s) => s.code);
  assert.deepEqual(order(a), ["US-NY", "US-TX", "US-AZ", "US-CA"]);
  assert.deepEqual(order(a), order(b), "same data, any input order, same render order");
});

test("buildStateRoster never throws on degenerate input and never invents a state", () => {
  assert.deepEqual(buildStateRoster(undefined, undefined), []);
  assert.deepEqual(buildStateRoster(null, null), []);
  assert.doesNotThrow(() =>
    buildStateRoster(
      [{ code: "" }, { notCode: 1 }, null, { code: "US-CA", regs: "not-an-array" }],
      [null, "", "US-CA", 42]
    )
  );
  const roster = buildStateRoster([{ code: "US-CA", regs: "not-an-array" }], ["US-CA"]);
  assert.deepEqual(roster, [{ code: "US-CA", label: "California", regs: [] }]);
});

test("formatFactStatus trims and omits blank/whitespace-only values as null, never an empty badge", () => {
  assert.equal(formatFactStatus("Constrained"), "Constrained");
  assert.equal(formatFactStatus("  Tight pool  "), "Tight pool");
  assert.equal(formatFactStatus(""), null);
  assert.equal(formatFactStatus("   "), null);
  assert.equal(formatFactStatus(null), null);
  assert.equal(formatFactStatus(undefined), null);
  assert.equal(formatFactStatus(42), null);
});
