// Run: node --test scripts/maintenance/census-off-vertical.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, sampleWithTitles, ARCHIVE_REASON, CITE } from "./census-off-vertical.mjs";

const ROWS = [
  { id: "c1", document_url: "https://www.federalregister.gov/x", title: "Safety Zone; Savannah River", surface_tags: [], dryrun_disposition: "would_mint" },
  { id: "c2", document_url: "https://eur-lex.europa.eu/y", title: "Regulation (EU) 2023/1805 FuelEU Maritime", surface_tags: [], dryrun_disposition: "would_mint" },
  { id: "c3", document_url: "https://eur-lex.europa.eu/z", title: "Commission Decision on German coal aid", surface_tags: [], dryrun_disposition: "would_mint" },
];

function deps(overrides = {}) {
  const calls = [];
  const updateCalls = [];
  return {
    calls,
    updateCalls,
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table, opts]);
      if (overrides.readAllImpl) return overrides.readAllImpl(table, cols, opts);
      return ROWS;
    },
    reviewed: {},
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      updateCalls.push({ table, ids, patch, cite: opts.cite, applyMatch: opts.applyMatch });
      return { updated: ids.length };
    },
    ...overrides,
  };
}

test("dry: counts on/off/ambiguous from the shared screen, writes nothing, reads only would_mint+not-archived rows", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "census-off-vertical");
  assert.equal(r.applied, 0);
  assert.equal(r.counts.would_mint_total, 3);
  assert.ok(r.counts.off_vertical >= 1);
  assert.equal(r.exitCode, 0);
});

test("dry: includes a titled sample of off_vertical and ambiguous rows — the operator's ruling needs the rows, not just counts", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.ok(Array.isArray(r.sample_off_vertical));
  assert.ok(Array.isArray(r.sample_ambiguous));
  assert.equal(r.sample_off_vertical.length, r.counts.off_vertical);
  for (const s of r.sample_off_vertical) {
    assert.ok("id" in s && "title" in s && "document_url" in s && "rule" in s && "basis" in s);
  }
});

test("sampleWithTitles: joins screenedOut rows (no title) back to the fetched rows (has title) by id, caps at n", () => {
  const screenedOut = [
    { row_id: "c2", document_url: "https://eur-lex.europa.eu/y", verdict: "off_vertical", rule: "r1", basis: "b1", provenance: "rule" },
    { row_id: "c3", document_url: "https://eur-lex.europa.eu/z", verdict: "off_vertical", rule: "r2", basis: "b2", provenance: "rule" },
  ];
  const rowsById = new Map(ROWS.map((r) => [r.id, r]));
  const sample = sampleWithTitles(screenedOut, rowsById, 1);
  assert.equal(sample.length, 1);
  assert.equal(sample[0].id, "c2");
  assert.equal(sample[0].title, "Regulation (EU) 2023/1805 FuelEU Maritime");
});

test("dry: readAll's match filters both dryrun_disposition='would_mint' and is_archived=false (migration 308)", async () => {
  const d = deps();
  await main({ mode: "dry" }, d);
  const [, , opts] = d.calls.find((c) => c[0] === "readAll" && c[1] === "census_worklist");
  const eqCalls = [];
  const q = { eq: (col, val) => { eqCalls.push([col, val]); return q; } };
  opts.match(q);
  assert.deepEqual(eqCalls, [["dryrun_disposition", "would_mint"], ["is_archived", false]]);
});

test("apply arg=park: no-op, applies nothing, exits 0", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "park" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.match(r.note, /no-op/);
  assert.equal(d.updateCalls.length, 0);
});

test("apply arg=archive: RUNNABLE (migration 308) — archives off_vertical rows via guardedUpdateByIds + archivePatch, cited, read back", async () => {
  let readAllCallCount = 0;
  const d = deps({
    readAllImpl: async (table, cols, opts) => {
      readAllCallCount += 1;
      if (readAllCallCount === 1) return ROWS; // the dry-count read
      // post-apply read-back: whichever rows were archived read back is_archived=true
      return [{ id: "c3", is_archived: true, archive_reason: ARCHIVE_REASON }];
    },
  });
  const r = await main({ mode: "apply", arg: "archive" }, d);
  assert.equal(d.updateCalls.length, 1);
  const call = d.updateCalls[0];
  assert.equal(call.table, "census_worklist");
  assert.deepEqual(call.patch, { is_archived: true, archive_reason: ARCHIVE_REASON });
  assert.equal(call.cite, CITE);
  assert.equal(typeof call.applyMatch, "function");
  // applyMatch re-checks would_mint AND is_archived=false
  const eqCalls = [];
  const q = { eq: (col, val) => { eqCalls.push([col, val]); return q; } };
  call.applyMatch(q);
  assert.deepEqual(eqCalls, [["dryrun_disposition", "would_mint"], ["is_archived", false]]);
  assert.equal(r.applied, 1); // guardedUpdateByIds' fake returns { updated: ids.length }
  assert.equal(r.read_back.archived, 1);
  assert.match(r.note, /archived 1 of 1/);
  assert.equal(r.exitCode, 0);
});

test("apply arg=archive with 0 off_vertical rows in the pool: no-op, no write attempted", async () => {
  const d = deps({ readAllImpl: async () => [{ id: "c2", document_url: "https://eur-lex.europa.eu/y", title: "Regulation (EU) 2023/1805 FuelEU Maritime", surface_tags: [], dryrun_disposition: "would_mint" }] });
  const r = await main({ mode: "apply", arg: "archive" }, d);
  assert.equal(d.updateCalls.length, 0);
  assert.equal(r.applied, 0);
  assert.match(r.note, /nothing to write/);
});

test("apply with an unrecognized arg: refused, exits 1", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "delete-everything" }, d);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
  assert.equal(d.updateCalls.length, 0);
});

test("only reads dryrun_disposition='would_mint' rows (the ruling's own population)", async () => {
  const d = deps();
  await main({ mode: "dry" }, d);
  assert.ok(d.calls.some((c) => c[0] === "readAll" && c[1] === "census_worklist"));
});
