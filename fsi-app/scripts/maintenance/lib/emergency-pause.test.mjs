// emergency-pause.test.mjs: lane TRUST-RET (2026-10-07). The operator's emergency stop read shared by the
// recompute-tiers and recompute-trust-scores steps: a set flag halts, a missing row does not, an unreadable
// flag fails closed, and the paused summary is a no-write exit 0 that names its reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readEmergencyPause, pausedSummary } from "./emergency-pause.mjs";

test("reads system_state.global_processing_paused and nothing else", async () => {
  const seen = [];
  const readAll = async (table, columns) => { seen.push([table, columns]); return [{ global_processing_paused: false }]; };
  assert.deepEqual(await readEmergencyPause(readAll), { paused: false, error: null });
  assert.deepEqual(seen, [["system_state", "global_processing_paused"]]);
});

test("a set flag reads as paused", async () => {
  assert.deepEqual(await readEmergencyPause(async () => [{ global_processing_paused: true }]), { paused: true, error: null });
});

test("a missing singleton row reads as not paused (the default src/lib/api/pause.ts uses)", async () => {
  assert.deepEqual(await readEmergencyPause(async () => []), { paused: false, error: null });
});

test("a read that throws fails CLOSED and names the error", async () => {
  const r = await readEmergencyPause(async () => { throw new Error("db down"); });
  assert.equal(r.paused, true);
  assert.equal(r.error, "db down");
});

test("pausedSummary: nothing planned or written, exit 0, reason on the record", () => {
  const s = pausedSummary({ step: "recompute-tiers", mode: "apply", pause: { paused: true, error: null } });
  assert.equal(s.paused, true);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
  assert.match(s.pause_reason, /global_processing_paused is set/);
  const failClosed = pausedSummary({ step: "x", mode: "dry", pause: { paused: true, error: "db down" } });
  assert.match(failClosed.pause_reason, /failing closed/);
});
