import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main, CITE } from "./dqi-producer.mjs";

const FIXTURE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "tce_data_quality.csv"), "utf8");
const ORG_ID = "00000000-0000-0000-0000-0000000000f1";

test("dry run, no CSV given: zero to insert, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("dry run with fixture CSV: accepts good rows, rejects out-of-range/missing axes", async () => {
  const s = await main({ mode: "dry" }, { csvText: FIXTURE, orgId: ORG_ID });
  assert.equal(s.counts.to_insert, 2);
  assert.equal(s.counts.rejected, 3);
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /reliability must be between 1 and 5/.test(e))));
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /primary_data_share must be between 0 and 1/.test(e))));
});

test("apply run with fixture CSV: inserts only the accepted rows, org-scoped, with a valid cite", async () => {
  let called = null;
  const deps = {
    csvText: FIXTURE,
    orgId: ORG_ID,
    guardedInsertMany: async (table, rows, opts) => {
      called = { table, rows, opts };
      return { inserted: rows.length, rows: rows.map((r, i) => ({ id: `dqi-${i}`, ...r })) };
    },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 2);
  assert.equal(called.table, "tce_data_quality");
  assert.equal(called.rows.length, 2);
  for (const row of called.rows) assert.equal(row.org_id, ORG_ID);
  assert.equal(called.opts.cite, CITE);
});
