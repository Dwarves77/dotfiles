import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { main, CITE, applyHoldRiskDefault } from "./eudr-custody-producer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EUDR_FIXTURE = readFileSync(resolve(HERE, "fixtures", "eudr_plot_claims.csv"), "utf8");
const CUSTODY_FIXTURE = readFileSync(resolve(HERE, "fixtures", "custody_chains.csv"), "utf8");
const ORG_ID = "00000000-0000-0000-0000-0000000000f1";

test("dry run, no CSV given for either table: zero to insert, names the gap", async () => {
  const s = await main({ mode: "dry" }, {});
  assert.equal(s.counts.to_insert_eudr_plot_claims, 0);
  assert.equal(s.counts.to_insert_custody_chains, 0);
  assert.match(s.gap, /SOURCES\.md/);
});

test("applyHoldRiskDefault: missing/malformed -> border_hold, fails_cutoff -> documentary, valid -> none", () => {
  assert.equal(applyHoldRiskDefault("missing"), "border_hold");
  assert.equal(applyHoldRiskDefault("malformed"), "border_hold");
  assert.equal(applyHoldRiskDefault("fails_cutoff"), "documentary");
  assert.equal(applyHoldRiskDefault("valid"), "none");
});

test("dry run: eudr_plot_claims fixture accepts good rows, rejects bad JSON/enum", async () => {
  const s = await main({ mode: "dry" }, { eudrCsvText: EUDR_FIXTURE, orgId: ORG_ID });
  assert.equal(s.counts.to_insert_eudr_plot_claims, 4);
  assert.equal(s.counts.rejected_eudr_plot_claims, 2);
  assert.ok(s.rejected.eudr_plot_claims.some((r) => r.errors.some((e) => /geometry_json must be valid JSON/.test(e))));
  assert.ok(s.rejected.eudr_plot_claims.some((r) => r.errors.some((e) => /validation_state must be one of/.test(e))));
});

test("dry run: custody_chains fixture accepts good rows, rejects unverifiable retirements and a bad enum", async () => {
  const s = await main({ mode: "dry" }, { custodyCsvText: CUSTODY_FIXTURE, orgId: ORG_ID });
  assert.equal(s.counts.to_insert_custody_chains, 2);
  assert.equal(s.counts.rejected_custody_chains, 3);
  assert.ok(s.rejected.custody_chains.some((r) => r.errors.some((e) => /must both be present or both be empty/.test(e))));
  assert.ok(s.rejected.custody_chains.some((r) => r.errors.some((e) => /double_count_check must be one of/.test(e))));
});

test("apply run with both fixtures: inserts accepted rows on both tables, org-scoped, blank hold_risk defaulted", async () => {
  const calls = [];
  const deps = {
    eudrCsvText: EUDR_FIXTURE,
    custodyCsvText: CUSTODY_FIXTURE,
    orgId: ORG_ID,
    guardedInsertMany: async (table, rows, opts) => {
      calls.push({ table, rows, opts });
      return { inserted: rows.length, rows: rows.map((r, i) => ({ id: `${table}-${i}`, ...r })) };
    },
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.applied, 6); // 4 eudr_plot_claims + 2 custody_chains
  assert.equal(calls.length, 2);
  const eudrCall = calls.find((c) => c.table === "eudr_plot_claims");
  const custodyCall = calls.find((c) => c.table === "custody_chains");
  assert.equal(eudrCall.rows.length, 4);
  assert.equal(custodyCall.rows.length, 2);
  for (const row of [...eudrCall.rows, ...custodyCall.rows]) assert.equal(row.org_id, ORG_ID);
  // Fixture's row 6 (CONSIG-2026-0096) leaves hold_risk blank with validation_state=valid — the
  // write-time default must have filled it (never left null on an accepted row).
  const defaulted = eudrCall.rows.find((r) => r.consignment_ref === "CONSIG-2026-0096");
  assert.ok(defaulted, "expected CONSIG-2026-0096 among the accepted rows");
  assert.equal(defaulted.hold_risk, "none");
  assert.equal(eudrCall.opts.cite, CITE);
  assert.equal(custodyCall.opts.cite, CITE);
});

test("csv given without orgId: refuses rather than silently defaulting the org", async () => {
  const s = await main({ mode: "dry" }, { eudrCsvText: EUDR_FIXTURE });
  assert.equal(s.exitCode, 1);
  assert.match(s.error, /orgId is required/);
});
