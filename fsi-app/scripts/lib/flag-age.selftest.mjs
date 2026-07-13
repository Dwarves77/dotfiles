// Discrimination proof for the flag-age dwell core (item 5). RD-28-held is exempt (valid long-dwell);
// disposition_deferred + standing-debt are exempt (owned elsewhere); everything else past the bound trips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOpenFlag, summarizeFlagAges, isRd28Held, DWELL_BOUND_DAYS } from "./flag-age.mjs";

const NOW = Date.parse("2026-07-13T00:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const flag = (o) => ({ id: o.id || "f", created_by: o.cb, subject_type: o.st || "item", subject_ref: o.sr || "x", created_at: o.at, recommended_actions: o.ra || [] });

test("RD-28-held is EXEMPT even when very old (valid long-dwell)", () => {
  const f = flag({ cb: "skill-conformance-audit", at: daysAgo(400), ra: [{ action: "held...", hold_class: "rd28-resting-state" }] });
  assert.equal(isRd28Held(f), true);
  const c = classifyOpenFlag(f, NOW);
  assert.equal(c.exempt, true);
  assert.equal(c.pastBound, false);
});

test("non-exempt flag past the bound TRIPS", () => {
  const c = classifyOpenFlag(flag({ cb: "null-tier-host", st: "source", at: daysAgo(45) }), NOW);
  assert.equal(c.exempt, false);
  assert.equal(c.pastBound, true);
});

test("non-exempt flag within the bound does NOT trip", () => {
  const c = classifyOpenFlag(flag({ cb: "truncation-guard", at: daysAgo(5) }), NOW);
  assert.equal(c.pastBound, false);
});

test("disposition_deferred is exempt here (owned by deferral-hygiene-audit)", () => {
  const c = classifyOpenFlag(flag({ cb: "disposition_deferred", at: daysAgo(90) }), NOW);
  assert.equal(c.exempt, true);
  assert.match(c.exemptReason, /deferral/);
});

test("standing-debt marker is exempt", () => {
  assert.equal(classifyOpenFlag(flag({ cb: "register-step-gap", st: "system", at: daysAgo(90) }), NOW).exempt, true);
});

test("ALL subject_types are covered (surface/source/system, not just item)", () => {
  const surface = classifyOpenFlag(flag({ cb: "seed-fallback-trigger", st: "surface", at: daysAgo(60) }), NOW);
  assert.equal(surface.pastBound, true, "surface-scoped old flag must trip (the dwell gap this closes)");
});

test("quarantined-item flag is EXEMPT (owned by quarantine-disposition-audit); non-quarantined item TRIPS", () => {
  const qIds = new Set(["q-item"]);
  // old set_provenance flag on a LIVE-QUARANTINED item -> exempt (its dwell is quarantine-disposition's domain)
  const onQ = classifyOpenFlag(flag({ cb: "set_provenance_status_trigger", st: "item", sr: "q-item", at: daysAgo(90) }), NOW, DWELL_BOUND_DAYS, qIds);
  assert.equal(onQ.exempt, true);
  assert.match(onQ.exemptReason, /quarantined-item/);
  // same-age skill-conformance flag on a NON-quarantined (verified) item -> still TRIPS (flag-age's own gap)
  const onV = classifyOpenFlag(flag({ cb: "skill-conformance-audit", st: "item", sr: "v-item", at: daysAgo(90) }), NOW, DWELL_BOUND_DAYS, qIds);
  assert.equal(onV.pastBound, true);
  // without the quarantined set passed, no quarantined-item exemption (safe default)
  assert.equal(classifyOpenFlag(flag({ cb: "set_provenance_status_trigger", st: "item", sr: "q-item", at: daysAgo(90) }), NOW).pastBound, true);
});

test("summarize counts the quarantined-item exemption separately", () => {
  const qIds = new Set(["qq"]);
  const flags = [
    flag({ id: "p", cb: "set_provenance_status_trigger", st: "item", sr: "qq", at: daysAgo(90) }), // exempt (quarantined)
    flag({ id: "t", cb: "null-tier-host", st: "source", at: daysAgo(45) }),                        // past-bound
  ];
  const s = summarizeFlagAges(flags, NOW, DWELL_BOUND_DAYS, qIds);
  assert.equal(s.exemptQuarantinedCount, 1);
  assert.equal(s.pastBoundCount, 1);
});

test("summarize splits past-bound vs held and groups by mechanism", () => {
  const flags = [
    flag({ id: "a", cb: "null-tier-host", st: "source", at: daysAgo(45) }),
    flag({ id: "b", cb: "null-tier-host", st: "source", at: daysAgo(50) }),
    flag({ id: "c", cb: "skill-conformance-audit", at: daysAgo(400), ra: [{ hold_class: "rd28-resting-state" }] }),
    flag({ id: "d", cb: "truncation-guard", at: daysAgo(2) }),
  ];
  const s = summarizeFlagAges(flags, NOW);
  assert.equal(s.pastBoundCount, 2);
  assert.equal(s.exemptHeldCount, 1);
  assert.equal(s.byMechanism["null-tier-host"], 2);
});

test("bound is 30 days", () => { assert.equal(DWELL_BOUND_DAYS, 30); });
