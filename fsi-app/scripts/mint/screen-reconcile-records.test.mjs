// Run: node --test scripts/mint/screen-reconcile-records.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLiveRecords, main, ARCHIVE_REASON, CITE } from "./screen-reconcile-records.mjs";

const ITEMS = [
  { id: "i1", title: "Safety Zone; Savannah River, Savannah, GA", source_url: "https://www.federalregister.gov/documents/2026/07/01/2026-1/safety-zone" },
  { id: "i2", title: "Regulation (EU) 2023/1805 on the use of renewable and low-carbon fuels in maritime transport", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1805" },
  { id: "i3", title: "Commission Decision of 2 October 2001 on German aid to the coal industry", source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002D0001" },
];
const CENSUS = new Map([
  [ITEMS[1].source_url, { id: "c2", document_url: ITEMS[1].source_url, title: ITEMS[1].title, surface_tags: [] }],
  [ITEMS[2].source_url, { id: "c3", document_url: ITEMS[2].source_url, title: ITEMS[2].title, surface_tags: [] }],
]);
const REVIEWED = { c2: { verdict: "on_vertical", reason: "FuelEU Maritime", reviewer: "operator" } };

test("classifyLiveRecords: verdict per live item, reviewed verdicts keyed by the CENSUS id (not the item id), item title used when no census row", () => {
  const out = classifyLiveRecords(ITEMS, CENSUS, REVIEWED);
  assert.deepEqual(out.map((o) => [o.id, o.verdict, o.provenance]), [["i1", "off_vertical", "rule"], ["i2", "on_vertical", "reviewed"], ["i3", "ambiguous", "rule"]]);
  assert.equal(out[0].census_id, null);
  assert.equal(out[1].census_id, "c2");
});

function deps(calls, reviewed = REVIEWED) {
  return {
    reviewed,
    readAll: async (table, cols, opts) => { calls.push(["readAll", table]); return table === "intelligence_items" && calls.filter((c) => c[0] === "readAll").length === 1 ? ITEMS : [{ id: "i1", is_archived: true, archive_reason: "off_vertical" }]; },
    fetchRowsIn: async () => [...CENSUS.values()],
    readClient: () => ({}),
    guardedUpdateByIds: async (table, ids, patch, opts) => { calls.push(["guardedUpdateByIds", table, ids, patch, opts]); return { updated: ids.length, chunks: 1, halvings: 0, rows: ids.map((id) => ({ id })) }; },
    archivePatch: (table, reason) => ({ is_archived: true, archive_reason: reason, provenance_status: "unverified" }),
  };
}

test("main dry-run: classifies, archives nothing, lists ambiguous items for a ruling", async () => {
  const calls = [];
  const r = await main({ apply: false }, deps(calls));
  assert.deepEqual({ live: r.live, on: r.on_vertical, off: r.off_vertical, amb: r.ambiguous, archived: r.archived }, { live: 3, on: 1, off: 1, amb: 1, archived: 0 });
  assert.deepEqual(r.needs_ruling.map((n) => n.id), ["i3"]);
  assert.ok(!calls.some((c) => c[0] === "guardedUpdateByIds"));
});

test("main apply: archives ONLY the off-vertical ids through guardedUpdateByIds with archivePatch(off_vertical) and the cite; ambiguous stays live; reads back", async () => {
  const calls = [];
  const r = await main({ apply: true }, deps(calls));
  const w = calls.find((c) => c[0] === "guardedUpdateByIds");
  assert.deepEqual(w[2], ["i1"]);
  assert.equal(w[3].archive_reason, ARCHIVE_REASON);
  assert.equal(w[3].is_archived, true);
  assert.equal(w[4].cite, CITE);
  assert.equal(typeof w[4].applyMatch, "function");
  assert.equal(r.archived, 1);
  assert.notEqual(process.exitCode, 1);
});
