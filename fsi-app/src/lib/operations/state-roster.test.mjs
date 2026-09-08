// state-roster.test.mjs — proofs for the Operations US state roster helpers (WO-10).
//
// The buildStateRoster proofs were deleted with buildStateRoster itself (UI fix round 2026-09-08,
// item D3: the By-state sub-list that was its only caller is gone from /operations). The
// STATE_LABELS population contract below is NOT a test of that sub-list — it is the roster the
// COVERAGE GAPS rail card artboard 08 draws counts against — so it stays.
// The formatFactStatus proofs went the same way in the round's finishing pass: that function was
// [CONFIRMED] dead at the round's own base commit (no consumer outside this module and this file),
// so its proofs were testing something no surface could reach.
// Executed via the src/lib/operations glob in fsi-app/.discipline/run-test-suite.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATE_LABELS } from "./state-roster.mjs";

// Live-confirmed 2026-08-30 (SELECT DISTINCT state_code FROM state_cost_facts): exactly these 13
// codes carry a sourced cost fact today. This test locks that population in as the contract the
// Coverage gaps rail card's "N of M priority jurisdictions" figure depends on — a regression here is
// a real product regression, not just a stale fixture.
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
