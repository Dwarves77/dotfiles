// D3 section 3 — self-liveness LAYER 1 (known-answer pairs) + LAYER 2 (mutation).
// Run: node --test scripts/lib/liveness.selftest.mjs
//
// The load-bearing property under test: not-run renders LOUD, never clean. The pairs
// fix that; the mutations prove a broken liveness gate would let a skipped run pass as
// clean — the exact silent-green trap section 3 exists to prevent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVENESS, assessLiveness, latestRunAtMs, consumerView } from "./liveness.mjs";

const WINDOW = 25 * 3600 * 1000; // 25h
const NOW = 1_000_000_000_000;   // fixed (Date.now() is unavailable here anyway)

// ───────── LAYER 1 — known-answer pairs ─────────

test("L1 assessLiveness — fresh -> LIVE; stale -> STALE; never -> NEVER (triple)", () => {
  assert.equal(assessLiveness(NOW - 3600_000, NOW, WINDOW).state, LIVENESS.LIVE);   // 1h ago
  assert.equal(assessLiveness(NOW - 50 * 3600_000, NOW, WINDOW).state, LIVENESS.STALE); // 50h ago
  assert.equal(assessLiveness(null, NOW, WINDOW).state, LIVENESS.NEVER);
});

test("L1 consumerView — 0 findings is CLEAN only under LIVE; UNKNOWN-loud under STALE/NEVER (the inversion)", () => {
  const live = assessLiveness(NOW - 3600_000, NOW, WINDOW);
  const stale = assessLiveness(NOW - 50 * 3600_000, NOW, WINDOW);
  const never = assessLiveness(null, NOW, WINDOW);
  // the pair that matters: SAME 0 findings, opposite render based on liveness
  assert.deepEqual([consumerView([], live).render, consumerView([], live).loud], ["CLEAN", false]);
  assert.deepEqual([consumerView([], stale).render, consumerView([], stale).loud], ["UNKNOWN", true]);
  assert.deepEqual([consumerView([], never).render, consumerView([], never).loud], ["UNKNOWN", true]);
  // findings present under LIVE -> FLAGS (loud)
  assert.deepEqual([consumerView([{}, {}], live).render, consumerView([{}, {}], live).loud], ["FLAGS", true]);
});

test("L1 latestRunAtMs — picks the max heartbeat; empty -> null", () => {
  assert.equal(latestRunAtMs([{ ran_at: new Date(NOW - 5000) }, { ran_at: new Date(NOW - 1000) }]), NOW - 1000);
  assert.equal(latestRunAtMs([]), null);
});

// ───────── LAYER 2 — mutation (test the test) ─────────

test("L2 mutation — a consumerView that IGNORES liveness wrongly renders CLEAN on a stale run", () => {
  const stale = assessLiveness(NOW - 50 * 3600_000, NOW, WINDOW);
  const real = consumerView([], stale);                       // UNKNOWN, loud
  const brokenIgnoresLiveness = (findings) => ({ render: (findings.length ? "FLAGS" : "CLEAN"), loud: findings.length > 0 });
  const broken = brokenIgnoresLiveness([]);                    // CLEAN, not loud
  assert.equal(real.render, "UNKNOWN");
  assert.equal(real.loud, true);
  assert.notEqual(real.render, broken.render);                // broken wrongly-CLEAN -> liveness gate is load-bearing
});

test("L2 mutation — an assessLiveness that treats STALE as LIVE lets the skipped run pass", () => {
  const real = assessLiveness(NOW - 50 * 3600_000, NOW, WINDOW).state;  // STALE
  const brokenTreatsAllLive = () => LIVENESS.LIVE;                       // mutation: never stale
  assert.equal(real, LIVENESS.STALE);
  assert.notEqual(real, brokenTreatsAllLive());                         // non-vacuous: STALE != forced-LIVE
});
