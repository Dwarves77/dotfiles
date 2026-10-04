// @ts-check
// S1-C (2026-10-04): the source tier system runs itself. These tests prove the single effective_tier
// calculator (decideEffectiveTier), the batch planner/applier, and the per-source recompute against the
// REAL trust.ts exports with injected readers/writers (no DB). jiti imports the TS home (@/ alias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const T = await jiti.import("./trust.ts");
const {
  decideEffectiveTier, opinionMovement, planTierMovements, applyTierMovements, tierMovementEvent,
  recomputeEffectiveTier, evaluateDemotion,
} = T;

const NOW = new Date("2026-10-04T12:00:00Z");
const OLD = "2020-01-01T00:00:00Z";
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

/** A sources row that, at base_tier 7, meets every 7 -> 6 promotion criterion and fires no demotion. */
function row(over = {}) {
  return {
    id: "s1", name: "Source One", base_tier: 7, effective_tier: null, tier_override: null, status: "active",
    confirmation_count: 100, conflict_count: 0, accuracy_rate: 1, accessibility_rate: 1, total_checks: 100,
    lead_time_samples: 100, avg_lead_time_days: 0, independent_citers: 10, highest_citing_tier: null,
    total_citations: 10, self_citation_count: 0, conflict_total: 0, last_checked: daysAgo(1),
    last_accessible: daysAgo(1), created_at: OLD, last_substantive_change: daysAgo(1), update_frequency: "ad-hoc",
    ...over,
  };
}
/** A healthy row that meets NO promotion criterion and fires NO demotion, at the given tier. */
const quiet = (over = {}) => row({ base_tier: 4, confirmation_count: 0, independent_citers: 0, lead_time_samples: 0, total_checks: 3, ...over });

const op = (tier, by, over = {}) => ({
  target_source_id: "s1", opined_tier: tier, opining_source_id: by, opined_at: daysAgo(5),
  dismissed_at: null, opinion_source: "haiku_brief_classifier", ...over,
});

function readers({ sources, opinions = [], citations = [] }) {
  return {
    readSources: async () => sources,
    readOpinions: async () => opinions,
    readCitations: async () => citations,
  };
}
function recorder() {
  const writes = [];
  const events = [];
  return {
    writes, events,
    writers: {
      setEffectiveTier: async (id, tier) => { writes.push({ id, tier }); },
      insertEvent: async (e) => { events.push(e); },
    },
  };
}

// ── Acceptance 1: promotion thresholds ──
test("a source meeting the promotion thresholds gets effective_tier = base - 1 and an applied tier_promotion event", async () => {
  const plan = await planTierMovements(readers({ sources: [row()] }), { now: NOW });
  assert.equal(plan.movements.length, 1);
  const d = plan.movements[0].decision;
  assert.equal(d.after_tier, 6);
  assert.deepEqual(d.rules, ["evaluate_promotion"]);
  const rec = recorder();
  const res = await applyTierMovements(plan.movements, rec.writers);
  assert.deepEqual(rec.writes, [{ id: "s1", tier: 6 }]);
  assert.equal(rec.events.length, 1);
  assert.equal(rec.events[0].event_type, "tier_promotion");
  assert.equal(rec.events[0].created_by, "worker");
  assert.equal(rec.events[0].details.applied, true);
  assert.equal(rec.events[0].details.rule, "evaluate_promotion");
  assert.equal(rec.events[0].details.before_tier, 7);
  assert.equal(rec.events[0].details.after_tier, 6);
  assert.equal(res.promotions, 1);
});

// ── Acceptance 2: demotion rule ──
test("a source meeting a demotion rule gets base + 1 and an applied tier_demotion event", async () => {
  const s = quiet({ conflict_count: 3, conflict_total: 5 });
  const plan = await planTierMovements(readers({ sources: [s] }), { now: NOW });
  assert.equal(plan.movements.length, 1);
  assert.equal(plan.movements[0].decision.after_tier, 5);
  const rec = recorder();
  const res = await applyTierMovements(plan.movements, rec.writers);
  assert.deepEqual(rec.writes, [{ id: "s1", tier: 5 }]);
  assert.equal(rec.events[0].event_type, "tier_demotion");
  assert.equal(rec.events[0].details.applied, true);
  assert.equal(rec.events[0].details.rule, "evaluate_demotion");
  assert.equal(res.demotions, 1);
});

// ── Acceptance 3: opinions move exactly one step ──
test("three opinions from two sources with median two tiers better move effective_tier exactly one step", async () => {
  const s = quiet({ base_tier: 5 });
  const opinions = [op(3, "a"), op(3, "b"), op(3, "a")];
  const plan = await planTierMovements(readers({ sources: [s], opinions }), { now: NOW });
  assert.equal(plan.movements.length, 1);
  assert.equal(plan.movements[0].decision.after_tier, 4, "one step toward the median, never the whole gap");
  assert.deepEqual(plan.movements[0].decision.rules, ["tier_opinions"]);
});

test("opinions toward a worse tier move one step worse", async () => {
  const s = quiet({ base_tier: 3 });
  const plan = await planTierMovements(readers({ sources: [s], opinions: [op(6, "a"), op(6, "b"), op(5, "b")] }), { now: NOW });
  assert.equal(plan.movements[0].decision.after_tier, 4);
  assert.equal(tierMovementEvent("s1", plan.movements[0].decision).event_type, "tier_demotion");
});

// ── Acceptance 4: admin override ──
test("tier_override set: no change, no write, no event, whatever the evidence says", async () => {
  const s = quiet({ base_tier: 5, tier_override: 2, effective_tier: 2, conflict_count: 3, conflict_total: 5 });
  const opinions = [op(7, "a"), op(7, "b"), op(7, "c")];
  const plan = await planTierMovements(readers({ sources: [s], opinions }), { now: NOW });
  assert.equal(plan.movements.length, 0);
  assert.equal(plan.override_held, 1);
  const rec = recorder();
  await applyTierMovements(plan.movements, rec.writers);
  assert.equal(rec.writes.length, 0);
  assert.equal(rec.events.length, 0);
});

test("tier_override set with a stale effective_tier: still no machine write", async () => {
  const s = row({ tier_override: 1, effective_tier: 7 });
  const plan = await planTierMovements(readers({ sources: [s] }), { now: NOW });
  assert.equal(plan.movements.length, 0);
});

// ── Acceptance 5: idempotent ──
test("a second run with unchanged inputs writes nothing", async () => {
  const store = [row()];
  const rd = { readSources: async () => store, readOpinions: async () => [], readCitations: async () => [] };
  const writers = {
    setEffectiveTier: async (id, tier) => { store.find((r) => r.id === id).effective_tier = tier; },
    insertEvent: async () => {},
  };
  const first = await planTierMovements(rd, { now: NOW });
  assert.equal(first.movements.length, 1);
  await applyTierMovements(first.movements, writers);
  assert.equal(store[0].effective_tier, 6);
  const second = await planTierMovements(rd, { now: NOW });
  assert.equal(second.movements.length, 0, "stored effective_tier already equals the decision");
});

// ── Reversibility: the decision is recomputed from base_tier, never accumulated ──
test("evidence that disappears moves effective_tier back to base_tier on the next recompute", async () => {
  const s = quiet({ base_tier: 5, effective_tier: 4 });
  const plan = await planTierMovements(readers({ sources: [s] }), { now: NOW });
  assert.equal(plan.movements.length, 1);
  assert.equal(plan.movements[0].decision.after_tier, 5);
  assert.equal(tierMovementEvent("s1", plan.movements[0].decision).event_type, "tier_demotion");
});

// ── Opinion rule edges ──
test("a dismissed opinion never counts", () => {
  const m = opinionMovement(5, [op(3, "a"), op(3, "b"), op(3, "c", { dismissed_at: daysAgo(1) })], NOW);
  assert.equal(m.counted, 2);
  assert.equal(m.delta, 0);
});
test("class-table opinions (host_class_table) are not evidence", () => {
  const m = opinionMovement(5, [op(3, "a", { opinion_source: "host_class_table" }), op(3, "b", { opinion_source: "host_class_table" }), op(3, "c", { opinion_source: "host_class_table" })], NOW);
  assert.equal(m.counted, 0);
  assert.equal(m.delta, 0);
});
test("three opinions from one opining source are not enough (needs 2 distinct)", () => {
  const m = opinionMovement(5, [op(3, "a"), op(3, "a"), op(3, "a")], NOW);
  assert.equal(m.distinct_opiners, 1);
  assert.equal(m.delta, 0);
});
test("fewer than three opinions never move a tier", () => {
  assert.equal(opinionMovement(5, [op(3, "a"), op(3, "b")], NOW).delta, 0);
});
test("opinions older than 90 days are outside the window", () => {
  const old = (by) => op(3, by, { opined_at: daysAgo(91) });
  assert.equal(opinionMovement(5, [old("a"), old("b"), old("c")], NOW).counted, 0);
});
test("median equal to base_tier moves nothing", () => {
  assert.equal(opinionMovement(5, [op(5, "a"), op(5, "b"), op(5, "c")], NOW).delta, 0);
});
test("an even count uses the mean of the two middle opinions", () => {
  const m = opinionMovement(5, [op(2, "a"), op(3, "b"), op(7, "c"), op(7, "d")], NOW);
  assert.equal(m.median, 5);
  assert.equal(m.delta, 0);
});

// ── Clamp ──
test("net movement is clamped to one tier either side of base_tier", () => {
  const evidence = {
    citation_promote: true, citation_reasoning: "c",
    promotion: { eligible: true, target_tier: 5, blocking: [] },
    demotion: null,
    opinion: { delta: -1, counted: 3, distinct_opiners: 2, median: 1, reason: "r" },
  };
  const d = decideEffectiveTier({ base_tier: 6, effective_tier: null, tier_override: null, evidence });
  assert.equal(d.after_tier, 5);
  assert.equal(d.net, -1);
  assert.deepEqual(d.rules, ["citation_promotion", "evaluate_promotion", "tier_opinions"]);
});
test("promotion and demotion together cancel to base_tier", () => {
  const evidence = {
    citation_promote: false, citation_reasoning: "c",
    promotion: { eligible: true, target_tier: 5, blocking: [] },
    demotion: { triggered: true, triggers_fired: [], recommended_tier: 7 },
    opinion: { delta: 0, counted: 0, distinct_opiners: 0, median: null, reason: "r" },
  };
  const d = decideEffectiveTier({ base_tier: 6, effective_tier: null, tier_override: null, evidence });
  assert.equal(d.after_tier, 6);
  assert.equal(d.changed, false);
});
test("tier 1 cannot move better and tier 7 cannot move worse", () => {
  const up = { citation_promote: true, citation_reasoning: "c", promotion: null, demotion: null, opinion: { delta: 0, counted: 0, distinct_opiners: 0, median: null, reason: "r" } };
  assert.equal(decideEffectiveTier({ base_tier: 1, effective_tier: null, tier_override: null, evidence: up }).after_tier, 1);
  const down = { ...up, citation_promote: false, demotion: { triggered: true, triggers_fired: [], recommended_tier: 7 } };
  assert.equal(decideEffectiveTier({ base_tier: 7, effective_tier: null, tier_override: null, evidence: down }).after_tier, 7);
});

// ── Citation promotion rides the same path ──
test("citation promotion (weighted sum and count thresholds) promotes one tier through the planner", async () => {
  const citers = ["c1", "c2", "c3"].map((id) => row({ id, base_tier: 1, confirmation_count: 0, independent_citers: 0, lead_time_samples: 0, total_checks: 3 }));
  const target = quiet({ id: "target", base_tier: 5 });
  const citations = citers.map((c) => ({ citing_source_id: c.id, cited_source_id: "target", detected_at: daysAgo(10) }));
  const plan = await planTierMovements(readers({ sources: [...citers, target], citations }), { now: NOW });
  const m = plan.movements.find((x) => x.source_id === "target");
  assert.ok(m, "target moves");
  assert.equal(m.decision.after_tier, 4);
  assert.deepEqual(m.decision.rules, ["citation_promotion"]);
});

// ── Demotion status gate (declared condition: inaccessible for 30+ days AND status = inaccessible) ──
test("extended_inaccessibility needs status = inaccessible: a merely unscanned source does not fire", () => {
  const base = { base_tier: 4, created_at: OLD, update_frequency: "ad-hoc", last_substantive_change: null, trust_metrics: { conflict_count: 0, conflict_total: 0, accessibility_rate: 1, total_checks: 3, independent_citers: 5, self_citation_count: 0, last_accessible: daysAgo(60) } };
  assert.equal(evaluateDemotion({ ...base, status: "active" }).triggered, false);
  assert.equal(evaluateDemotion({ ...base, status: "inaccessible" }).triggered, true);
});

// ── Apply failure handling ──
test("a failed tier write records no event and is counted; a failed event is counted and the tier stays", async () => {
  const plan = await planTierMovements(readers({ sources: [row({ id: "a" }), row({ id: "b" })] }), { now: NOW });
  const events = [];
  const res = await applyTierMovements(plan.movements, {
    setEffectiveTier: async (id) => { if (id === "a") throw new Error("boom"); },
    insertEvent: async (e) => { events.push(e); throw new Error("event boom"); },
  });
  assert.equal(res.write_failed, 1);
  assert.equal(res.applied, 1);
  assert.equal(res.event_failed, 1);
  assert.equal(events.length, 1, "no event attempted for the failed write");
  assert.equal(events[0].source_id, "b");
});

// ── The per-source calculator (source-growth's end-of-cycle path) uses the same evidence ──
function fakeClient({ source, opinions = [], citations = [], cadence = "weekly" }) {
  const mk = (table) => {
    const st = { table, filters: [] };
    const b = {
      select() { return b; },
      eq(c, v) { st.filters.push(["eq", c, v]); return b; },
      is(c, v) { st.filters.push(["is", c, v]); return b; },
      gte(c, v) { st.filters.push(["gte", c, v]); return b; },
      in() { return b; },
      single() { return Promise.resolve({ data: source, error: null }); },
      maybeSingle() { return Promise.resolve({ data: table === "system_state" ? { scrape_cadence: cadence } : source, error: null }); },
      then(res, rej) {
        const data = table === "source_citations" ? citations : table === "source_tier_opinions" ? opinions : [];
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return b;
  };
  return { from: mk };
}
test("recomputeEffectiveTier folds tier opinions into the same decision the batch planner makes", async () => {
  const client = fakeClient({ source: quiet({ base_tier: 5 }), opinions: [op(3, "a"), op(3, "b"), op(3, "c")] });
  const r = await recomputeEffectiveTier(client, "s1");
  assert.equal(r.after_tier, 4);
  assert.equal(r.changed, true);
  assert.deepEqual(r.rules, ["tier_opinions"]);
});
test("recomputeEffectiveTier with tier_override set reports changed=false (never written over)", async () => {
  const client = fakeClient({ source: quiet({ base_tier: 5, tier_override: 2, effective_tier: null }) });
  const r = await recomputeEffectiveTier(client, "s1");
  assert.equal(r.after_tier, 2);
  assert.equal(r.changed, false);
});

// ── Cadence hold (CLAUDE.md rule 16): no_substantive_update is suppressed while scrape_cadence is 'off' ──
const stale = () => quiet({ base_tier: 4, update_frequency: "weekly", last_substantive_change: daysAgo(200) });
test("cadence on: a source with no substantive update inside 3x its frequency demotes", async () => {
  const plan = await planTierMovements(readers({ sources: [stale()] }), { now: NOW, scrapeCadence: "weekly" });
  assert.equal(plan.movements.length, 1);
  assert.equal(plan.movements[0].decision.after_tier, 5);
  assert.deepEqual(plan.movements[0].decision.rules, ["evaluate_demotion"]);
  assert.equal(plan.held_cadence_off, 0);
});
test("cadence off: the same source does not demote and is counted as held_cadence_off", async () => {
  const plan = await planTierMovements(readers({ sources: [stale()] }), { now: NOW, scrapeCadence: "off" });
  assert.equal(plan.movements.length, 0);
  assert.equal(plan.held_cadence_off, 1);
});
test("cadence off holds only the scan-timestamp trigger: a conflict-rate demotion still fires", async () => {
  const s = stale();
  s.conflict_count = 3; s.conflict_total = 5;
  const plan = await planTierMovements(readers({ sources: [s] }), { now: NOW, scrapeCadence: "off" });
  assert.equal(plan.movements.length, 1);
  assert.deepEqual(plan.movements[0].decision.inputs.demotion.triggers.map((t) => t.trigger), ["high_conflict_rate"]);
  assert.equal(plan.held_cadence_off, 1);
});
test("no cadence given suppresses nothing (per-source callers keep prior behaviour)", async () => {
  const plan = await planTierMovements(readers({ sources: [stale()] }), { now: NOW });
  assert.equal(plan.movements.length, 1);
});

test("recomputeEffectiveTier reads the cadence itself when none is passed: off holds no_substantive_update, on demotes", async () => {
  const src = quiet({ base_tier: 4, update_frequency: "weekly", last_substantive_change: daysAgo(200) });
  const on = await recomputeEffectiveTier(fakeClient({ source: src, cadence: "weekly" }), "s1");
  assert.equal(on.after_tier, 5);
  const off = await recomputeEffectiveTier(fakeClient({ source: src, cadence: "off" }), "s1");
  assert.equal(off.changed, false);
});
test("recomputeEffectiveTier fails closed to off when system_state cannot be read", async () => {
  const src = quiet({ base_tier: 4, update_frequency: "weekly", last_substantive_change: daysAgo(200) });
  const client = fakeClient({ source: src });
  const inner = client.from;
  client.from = (t) => { if (t === "system_state") throw new Error("no table"); return inner(t); };
  const r = await recomputeEffectiveTier(client, "s1");
  assert.equal(r.changed, false);
});
