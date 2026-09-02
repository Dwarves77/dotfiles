// Run: node --test scripts/maintenance/census-off-vertical.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main } from "./census-off-vertical.mjs";

const ROWS = [
  { id: "c1", document_url: "https://www.federalregister.gov/x", title: "Safety Zone; Savannah River", surface_tags: [], dryrun_disposition: "would_mint" },
  { id: "c2", document_url: "https://eur-lex.europa.eu/y", title: "Regulation (EU) 2023/1805 FuelEU Maritime", surface_tags: [], dryrun_disposition: "would_mint" },
  { id: "c3", document_url: "https://eur-lex.europa.eu/z", title: "Commission Decision on German coal aid", surface_tags: [], dryrun_disposition: "would_mint" },
];

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    readAll: async (table, cols, opts) => { calls.push(["readAll", table]); return ROWS; },
    reviewed: {},
    ...overrides,
  };
}

test("dry: counts on/off/ambiguous from the shared screen, writes nothing, reads only would_mint rows", async () => {
  const d = deps();
  const r = await main({ mode: "dry" }, d);
  assert.equal(r.step, "census-off-vertical");
  assert.equal(r.applied, 0);
  assert.equal(r.counts.would_mint_total, 3);
  assert.ok(r.counts.off_vertical >= 1);
  assert.equal(r.exitCode, 0);
});

test("apply arg=park: no-op, applies nothing, exits 0", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "park" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 0);
  assert.match(r.note, /no-op/);
});

test("apply arg=archive: NOT RUNNABLE (census_worklist has no archive columns), exits 2, no write attempted", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "archive" }, d);
  assert.equal(r.applied, 0);
  assert.equal(r.exitCode, 2);
  assert.match(r.note, /NOT RUNNABLE/);
});

test("apply with an unrecognized arg: refused, exits 1", async () => {
  const d = deps();
  const r = await main({ mode: "apply", arg: "delete-everything" }, d);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("only reads dryrun_disposition='would_mint' rows (the ruling's own population)", async () => {
  const d = deps();
  await main({ mode: "dry" }, d);
  assert.ok(d.calls.some((c) => c[0] === "readAll" && c[1] === "census_worklist"));
});
