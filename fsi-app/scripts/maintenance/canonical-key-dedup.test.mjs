import { test } from "node:test";
import assert from "node:assert";
import {
  groupByCanonicalKey,
  decideKeeper,
  planSelection,
  buildArchivePatch,
  buildKeeperPatch,
  buildKeeperRestoreSql,
  main,
  pickLatestPriorStates,
  buildRestorePatchFromPrior,
  buildRestoreSql,
} from "./canonical-key-dedup.mjs";

test("groupByCanonicalKey: groups items by canonical key", () => {
  const items = [
    { id: "a", canonical_instrument_key: "key1" },
    { id: "b", canonical_instrument_key: "key1" },
    { id: "c", canonical_instrument_key: "key2" },
  ];
  const grouped = groupByCanonicalKey(items);
  assert.equal(grouped["key1"].length, 2);
  assert.equal(grouped["key2"].length, 1);
});

test("groupByCanonicalKey: handles null keys", () => {
  const items = [
    { id: "a", canonical_instrument_key: "key1" },
    { id: "b", canonical_instrument_key: null },
  ];
  const grouped = groupByCanonicalKey(items);
  assert.equal(grouped["key1"].length, 1);
  assert.equal(grouped["(null)"].length, 1);
});

test("decideKeeper: single verified in group returns it as keeper", () => {
  const rows = [
    { id: "a", provenance_status: "quarantined", created_at: "2026-04-05" },
    { id: "b", provenance_status: "verified", created_at: "2026-09-01" },
  ];
  const result = decideKeeper("key1", rows);
  assert.equal(result.keeper.id, "b");
  assert.equal(result.reason, "single_verified");
  assert.deepEqual(result.refusals, ["a"]);
});

test("decideKeeper: zero verified refuses", () => {
  const rows = [
    { id: "a", provenance_status: "quarantined", created_at: "2026-04-05" },
    { id: "b", provenance_status: "unverified", created_at: "2026-09-01" },
  ];
  const result = decideKeeper("key1", rows);
  assert.equal(result.keeper, null);
  assert.equal(result.reason, "zero_verified_in_group");
});

test("decideKeeper: multiple verified refuses", () => {
  const rows = [
    { id: "a", provenance_status: "verified", created_at: "2026-04-05" },
    { id: "b", provenance_status: "verified", created_at: "2026-09-01" },
  ];
  const result = decideKeeper("key1", rows);
  assert.equal(result.keeper, null);
  assert.equal(result.reason, "multiple_verified_in_group");
});

test("planSelection: identifies keepers and targets from duplicate groups", () => {
  const items = [
    // Single item (not a duplicate) — should not appear
    { id: "single", canonical_instrument_key: "key-single", provenance_status: "verified", created_at: "2026-01-01" },
    // Duplicate group 1: 1 verified, 1 quarantined
    { id: "dup1-q", canonical_instrument_key: "key1", provenance_status: "quarantined", created_at: "2026-04-05" },
    { id: "dup1-v", canonical_instrument_key: "key1", provenance_status: "verified", created_at: "2026-09-01" },
    // Duplicate group 2: 1 verified, 1 quarantined (real fixture)
    { id: "dup2-v", canonical_instrument_key: "key2", provenance_status: "verified", created_at: "2026-05-05" },
    { id: "dup2-q", canonical_instrument_key: "key2", provenance_status: "quarantined", created_at: "2026-05-10" },
  ];
  const result = planSelection(items);
  assert.equal(result.keepers.length, 2);
  assert.equal(result.targets.length, 2);
  assert.equal(result.refusals.length, 0);
  assert(result.keepers.some((k) => k.id === "dup1-v"));
  assert(result.keepers.some((k) => k.id === "dup2-v"));
  assert(result.targets.some((t) => t.id === "dup1-q"));
  assert(result.targets.some((t) => t.id === "dup2-q"));
});

test("planSelection: refuses groups with zero verified", () => {
  const items = [
    { id: "a", canonical_instrument_key: "key1", provenance_status: "quarantined", created_at: "2026-04-05" },
    { id: "b", canonical_instrument_key: "key1", provenance_status: "unverified", created_at: "2026-09-01" },
  ];
  const result = planSelection(items);
  assert.equal(result.keepers.length, 0);
  assert.equal(result.targets.length, 0);
  assert.equal(result.refusals.length, 1);
  assert.equal(result.refusals[0].reason, "zero_verified_in_group");
});

test("buildArchivePatch: sets all identity-release fields", () => {
  const patch = buildArchivePatch();
  assert.equal(patch.is_archived, true);
  assert.equal(patch.archive_reason, "duplicate_of_verified");
  assert.equal(patch.provenance_status, "unverified");
  assert.equal(patch.canonical_instrument_key, null);
  assert.equal(patch.instrument_identifier, null);
  assert.equal(patch.source_url, "");
});

test("buildKeeperPatch: clears a non-null archive_reason on a live keeper", () => {
  const keeper = { id: "k1", prior_archive_reason: "duplicate_instrument" };
  const patch = buildKeeperPatch(keeper);
  assert.deepEqual(patch, { archive_reason: null });
});

test("buildKeeperPatch: no write when the keeper's archive_reason is already null", () => {
  assert.equal(buildKeeperPatch({ id: "k1", prior_archive_reason: null }), null);
  assert.equal(buildKeeperPatch({ id: "k1" }), null);
});

test("buildKeeperRestoreSql: restores the prior stamp verbatim", () => {
  const sql = buildKeeperRestoreSql({ id: "ff95b385", prior_archive_reason: "duplicate_instrument" });
  assert.equal(sql, "UPDATE intelligence_items SET archive_reason = 'duplicate_instrument' WHERE id = 'ff95b385';");
});

test("main apply: keeper with a stamp is cleared and recorded; keeper without one is untouched", async () => {
  const items = [
    { id: "v1", canonical_instrument_key: "32023R1804", provenance_status: "verified", created_at: "2026-05-05", archive_reason: "duplicate_instrument", source_url: "u", instrument_identifier: "i" },
    { id: "q1", canonical_instrument_key: "32023R1804", provenance_status: "quarantined", created_at: "2026-09-01", archive_reason: null, source_url: "u2", instrument_identifier: "i2" },
    { id: "v2", canonical_instrument_key: "32015R0757", provenance_status: "verified", created_at: "2026-09-01", archive_reason: null, source_url: "u", instrument_identifier: "i" },
    { id: "q2", canonical_instrument_key: "32015R0757", provenance_status: "quarantined", created_at: "2026-09-02", archive_reason: null, source_url: "u3", instrument_identifier: "i3" },
  ];
  const keeperWrites = [];
  const deps = {
    readTargetCandidates: async () => items,
    archiveTargets: async (ids, patch) => ({ updated: ids.length, rows: ids.map((id) => ({ id, ...patch })) }),
    updateKeepers: async (id, patch) => { keeperWrites.push({ id, patch }); return { updated: 1 }; },
    readItemsByIds: async (ids) => ids.map((id) => ({ id, is_archived: true, archive_reason: "duplicate_of_verified" })),
    readSnapshotEntries: async () => [],
    restoreOne: async () => ({ updated: 1 }),
  };
  const s = await main({ mode: "apply" }, deps);
  assert.equal(s.exitCode, 0);
  assert.deepEqual(s.target_ids.sort(), ["q1", "q2"]);
  assert.deepEqual(keeperWrites, [{ id: "v1", patch: { archive_reason: null } }]);
  assert.equal(s.counts.keepers_updated, 1);
  assert.equal(s.keepers.length, 1);
  assert.equal(s.keepers[0].before.archive_reason, "duplicate_instrument");
  assert.equal(s.keepers[0].restore_sql, "UPDATE intelligence_items SET archive_reason = 'duplicate_instrument' WHERE id = 'v1';");
});

test("pickLatestPriorStates: finds latest prior state by cite marker", () => {
  const entries = [
    { table: "intelligence_items", prior: { id: "a", archive_reason: "old" }, _cite: { reason: "MAINT canonical-key-dedup dispatch (Lane DEDUP" } },
    { table: "intelligence_items", prior: { id: "a", archive_reason: "new" }, _cite: { reason: "MAINT canonical-key-dedup dispatch (Lane DEDUP" } },
    { table: "intelligence_items", prior: { id: "b", archive_reason: "b-val" }, _cite: { reason: "MAINT canonical-key-dedup dispatch (Lane DEDUP" } },
  ];
  const result = pickLatestPriorStates(entries, ["a", "b"], "MAINT canonical-key-dedup dispatch (Lane DEDUP");
  assert.equal(result.get("a").archive_reason, "new");
  assert.equal(result.get("b").archive_reason, "b-val");
});

test("pickLatestPriorStates: ignores different cite markers", () => {
  const entries = [
    { table: "intelligence_items", prior: { id: "a" }, _cite: { reason: "MAINT different-sweep" } },
  ];
  const result = pickLatestPriorStates(entries, ["a"], "MAINT canonical-key-dedup dispatch (Lane DEDUP");
  assert.equal(result.size, 0);
});

test("buildRestorePatchFromPrior: restores identity fields", () => {
  const prior = {
    is_archived: false,
    archive_reason: "some_reason",
    canonical_instrument_key: "key1",
    instrument_identifier: "id1",
    source_url: "http://example.com",
  };
  const patch = buildRestorePatchFromPrior(prior);
  assert.deepEqual(patch, prior);
});

test("buildRestoreSql: generates valid UPDATE statement", () => {
  const before = {
    id: "test-id",
    archive_reason: "old_reason",
    canonical_instrument_key: "key1",
    instrument_identifier: "id1",
    source_url: "http://example.com",
  };
  const sql = buildRestoreSql(before);
  assert(sql.includes("UPDATE intelligence_items SET"));
  assert(sql.includes("WHERE id = 'test-id'"));
  assert(sql.includes("archive_reason = 'old_reason'"));
  assert(sql.includes("canonical_instrument_key = 'key1'"));
});

test("buildRestoreSql: handles null values", () => {
  const before = {
    id: "test-id",
    archive_reason: null,
    canonical_instrument_key: null,
    instrument_identifier: null,
    source_url: "",
  };
  const sql = buildRestoreSql(before);
  assert(sql.includes("archive_reason = NULL"));
  assert(sql.includes("canonical_instrument_key = NULL"));
  assert(sql.includes("source_url = NULL"));
});

test("buildRestoreSql: escapes single quotes", () => {
  const before = {
    id: "test-id",
    archive_reason: "reason's with quote",
    canonical_instrument_key: "key'1",
    instrument_identifier: "id'1",
    source_url: "http://example.com?q='val'",
  };
  const sql = buildRestoreSql(before);
  assert(sql.includes("reason''s with quote"));
  assert(sql.includes("key''1"));
});
