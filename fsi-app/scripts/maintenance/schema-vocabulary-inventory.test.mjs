// Tests for schema-vocabulary-inventory.mjs (D7). Dependency-injected: no DB, no filesystem writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, QUERY } from "./schema-vocabulary-inventory.mjs";

test("QUERY matches the plan's exact query (docs/plans/defect-fix-plan-2026-09-12.md, D7)", () => {
  assert.ok(/select conrelid::regclass as tbl, conname, pg_get_constraintdef\(oid\) as def/i.test(QUERY));
  assert.ok(/from pg_constraint/i.test(QUERY));
  assert.ok(/contype = 'c'/i.test(QUERY));
  assert.ok(/connamespace = 'public'::regnamespace/i.test(QUERY));
  assert.ok(QUERY.includes("ANY \\(ARRAY"));
  assert.ok(/order by 1, 2/i.test(QUERY));
});

test("main: apply mode is refused before any DB call, exits 0 with a note", async () => {
  let called = false;
  const deps = { query: async () => { called = true; return { rows: [] }; } };
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(called, false);
  assert.equal(summary.exitCode, 0);
  assert.ok(/READ-ONLY/i.test(summary.note));
});

test("main: dry mode queries, parses, and writes the inventory doc", async () => {
  const rows = [
    { tbl: "provisional_sources", conname: "provisional_sources_status_check", def: "CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text])))" },
    { tbl: "sources", conname: "sources_tier_check", def: "CHECK ((tier BETWEEN 1 AND 7))" }, // not ANY(ARRAY): live query would never return this, but the parser must still not crash on it
  ];
  let queried = null;
  let written = null;
  const deps = {
    query: async (sql) => { queried = sql; return { rows }; },
    writeFile: (path, content) => { written = { path, content }; },
    now: () => new Date("2026-09-12T00:00:00.000Z"),
  };
  const summary = await main({ mode: "dry" }, deps);

  assert.equal(queried, QUERY);
  assert.ok(written.path.endsWith("db-check-constraints.json"));
  const doc = JSON.parse(written.content);
  assert.equal(doc.source, "live");
  assert.equal(doc.generated, "2026-09-12T00:00:00.000Z");
  assert.equal(doc.constraints.length, 2);
  assert.deepEqual(doc.constraints[0], {
    table: "provisional_sources",
    column: "status",
    constraint: "provisional_sources_status_check",
    allowed: ["pending_review", "confirmed"],
  });
  assert.equal(doc.constraints[1].allowed, null);
  assert.equal(doc.constraints[1].unparsed, "CHECK ((tier BETWEEN 1 AND 7))");

  assert.equal(summary.counts.constraints, 2);
  assert.equal(summary.counts.unparsed, 1);
  assert.equal(summary.counts.tables, 2);
  assert.ok(/could not be parsed/i.test(summary.note));
});

test("main: dry mode with zero unparsed rows carries no note", async () => {
  const rows = [{ tbl: "sources", conname: "sources_status_check", def: "CHECK ((status = ANY (ARRAY['active'::text, 'stale'::text])))" }];
  const deps = { query: async () => ({ rows }), writeFile: () => {} };
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.unparsed, 0);
  assert.equal(summary.note, undefined);
});
