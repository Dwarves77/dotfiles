// Discrimination proof for the deferral guard (research-or-erase / quarantine-disposition invariant).
// A GOOD deferral (real blocker + future date + named event + real owner) passes; each failure mode is
// REJECTED. Anti-silence: an expired deferred_until is rejected (read side re-opens it as undispositioned).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidDeferral, assertValidDeferral } from "./deferral.mjs";

const NOW = new Date("2026-06-17T00:00:00Z");
const FUTURE = "2026-09-01T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";

const GOOD = {
  reason: "Blocked on network-stable reground lane: source unreachable until Phase 2 reground primary source is built.",
  deferred_until: FUTURE,
  owner: "remediation-lane",
  resolution_event: "Phase 2 network-stable reground lane",
};

test("GOOD: real blocker + future date + named event + real owner passes", () => {
  assert.deepEqual(isValidDeferral(GOOD, NOW), { ok: true });
  assert.doesNotThrow(() => assertValidDeferral(GOOD, NOW));
});

test("REJECT: vague/short reason", () => {
  const bad = { ...GOOD, reason: "later" };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: reason with no disposition-path keyword (the 'needs review, owner TBD, until later' shape)", () => {
  const bad = { ...GOOD, reason: "Needs review by somebody at some point, will look again when there is time." };
  const r = isValidDeferral(bad, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /disposition path/);
});

test("REJECT: past deferred_until (expired -> falls back to undispositioned)", () => {
  const bad = { ...GOOD, deferred_until: PAST };
  const r = isValidDeferral(bad, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /future|undispositioned/);
});

test("REJECT: unparseable deferred_until", () => {
  const bad = { ...GOOD, deferred_until: "soon-ish" };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: missing resolution_event (bare date with no named event)", () => {
  const bad = { ...GOOD };
  delete bad.resolution_event;
  const r = isValidDeferral(bad, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /resolution_event/);
});

test("REJECT: empty resolution_event", () => {
  const bad = { ...GOOD, resolution_event: "   " };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: owner = 'TBD'", () => {
  const bad = { ...GOOD, owner: "TBD" };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: owner = 'unknown' (case-insensitive)", () => {
  const bad = { ...GOOD, owner: "Unknown" };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: empty owner", () => {
  const bad = { ...GOOD, owner: "" };
  assert.equal(isValidDeferral(bad, NOW).ok, false);
});

test("REJECT: missing payload entirely", () => {
  assert.equal(isValidDeferral(undefined, NOW).ok, false);
  assert.equal(isValidDeferral(null, NOW).ok, false);
});

test("assertValidDeferral throws on a bad payload", () => {
  assert.throws(() => assertValidDeferral({ ...GOOD, owner: "TBD" }, NOW), /invalid deferral/);
});
