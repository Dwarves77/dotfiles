// backfill-source-type.test.mjs — planBackfill() (pure) + main() against a hand-rolled fake deps object
// (no real database, no supabase-js — see screen-reconcile-records.mjs for the same pattern this mirrors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBackfill, main, CITE } from "./backfill-source-type.mjs";

const ROWS = [
  { id: "s1", name: "US Environmental Protection Agency", url: "https://www.epa.gov", source_type: null },
  { id: "s2", name: "US Congress", url: "https://www.congress.gov", source_type: null },
  { id: "s3", name: "Bundestag", url: "https://www.bundestag.de", source_type: null },
  { id: "s4", name: "FreightWaves", url: "https://www.freightwaves.com", source_type: null }, // unclassifiable
  { id: "s5", name: "Already Tagged Co", url: "https://example.com/already", source_type: ["news"] }, // pre-classified
  { id: "s6", name: "Umweltbundesamt", url: "https://www.umweltbundesamt.de", source_type: [] }, // empty array treated as not-yet-classified
];

test("planBackfill: groups rows by identical resulting type array, tallies distribution, separates unclassifiable", () => {
  const plan = planBackfill(ROWS);
  assert.equal(plan.alreadyClassified.length, 1);
  assert.equal(plan.alreadyClassified[0].id, "s5");
  assert.equal(plan.unclassifiable.length, 1);
  assert.equal(plan.unclassifiable[0].id, "s4");
  // s1 -> [environmental_body], s2+s3 -> [legislature], s6 -> [environmental_body]: 3 groups
  assert.equal(plan.writeGroups.length, 2); // [environmental_body] group (s1, s6) and [legislature] group (s2, s3)
  assert.equal(plan.toWriteCount, 4);
  const envGroup = plan.writeGroups.find((g) => g.types.includes("environmental_body"));
  assert.deepEqual(new Set(envGroup.ids), new Set(["s1", "s6"]));
  const legGroup = plan.writeGroups.find((g) => g.types.includes("legislature"));
  assert.deepEqual(new Set(legGroup.ids), new Set(["s2", "s3"]));
  assert.equal(plan.distribution.environmental_body, 2); // s1, s6
  assert.equal(plan.distribution.legislature, 2); // s2, s3
  assert.equal(plan.distribution.news, 1); // s5, already-classified, still counted
  assert.equal(plan.distribution.gazette, 0);
});

test("planBackfill: empty input -> zero everything, no throw", () => {
  const plan = planBackfill([]);
  assert.equal(plan.toWriteCount, 0);
  assert.equal(plan.writeGroups.length, 0);
  assert.equal(plan.unclassifiable.length, 0);
  assert.equal(plan.alreadyClassified.length, 0);
  for (const v of Object.values(plan.distribution)) assert.equal(v, 0);
});

test("planBackfill: undefined/null input does not throw", () => {
  assert.doesNotThrow(() => planBackfill(undefined));
  assert.doesNotThrow(() => planBackfill(null));
});

test("main: dry-run never calls guardedUpdateByIds", async () => {
  let called = false;
  const deps = {
    readAll: async () => ROWS,
    guardedUpdateByIds: async () => { called = true; return { updated: 0 }; },
  };
  const summary = await main({ apply: false }, deps);
  assert.equal(called, false);
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.written, 0);
  assert.equal(summary.to_write, 4);
  assert.equal(summary.already_classified, 1);
  assert.equal(summary.unclassifiable, 1);
});

test("main: --apply calls guardedUpdateByIds once per distinct type-group, with a valid cite and a NULL applyMatch guard", async () => {
  const calls = [];
  const deps = {
    readAll: async () => ROWS,
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push({ table, ids: [...ids], patch, opts });
      return { updated: ids.length };
    },
  };
  const summary = await main({ apply: true }, deps);
  assert.equal(summary.mode, "apply");
  assert.equal(calls.length, 2); // one per distinct group
  for (const c of calls) {
    assert.equal(c.table, "sources");
    assert.ok(Array.isArray(c.patch.source_type) && c.patch.source_type.length > 0);
    assert.deepEqual(c.opts.cite, CITE);
    assert.equal(typeof c.opts.applyMatch, "function");
  }
  assert.equal(summary.written, 4); // 2 + 2 rows across the two groups
});

test("main: nothing to write (all already classified or unclassifiable) -> apply is a no-op, guardedUpdateByIds never called", async () => {
  let called = false;
  const rows = [
    { id: "s5", name: "x", url: "https://example.com", source_type: ["news"] },
    { id: "s4", name: "FreightWaves", url: "https://www.freightwaves.com", source_type: null },
  ];
  const deps = {
    readAll: async () => rows,
    guardedUpdateByIds: async () => { called = true; return { updated: 0 }; },
  };
  const summary = await main({ apply: true }, deps);
  assert.equal(called, false);
  assert.equal(summary.written, 0);
  assert.equal(summary.to_write, 0);
});

test("CITE carries the skill/reason shape db.mjs's guardedUpdateByIds requires", () => {
  assert.equal(typeof CITE.skill, "string");
  assert.ok(CITE.skill.length > 0);
  assert.equal(typeof CITE.reason, "string");
  assert.ok(CITE.reason.length > 0);
});
