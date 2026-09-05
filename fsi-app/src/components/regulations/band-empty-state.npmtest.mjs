// FIRSTPAGE lane (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §14), refined by PERF-13
// (2026-09-04, docs/audits/perf-clickthrough-2026-09-04.md §(g)). Pins bandEmptyState's contract.
//
// Live evidence this guards against, generation 1 [CONFIRMED, production carosledge.com, 2026-09-04
// ~08:15 UTC, coordinator capture]: the "Immediate" band (13 total) and "Action" band (12 total)
// both showed "No matching regulations in this band." while the page's own masthead still read
// "Loading the full ledger…" and zero rows had been filtered by anything.
//
// Live evidence this guards against, generation 2 [CONFIRMED, production carosledge.com, 2026-09-04
// 23:10-23:20 UTC, coordinator capture]: the "Awareness" band (169 total) showed "Loading 169
// regulations…" for the entire session even though no fetch was ever in flight FOR that band
// specifically — `hasNextPage` alone (true for most of a multi-minute priority-ordered cursor walk)
// is not evidence of an active request. This test proves the function distinguishes "a fetch is
// literally in flight" from "more pages exist somewhere down the line", and never claims "Loading"
// for the latter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { bandEmptyState } = await jiti.import("./band-empty-state.ts");

const NO_MATCH = "No matching regulations in this band.";

function base(overrides = {}) {
  return {
    total: 13,
    isFetchingNextPage: false,
    hasNextPage: false,
    isFetchNextPageError: false,
    initialLoadPending: false,
    anyFilterActive: false,
    ...overrides,
  };
}

test("generation-1 live-defect shape: total>0, a fetch is actually in flight, no filter -> honest loading text", () => {
  const state = bandEmptyState(base({ isFetchingNextPage: true, hasNextPage: true }));
  assert.equal(state.kind, "loading");
  assert.equal(state.text, "Loading 13 regulations…");
  assert.notEqual(state.text, NO_MATCH);
});

test("singular count: total=1 reads 'regulation', not 'regulations'", () => {
  const state = bandEmptyState(base({ total: 1, isFetchingNextPage: true, hasNextPage: true }));
  assert.equal(state.text, "Loading 1 regulation…");
});

test("initial ledger page still resolving: also 'loading', even though no fetchNextPage is in flight yet", () => {
  const state = bandEmptyState(base({ initialLoadPending: true, hasNextPage: true }));
  assert.equal(state.kind, "loading");
});

test("generation-2 live-defect shape (§(g)): total>0, hasNextPage true, but NOTHING is in flight right now -> 'ready', never 'loading'", () => {
  const state = bandEmptyState(base({ total: 169, hasNextPage: true, isFetchingNextPage: false }));
  assert.equal(state.kind, "ready");
  assert.equal(state.text, "169 regulations in this band — not loaded yet.");
  assert.equal(state.total, 169);
  assert.notEqual(state.text.startsWith("Loading"), true);
});

test("stream exhausted (hasNextPage=false) with a fetchNextPage error still pending: 'error', not silently 'done'", () => {
  const state = bandEmptyState(base({ hasNextPage: false, isFetchNextPageError: true }));
  assert.equal(state.kind, "error");
});

test("stream exhausted with a positive total this band never received (no error flagged either): 'error', not 'No matching'", () => {
  const state = bandEmptyState(base({ hasNextPage: false, isFetchNextPageError: false }));
  assert.equal(state.kind, "error");
  assert.match(state.text, /expected in this band but none loaded/);
});

test("filter active during load: 'no-match' — a filter narrowing the band to zero IS a real 'no match', even mid-fetch", () => {
  const state = bandEmptyState(base({ isFetchingNextPage: true, hasNextPage: true, anyFilterActive: true }));
  assert.equal(state.kind, "no-match");
  assert.equal(state.text, NO_MATCH);
});

test("genuinely empty band (total=0): 'no-match' regardless of fetch state — nothing was ever going to load", () => {
  assert.equal(bandEmptyState(base({ total: 0, isFetchingNextPage: true, hasNextPage: true })).kind, "no-match");
  assert.equal(bandEmptyState(base({ total: 0, hasNextPage: false })).kind, "no-match");
});

test("done + no filter + total>0, rows never arrived is covered by 'error' above — a band with rows.length===0 only ever calls this when it is empty", () => {
  // Documents the call-site contract: RegulationsLedger.tsx only calls bandEmptyState when
  // rows.length === 0, so "loaded and truly empty" is represented by total===0 -> no-match, never a
  // fifth state — there is no "successfully loaded, still zero, no total mismatch" case to name.
  assert.equal(bandEmptyState(base({ total: 0 })).kind, "no-match");
});
