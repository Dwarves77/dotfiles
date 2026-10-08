// recompute-tiers.npmtest.mjs: lane S1-C (2026-10-04). Proves the maintenance step through injected deps
// over the REAL trust.ts calculator (jiti, so *.npmtest.mjs, run after npm ci), and proves buildDeps()'s
// real wiring (the lazily loaded calculator and the guarded write path) against a fake write client.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { tmpdir } from "node:os";
import { __setWriteClientForTest } from "../lib/db.mjs";
import { main, buildDeps, CITE } from "./recompute-tiers.mjs";

// guarded writes snapshot the prior row state to disk before mutating (db.mjs). Redirect the snapshots to a
// private temp directory removed when this file finishes, so the test never leaves
// scripts/_snapshots/<timestamp>_<table>.jsonl in the real working tree (lane TESTFIX-1, 2026-10-08: found
// by auditing every test's file writes; the sibling tests set a fixed temp path and never clean it).
const SNAP_DIR = mkdtempSync(join(tmpdir(), "recompute-tiers-npmtest-snapshots-"));
process.env.DISCIPLINE_SNAP_DIR = SNAP_DIR;
after(() => { rmSync(SNAP_DIR, { recursive: true, force: true }); });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const tierMovement = await jiti.import("../../src/lib/trust.ts");

const NOW = new Date("2026-10-04T12:00:00Z");
const day = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const row = (over = {}) => ({
  id: "s1", name: "Source One", base_tier: 7, effective_tier: null, tier_override: null, status: "active",
  processing_paused: false, confirmation_count: 100, conflict_count: 0, accuracy_rate: 1, accessibility_rate: 1,
  total_checks: 100, lead_time_samples: 100, avg_lead_time_days: 0, independent_citers: 10, highest_citing_tier: null,
  total_citations: 10, self_citation_count: 0, conflict_total: 0, last_checked: day(1), last_accessible: day(1),
  created_at: "2020-01-01T00:00:00Z", last_substantive_change: day(1), update_frequency: "ad-hoc", ...over,
});
const quiet = (over = {}) => row({ base_tier: 5, confirmation_count: 0, independent_citers: 0, lead_time_samples: 0, total_checks: 3, ...over });

function fakeDeps(store, opinions = [], cadence = "weekly") {
  const writes = [];
  const events = [];
  return {
    writes, events,
    deps: {
      tierMovement,
      now: () => NOW,
      readCadence: async () => cadence,
      readers: { readSources: async () => store, readOpinions: async () => opinions, readCitations: async () => [] },
      writers: {
        setEffectiveTier: async (id, tier) => { writes.push({ id, tier }); store.find((r) => r.id === id).effective_tier = tier; },
        insertEvent: async (e) => { events.push(e); },
      },
    },
  };
}
const op = (tier, by) => ({ target_source_id: "s1", opined_tier: tier, opining_source_id: by, opined_at: day(3), dismissed_at: null, opinion_source: "haiku_brief_classifier" });

test("dry mode plans the movement and writes nothing", async () => {
  const f = fakeDeps([row()]);
  const summary = await main({ mode: "dry" }, f.deps);
  assert.equal(summary.counts.movements, 1);
  assert.equal(summary.counts.promotions, 1);
  assert.equal(summary.applied, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(summary.exitCode, 0);
});

test("apply mode promotes a source meeting the thresholds and records an applied event", async () => {
  const f = fakeDeps([row()]);
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.applied, 1);
  assert.deepEqual(f.writes, [{ id: "s1", tier: 6 }]);
  assert.equal(f.events[0].event_type, "tier_promotion");
  assert.equal(f.events[0].created_by, "worker");
  assert.equal(f.events[0].details.applied, true);
  assert.equal(summary.read_back.promotions, 1);
});

test("apply mode demotes a source meeting a demotion rule (base + 1)", async () => {
  const f = fakeDeps([quiet({ base_tier: 4, conflict_count: 3, conflict_total: 5 })]);
  await main({ mode: "apply" }, f.deps);
  assert.deepEqual(f.writes, [{ id: "s1", tier: 5 }]);
  assert.equal(f.events[0].event_type, "tier_demotion");
});

test("three opinions from two sources, median two tiers better: exactly one step", async () => {
  const f = fakeDeps([quiet({ base_tier: 5 })], [op(3, "a"), op(3, "b"), op(3, "a")]);
  await main({ mode: "apply" }, f.deps);
  assert.deepEqual(f.writes, [{ id: "s1", tier: 4 }]);
});

test("tier_override set: no write and no event", async () => {
  const f = fakeDeps([quiet({ base_tier: 4, tier_override: 1, conflict_count: 3, conflict_total: 5 })]);
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(summary.counts.override_held, 1);
});

test("a second apply run over unchanged inputs writes nothing (idempotent)", async () => {
  const f = fakeDeps([row()]);
  await main({ mode: "apply" }, f.deps);
  assert.equal(f.writes.length, 1);
  const second = await main({ mode: "apply" }, f.deps);
  assert.equal(second.counts.movements, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(f.events.length, 1);
});

test("a failed write sets exitCode 1 and is named in read_back", async () => {
  const f = fakeDeps([row()]);
  f.deps.writers.setEffectiveTier = async () => { throw new Error("db down"); };
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.read_back.write_failed, 1);
  assert.match(summary.read_back.failures[0], /db down/);
});

// ── real wiring: buildDeps() with the real calculator and the real guarded write path ──
function makeClient(handler) {
  const calls = [];
  function from(table) {
    const state = { table, verb: "select", ops: [], payload: null };
    const settle = () => { calls.push({ table, verb: state.verb, ops: state.ops.slice(), payload: state.payload }); return Promise.resolve(handler(state)); };
    const b = {
      select(c) { state.ops.push(["select", c]); return b; },
      update(p) { state.verb = "update"; state.payload = p; return b; },
      insert(p) { state.verb = "insert"; state.payload = p; return b; },
      eq(c, v) { state.ops.push(["eq", c, v]); return b; },
      in(c, v) { state.ops.push(["in", c, v]); return b; },
      is(c, v) { state.ops.push(["is", c, v]); return b; },
      gte(c, v) { state.ops.push(["gte", c, v]); return b; },
      order(c) { state.ops.push(["order", c]); return b; },
      range(a, z) { state.ops.push(["range", a, z]); return b; },
      single() { return settle(); },
      then(res, rej) { return settle().then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls };
}
test.afterEach(() => { __setWriteClientForTest(null); });

test("buildDeps(): the real calculator loads, and the writers go through the guarded path with the override guard", async () => {
  const client = makeClient((s) => {
    if (s.verb === "select") return { data: [{ id: "s1", effective_tier: 7 }], error: null };
    if (s.verb === "update") return { data: [{ id: "s1", effective_tier: 6 }], error: null };
    if (s.verb === "insert") return { data: { id: "ev1" }, error: null };
    throw new Error("unexpected");
  });
  __setWriteClientForTest(() => client);
  const deps = await buildDeps();
  assert.equal(typeof deps.tierMovement.planTierMovements, "function");
  assert.equal(typeof deps.tierMovement.applyTierMovements, "function");
  await deps.writers.setEffectiveTier("s1", 6);
  const upd = client.__calls.find((c) => c.verb === "update");
  assert.deepEqual(upd.payload, { effective_tier: 6 });
  assert.ok(upd.ops.some((o) => o[0] === "is" && o[1] === "tier_override" && o[2] === null), "override guard applied at the write");
  await deps.writers.insertEvent({ source_id: "s1", event_type: "tier_promotion", details: { applied: true }, created_by: "worker" });
  const ins = client.__calls.find((c) => c.verb === "insert");
  assert.equal(ins.table, "source_trust_events");
  assert.equal(CITE.skill, "source-credibility-model");
});

test("cadence off: no_substantive_update is held and reported as held_cadence_off; cadence on demotes", async () => {
  const stale = () => quiet({ base_tier: 4, update_frequency: "weekly", last_substantive_change: day(200) });
  const on = fakeDeps([stale()], [], "weekly");
  const onSummary = await main({ mode: "apply" }, on.deps);
  assert.deepEqual(on.writes, [{ id: "s1", tier: 5 }]);
  assert.equal(onSummary.counts.held_cadence_off, 0);
  const off = fakeDeps([stale()], [], "off");
  const offSummary = await main({ mode: "apply" }, off.deps);
  assert.equal(off.writes.length, 0);
  assert.equal(offSummary.counts.held_cadence_off, 1);
  assert.equal(offSummary.counts.scrape_cadence, "off");
});

// ── Lane L4-D (2026-10-05): scored prediction outcomes are read with the other evidence and reported apart ──
const outcomeRows = (id, n, outcome, d = 5) => Array.from({ length: n }, () => ({ source_id: id, outcome, scored_at: day(d) }));

test("outcome evidence moves a source and the summary reports outcome-driven movements apart from the others", async () => {
  const f = fakeDeps([quiet({ id: "s1", base_tier: 4 }), quiet({ id: "s2", base_tier: 4, conflict_count: 3, conflict_total: 5 })]);
  f.deps.readers.readOutcomes = async () => [...outcomeRows("s1", 4, "refuted"), ...outcomeRows("s1", 1, "held")];
  const summary = await main({ mode: "apply" }, f.deps);
  assert.deepEqual(f.writes.sort((a, b) => a.id.localeCompare(b.id)), [{ id: "s1", tier: 5 }, { id: "s2", tier: 5 }]);
  assert.equal(summary.counts.movements, 2);
  assert.equal(summary.counts.outcome_movements, 1);
  assert.equal(summary.counts.outcome_demotions, 1);
  assert.equal(summary.counts.outcome_promotions, 0);
  assert.equal(summary.counts.other_movements, 1);
  assert.equal(summary.counts.outcome_read_error, null);
  assert.equal(summary.counts.sample.find((m) => m.source_id === "s1").outcome_driven, true);
  assert.equal(summary.counts.sample.find((m) => m.source_id === "s2").outcome_driven, false);
  const ev = f.events.find((e) => e.source_id === "s1");
  assert.equal(ev.event_type, "tier_demotion");
  assert.equal(ev.details.outcome_driven, true);
});

test("a held-only record promotes; an admin override is never written over by outcomes", async () => {
  const f = fakeDeps([quiet({ id: "s1", base_tier: 4 }), quiet({ id: "s2", base_tier: 4, tier_override: 2, effective_tier: 2 })]);
  f.deps.readers.readOutcomes = async () => [...outcomeRows("s1", 5, "held"), ...outcomeRows("s2", 5, "refuted")];
  const summary = await main({ mode: "apply" }, f.deps);
  assert.deepEqual(f.writes, [{ id: "s1", tier: 3 }]);
  assert.equal(summary.counts.outcome_promotions, 1);
  assert.equal(summary.counts.override_held, 1);
});

test("dry mode reports outcome movements and writes nothing", async () => {
  const f = fakeDeps([quiet({ id: "s1", base_tier: 4 })]);
  f.deps.readers.readOutcomes = async () => outcomeRows("s1", 5, "held");
  const summary = await main({ mode: "dry" }, f.deps);
  assert.equal(summary.counts.outcome_movements, 1);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.length, 0);
});

test("an unreadable ledger (migration 353 unapplied) leaves the run as it was and says so", async () => {
  const f = fakeDeps([quiet({ id: "s1", base_tier: 4 })]);
  f.deps.readers.readOutcomes = async () => { throw new Error("relation source_reliability_ledger does not exist"); };
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.counts.movements, 0);
  assert.match(summary.counts.outcome_read_error, /does not exist/);
});

test("buildDeps(): readOutcomes is ONE bounded read of the ledger window", async () => {
  const seen = [];
  const client = makeClient((s) => { seen.push(s); return { data: [{ source_id: "s1", outcome: "held", scored_at: day(2) }], error: null }; });
  __setWriteClientForTest(() => client);
  const deps = await buildDeps();
  assert.equal(typeof deps.readers.readOutcomes, "function");
  const rows = await deps.readers.readOutcomes("2025-10-04T00:00:00.000Z");
  assert.equal(rows.length, 1);
  const ledgerReads = client.__calls.filter((c) => c.table === "source_reliability_ledger");
  assert.ok(ledgerReads.length >= 1);
  assert.ok(ledgerReads.every((c) => c.ops.some((o) => o[0] === "gte" && o[1] === "scored_at" && o[2] === "2025-10-04T00:00:00.000Z")), "bounded by the window");
});

// Lane TRUST-RET (2026-10-07): the operator's emergency stop halts the run before any plan or write.
test("the emergency stop halts recompute-tiers: nothing read, planned or written", async () => {
  const f = fakeDeps([row()]);
  f.deps.readPause = async () => ({ paused: true, error: null });
  f.deps.readers.readSources = async () => { throw new Error("must not read"); };
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.paused, true);
  assert.equal(summary.applied, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(summary.exitCode, 0);
});

test("a clear pause read leaves the run as it was", async () => {
  const f = fakeDeps([row()]);
  f.deps.readPause = async () => ({ paused: false, error: null });
  assert.equal((await main({ mode: "apply" }, f.deps)).applied, 1);
});

test("an unreadable pause flag fails closed: the step does not write", async () => {
  const f = fakeDeps([row()]);
  f.deps.readPause = async () => ({ paused: true, error: "db down" });
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(f.writes.length, 0);
  assert.match(summary.pause_reason, /failing closed/);
});

test("buildDeps(): readPause reads system_state.global_processing_paused", async () => {
  const client = makeClient((s) => ({ data: s.table === "system_state" ? [{ global_processing_paused: true }] : [], error: null }));
  __setWriteClientForTest(() => client);
  const deps = await buildDeps();
  assert.deepEqual(await deps.readPause(), { paused: true, error: null });
  assert.ok(client.__calls.some((c) => c.table === "system_state" && c.ops.some((o) => o[0] === "select" && o[1] === "global_processing_paused")));
});
