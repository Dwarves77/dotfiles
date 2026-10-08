// recompute-trust-scores.npmtest.mjs: lane TRUST-RET (2026-10-07). Proves the maintenance step through
// injected deps over the REAL trust.ts calculator (jiti, so *.npmtest.mjs, run after npm ci), proves the score
// plan equals the formula the retired workflow's route used, and proves buildDeps()'s real wiring (the lazily
// loaded calculator, the paginated read scope and the guarded write path) against a recording fake client.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { __setWriteClientForTest } from "../lib/db.mjs";
import { main, buildDeps, CITE } from "./recompute-trust-scores.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const trust = await jiti.import("../../src/lib/trust.ts");

const NOW = new Date("2026-10-07T12:00:00Z");
const row = (over = {}) => ({
  id: "s1", name: "Source One", base_tier: 3, effective_tier: null, tier_override: null, status: "active",
  processing_paused: false, confirmation_count: 12, conflict_count: 1, accuracy_rate: 0.9, accessibility_rate: 0.95,
  total_checks: 20, lead_time_samples: 5, avg_lead_time_days: 2, independent_citers: 4, highest_citing_tier: 2,
  total_citations: 6, self_citation_count: 0, conflict_total: 1, last_checked: "2026-10-06T00:00:00Z",
  last_accessible: "2026-10-06T00:00:00Z", created_at: "2020-01-01T00:00:00Z", last_substantive_change: null,
  update_frequency: "ad-hoc", ...over,
});
const SCORE_COLUMNS = ["trust_score_accuracy", "trust_score_citation", "trust_score_computed_at", "trust_score_overall", "trust_score_reliability", "trust_score_timeliness"];

function fakeDeps(sources, { pause } = {}) {
  const writes = [];
  return {
    writes,
    deps: {
      trust,
      now: () => NOW,
      readSources: async () => sources,
      readPause: pause ? async () => pause : undefined,
      writeScores: async (id, patch) => { writes.push({ id, patch }); return { written: true }; },
    },
  };
}

test("the plan is the route's formula: overall is computeOverallScore anchored to base_tier, components from computeTrustScore", () => {
  const s = row();
  const plan = trust.planTrustScores([s], NOW.toISOString());
  const m = trust.trustMetricsFromRow(s);
  const score = trust.computeTrustScore(m);
  assert.equal(plan.rows[0].patch.trust_score_overall, trust.computeOverallScore(m, s.base_tier));
  assert.equal(plan.rows[0].patch.trust_score_accuracy, score.accuracy_component);
  assert.equal(plan.rows[0].patch.trust_score_timeliness, score.timeliness_component);
  assert.equal(plan.rows[0].patch.trust_score_reliability, score.reliability_component);
  assert.equal(plan.rows[0].patch.trust_score_citation, score.citation_component);
  assert.equal(plan.rows[0].patch.trust_score_computed_at, NOW.toISOString());
  assert.deepEqual(Object.keys(plan.rows[0].patch).sort(), SCORE_COLUMNS);
});

test("a source on a per-source hold keeps its last-known score: skipped and counted, never planned", () => {
  const plan = trust.planTrustScores([row(), row({ id: "s2", processing_paused: true })], NOW.toISOString());
  assert.deepEqual(plan.rows.map((r) => r.id), ["s1"]);
  assert.equal(plan.skipped_paused, 1);
});

test("distribution and per-base-tier averages cover exactly the scored rows", () => {
  const bare = { confirmation_count: 0, conflict_count: 0, total_checks: 0, independent_citers: 0 };
  const plan = trust.planTrustScores([row({ id: "a", base_tier: 1 }), row({ id: "b", base_tier: 1 }), row({ id: "c", base_tier: 7, ...bare })], NOW.toISOString());
  assert.equal(Object.values(plan.distribution).reduce((x, y) => x + y, 0), 3);
  assert.equal(plan.tier_averages.T1.n, 2);
  assert.equal(plan.tier_averages.T7.n, 1);
});

test("dry mode plans the scores and writes nothing", async () => {
  const f = fakeDeps([row(), row({ id: "s2" })]);
  const summary = await main({ mode: "dry" }, f.deps);
  assert.equal(summary.counts.sources_scored, 2);
  assert.equal(summary.applied, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(summary.exitCode, 0);
});

test("apply mode writes only the six trust_score columns per source, never a tier column", async () => {
  const f = fakeDeps([row(), row({ id: "s2", tier_override: 1, effective_tier: 1 })]);
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.applied, 2);
  assert.equal(summary.read_back.attempted, 2);
  for (const w of f.writes) assert.deepEqual(Object.keys(w.patch).sort(), SCORE_COLUMNS);
});

test("the emergency stop halts before any plan or write", async () => {
  const f = fakeDeps([row()], { pause: { paused: true, error: null } });
  f.deps.readSources = async () => { throw new Error("must not read"); };
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.paused, true);
  assert.equal(summary.applied, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(summary.exitCode, 0);
});

test("a clear pause read runs normally", async () => {
  const f = fakeDeps([row()], { pause: { paused: false, error: null } });
  assert.equal((await main({ mode: "apply" }, f.deps)).applied, 1);
});

test("a failed write sets exitCode 1, is named in read_back, and the sweep continues", async () => {
  const f = fakeDeps([row(), row({ id: "s2", name: "Source Two" })]);
  f.deps.writeScores = async (id) => { if (id === "s1") throw new Error("db down"); return { written: true }; };
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.applied, 1);
  assert.equal(summary.read_back.write_failed, 1);
  assert.match(summary.read_back.failures[0], /Source One: db down/);
});

test("a write that matched no row is counted, not called applied", async () => {
  const f = fakeDeps([row()]);
  f.deps.writeScores = async () => ({ written: false });
  const summary = await main({ mode: "apply" }, f.deps);
  assert.equal(summary.applied, 0);
  assert.equal(summary.read_back.row_not_matched, 1);
});

// Real wiring: buildDeps() with the real calculator, the real paginated read and the real guarded write.
function recorder(handler) {
  const calls = [];
  const from = (table) => {
    const st = { table, verb: "select", ops: [], payload: null };
    const b = new Proxy(function () {}, {
      get(_t, key) {
        if (key === "then") return (res, rej) => { calls.push(st); return Promise.resolve(handler(st)).then(res, rej); };
        return (...args) => {
          if (key === "update" || key === "insert") { st.verb = key; st.payload = args[0]; } else st.ops.push([key, ...args]);
          return b;
        };
      },
    });
    return b;
  };
  return { from, calls };
}
test.afterEach(() => { __setWriteClientForTest(null); });

test("buildDeps(): reads the unpaused registry, writes through the guarded path with a cite, touches no tier column", async () => {
  const client = recorder((s) => {
    if (s.verb === "update") return { data: [{ id: "s1" }], error: null };
    if (s.table === "system_state") return { data: [{ global_processing_paused: false }], error: null };
    return { data: [{ id: "s1", base_tier: 3 }], error: null };
  });
  __setWriteClientForTest(() => client);
  const deps = await buildDeps();
  assert.equal(typeof deps.trust.planTrustScores, "function");
  assert.deepEqual(await deps.readPause(), { paused: false, error: null });
  await deps.readSources();
  const read = client.calls.find((c) => c.table === "sources" && c.verb === "select");
  assert.ok(read.ops.some((o) => o[0] === "eq" && o[1] === "processing_paused" && o[2] === false), "per-source hold excluded at the read");
  const patch = Object.fromEntries(SCORE_COLUMNS.map((c) => [c, 1]));
  const res = await deps.writeScores("s1", patch);
  assert.equal(res.written, true);
  const upd = client.calls.find((c) => c.verb === "update");
  assert.deepEqual(Object.keys(upd.payload).sort(), SCORE_COLUMNS);
  assert.equal(CITE.skill, "source-credibility-model");
});

test("the admin route and this step share the one planTrustScores (static)", () => {
  const route = readFileSync(resolve(ROOT, "src/app/api/admin/recompute-trust/route.ts"), "utf8");
  assert.match(route, /planTrustScores/);
  assert.doesNotMatch(route, /computeOverallScore|computeTrustScore/, "the route holds no second copy of the formula");
  const step = readFileSync(resolve(ROOT, "scripts/maintenance/recompute-trust-scores.mjs"), "utf8");
  assert.doesNotMatch(step, /computeOverallScore|computeTrustScore/, "the step holds no copy of the formula");
});
