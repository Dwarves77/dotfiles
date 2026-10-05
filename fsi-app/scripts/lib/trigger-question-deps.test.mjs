// trigger-question-deps.test.mjs, lane L4-A: the shared deps builder, over a fake db module. Proves the
// two callers (flywheel mint-time step, drain change-time step) get the same read filter and the same
// guarded writer, differing only in the cite.
import test from "node:test";
import assert from "node:assert/strict";
import { buildTriggerQuestionsDeps } from "./trigger-question-deps.mjs";
import { main, CITE } from "../../src/lib/learning/trigger-questions.mjs";

function fakeDb() {
  const calls = { readAll: [], insert: [] };
  const qb = { filters: [], eq(c, v) { this.filters.push(["eq", c, v]); return this; }, like(c, v) { this.filters.push(["like", c, v]); return this; } };
  return {
    calls,
    async readAll(table, cols, { match }) { const q = { ...qb, filters: [] }; match(q); calls.readAll.push({ table, cols, filters: q.filters }); return []; },
    async guardedInsertMany(table, rows, opts) { calls.insert.push({ table, rows, opts }); return { inserted: rows.length, snapshot: "s" }; },
  };
}

test("readExistingOpen reads open question: flags from integrity_flags", async () => {
  const db = fakeDb();
  await buildTriggerQuestionsDeps(db).readExistingOpen();
  assert.equal(db.calls.readAll[0].table, "integrity_flags");
  assert.deepEqual(db.calls.readAll[0].filters, [["eq", "status", "open"], ["like", "created_by", "question:%"]]);
});

test("insertMany writes through guardedInsertMany with the mint cite by default and a caller cite when given", async () => {
  const db = fakeDb();
  await buildTriggerQuestionsDeps(db).insertMany([{ a: 1 }]);
  assert.equal(db.calls.insert[0].table, "integrity_flags");
  assert.equal(db.calls.insert[0].opts.cite, CITE);
  const other = { skill: "x", reason: "y" };
  await buildTriggerQuestionsDeps(db, { cite: other }).insertMany([{ a: 1 }]);
  assert.equal(db.calls.insert[1].opts.cite, other);
});

test("the mint-time main() writes through the shared builder end to end", async () => {
  const db = fakeDb();
  const s = await main({ mode: "apply", items: [{ id: "i1", title: "T", domain: 1 }] }, buildTriggerQuestionsDeps(db));
  assert.equal(s.applied, 4);
  assert.equal(db.calls.insert[0].rows.length, 4);
});
