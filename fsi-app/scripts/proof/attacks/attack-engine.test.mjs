// attack-engine.test.mjs -- lane PROOF-4 (2026-10-07). Fixture proof of the SQL attack engine: the expectation
// language, the role impersonation statements, the savepoint discipline, and the attack on the attacker (a stub
// database that lets the forbidden action through must produce a RED result). No database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DENIED,
  resolveParams,
  parseRole,
  roleStatements,
  evaluateExpect,
  describeObserved,
  runSqlAttack,
} from "./attack-engine.mjs";

const pgError = (code, message) => Object.assign(new Error(message), { code });

/** A scripted database: handler(sql, params, calls) returns { rows, rowCount } or an Error to throw. */
function scripted(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      const out = handler(String(sql), params, calls);
      if (out instanceof Error) throw out;
      return out ?? { rows: [], rowCount: 0 };
    },
  };
}

const CTX = { owner_a: "11111111-1111-4111-8111-111111111111", admin: "22222222-2222-4222-8222-222222222222" };

test("resolveParams: @name resolves from the context, literals pass, a missing name throws", () => {
  assert.deepEqual(resolveParams(["@owner_a", "text", 5, null], CTX), [CTX.owner_a, "text", 5, null]);
  assert.throws(() => resolveParams(["@nope"], CTX), /nope/);
  assert.deepEqual(resolveParams(undefined, CTX), []);
});

test("parseRole: owner, service, anon and user:<key> parse; anything else throws", () => {
  assert.deepEqual(parseRole(undefined), { kind: "owner" });
  assert.deepEqual(parseRole("owner"), { kind: "owner" });
  assert.deepEqual(parseRole("service"), { kind: "service" });
  assert.deepEqual(parseRole("anon"), { kind: "anon" });
  assert.deepEqual(parseRole("user:owner_a"), { kind: "user", key: "owner_a" });
  assert.throws(() => parseRole("root"), /root/);
  assert.throws(() => parseRole("user:"), /user/);
});

test("roleStatements: owner needs none; user sets the authenticated role and a sub claim from the fixture", () => {
  assert.deepEqual(roleStatements({ kind: "owner" }, CTX), []);
  const anon = roleStatements({ kind: "anon" }, CTX);
  assert.equal(anon[0].sql, "SET LOCAL ROLE anon");
  const svc = roleStatements({ kind: "service" }, CTX);
  assert.equal(svc[0].sql, "SET LOCAL ROLE service_role");
  const user = roleStatements({ kind: "user", key: "owner_a" }, CTX);
  assert.equal(user[0].sql, "SET LOCAL ROLE authenticated");
  assert.match(user[1].sql, /set_config\('request\.jwt\.claims'/);
  assert.equal(JSON.parse(user[1].params[0]).sub, CTX.owner_a);
  assert.throws(() => roleStatements({ kind: "user", key: "ghost" }, CTX), /ghost/);
});

test("evaluateExpect: error code, message, ok", () => {
  const denied = { errored: true, code: DENIED, message: "permission denied for table x", rows: [], rowCount: null };
  assert.equal(evaluateExpect({ error: "42501" }, denied).ok, true);
  assert.equal(evaluateExpect({ error: ["23514", "42501"] }, denied).ok, true);
  assert.equal(evaluateExpect({ error: "23514" }, denied).ok, false);
  assert.equal(evaluateExpect({ error: "42501", message_includes: "permission denied" }, denied).ok, true);
  assert.equal(evaluateExpect({ error: "42501", message_includes: "append-only" }, denied).ok, false);
  const fine = { errored: false, rows: [{ a: 1 }], rowCount: 1 };
  assert.equal(evaluateExpect({ error: "42501" }, fine).ok, false, "an expected refusal that did not happen is a failure");
  assert.equal(evaluateExpect({ ok: true }, fine).ok, true);
  assert.equal(evaluateExpect({ ok: true }, denied).ok, false);
});

test("evaluateExpect: denied_or_rows accepts a 42501 refusal or an empty result and nothing else", () => {
  const e = { denied_or_rows: 0 };
  assert.equal(evaluateExpect(e, { errored: true, code: "42501", rows: [], rowCount: null }).ok, true);
  assert.equal(evaluateExpect(e, { errored: false, rows: [], rowCount: 0 }).ok, true);
  assert.equal(evaluateExpect(e, { errored: false, rows: [], rowCount: 0, command: "UPDATE" }).ok, true);
  assert.equal(evaluateExpect(e, { errored: false, rows: [{ x: 1 }], rowCount: 1 }).ok, false);
  assert.equal(evaluateExpect(e, { errored: false, rows: [], rowCount: 2 }).ok, false, "an UPDATE that touched rows is a leak");
  assert.equal(evaluateExpect(e, { errored: true, code: "23505", rows: [], rowCount: null }).ok, false, "the wrong error is not a refusal");
});

test("evaluateExpect: rows, rows_min, row_count, equals, includes", () => {
  const obs = { errored: false, rows: [{ refused: true, reason: "refused: 9 organisations, minimum 10", n: 0 }], rowCount: 1 };
  assert.equal(evaluateExpect({ rows: 1 }, obs).ok, true);
  assert.equal(evaluateExpect({ rows: 0 }, obs).ok, false);
  assert.equal(evaluateExpect({ rows_min: 1 }, obs).ok, true);
  assert.equal(evaluateExpect({ rows_min: 2 }, obs).ok, false);
  assert.equal(evaluateExpect({ row_count: 1 }, obs).ok, true);
  assert.equal(evaluateExpect({ equals: { refused: "true", n: "0" } }, obs).ok, true);
  assert.equal(evaluateExpect({ equals: { refused: "false" } }, obs).ok, false);
  assert.equal(evaluateExpect({ includes: { reason: "minimum 10" } }, obs).ok, true);
  assert.equal(evaluateExpect({ includes: { reason: "dominance" } }, obs).ok, false);
  assert.equal(evaluateExpect({ equals: { refused: "true" } }, { errored: false, rows: [], rowCount: 0 }).ok, false, "no row to compare is a failure");
});

test("evaluateExpect: a mismatch note names the column and never carries the database value", () => {
  const secret = "SECRET-TITLE-OF-A-REAL-ITEM";
  const r = evaluateExpect({ equals: { full_brief: "expected text" } }, { errored: false, rows: [{ full_brief: secret }], rowCount: 1 });
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes(secret), "the report must not contain the stored value");
  assert.match(r.notes.join(" "), /full_brief/);
  const d = describeObserved({ errored: false, rows: [{ full_brief: secret }], rowCount: 1 });
  assert.ok(!d.includes(secret));
});

test("describeObserved: error code and counts only", () => {
  assert.match(describeObserved({ errored: true, code: "42501", message: "permission denied for table t" }), /42501/);
  assert.match(describeObserved({ errored: false, rows: [{}, {}], rowCount: 2 }), /rows=2/);
});

const denyAttack = () => ({
  id: "x-deny",
  invariant: "a non-admin cannot write",
  expected: "refused with 42501",
  steps: [
    { label: "pick an item", kind: "setup", sql: "SELECT id AS item_id FROM public.t LIMIT 1", expect: { rows_min: 1 }, save: { item_id: "item_id" } },
    { label: "forbidden write", kind: "attack", as: "user:owner_a", sql: "UPDATE public.t SET v = 1 WHERE id = $1::uuid", params: ["@item_id"], expect: { error: "42501" } },
  ],
});

const guardedDb = () =>
  scripted((sql) => {
    if (/^SELECT id AS item_id/.test(sql)) return { rows: [{ item_id: "item-1" }], rowCount: 1 };
    if (/^UPDATE public\.t/.test(sql)) return pgError("42501", "permission denied for table t");
    return undefined;
  });

test("runSqlAttack: a held guard passes; the transaction is rolled back; the saved value reaches the next step", async () => {
  const db = guardedDb();
  const r = await runSqlAttack(db, denyAttack(), { ...CTX });
  assert.equal(r.status, "pass");
  assert.equal(r.steps.length, 2);
  assert.ok(r.steps.every((s) => s.ok));
  const sqls = db.calls.map((c) => c.sql);
  assert.equal(sqls[0], "BEGIN");
  assert.equal(sqls.at(-1), "ROLLBACK", "always rolled back");
  assert.ok(sqls.some((s) => /^SAVEPOINT /.test(s)));
  assert.ok(sqls.some((s) => /^ROLLBACK TO SAVEPOINT /.test(s)), "the refused statement is rolled back to its savepoint");
  const upd = db.calls.find((c) => /^UPDATE public\.t/.test(c.sql));
  assert.deepEqual(upd.params, ["item-1"]);
  assert.ok(db.calls.some((c) => c.sql === "SET LOCAL ROLE authenticated"));
});

test("ATTACK ON THE ATTACKER: a stub that lets the forbidden write through produces a RED result", async () => {
  const leaky = scripted((sql) => {
    if (/^SELECT id AS item_id/.test(sql)) return { rows: [{ item_id: "item-1" }], rowCount: 1 };
    if (/^UPDATE public\.t/.test(sql)) return { rows: [], rowCount: 1 }; // the guard is gone: the write succeeds
    return undefined;
  });
  const r = await runSqlAttack(leaky, denyAttack(), { ...CTX });
  assert.equal(r.status, "fail");
  assert.equal(r.steps[1].ok, false);
  assert.match(r.observed, /forbidden write/);
  assert.equal(leaky.calls.at(-1).sql, "ROLLBACK", "even a leaked write is rolled back");
});

test("a failing setup step stops the attack as NOT EXERCISED and the forbidden step never runs", async () => {
  const empty = scripted((sql) => (/^SELECT id AS item_id/.test(sql) ? { rows: [], rowCount: 0 } : undefined));
  const r = await runSqlAttack(empty, denyAttack(), { ...CTX });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /not exercised/i);
  assert.ok(!empty.calls.some((c) => /^UPDATE public\.t/.test(c.sql)));
});

test("a wrong refusal (the SQLSTATE differs) is a failure, not a pass", async () => {
  const wrong = scripted((sql) => {
    if (/^SELECT id AS item_id/.test(sql)) return { rows: [{ item_id: "item-1" }], rowCount: 1 };
    if (/^UPDATE public\.t/.test(sql)) return pgError("42P01", 'relation "t" does not exist');
    return undefined;
  });
  const r = await runSqlAttack(wrong, denyAttack(), { ...CTX });
  assert.equal(r.status, "fail");
});

test("a control step (the legitimate path) must succeed; a refused control fails the attack", async () => {
  const attack = {
    id: "x-control",
    invariant: "service role path stays open",
    expected: "control passes, attack refused",
    steps: [{ label: "service write", kind: "control", as: "service", sql: "UPDATE public.t SET v = 2", expect: { row_count: 1 } }],
  };
  const open = scripted((sql) => (/^UPDATE/.test(sql) ? { rows: [], rowCount: 1 } : undefined));
  assert.equal((await runSqlAttack(open, attack, { ...CTX })).status, "pass");
  const closed = scripted((sql) => (/^UPDATE/.test(sql) ? pgError("42501", "permission denied") : undefined));
  const r = await runSqlAttack(closed, attack, { ...CTX });
  assert.equal(r.status, "fail", "an attack suite whose legitimate path is also dead is not a proof");
});

test("an unknown fixture reference is reported as a failure of that attack, with the transaction rolled back", async () => {
  const attack = { id: "x-ref", invariant: "i", expected: "e", steps: [{ label: "s", kind: "attack", sql: "SELECT $1::uuid", params: ["@missing"], expect: { ok: true } }] };
  const db = scripted(() => undefined);
  const r = await runSqlAttack(db, attack, { ...CTX });
  assert.equal(r.status, "fail");
  assert.match(r.observed, /missing/);
  assert.equal(db.calls.at(-1).sql, "ROLLBACK");
});
