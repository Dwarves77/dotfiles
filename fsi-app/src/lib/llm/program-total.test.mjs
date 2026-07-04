// @ts-check
// Red-then-green for the LEDGER-TOTAL GATE (operator ruling 2026-07-04). The agent_runs table exceeds the
// 1000-row PostgREST cap, so a single unpaginated read UNDER-counts the program total → the ceiling would
// fail to throw. Proven here on a synthetic >1000-row ledger: the paginated read catches the TRUE total (and
// the seeded ceiling throws); a single-page read misses the tail (RED).

import { test } from "node:test";
import assert from "node:assert/strict";
import { sumCostRows, readProgramTotalPaginated, fitsUnderCeiling, projectBatchFitsBuffer, CEILING_BUFFER_USD } from "./program-total.mjs";
import { assertBudget, seedSpend, __resetSpendForTest } from "./spend-guard.mjs";

// A synthetic ledger of 1200 rows × $0.01 = $12.00 total. The first 1000-row page sums to $10.00.
const LEDGER = Array.from({ length: 1200 }, () => ({ cost_usd_estimated: 0.01 }));
const fetchPage = async (offset, pageSize) => LEDGER.slice(offset, offset + pageSize);

test("sumCostRows is a defensive numeric sum", () => {
  assert.equal(sumCostRows([{ cost_usd_estimated: 1.5 }, { cost_usd_estimated: "2.25" }, {}]), 3.75);
  assert.equal(sumCostRows(null), 0);
});

test("RED: a single unpaginated read (PostgREST 1000-row cap) MISSES the tail — under-counts the true total", async () => {
  // The OLD bug the ledger gate fixes: read only the first page and sum it (what an unpaginated
  // .from('agent_runs').select() does once the table exceeds 1000 rows).
  const firstPageOnly = sumCostRows(await fetchPage(0, 1000));
  assert.equal(Number(firstPageOnly.toFixed(2)), 10.0); // $10, silently missing the $2 tail
});

test("GREEN: the paginated read catches ALL 1200 rows and the TRUE $12.00 total", async () => {
  const good = await readProgramTotalPaginated(fetchPage, 1000);
  assert.equal(good.rows, 1200);
  assert.equal(good.pages, 2);
  assert.equal(Number(good.total.toFixed(2)), 12.0);
});

test("CEILING throws at the TRUE seeded total, not the truncated one — the whole point", () => {
  const cap = 11;
  // BUG path: ceiling seeded with the under-counted $10 → a $0.25 pass wrongly PASSES (RED).
  __resetSpendForTest();
  seedSpend(10.0);
  assert.doesNotThrow(() => assertBudget({ purpose: "proof sample", budgetCapUsd: cap }, cap),
    "with the truncated $10 seed the ceiling wrongly allows the pass");
  // FIXED path: ceiling seeded with the TRUE $12 → over the $11 cap → THROWS (GREEN).
  __resetSpendForTest();
  seedSpend(12.0);
  assert.throws(() => assertBudget({ purpose: "proof sample", budgetCapUsd: cap }, cap), /SPEND_CEILING/);
  __resetSpendForTest();
});

test("fitsUnderCeiling: the pre-paid-call verification (program total + estimate vs cap)", () => {
  assert.equal(fitsUnderCeiling(9.87, 0.25, 11).ok, true);      // $9.87 + $0.25 <= $11
  assert.equal(fitsUnderCeiling(9.87, 1.5, 11).ok, false);      // would exceed
  assert.equal(fitsUnderCeiling(11.0, 0.01, 11).ok, false);     // already at cap
  assert.match(fitsUnderCeiling(11.0, 0.01, 11).reason, /already >= cap/);
});

// ── BATCH PRE-FLIGHT BUFFER (ceiling-correction delta 2026-07-04) ──
test("projectBatchFitsBuffer: STOPS a batch that projects into the $5 buffer under the $85 ceiling", () => {
  assert.equal(CEILING_BUFFER_USD, 5);
  const cap = 85; // soft cap = $80
  // measured ground-only ≈ $1/item. From $10.90, a 60-item batch projects to $70.90 — fits under $80.
  const ok = projectBatchFitsBuffer(10.90, 1.0, 60, cap);
  assert.equal(ok.ok, true);
  assert.equal(Number(ok.softCapUsd.toFixed(2)), 80.0);
  assert.equal(Number(ok.projectedTotalUsd.toFixed(2)), 70.90);
  // A 75-item batch from $10.90 projects to $85.90 — PAST the $80 soft cap → STOP before the batch.
  const stop = projectBatchFitsBuffer(10.90, 1.0, 75, cap);
  assert.equal(stop.ok, false);
  assert.match(stop.reason, /STOP before batch/);
  assert.match(stop.reason, /Fork-B/);
  // The boundary: projecting exactly TO the soft cap is allowed; one cent past is not.
  assert.equal(projectBatchFitsBuffer(79.0, 1.0, 1, cap).ok, true);   // → $80.00, == soft cap
  assert.equal(projectBatchFitsBuffer(79.5, 1.0, 1, cap).ok, false);  // → $80.50, past soft cap
});
