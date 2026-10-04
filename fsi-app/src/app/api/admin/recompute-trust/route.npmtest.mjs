// S1-C (2026-10-04): the recompute-trust route APPLIES tier movement instead of proposing demotions.
// Before this lane the Wave W2 test here pinned demotionOutcomeFor to applied:false for every trigger
// (propose-only). That recorder is gone: the route runs planTierMovements / applyTierMovements from
// src/lib/trust.ts and shapes its response with tierMovementSummary (sibling logic.ts, because a
// route.ts may export only handlers, F34 / BUILDGATE 2026-09-02).
//
// What this proves, against the REAL exported functions the route calls: (1) a fired demotion trigger
// is APPLIED (effective_tier written, an applied:true event recorded), (2) an admin override is never
// written over, (3) a paused source keeps its last-known tier, (4) the response block counts what
// happened and names failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { tierMovementSummary } = await jiti.import("./logic.ts");
const { planTierMovements, applyTierMovements } = await jiti.import("@/lib/trust");

const NOW = new Date("2026-10-04T12:00:00Z");
const day = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const src = (over = {}) => ({
  id: "s1", name: "Source One", base_tier: 4, effective_tier: null, tier_override: null, status: "active",
  processing_paused: false, confirmation_count: 0, conflict_count: 0, accuracy_rate: 1, accessibility_rate: 1,
  total_checks: 3, lead_time_samples: 0, avg_lead_time_days: 0, independent_citers: 0, highest_citing_tier: null,
  total_citations: 0, self_citation_count: 0, conflict_total: 0, last_checked: day(1), last_accessible: day(1),
  created_at: "2020-01-01T00:00:00Z", last_substantive_change: day(1), update_frequency: "ad-hoc", ...over,
});
const readers = (sources) => ({ readSources: async () => sources, readOpinions: async () => [], readCitations: async () => [] });

test("a fired demotion trigger is applied: tier written, applied:true event, counted in the response block", async () => {
  const plan = await planTierMovements(readers([src({ conflict_count: 3, conflict_total: 5 })]), { now: NOW });
  const writes = [];
  const events = [];
  const applied = await applyTierMovements(plan.movements, {
    setEffectiveTier: async (id, tier) => { writes.push({ id, tier }); },
    insertEvent: async (e) => { events.push(e); },
  });
  assert.deepEqual(writes, [{ id: "s1", tier: 5 }]);
  assert.equal(events[0].event_type, "tier_demotion");
  assert.equal(events[0].details.applied, true, "no longer propose-only, even for a flagged-severity trigger");
  const summary = tierMovementSummary(plan, applied);
  assert.equal(summary.planned, 1);
  assert.equal(summary.applied, 1);
  assert.equal(summary.demotions, 1);
  assert.deepEqual(summary.samples[0], { source: "Source One", before_tier: 4, after_tier: 5, rules: ["evaluate_demotion"] });
});

test("a source with an admin override is held: nothing planned, nothing written", async () => {
  const plan = await planTierMovements(readers([src({ conflict_count: 3, conflict_total: 5, tier_override: 2 })]), { now: NOW });
  assert.equal(plan.movements.length, 0);
  const summary = tierMovementSummary(plan, await applyTierMovements(plan.movements, { setEffectiveTier: async () => { throw new Error("must not write"); }, insertEvent: async () => { throw new Error("must not write"); } }));
  assert.equal(summary.override_held, 1);
  assert.equal(summary.applied, 0);
});

test("a paused source keeps its last-known tier (skipped, never moved)", async () => {
  const plan = await planTierMovements(readers([src({ conflict_count: 3, conflict_total: 5, processing_paused: true })]), { now: NOW });
  assert.equal(plan.movements.length, 0);
  assert.deepEqual(plan.skipped, [{ source_id: "s1", reason: "processing_paused" }]);
});

test("a failed tier write is counted and named in the response block, and the sweep continues", async () => {
  const plan = await planTierMovements(readers([src({ id: "a", name: "A", conflict_count: 3, conflict_total: 5 }), src({ id: "b", name: "B", conflict_count: 3, conflict_total: 5 })]), { now: NOW });
  const applied = await applyTierMovements(plan.movements, {
    setEffectiveTier: async (id) => { if (id === "a") throw new Error("db down"); },
    insertEvent: async () => {},
  });
  const summary = tierMovementSummary(plan, applied);
  assert.equal(summary.write_failed, 1);
  assert.equal(summary.applied, 1);
  assert.match(summary.failures[0], /A: effective_tier write failed: db down/);
});

test("cadence off: held_cadence_off is reported in the response block and the held source is not moved", async () => {
  const stale = src({ update_frequency: "weekly", last_substantive_change: day(200) });
  const plan = await planTierMovements(readers([stale]), { now: NOW, scrapeCadence: "off" });
  const summary = tierMovementSummary(plan, await applyTierMovements(plan.movements, { setEffectiveTier: async () => {}, insertEvent: async () => {} }));
  assert.equal(summary.held_cadence_off, 1);
  assert.equal(summary.planned, 0);
});
