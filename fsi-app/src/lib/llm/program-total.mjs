// @ts-check
// LEDGER-TOTAL GATE (operator ruling 2026-07-04). The spend-guard ceiling is a PER-PROCESS accumulator
// (spend-guard.mjs runningSpentUsd starts at 0 each run); it does NOT read agent_runs. So a fresh runner
// process would start at $0 and could spend a full ceiling regardless of prior program spend. Before any
// paid call the runner MUST read the PROGRAM total (agent_runs.cost_usd_estimated) and SEED the accumulator,
// so the ceiling accounts for history — "program total ≤ $N", not "this-process spend ≤ $N".
//
// THE TRUNCATION BOUNDARY IS REAL: agent_runs sits at ~1000 rows now, and a single unpaginated PostgREST
// read caps at 1000 → it would UNDER-count the true total → the ceiling would fail to throw. The reader here
// PAGINATES (or a server-side SUM RPC, QUEUED for the DDL window as the durable single-home — not built
// now). The pure sum + the paginated loop are dependency-injected so the red-then-green runs without a DB.

/** Pure: sum cost_usd_estimated across ledger rows (defensive Number()). */
export function sumCostRows(rows) {
  let t = 0;
  for (const r of rows || []) t += Number(r?.cost_usd_estimated) || 0;
  return t;
}

/**
 * PAGINATED program total. `fetchPage(offset, pageSize)` returns up to pageSize rows (each with
 * cost_usd_estimated); the loop advances until a short page. This is what an unpaginated single read gets
 * WRONG once the table exceeds pageSize — it silently returns only the first page and under-counts.
 * @param {(offset:number, pageSize:number) => Promise<Array<{cost_usd_estimated?: number|string}>>} fetchPage
 * @param {number} [pageSize]
 * @returns {Promise<{ total: number, rows: number, pages: number }>}
 */
export async function readProgramTotalPaginated(fetchPage, pageSize = 1000) {
  let total = 0, rows = 0, pages = 0;
  // Defensive page cap: a well-behaved fetchPage (PostgREST .range) returns a short page when exhausted and
  // terminates; a misbehaving one that ignores offset (always a full page) would loop forever. Cap at 10k
  // pages (10M rows at the default size) and throw rather than hang.
  const MAX_PAGES = 10000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    pages += 1;
    total += sumCostRows(page);
    rows += (page?.length || 0);
    if (!page || page.length < pageSize) break;
    if (pages >= MAX_PAGES) throw new Error(`readProgramTotalPaginated: exceeded ${MAX_PAGES} pages — fetchPage is not advancing by offset (would loop forever).`);
  }
  return { total, rows, pages };
}

/**
 * The GATE: does a new paid pass of `estimatedUsd` fit under `capUsd` given the current program total?
 * Pure — the caller supplies the program total (from readProgramTotalPaginated) so this stays testable.
 * @param {number} programTotalUsd
 * @param {number} estimatedUsd
 * @param {number} capUsd
 * @returns {{ ok: boolean, reason: string, headroomUsd: number }}
 */
export function fitsUnderCeiling(programTotalUsd, estimatedUsd, capUsd) {
  const headroomUsd = capUsd - programTotalUsd;
  if (programTotalUsd >= capUsd) {
    return { ok: false, reason: `program total $${programTotalUsd.toFixed(4)} already >= cap $${capUsd.toFixed(2)}`, headroomUsd };
  }
  if (programTotalUsd + estimatedUsd > capUsd) {
    return { ok: false, reason: `program total $${programTotalUsd.toFixed(4)} + est $${estimatedUsd.toFixed(4)} > cap $${capUsd.toFixed(2)} (headroom $${headroomUsd.toFixed(4)})`, headroomUsd };
  }
  return { ok: true, reason: `fits: $${programTotalUsd.toFixed(4)} + $${estimatedUsd.toFixed(4)} <= $${capUsd.toFixed(2)}`, headroomUsd };
}

// ── BATCH PRE-FLIGHT BUFFER (operator ruling 2026-07-04, ceiling-correction delta) ──
// fitsUnderCeiling gates a single paid call right at the ceiling. The batch gate is TIGHTER: it refuses to
// START a batch whose PROJECTED cost (from the running MEASURED average, not an a-priori estimate) would carry
// the program total past a SOFT cap = (ceiling − buffer). The $5 buffer keeps a batch from ever landing the
// program total in the last $5 of real balance. A batch that projects into the buffer STOPS before it starts;
// its items stay covered by their Fork-B event-bound deferrals (the pass resumes on the next top-up), never
// silenced. Never start a batch that projects into the buffer.
export const CEILING_BUFFER_USD = 5;

/**
 * The BATCH gate: may a batch of `batchSize` items START, given the running MEASURED per-item average?
 * Projects programTotal + avg×size and compares to the soft cap (cap − buffer). Pure.
 * @param {number} programTotalUsd   the seeded program total right now
 * @param {number} measuredAvgUsd    running measured per-item average (NOT an a-priori estimate)
 * @param {number} batchSize         items the batch would process
 * @param {number} capUsd            the standing ceiling
 * @param {number} [bufferUsd]       buffer under the ceiling (default CEILING_BUFFER_USD)
 * @returns {{ ok: boolean, reason: string, projectedTotalUsd: number, softCapUsd: number }}
 */
export function projectBatchFitsBuffer(programTotalUsd, measuredAvgUsd, batchSize, capUsd, bufferUsd = CEILING_BUFFER_USD) {
  const projectedTotalUsd = programTotalUsd + (Number(measuredAvgUsd) || 0) * (Number(batchSize) || 0);
  const softCapUsd = capUsd - bufferUsd;
  if (projectedTotalUsd > softCapUsd) {
    return { ok: false, projectedTotalUsd, softCapUsd,
      reason: `STOP before batch: projected total $${projectedTotalUsd.toFixed(4)} (now $${programTotalUsd.toFixed(4)} + avg $${(Number(measuredAvgUsd)||0).toFixed(4)} × ${batchSize}) > soft cap $${softCapUsd.toFixed(2)} (ceiling $${capUsd.toFixed(2)} − buffer $${bufferUsd.toFixed(2)}). Remaining items → Fork-B deferral; resume on top-up.` };
  }
  return { ok: true, projectedTotalUsd, softCapUsd,
    reason: `batch fits: projected $${projectedTotalUsd.toFixed(4)} <= soft cap $${softCapUsd.toFixed(2)}` };
}
