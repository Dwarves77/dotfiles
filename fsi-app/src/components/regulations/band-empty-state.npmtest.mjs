// FIRSTPAGE lane (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §14): pins
// bandEmptyStateText's contract. Live evidence this guards against
// [CONFIRMED, production carosledge.com, 2026-09-04 ~08:15 UTC, coordinator capture]: the "Immediate"
// band (13 total) and "Action" band (12 total) both showed "No matching regulations in this band."
// while the page's own masthead still read "Loading the full ledger…" and zero rows had been
// filtered by anything — this test proves the function no longer produces that string in the
// equivalent state (total>0, restStatus="loading", no filter), and still produces it in every case
// where "no match" is actually true.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { bandEmptyStateText } = await jiti.import("./band-empty-state.ts");

const NO_MATCH = "No matching regulations in this band.";

test("live-defect shape: total>0, loading, no filter → honest loading text, never 'No matching'", () => {
  const text = bandEmptyStateText({ total: 13, restStatus: "loading", anyFilterActive: false });
  assert.equal(text, "Loading 13 regulations…");
  assert.notEqual(text, NO_MATCH);
});

test("singular count: total=1 reads 'regulation', not 'regulations'", () => {
  assert.equal(
    bandEmptyStateText({ total: 1, restStatus: "loading", anyFilterActive: false }),
    "Loading 1 regulation…"
  );
});

test("load finished (restStatus='done'): 'No matching' even though total>0 — a true empty band after full load", () => {
  assert.equal(
    bandEmptyStateText({ total: 13, restStatus: "done", anyFilterActive: false }),
    NO_MATCH
  );
});

test("load errored (restStatus='error'): 'No matching', not an indefinite 'Loading' claim", () => {
  assert.equal(
    bandEmptyStateText({ total: 13, restStatus: "error", anyFilterActive: false }),
    NO_MATCH
  );
});

test("filter active during load: 'No matching' — a filter narrowing the band to zero IS a real 'no match'", () => {
  assert.equal(
    bandEmptyStateText({ total: 13, restStatus: "loading", anyFilterActive: true }),
    NO_MATCH
  );
});

test("genuinely empty band (total=0): 'No matching' regardless of load state — nothing was ever going to load", () => {
  assert.equal(
    bandEmptyStateText({ total: 0, restStatus: "loading", anyFilterActive: false }),
    NO_MATCH
  );
  assert.equal(
    bandEmptyStateText({ total: 0, restStatus: "done", anyFilterActive: false }),
    NO_MATCH
  );
});

test("done + no filter + total>0 is the normal steady-state 'true no match' case", () => {
  assert.equal(
    bandEmptyStateText({ total: 168, restStatus: "done", anyFilterActive: false }),
    NO_MATCH
  );
});
