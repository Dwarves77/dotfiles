// run-attacks.test.mjs -- lane PROOF-4 (2026-10-07). The suite runner: local-only refusal, manifest validation,
// fixture lifecycle, aggregation, the report, the exit code, and THE ATTACK ON THE ATTACKER at suite level (an
// attack whose forbidden action succeeds makes the run exit 1). Scripted database, injected spawn: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertLocalOnly,
  validateManifest,
  runAll,
  buildReport,
  exitCodeFor,
  cliMain,
} from "./run-attacks.mjs";

const LOCAL_ENV = {
  CHAIN_PROOF_LOCAL: "1",
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
};

test("assertLocalOnly: the local stack environment is accepted", () => {
  assert.deepEqual(assertLocalOnly(LOCAL_ENV), { ok: true, violations: [] });
});

test("assertLocalOnly: refuses a missing loopback switch, a remote database host, a remote API host and a production marker", () => {
  const bad = assertLocalOnly({ ...LOCAL_ENV, CHAIN_PROOF_LOCAL: "0" });
  assert.equal(bad.ok, false);
  assert.match(bad.violations.join(" "), /CHAIN_PROOF_LOCAL/);
  assert.equal(assertLocalOnly({ ...LOCAL_ENV, SUPABASE_DB_URL: "postgresql://u:p@db.example.org:5432/postgres" }).ok, false);
  assert.equal(assertLocalOnly({ ...LOCAL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://x.example.org" }).ok, false);
  assert.equal(assertLocalOnly({ ...LOCAL_ENV, SUPABASE_DB_URL: "" }).ok, false, "a missing database URL is a refusal, not a pass");
  assert.equal(assertLocalOnly({ ...LOCAL_ENV, SUPABASE_DB_URL: "postgresql://u:p@127.0.0.1.evil.example:5432/db" }).ok, false, "a host that merely starts with 127.0.0.1 is not loopback");
  const prod = assertLocalOnly({ ...LOCAL_ENV, SOME_OTHER_VAR: "https://abc.supabase.co" });
  assert.equal(prod.ok, false);
  assert.ok(!prod.violations.join(" ").includes("abc.supabase.co"), "violations name variables, never values");
});

const sqlAttack = (over = {}) => ({
  id: "t-sql",
  group: "g",
  invariant: "a write is refused",
  expected: "42501",
  kind: "sql",
  steps: [{ label: "forbidden", kind: "attack", sql: "UPDATE public.t SET v = 1", expect: { error: "42501" } }],
  ...over,
});
const scriptAttack = (over = {}) => ({
  id: "t-script",
  group: "g",
  invariant: "an audit holds",
  expected: "exit 0",
  kind: "script",
  script: "scripts/verify/x.mjs",
  expect_exit: 0,
  require: [{ label: "PASS line", pattern: "^PASS" }],
  ...over,
});

test("validateManifest: accepts a well formed manifest", () => {
  assert.deepEqual(validateManifest({ version: 1, attacks: [sqlAttack(), scriptAttack()] }), []);
});

test("validateManifest: names every defect (duplicate id, unknown kind, empty steps, no expectation, bad step kind, missing invariant)", () => {
  const errors = validateManifest({
    version: 1,
    attacks: [
      sqlAttack(),
      sqlAttack(), // duplicate id
      sqlAttack({ id: "t-kind", kind: "magic" }),
      sqlAttack({ id: "t-empty", steps: [] }),
      sqlAttack({ id: "t-noexpect", steps: [{ label: "x", kind: "attack", sql: "SELECT 1" }] }),
      sqlAttack({ id: "t-stepkind", steps: [{ label: "x", kind: "wander", sql: "SELECT 1", expect: { ok: true } }] }),
      sqlAttack({ id: "t-noinv", invariant: "" }),
      scriptAttack({ id: "t-noscript", script: undefined }),
    ],
  }).join("\n");
  for (const needle of ["duplicate", "t-kind", "t-empty", "t-noexpect", "t-stepkind", "t-noinv", "t-noscript"]) assert.match(errors, new RegExp(needle));
  assert.notEqual(validateManifest({ version: 1, attacks: [] }).length, 0, "an empty suite is a defect");
  assert.notEqual(validateManifest({}).length, 0);
});

test("validateManifest: an unknown expectation key is a defect (a typo must not become a vacuous pass)", () => {
  const errs = validateManifest({ version: 1, attacks: [sqlAttack({ steps: [{ label: "x", kind: "attack", sql: "SELECT 1", expect: { errr: "42501" } }] })] });
  assert.match(errs.join(" "), /errr/);
});

function suiteDb({ leak = false, failFixtures = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (failFixtures && /INSERT INTO auth\.users/.test(s)) throw Object.assign(new Error("auth schema missing"), { code: "3F000" });
      if (/^UPDATE public\.t SET v = 1/.test(s)) {
        if (leak) return { rows: [], rowCount: 1 };
        throw Object.assign(new Error("permission denied for table t"), { code: "42501" });
      }
      return { rows: [], rowCount: 1 };
    },
  };
}

const stubSpawn = (status = 0, stdout = "PASS ok\n") => () => ({ status, stdout, stderr: "" });

const run = (manifest, db, over = {}) =>
  runAll({ manifest, client: db, spawn: stubSpawn(), env: LOCAL_ENV, cwd: "/work/fsi-app", echo: () => {}, now: () => new Date("2026-10-07T00:00:00Z"), ...over });

test("a held suite is green: every attack passes, the report counts them, the exit code is 0", async () => {
  const manifest = { version: 1, attacks: [sqlAttack(), scriptAttack()] };
  const report = await run(manifest, suiteDb());
  assert.equal(report.summary.attacks, 2);
  assert.equal(report.summary.passed, 2);
  assert.equal(report.summary.failed, 0);
  assert.equal(exitCodeFor(report), 0);
  assert.equal(report.attacks[0].id, "t-sql");
  for (const a of report.attacks) for (const k of ["id", "invariant", "expected", "observed", "status"]) assert.ok(a[k] !== undefined, `${a.id}.${k}`);
});

test("ATTACK ON THE ATTACKER: a stub database that lets the forbidden write through makes the run exit 1", async () => {
  const report = await run({ version: 1, attacks: [sqlAttack(), scriptAttack()] }, suiteDb({ leak: true }));
  assert.equal(report.summary.failed, 1);
  assert.equal(report.attacks.find((a) => a.id === "t-sql").status, "fail");
  assert.equal(exitCodeFor(report), 1);
});

test("ATTACK ON THE ATTACKER: an audit script that exits 0 without its required verdict line makes the run exit 1", async () => {
  const report = await run({ version: 1, attacks: [scriptAttack()] }, suiteDb(), { spawn: stubSpawn(0, "SKIP nothing happened\n") });
  assert.equal(exitCodeFor(report), 1);
});

test("one attack that throws an engine error is recorded as a failure and the rest still run", async () => {
  const db = suiteDb();
  const original = db.query.bind(db);
  db.query = async (sql, params) => {
    if (/boom/.test(String(sql))) throw new Error("connection terminated");
    return original(sql, params);
  };
  const manifest = {
    version: 1,
    attacks: [
      sqlAttack({ id: "t-engine", steps: [{ label: "x", kind: "setup", sql: "SAVEPOINT boom", expect: { ok: true } }] }),
      scriptAttack(),
    ],
  };
  const report = await run(manifest, db);
  assert.equal(report.attacks.find((a) => a.id === "t-engine").status, "fail");
  assert.equal(report.attacks.find((a) => a.id === "t-script").status, "pass");
});

test("fixtures: created before the attacks that need them and removed after; an attack that needs none still runs", async () => {
  const db = suiteDb();
  const manifest = { version: 1, attacks: [sqlAttack({ id: "t-needs", needs_fixtures: true }), sqlAttack({ id: "t-free" })] };
  const report = await run(manifest, db);
  assert.equal(report.fixtures.created, true);
  assert.equal(report.fixtures.removed, true);
  const sqls = db.calls.map((c) => c.sql);
  assert.ok(sqls.findIndex((s) => /INSERT INTO auth\.users/.test(s)) < sqls.findIndex((s) => /^UPDATE public\.t SET v = 1/.test(s)));
  assert.match(sqls.at(-1), /^DELETE FROM auth\.users/);
});

test("fixtures that cannot be created fail the attacks that need them as NOT EXERCISED, never as a pass", async () => {
  const manifest = { version: 1, attacks: [sqlAttack({ id: "t-needs", needs_fixtures: true }), scriptAttack()] };
  const report = await run(manifest, suiteDb({ failFixtures: true }));
  const needs = report.attacks.find((a) => a.id === "t-needs");
  assert.equal(needs.status, "fail");
  assert.match(needs.observed, /not exercised/i);
  assert.equal(report.fixtures.created, false);
  assert.equal(report.attacks.find((a) => a.id === "t-script").status, "pass");
  assert.equal(exitCodeFor(report), 1);
});

test("--only runs the named attacks and nothing else", async () => {
  const report = await run({ version: 1, attacks: [sqlAttack(), scriptAttack()] }, suiteDb(), { only: ["t-script"] });
  assert.deepEqual(report.attacks.map((a) => a.id), ["t-script"]);
});

test("the report never contains a value read from the database", async () => {
  const sentinel = "SENTINEL-ROW-TEXT";
  const db = suiteDb();
  const original = db.query.bind(db);
  db.query = async (sql, params) => (/FROM public\.items/.test(String(sql)) ? { rows: [{ title: sentinel }], rowCount: 1 } : original(sql, params));
  const manifest = { version: 1, attacks: [sqlAttack({ steps: [{ label: "read", kind: "setup", sql: "SELECT title FROM public.items", expect: { equals: { title: "other" } } }] })] };
  const report = await run(manifest, db);
  assert.ok(!JSON.stringify(report).includes(sentinel));
});

test("buildReport: shape and counts", () => {
  const r = buildReport({
    results: [{ id: "a", status: "pass", invariant: "i", expected: "e", observed: "o" }, { id: "b", status: "fail", invariant: "i", expected: "e", observed: "o" }],
    fixtures: { created: true, removed: true },
    startedAt: new Date("2026-10-07T00:00:00Z"),
    finishedAt: new Date("2026-10-07T00:00:05Z"),
  });
  assert.equal(r.schema, 1);
  assert.equal(r.suite, "chain-proof-attacks");
  assert.deepEqual(r.summary, { attacks: 2, passed: 1, failed: 1 });
  assert.equal(r.seconds, 5);
  assert.equal(exitCodeFor(r), 1);
  assert.equal(exitCodeFor(buildReport({ results: [], fixtures: {}, startedAt: new Date(), finishedAt: new Date() })), 1, "zero attacks run is never a green suite");
});

test("cliMain: refuses to connect when the environment is not the local stack (exit 2, connect never called)", async () => {
  let connected = false;
  const code = await cliMain({
    argv: [],
    env: { ...LOCAL_ENV, SUPABASE_DB_URL: "postgresql://u:p@db.example.org:5432/postgres" },
    connect: async () => { connected = true; return null; },
    loadManifest: () => ({ version: 1, attacks: [sqlAttack()] }),
    log: () => {},
  });
  assert.equal(code, 2);
  assert.equal(connected, false);
});

test("cliMain: no database connection is exit 2 (cannot verify), never a pass", async () => {
  const code = await cliMain({ argv: [], env: LOCAL_ENV, connect: async () => null, loadManifest: () => ({ version: 1, attacks: [sqlAttack()] }), log: () => {} });
  assert.equal(code, 2);
});

test("cliMain: a green run writes attacks-report.json into the output directory and exits 0; a red run exits 1 and still writes it", async () => {
  for (const [leak, expectCode] of [[false, 0], [true, 1]]) {
    const written = {};
    const db = suiteDb({ leak });
    db.end = async () => {};
    const code = await cliMain({
      argv: ["--out-dir", "/out"],
      env: LOCAL_ENV,
      connect: async () => db,
      loadManifest: () => ({ version: 1, attacks: [sqlAttack()] }),
      spawn: stubSpawn(),
      writeFile: (p, c) => { written[p] = c; },
      makeDir: () => {},
      cwd: "/work/fsi-app",
      log: () => {},
    });
    assert.equal(code, expectCode);
    const file = Object.keys(written).find((p) => p.endsWith("attacks-report.json"));
    assert.ok(file, "report written");
    assert.equal(JSON.parse(written[file]).summary.attacks, 1);
  }
});

test("cliMain: the output directory falls back to CP_OUT_DIR (how the workflow step passes it)", async () => {
  const written = {};
  const db = suiteDb();
  db.end = async () => {};
  await cliMain({
    argv: [],
    env: { ...LOCAL_ENV, CP_OUT_DIR: "/runner/chain-proof-out" },
    connect: async () => db,
    loadManifest: () => ({ version: 1, attacks: [sqlAttack()] }),
    spawn: stubSpawn(),
    writeFile: (p, c) => { written[p] = c; },
    makeDir: () => {},
    cwd: "/work/fsi-app",
    log: () => {},
  });
  assert.ok(Object.keys(written).some((p) => p.replace(/\\/g, "/") === "/runner/chain-proof-out/attacks-report.json"));
});
