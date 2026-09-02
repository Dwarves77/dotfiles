// Run: node --test scripts/review/lib/coverage-gaps.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKeyOf, recommendGapDisposition, groupRows, patchForDecision, freshestTimestamp } from "./coverage-gaps.mjs";

test("groupKeyOf: coverage_class x jurisdiction x transport_mode", () => {
  assert.equal(
    groupKeyOf({ coverage_class: "MISSING", jurisdiction: "eu", transport_mode: "air" }),
    "MISSING::eu::air"
  );
});

test("recommendGapDisposition: both directions across the table's own evidence hierarchy", () => {
  assert.equal(recommendGapDisposition("HAVE_QUARANTINED", "HIGH"), "declined");
  assert.equal(recommendGapDisposition("AMBIGUOUS_ARCHIVED", "HIGH"), "parked");
  assert.equal(recommendGapDisposition("MISSING", "CRITICAL"), "kept");
  assert.equal(recommendGapDisposition("MISSING", "HIGH"), "kept");
  assert.equal(recommendGapDisposition("MISSING", "MODERATE"), "parked");
  assert.equal(recommendGapDisposition("MISSING", "LOW"), "parked");
  assert.equal(recommendGapDisposition("SOMETHING_ELSE", "HIGH"), "uncertain");
});

const ROWS = [
  { id: "g1", instrument: "CORSIA", jurisdiction: "global", transport_mode: "air", estimated_priority: "CRITICAL", coverage_class: "MISSING", authoritative_url: "https://icao.int/x", created_at: "2026-07-17T00:00:00Z" },
  { id: "g2", instrument: "UK CBAM", jurisdiction: "uk", transport_mode: "multi", estimated_priority: "HIGH", coverage_class: "MISSING", authoritative_url: "https://gov.uk/x", created_at: "2026-09-01T00:00:00Z" },
  { id: "g3", instrument: "IMO Net-Zero", jurisdiction: "global", transport_mode: "ocean", estimated_priority: "HIGH", coverage_class: "HAVE_QUARANTINED", authoritative_url: "https://imo.org/x", created_at: "2026-07-17T00:00:00Z" },
];

test("groupRows: deterministic order, per-class recommendation, mixed-priority MISSING group is uncertain", () => {
  const g1 = groupRows(ROWS);
  const g2 = groupRows([...ROWS].reverse());
  assert.deepEqual(g1.map((g) => g.key), g2.map((g) => g.key));
  const quarantined = g1.find((g) => g.key.startsWith("HAVE_QUARANTINED"));
  assert.equal(quarantined.recommended_decision, "declined");

  const mixed = groupRows([
    { ...ROWS[0], id: "m1", jurisdiction: "eu", transport_mode: "air", estimated_priority: "CRITICAL" },
    { ...ROWS[0], id: "m2", jurisdiction: "eu", transport_mode: "air", estimated_priority: "LOW" },
  ]);
  assert.equal(mixed[0].recommended_decision, "uncertain");
});

test("patchForDecision: kept has no surface_test; declined/parked carry a uniform 5-surface payload", () => {
  assert.deepEqual(patchForDecision("kept"), { disposition: "kept" });
  const declined = patchForDecision("declined", { rationale: "already in corpus" });
  assert.equal(declined.disposition, "declined");
  for (const k of ["regulations", "operations", "market_intel", "research", "community"]) {
    assert.equal(declined.surface_test[k].verdict, "not_applicable");
    assert.equal(declined.surface_test[k].reason, "already in corpus");
  }
  const parked = patchForDecision("parked", {});
  assert.equal(parked.surface_test.regulations.verdict, "deferred");
  assert.equal(patchForDecision("skip"), null);
});

test("freshestTimestamp: max created_at", () => {
  assert.equal(freshestTimestamp(ROWS), "2026-09-01T00:00:00.000Z");
});
