import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main, CITE } from "./indexation-producer.mjs";

const FIXTURE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "indexation_clauses.csv"), "utf8");
const ORG_ID = "00000000-0000-0000-0000-0000000000f1";

test("dry run, no CSV given: zero to insert, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("dry run: carries a computed worked example (spec 09 §1.3's own requirement) regardless of CSV", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.worked_example.result.label, "estimate");
  assert.equal(typeof s.worked_example.result.value, "number");
});

test("dry run with fixture CSV: accepts good rows, rejects an inverted band and a missing index_id", async () => {
  const s = await main({ mode: "dry" }, { csvText: FIXTURE, orgId: ORG_ID });
  assert.equal(s.counts.to_insert, 3);
  assert.equal(s.counts.rejected, 2);
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /floor_pct must be <= cap_pct/.test(e))));
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /index_id is required/.test(e))));
});

test("apply run with fixture CSV: inserts only the accepted rows, org-scoped, with a valid cite", async () => {
  let called = null;
  const deps = {
    csvText: FIXTURE,
    orgId: ORG_ID,
    guardedInsertMany: async (table, rows, opts) => {
      called = { table, rows, opts };
      return { inserted: rows.length, rows: rows.map((r, i) => ({ id: `idx-${i}`, ...r })) };
    },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 3);
  assert.equal(called.table, "indexation_clauses");
  assert.equal(called.rows.length, 3);
  for (const row of called.rows) assert.equal(row.org_id, ORG_ID);
  assert.equal(called.opts.cite, CITE);
});
