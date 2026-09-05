import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main, CITE } from "./surcharge-audit-producer.mjs";

const FIXTURE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "surcharge_audits.csv"), "utf8");
const ORG_ID = "00000000-0000-0000-0000-0000000000f1";

test("dry run, no CSV given: reports zero to insert, writes nothing, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.mode, "dry");
  assert.equal(s.counts.to_insert, 0);
  assert.equal(s.applied, 0);
  assert.match(s.gap, /SOURCES\.md/);
  assert.match(s.gap, /carrier invoice/);
  assert.equal(s.exitCode, 0);
});

test("csvText without orgId: refuses rather than silently defaulting the org", async () => {
  const s = await main({ mode: "dry" }, { csvText: FIXTURE });
  assert.equal(s.exitCode, 1);
  assert.match(s.error, /orgId is required/);
});

test("dry run with fixture CSV: accepts good rows, rejects bad ones with reasons, writes nothing", async () => {
  const s = await main({ mode: "dry" }, { csvText: FIXTURE, orgId: ORG_ID });
  assert.equal(s.counts.to_insert, 2);
  assert.equal(s.counts.rejected, 3);
  assert.equal(s.applied, 0);
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /billed_eur must be between 0/.test(e))));
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /carrier_id is required/.test(e))));
  assert.ok(s.rejected.some((r) => r.errors.some((e) => /statutory_derivation must be one of/.test(e))));
});

test("apply run with fixture CSV: inserts only the accepted rows, org-scoped, with a valid cite", async () => {
  const calls = [];
  const deps = {
    csvText: FIXTURE,
    orgId: ORG_ID,
    guardedInsertMany: async (table, rows, opts) => {
      calls.push({ table, rows, opts });
      if (!opts?.cite?.skill || !opts?.cite?.reason) throw new Error("missing cite");
      return { inserted: rows.length, rows: rows.map((r, i) => ({ id: `sa-${i}`, ...r })) };
    },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "surcharge_audits");
  assert.equal(calls[0].rows.length, 2);
  for (const row of calls[0].rows) assert.equal(row.org_id, ORG_ID);
  assert.equal(calls[0].opts.cite, CITE);
  assert.equal(s.read_back.inserted_ids.length, 2);
});

test("apply run with no deps.guardedInsertMany and no CSV: does not throw, applied stays 0", async () => {
  const s = await main({ mode: "apply" }, {});
  assert.equal(s.applied, 0);
});
