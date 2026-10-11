// rls-view-function-attacks.test.mjs -- unit tests of the views and functions leg of the RLS attack (lane TESTS-2,
// 2026-10-10), against a scripted fake database. The attack itself needs the local stack; here every attack is proven to
// hold on a correct schema and to turn red for each leak (an attack on the attacker), and the CLI refusals are pinned.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRole, EXPECT_KEYS, STEP_KINDS } from "../../proof/attacks/attack-engine.mjs";
import {
  VIEW_FUNCTION_ATTACKS, OWNER_RUN_VIEWS_SQL, GUARDED_VIEWS, SYSTEM_ONLY_FUNCTIONS, runAll, cliMain,
} from "./rls-view-function-attacks.mjs";

const NL = String.fromCharCode(10);
const DENY = Object.assign(new Error("permission denied"), { code: "42501" });
const NOT_UPDATABLE = Object.assign(new Error("cannot insert into view"), { code: "55000" });

/**
 * A scripted database. `world` switches individual leaks on. It tracks the impersonated role the engine sets, and answers the
 * attack statements by pattern; anything else (fixture inserts, savepoints) succeeds with no rows.
 */
function fakeDb(world = {}) {
  let role = "owner";
  const log = [];
  return {
    log,
    end: async () => {},
    async query(sql) {
      const text = String(sql);
      log.push(text);
      let m = /^SET LOCAL ROLE (\w+)/.exec(text);
      if (m) { role = m[1]; return { rows: [], rowCount: 0 }; }
      if (/^(RESET ROLE|ROLLBACK|BEGIN|COMMIT)/.test(text)) { role = "owner"; return { rows: [], rowCount: 0 }; }
      if (/^(SAVEPOINT|RELEASE|ROLLBACK TO)/.test(text) || /^SELECT set_config/.test(text)) return { rows: [], rowCount: 0 };
      if (/count\(\*\) >= 3\) AS ok/.test(text)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/= 2\) AS ok FROM pg_class c/.test(text)) return { rows: [{ ok: true }], rowCount: 1 };
      if (/AS name FROM pg_class c/.test(text)) return { rows: (world.ownerRun ?? []).map((name) => ({ name })), rowCount: (world.ownerRun ?? []).length };
      if (/AS n FROM pg_class c/.test(text) && /security_invoker/.test(text)) return { rows: [{ n: world.definerView ? 1 : 0 }], rowCount: 1 };
      if (/^SELECT \* FROM public\./.test(text)) {
        if (role === "service_role") return { rows: [], rowCount: 0 };
        if (world.viewReadable && role === "anon") return { rows: [{ id: "x" }], rowCount: 1 };
        if (world.viewReadableBy && role === world.viewReadableBy) return { rows: [{ id: "x" }], rowCount: 1 };
        throw DENY;
      }
      if (/^SELECT count\(\*\)::int AS n FROM public\./.test(text)) {
        if (role === "service_role") return { rows: [{ n: 0 }], rowCount: 1 };
        throw DENY;
      }
      if (/^(DELETE FROM|INSERT INTO) public\.(derived_values_admissible|research_assessments_current)/.test(text)) {
        if (world.viewWritable && role === "anon") return { rows: [], rowCount: 0 };
        throw role === "owner" ? NOT_UPDATABLE : DENY;
      }
      if (/AS ok FROM pg_proc/.test(text) && /service_role/.test(text)) return { rows: [{ ok: !world.serviceLost }], rowCount: 1 };
      if (/FROM pg_proc p JOIN pg_namespace ns/.test(text) && /has_function_privilege\('anon'/.test(text) && /proname = ANY/.test(text)) return { rows: [{ n: world.anonCanExecute ? 1 : 0 }], rowCount: 1 };
      if (/FROM pg_proc p JOIN pg_namespace ns/.test(text) && /has_function_privilege\('authenticated'/.test(text) && /proname = ANY/.test(text)) return { rows: [{ n: world.authCanExecute ? 1 : 0 }], rowCount: 1 };
      if (/AS n FROM pg_proc p JOIN pg_namespace ns/.test(text) && /proname = ANY/.test(text)) return { rows: [{ n: 5 }], rowCount: 1 };
      if (/^SELECT public\.admin_set_/.test(text)) {
        if (world.callableBy && role === world.callableBy) return { rows: [{}], rowCount: 1 };
        if (role === "service_role" || role === "owner") return { rows: [{}], rowCount: 1 };
        throw DENY;
      }
      if (/prosecdef/.test(text)) return { rows: [{ n: 3 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

test("every attack is well formed: kinds, expectation keys and roles the engine knows", () => {
  assert.ok(VIEW_FUNCTION_ATTACKS.length >= 5);
  const ids = new Set();
  for (const a of VIEW_FUNCTION_ATTACKS) {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(a.invariant && a.expected && a.steps.length > 0);
    for (const s of a.steps) {
      assert.ok(STEP_KINDS.includes(s.kind), `${a.id}: ${s.label}`);
      assert.ok(s.label && s.sql);
      assert.ok(Object.keys(s.expect).every((k) => EXPECT_KEYS.includes(k)), `${a.id}: ${s.label}`);
      assert.doesNotThrow(() => parseRole(s.as));
    }
    assert.ok(a.id === "rls-vf-census" || a.steps.some((s) => s.kind === "attack"), `${a.id} has an attack step`);
  }
  assert.deepEqual([...GUARDED_VIEWS], ["derived_values_admissible", "research_assessments_current"]);
  assert.equal(SYSTEM_ONLY_FUNCTIONS.length, 5);
});

test("on a correct schema every attack holds and the fixtures are set up and torn down", async () => {
  const db = fakeDb();
  const report = await runAll({ client: db });
  assert.deepEqual(report.violations, []);
  assert.equal(report.attacks.length, VIEW_FUNCTION_ATTACKS.length);
  assert.ok(report.attacks.every((a) => a.status === "pass"), JSON.stringify(report.attacks.filter((a) => a.status !== "pass")));
  assert.ok(db.log.some((t) => /DELETE FROM auth\.users/.test(t)), "teardown ran");
  const census = report.attacks.find((a) => a.id === "rls-vf-census");
  assert.match(census.observed, /n=3/, "the census carries its numbers");
});

const leaks = [
  ["a guarded view that runs as its owner", { definerView: true }, "rls-vf-views-run-as-invoker"],
  ["a guarded view readable by anon", { viewReadable: true }, "rls-vf-views-read-denied"],
  ["a guarded view readable by an org member", { viewReadableBy: "authenticated" }, "rls-vf-views-read-denied"],
  ["a view that accepts a write from anon", { viewWritable: true }, "rls-vf-views-write-denied"],
  ["a system-only writer executable by anon", { anonCanExecute: true }, "rls-vf-system-writers-not-executable"],
  ["a system-only writer executable by authenticated", { authCanExecute: true }, "rls-vf-system-writers-not-executable"],
  ["a flag writer callable by an org member", { callableBy: "authenticated" }, "rls-vf-system-writers-not-executable"],
  ["a system-only writer that lost its service role grant (the legitimate path killed)", { serviceLost: true }, "rls-vf-system-writers-not-executable"],
];
for (const [name, world, id] of leaks) {
  test(`ATTACK ON THE ATTACKER: ${name} turns ${id} red`, async () => {
    const report = await runAll({ client: fakeDb(world) });
    const hit = report.attacks.find((a) => a.id === id);
    assert.equal(hit.status, "fail", JSON.stringify(hit));
    assert.ok(report.violations.some((v) => v.includes(id)));
    assert.ok(report.attacks.filter((a) => a.id !== id).every((a) => a.status === "pass" || a.id !== id), "other attacks are judged on their own");
  });
}

test("the owner-run census names every non-guarded view that lacks security_invoker, and is a census, not a pass condition", async () => {
  const report = await runAll({ client: fakeDb({ ownerRun: ["census_rollup_by_surface", "licence_clear_sources"] }) });
  assert.deepEqual(report.owner_run_views, ["public.census_rollup_by_surface", "public.licence_clear_sources"]);
  assert.deepEqual(report.violations, [], "an owner-run view outside the guarded two does not fail the attack");
  const logs = [];
  const env = { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
  const code = await cliMain({ argv: [], env, connect: async () => fakeDb({ ownerRun: ["public_thing"] }), log: (m) => logs.push(m), makeDir: () => {}, writeFile: () => {} });
  assert.equal(code, 0);
  assert.ok(logs.includes("owner-run view: public.public_thing"), logs.join(NL));
});

test("the invoker check accepts both spellings Postgres stores (on and true) and the census query shares it", () => {
  const sql = VIEW_FUNCTION_ATTACKS.find((a) => a.id === "rls-vf-views-run-as-invoker").steps.map((s) => s.sql).join(NL);
  assert.ok(sql.includes("security_invoker=(on|true)"));
  assert.ok(OWNER_RUN_VIEWS_SQL.includes("security_invoker=(on|true)"));
});

test("a database that cannot create the fixtures reports nothing attacked, not a pass", async () => {
  const db = fakeDb();
  const orig = db.query.bind(db);
  db.query = async (sql, p) => { if (/INSERT INTO auth\.users/.test(sql)) throw Object.assign(new Error("boom"), { code: "XX000" }); return orig(sql, p); };
  const report = await runAll({ client: db });
  assert.equal(report.attacks.length, 0);
  assert.ok(report.violations.some((v) => v.startsWith("FIXTURES:")));
});

test("cliMain: refuses outside the local stack, exits 2 with no connection, 1 on a leak, 0 and a report on a clean run", async () => {
  const logs = [];
  const env = { CHAIN_PROOF_LOCAL: "1", SUPABASE_DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
  const base = { log: (m) => logs.push(m), makeDir: () => {} };
  assert.equal(await cliMain({ ...base, argv: [], env: {}, connect: async () => fakeDb() }), 2);
  assert.equal(await cliMain({ ...base, argv: ["--nope"], env, connect: async () => fakeDb() }), 2);
  assert.equal(await cliMain({ ...base, argv: [], env, connect: async () => null }), 2);
  const writes = [];
  assert.equal(await cliMain({ ...base, argv: ["--out-dir", "OUT"], env, connect: async () => fakeDb({ viewReadable: true }), writeFile: (p, c) => writes.push([p, c]) }), 1);
  assert.equal(await cliMain({ ...base, argv: ["--out-dir", "OUT"], env, connect: async () => fakeDb(), writeFile: (p, c) => writes.push([p, c]) }), 0);
  assert.equal(writes.length, 2);
  assert.match(writes[1][0], /rls-view-function-attacks-report\.json$/);
});
