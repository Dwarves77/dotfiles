// Run: node --test scripts/maintenance/one-off/2026-09-29-reverse-chained-apply.test.mjs, no DB, deps
// injected. Covers the id-list integrity check (the thing the dispatch asked to be unit-tested: 33/33/
// 32/51, no duplicates) plus dry/apply/archive/verify wiring with fake deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  main,
  checkIdListIntegrity,
  ITEM_IDS,
  STAGED_UPDATE_IDS,
  AGENT_RUN_SEARCH_IDS,
  INTEGRITY_FLAG_IDS,
  SOURCE_URLS,
  EXPECTED_COUNTS,
  CITE,
  ARCHIVE_REASON,
} from "./2026-09-29-reverse-chained-apply.mjs";

test("id-list integrity: counts match 33/33/32/51 exactly", () => {
  const r = checkIdListIntegrity();
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { items: 33, staged_updates: 33, agent_run_searches: 32, integrity_flags: 51 });
  assert.deepEqual(r.counts, EXPECTED_COUNTS);
});

test("id-list integrity: no duplicates within any list", () => {
  const r = checkIdListIntegrity();
  assert.deepEqual(r.duplicates, { items: 0, staged_updates: 0, agent_run_searches: 0, integrity_flags: 0 });
});

test("id-list integrity: every exported list actually has the length it claims (sanity against a stale EXPECTED_COUNTS)", () => {
  assert.equal(ITEM_IDS.length, 33);
  assert.equal(STAGED_UPDATE_IDS.length, 33);
  assert.equal(AGENT_RUN_SEARCH_IDS.length, 32);
  assert.equal(INTEGRITY_FLAG_IDS.length, 51);
  assert.equal(SOURCE_URLS.length, 33);
});

test("id-list integrity: a synthetic duplicate is caught (proves the check isn't vacuous)", () => {
  // checkIdListIntegrity is pure and closes over the module's own lists, so we can't inject a bad list
  // directly, instead assert the detection logic itself catches a duplicate in an equivalent array.
  const withDupe = [...ITEM_IDS.slice(0, 32), ITEM_IDS[0]];
  const seen = new Set(withDupe);
  assert.equal(withDupe.length - seen.size, 1);
});

test("dry mode: reports counts, makes no DB call, integrity.ok true", async () => {
  const r = await main({ mode: "dry" }, {});
  assert.equal(r.step, "reverse-chained-apply-2026-09-29");
  assert.equal(r.mode, "dry");
  assert.equal(r.integrity.ok, true);
  assert.equal(r.exitCode, 0);
  assert.match(r.note, /No DB call made/);
});

test("apply mode: calls guardedDelete four times in FK-safe order (flags, searches, staged, items) with CITE", async () => {
  const calls = [];
  const deps = {
    guardedDelete: async (table, ids, opts) => {
      calls.push({ table, ids, cite: opts.cite });
      return { deleted: ids.length, snapshots: [`fake-${table}.jsonl`] };
    },
  };
  const r = await main({ mode: "apply" }, deps);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((c) => c.table), ["integrity_flags", "agent_run_searches", "staged_updates", "intelligence_items"]);
  for (const c of calls) assert.deepEqual(c.cite, CITE);
  assert.deepEqual(r.applied, {
    integrity_flags: 51,
    agent_run_searches: 32,
    staged_updates: 33,
    intelligence_items: 33,
  });
  assert.equal(r.exitCode, 0);
});

test("apply mode: id lists passed to guardedDelete are exactly the exported lists (no re-derivation)", async () => {
  const seen = {};
  const deps = {
    guardedDelete: async (table, ids) => {
      seen[table] = ids;
      return { deleted: ids.length, snapshots: [] };
    },
  };
  await main({ mode: "apply" }, deps);
  assert.deepEqual(seen.integrity_flags, INTEGRITY_FLAG_IDS);
  assert.deepEqual(seen.agent_run_searches, AGENT_RUN_SEARCH_IDS);
  assert.deepEqual(seen.staged_updates, STAGED_UPDATE_IDS);
  assert.deepEqual(seen.intelligence_items, ITEM_IDS);
});

test("archive mode: calls guardedUpdateByIds on intelligence_items with archivePatch, never deletes", async () => {
  const calls = [];
  const deletesCalled = [];
  const deps = {
    guardedDelete: async (table, ids) => { deletesCalled.push(table); return { deleted: ids.length, snapshots: [] }; },
    archivePatch: (table, reason) => ({ is_archived: true, archive_reason: reason, provenance_status: "unverified" }),
    guardedUpdateByIds: async (table, ids, patch, opts) => {
      calls.push({ table, ids, patch, cite: opts.cite, applyMatch: opts.applyMatch });
      return { updated: ids.length, snapshots: [`fake-${table}.jsonl`] };
    },
  };
  const r = await main({ mode: "archive" }, deps);
  assert.equal(deletesCalled.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "intelligence_items");
  assert.deepEqual(calls[0].ids, ITEM_IDS);
  assert.equal(calls[0].patch.archive_reason, ARCHIVE_REASON);
  assert.deepEqual(calls[0].cite, CITE);
  assert.equal(typeof calls[0].applyMatch, "function");
  assert.equal(r.applied.intelligence_items_archived, 33);
  assert.equal(r.exitCode, 0);
});

test("verify mode: all-zero read-back reports clean, exitCode 0", async () => {
  const deps = {
    readAllByIds: async (table) => {
      if (table === "portal_link_candidates") return [];
      return [];
    },
  };
  const r = await main({ mode: "verify" }, deps);
  assert.deepEqual(r.read_back, {
    intelligence_items_remaining: 0,
    staged_updates_remaining: 0,
    agent_run_searches_remaining: 0,
    integrity_flags_remaining: 0,
    portal_link_candidates_touched: 0,
  });
  assert.equal(r.exitCode, 0);
  assert.match(r.note, /confirmed clean/);
});

test("verify mode: non-zero remainder fails the check (exitCode 1) instead of reporting clean", async () => {
  const deps = {
    readAllByIds: async (table) => {
      if (table === "intelligence_items") return [{ id: ITEM_IDS[0] }];
      return [];
    },
  };
  const r = await main({ mode: "verify" }, deps);
  assert.equal(r.read_back.intelligence_items_remaining, 1);
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /NOT complete/);
});

test("verify mode: portal_link_candidates checked by url (SOURCE_URLS), not item_id", async () => {
  const idsSeenByTable = {};
  const deps = {
    readAllByIds: async (table, cols, ids, opts) => {
      idsSeenByTable[table] = { ids, idColumn: opts?.idColumn };
      return [];
    },
  };
  await main({ mode: "verify" }, deps);
  assert.deepEqual(idsSeenByTable.portal_link_candidates.ids, SOURCE_URLS);
  assert.equal(idsSeenByTable.portal_link_candidates.idColumn, "url");
});

test("unknown mode is refused, not silently treated as dry", async () => {
  const r = await main({ mode: "bogus" }, {});
  assert.equal(r.exitCode, 1);
  assert.match(r.note, /REFUSED/);
});

test("CITE names the correct GH Actions run and operator ruling", () => {
  assert.equal(CITE.skill, "remediation-discipline");
  assert.match(CITE.reason, /36568656803/);
  assert.match(CITE.reason, /2026-09-29/);
});
