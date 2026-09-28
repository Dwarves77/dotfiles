import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuarantineDwell, DWELL_BOUND_DAYS } from "./quarantine-dwell.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T00:00:00Z");
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();

const validDeferralPayload = (overrides = {}) => ({
  reason: "Needs-acquire: blocked pending the operator-gated paid re-ground path.",
  deferred_until: iso(10 * DAY),
  owner: "coordinator",
  resolution_event: "GROUNDING_ACQUIRE_ENABLED flip",
  ...overrides,
});

test("DWELL_BOUND_DAYS is 14 (unchanged from the pre-extraction constant)", () => {
  assert.equal(DWELL_BOUND_DAYS, 14);
});

test("item with no open flag at all -> enqueue-missing", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const r = computeQuarantineDwell({ items, flags: [], now: NOW });
  assert.equal(r.enqueueMissing.length, 1);
  assert.equal(r.undispositioned.length, 0);
});

test("item enqueued 5 days ago -> within bound", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-5 * DAY), created_by: "trigger", status: "open" }];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.withinBound.length, 1);
  assert.equal(r.withinBound[0].ageDays, 5);
});

test("item enqueued 20 days ago, no deferral -> undispositioned past-bound, not resurrected", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [{ subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" }];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.undispositioned.length, 1);
  assert.equal(r.undispositioned[0].ageDays, 20);
  assert.equal(r.undispositioned[0].resurrected, false);
});

test("item enqueued 20 days ago WITH a valid future deferral -> deferred, not undispositioned", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-1 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: validDeferralPayload() }] },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.undispositioned.length, 0);
  assert.equal(r.deferred.length, 1);
  assert.equal(r.deferred[0].deferral.owner, "coordinator");
});

test("item with an EXPIRED deferral -> re-opens as undispositioned AND resurrected:true", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-40 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-39 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: validDeferralPayload({ deferred_until: iso(-5 * DAY) }) }] },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.deferred.length, 0);
  assert.equal(r.undispositioned.length, 1);
  assert.equal(r.undispositioned[0].resurrected, true, "once-deferred item must read as resurrected, not a fresh crossing");
});

test("an INVALID deferral payload (vague reason) does not count -> undispositioned", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-1 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: { reason: "needs review", deferred_until: iso(10 * DAY), owner: "coordinator", resolution_event: "later" } }] },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.deferred.length, 0);
  assert.equal(r.undispositioned.length, 1);
});

test("multiple valid deferrals for one item -> keeps the LATEST deferred_until", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-2 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: validDeferralPayload({ deferred_until: iso(5 * DAY) }) }] },
    { subject_ref: "a", created_at: iso(-1 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: [{ deferral: validDeferralPayload({ deferred_until: iso(30 * DAY) }) }] },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.deferred.length, 1);
  assert.equal(r.deferred[0].deferral.deferred_until, iso(30 * DAY));
});

test("bare (non-wrapped) deferral payload shape is tolerated", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-1 * DAY), created_by: "disposition_deferred", status: "open",
      recommended_actions: validDeferralPayload() },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.deferred.length, 1);
});

test("earliest open flag (of several) is the dwell clock", () => {
  const items = [{ id: "a", item_type: "regulation" }];
  const flags = [
    { subject_ref: "a", created_at: iso(-3 * DAY), created_by: "trigger", status: "open" },
    { subject_ref: "a", created_at: iso(-20 * DAY), created_by: "trigger2", status: "open" },
  ];
  const r = computeQuarantineDwell({ items, flags, now: NOW });
  assert.equal(r.undispositioned.length, 1);
  assert.equal(r.undispositioned[0].ageDays, 20);
});

test("empty items -> all buckets empty, no throw", () => {
  const r = computeQuarantineDwell({ items: [], flags: [], now: NOW });
  assert.deepEqual(r, { enqueueMissing: [], undispositioned: [], deferred: [], withinBound: [] });
});
