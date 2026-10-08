/** Tests for scripts/proof/steps/assertions.mjs (lane PROOF-3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { countSql, takeBaselines, takeSnapshots, evaluateAssertions, autoAssertions, describeFailure } from "./assertions.mjs";

const vars = { run_id: "900", "run_id.s1": "900", started_at: "2026-10-07 10:00:00+00", loop_run_id: "800", upstream_run_id: "899" };

/** A stub database: answers each query by the first matcher whose substring appears in the SQL. */
function stubQuery(answers, log = []) {
  return async (sql, params = []) => {
    log.push({ sql, params });
    for (const [needle, value] of answers) {
      if (sql.includes(needle)) return typeof value === "function" ? value(sql, params) : value;
    }
    return [{ n: 0 }];
  };
}

test("countSql names the table and the substituted predicate", () => {
  assert.equal(
    countSql({ table: "harness_runs", predicate: "github_run_id = '{{run_id}}'" }, vars),
    "SELECT count(*)::int AS n FROM public.harness_runs WHERE github_run_id = '900'",
  );
});

test("countSql refuses a table that is not a plain identifier", () => {
  assert.throws(() => countSql({ table: "x; drop table y", predicate: "true" }, vars), /not a plain identifier/);
});

test("count: passes at the minimum, fails below it, and reports the observed integer", async () => {
  const a = [{ id: "c", kind: "count", table: "t", predicate: "true", min: 3 }];
  const pass = await evaluateAssertions({ assertions: a, vars, query: stubQuery([["FROM public.t", [{ n: 3 }]]]) });
  assert.equal(pass[0].ok, true);
  assert.equal(pass[0].observed, 3);
  const fail = await evaluateAssertions({ assertions: a, vars, query: stubQuery([["FROM public.t", [{ n: 2 }]]]) });
  assert.equal(fail[0].ok, false);
  assert.equal(fail[0].observed, 2);
  assert.equal(fail[0].expect, ">= 3");
});

test("max: passes at or below the maximum and fails above it", async () => {
  const a = [{ id: "m", kind: "max", table: "t", predicate: "true", max: 0 }];
  assert.equal((await evaluateAssertions({ assertions: a, vars, query: stubQuery([["FROM public.t", [{ n: 0 }]]]) }))[0].ok, true);
  assert.equal((await evaluateAssertions({ assertions: a, vars, query: stubQuery([["FROM public.t", [{ n: 1 }]]]) }))[0].ok, false);
});

test("minSql: the minimum is read from the database after the step, and an empty result still has a floor", async () => {
  const a = [{ id: "g", kind: "count", table: "t", predicate: "true", minSql: "SELECT greatest(1, coalesce(max(1), 0))::int FROM public.x WHERE r = '{{run_id}}'" }];
  const q = stubQuery([["FROM public.x", [{ greatest: 4 }]], ["FROM public.t", [{ n: 4 }]]]);
  const r = await evaluateAssertions({ assertions: a, vars, query: q });
  assert.equal(r[0].ok, true);
  assert.equal(r[0].expect, ">= 4");
  const q2 = stubQuery([["FROM public.x", [{ greatest: 4 }]], ["FROM public.t", [{ n: 3 }]]]);
  assert.equal((await evaluateAssertions({ assertions: a, vars, query: q2 }))[0].ok, false);
});

test("growth: the baseline is taken before and compared after, in both directions", async () => {
  const up = [{ id: "u", kind: "growth", table: "t", predicate: "true", min: 2 }];
  let n = 5;
  const q = async () => [{ n }];
  const base = await takeBaselines(up, vars, q);
  assert.deepEqual(base, { u: 5 });
  n = 7;
  assert.equal((await evaluateAssertions({ assertions: up, vars, query: q, baselines: base }))[0].ok, true);
  n = 6;
  const bad = (await evaluateAssertions({ assertions: up, vars, query: q, baselines: base }))[0];
  assert.equal(bad.ok, false);
  assert.equal(bad.observed, 1);

  const down = [{ id: "d", kind: "growth", table: "t", predicate: "status = 'x'", direction: "down", min: 1 }];
  n = 10;
  const base2 = await takeBaselines(down, vars, q);
  n = 9;
  assert.equal((await evaluateAssertions({ assertions: down, vars, query: q, baselines: base2 }))[0].ok, true);
  n = 10;
  assert.equal((await evaluateAssertions({ assertions: down, vars, query: q, baselines: base2 }))[0].ok, false);
});

test("growth without a baseline is a failed assertion with a reason, never a silent pass", async () => {
  const r = await evaluateAssertions({ assertions: [{ id: "u", kind: "growth", table: "t", predicate: "true", min: 1 }], vars, query: async () => [{ n: 9 }], baselines: {} });
  assert.equal(r[0].ok, false);
  assert.match(r[0].error, /no baseline/);
});

test("any_of: passes when the first alternative fails and the second passes, and reports every alternative", async () => {
  const a = [{ id: "d", kind: "any_of", of: [
    { table: "propagation_events", predicate: "drained_at >= '{{started_at}}'::timestamptz", min: 1 },
    { table: "harness_runs", predicate: "(metrics->>'events_considered')::int = 0", min: 1 },
  ] }];
  const q = stubQuery([["FROM public.propagation_events", [{ n: 0 }]], ["FROM public.harness_runs", [{ n: 1 }]]]);
  const r = (await evaluateAssertions({ assertions: a, vars, query: q }))[0];
  assert.equal(r.ok, true);
  assert.deepEqual(r.observed, [0, 1]);
  assert.equal(r.alternatives.length, 2);
  const q2 = stubQuery([["FROM public.propagation_events", [{ n: 0 }]], ["FROM public.harness_runs", [{ n: 0 }]]]);
  assert.equal((await evaluateAssertions({ assertions: a, vars, query: q2 }))[0].ok, false);
});

test("snapshot_changed counts rows whose value differs from the snapshot", async () => {
  const defs = [{ key: "b", sql: "SELECT id AS k, v FROM public.t WHERE id = ANY($1)", params: ["ids"] }];
  const a = [{ id: "c", kind: "snapshot_changed", table: "t", snapshot: "b", min: 1 }];
  const before = await takeSnapshots(defs, vars, async () => [{ k: "1", v: "a" }, { k: "2", v: "a" }], { ids: ["1", "2"] });
  const same = await evaluateAssertions({ assertions: a, vars, query: async () => [{ k: "1", v: "a" }, { k: "2", v: "a" }], snapshots: before, snapshotDefs: defs, snapshotParams: { ids: ["1", "2"] } });
  assert.equal(same[0].ok, false);
  assert.equal(same[0].observed, 0);
  const changed = await evaluateAssertions({ assertions: a, vars, query: async () => [{ k: "1", v: "a" }, { k: "2", v: "b" }], snapshots: before, snapshotDefs: defs, snapshotParams: { ids: ["1", "2"] } });
  assert.equal(changed[0].ok, true);
  assert.equal(changed[0].observed, 1);
});

test("a query that throws is a failed assertion carrying the error text, not an exception", async () => {
  const r = await evaluateAssertions({ assertions: [{ id: "c", kind: "count", table: "t", predicate: "nope = 1", min: 1 }], vars, query: async () => { throw new Error('column "nope" does not exist'); } });
  assert.equal(r[0].ok, false);
  assert.match(r[0].error, /column "nope" does not exist/);
});

test("autoAssertions: a chained loop step carries the row, upstream and loop assertions; a root carries the row only", () => {
  const chained = autoAssertions({ family: "fetch-drain", upstream: { step: "s", name: "Source sweep" }, loop: true });
  assert.deepEqual(chained.map((a) => a.id), ["harness-row", "upstream-linked", "loop-carried"]);
  assert.match(chained[1].predicate, /upstream_run_id = '\{\{upstream_run_id\}\}'/);
  assert.match(chained[2].predicate, /config->>'loop_run_id' = '\{\{loop_run_id\}\}'/);
  const root = autoAssertions({ family: "producers", upstream: null, loop: false });
  assert.deepEqual(root.map((a) => a.id), ["harness-row"]);
});

test("the auto assertions evaluate to real SQL on a chained step's vars", async () => {
  const log = [];
  await evaluateAssertions({ assertions: autoAssertions({ family: "mint", upstream: { step: "s", name: "x" }, loop: true }), vars, query: stubQuery([["FROM public.harness_runs", [{ n: 1 }]]], log) });
  assert.equal(log.length, 3);
  assert.match(log[1].sql, /harness_family = 'mint' AND github_run_id = '900' AND upstream_run_id = '899'/);
  assert.match(log[2].sql, /config->>'loop_run_id' = '800'/);
});

test("describeFailure names the step, the assertion, the table, the predicate, the observed value and the expectation", () => {
  const msg = describeFailure("corpus-turn", { id: "cross-references-grew", table: "item_cross_references", predicate: "true", observed: 0, expect: "grew by >= 1 (before 5, after 5)", error: null });
  assert.match(msg, /chain step "corpus-turn" failed assertion "cross-references-grew"/);
  assert.match(msg, /item_cross_references WHERE true/);
  assert.match(msg, /observed 0, expected grew by >= 1/);
});
