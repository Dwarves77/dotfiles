// Durable verification for the D1-interpretation fix (the reachability SSOT), to the
// four-part standard. The full-pipeline STORED-OUTCOME proof (read-back of
// source_verifications under a forced 429) is run by scripts/tmp/d1interp-harness.mjs
// against the live DB; THIS selftest is the node-native, repeatable known-answer +
// mutation-check that needs no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACH, classifyReachability, classifyReachability_LEGACY_BUGGY, reachabilityTier, checkReachability,
} from "./../../src/lib/sources/reachability.mjs";

// ── KNOWN-ANSWER: the fixed classifier honors the fetchOk principle ──
test("non-answers (429/503/timeout/dns/403) are INCONCLUSIVE, not negative", () => {
  for (const r of [
    { status: 429, errored: false }, { status: 503, errored: false }, { status: 403, errored: false },
    { status: null, errored: true }, { status: 429, errored: true }, { status: 502, errored: true },
  ]) assert.equal(classifyReachability(r), REACH.INCONCLUSIVE, JSON.stringify(r));
});
test("definitive 404/410 are DEAD (a genuine negative)", () => {
  assert.equal(classifyReachability({ status: 404, errored: false }), REACH.DEAD);
  assert.equal(classifyReachability({ status: 410, errored: false }), REACH.DEAD);
});
test("2xx/405 are REACHABLE", () => {
  assert.equal(classifyReachability({ status: 200, errored: false }), REACH.REACHABLE);
  assert.equal(classifyReachability({ status: 405, errored: false }), REACH.REACHABLE);
});
test("reachabilityTier: INCONCLUSIVE->M, DEAD->L, REACHABLE->proceed(null)", () => {
  assert.deepEqual(reachabilityTier(REACH.INCONCLUSIVE), { tier: "M", rejection_reason: "reachability_inconclusive" });
  assert.deepEqual(reachabilityTier(REACH.DEAD), { tier: "L", rejection_reason: "reachability" });
  assert.equal(reachabilityTier(REACH.REACHABLE), null);
});

// ── MUTATION CHECK: the legacy mapping is the bug; the new assertion discriminates ──
test("MUTATION: legacy maps every non-answer to DEAD->tier L; fixed maps to INCONCLUSIVE->tier M", () => {
  for (const r of [{ status: 429, errored: true }, { status: 503, errored: true }, { status: null, errored: true }]) {
    const fixedTier = reachabilityTier(classifyReachability(r)).tier;
    const legacyTier = reachabilityTier(classifyReachability_LEGACY_BUGGY(r)).tier;
    // the assertion that the harness asserts on STORED state:
    assert.equal(fixedTier, "M", "fixed must queue a non-answer for review");      // PASSES on fix
    assert.equal(legacyTier, "L", "legacy must reject it (the bug we are killing)"); // proves it FAILS pre-fix
    assert.notEqual(fixedTier, legacyTier, "assertion has discriminating power");
  }
  // a genuine 404 is DEAD->L under BOTH — the fix does not over-correct real negatives.
  assert.equal(reachabilityTier(classifyReachability({ status: 404, errored: false })).tier, "L");
  assert.equal(reachabilityTier(classifyReachability_LEGACY_BUGGY({ status: 404, errored: false })).tier, "L");
});

// ── injected-render: forcing the failure that STILL happens post-D1 ──
test("checkReachability under a FORCED 429 render: fixed=INCONCLUSIVE, legacy=DEAD", async () => {
  const render429 = async () => { const e = new Error("forced 429"); e.name = "BrowserlessError"; e.status = 429; throw e; };
  const fixed = await checkReachability("https://x.invalid/", { render: render429, backoff: [0, 0, 0] });
  assert.equal(fixed.outcome, REACH.INCONCLUSIVE);
  assert.equal(fixed.ok, false);
  const legacy = await checkReachability("https://x.invalid/", { render: render429, classify: classifyReachability_LEGACY_BUGGY, backoff: [0, 0, 0] });
  assert.equal(legacy.outcome, REACH.DEAD);
});
test("checkReachability under a FORCED 200 render: REACHABLE", async () => {
  const render200 = async () => ({ status: 200, text: "ok" });
  const r = await checkReachability("https://x.invalid/", { render: render200, backoff: [0, 0, 0] });
  assert.equal(r.outcome, REACH.REACHABLE);
  assert.equal(r.ok, true);
});
