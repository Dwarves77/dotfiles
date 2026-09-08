// The invariant: the remainder read returns the WHOLE remainder, never one server-capped page.
//
// The production defect this would have caught (click-through audit 2026-09-08): /regulations
// printed "All 1031 monitor →" under a band tile reading 1,119 for the same band on the same
// screen. The route asked for `.range(60, 5059)` in one call; PostgREST answered with 1000 rows and
// no error. Case "stops at the server page cap" below fails against the pre-fix single-call shape
// and passes against the paged one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { fetchRemainderPaged, REMAINDER_PAGE_SIZE } = jiti("./logic.ts");

/** A corpus of `total` rows behind a server that never returns more than `serverCap` per response —
 *  PostgREST's db-max-rows, the thing that made the single wide range silently short. */
function cappedCorpus(total, serverCap = REMAINDER_PAGE_SIZE) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `r${i}` }));
  const calls = [];
  return {
    calls,
    fetchPage: async (from, to) => {
      calls.push([from, to]);
      const width = Math.min(to - from + 1, serverCap);
      return { resources: rows.slice(from, from + width), archived: [] };
    },
  };
}

test("the whole remainder comes back, not one server-capped page", async () => {
  const total = 1313;
  const offset = 60;
  const { fetchPage, calls } = cappedCorpus(total);
  const out = await fetchRemainderPaged(fetchPage, offset, 5000);

  assert.equal(out.resources.length, total - offset, "every row past the first-paint page");
  assert.ok(calls.length > 1, "more than one page was walked");
  // The pre-fix shape was exactly one call, and would have yielded the server cap.
  assert.notEqual(out.resources.length, REMAINDER_PAGE_SIZE);
});

test("a band tally over the loaded rows now matches the corpus tally", async () => {
  // The shape of the live defect: 15 CRITICAL + 14 HIGH ahead of 1,119 MODERATE in the RPC's own
  // priority order. Truncating at 1000 rows past the 60-row first page left 1031 MODERATE loaded.
  const bands = [
    ...Array(15).fill("CRITICAL"),
    ...Array(14).fill("HIGH"),
    ...Array(1119).fill("MODERATE"),
    ...Array(165).fill("LOW"),
  ];
  const rows = bands.map((priority, i) => ({ id: `r${i}`, priority }));
  const fetchPage = async (from, to) => ({
    resources: rows.slice(from, from + Math.min(to - from + 1, REMAINDER_PAGE_SIZE)),
    archived: [],
  });

  const firstPaint = rows.slice(0, 60);
  const out = await fetchRemainderPaged(fetchPage, 60, 5000);
  const loaded = [...firstPaint, ...out.resources];

  const moderateLoaded = loaded.filter((r) => r.priority === "MODERATE").length;
  assert.equal(moderateLoaded, 1119, "the list's own Monitor tally equals the corpus figure");
  assert.notEqual(moderateLoaded, 1031, "1031 was the truncated number production printed");
});

test("a short page ends the walk without a wasted extra request", async () => {
  const { fetchPage, calls } = cappedCorpus(1200);
  await fetchRemainderPaged(fetchPage, 0, 5000);
  assert.equal(calls.length, 2, "1000 then 200; the short page proves the end");
});

test("an exact multiple of the page size takes one confirming empty page", async () => {
  const { fetchPage, calls } = cappedCorpus(REMAINDER_PAGE_SIZE);
  const out = await fetchRemainderPaged(fetchPage, 0, 5000);
  assert.equal(out.resources.length, REMAINDER_PAGE_SIZE);
  assert.equal(calls.length, 2, "a full page can never prove it was the last one");
});

test("the cap is a ceiling, not a silent per-request limit", async () => {
  const { fetchPage } = cappedCorpus(5000);
  const out = await fetchRemainderPaged(fetchPage, 0, 2000);
  assert.equal(out.resources.length, 2000);
});

test("a page error stops the walk and is propagated with whatever rows arrived", async () => {
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    if (n === 1) {
      return { resources: Array.from({ length: REMAINDER_PAGE_SIZE }, (_, i) => ({ id: `a${i}` })), archived: [] };
    }
    return { resources: [], archived: [], _error: "rpc down", _fallbackTrigger: "rpc_error" };
  };
  const out = await fetchRemainderPaged(fetchPage, 0, 5000);
  assert.equal(out.resources.length, REMAINDER_PAGE_SIZE);
  assert.equal(out._error, "rpc down");
  assert.equal(out._fallbackTrigger, "rpc_error");
  assert.equal(n, 2);
});

test("archived rows count toward the page width, because they share one underlying row page", async () => {
  const fetchPage = async (from, to) => {
    const width = Math.min(to - from + 1, REMAINDER_PAGE_SIZE);
    if (from > 0) return { resources: [], archived: [] };
    const half = width / 2;
    return {
      resources: Array.from({ length: half }, (_, i) => ({ id: `a${i}` })),
      archived: Array.from({ length: half }, (_, i) => ({ id: `z${i}` })),
    };
  };
  const out = await fetchRemainderPaged(fetchPage, 0, 5000);
  assert.equal(out.resources.length + out.archived.length, REMAINDER_PAGE_SIZE);
});
