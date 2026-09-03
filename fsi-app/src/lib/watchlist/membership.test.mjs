// Proof for src/lib/watchlist/membership.ts (PERF-3 lane, 2026-09-03,
// docs/audits/perf-load-times-2026-09-03.md item 2: "/market fires GET /api/watchlist six times
// within 3ms on every visit ... WatchButton.tsx fetches membership on mount per instance").
//
// Two things this proves:
//   1. buildWatchMembership (server half): dedupes ids, honestly zeroes personal/team when
//      userId/orgId is absent (never queries, never fabricates), and short-circuits an empty
//      itemIds list without calling either dep.
//   2. getClientWatchMembership (client half): N calls for the SAME item_type on one page share
//      ONE underlying fetch (the exact "six fetches" defect this lane fixes), a failed fetch
//      resolves to an empty map rather than rejecting, and two DIFFERENT item_types get two
//      independent fetches (never conflated into one cache entry).
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWatchMembership,
  lookupWatchMembership,
  getClientWatchMembership,
  __resetClientWatchMembershipCacheForTests,
} from "./membership.ts";

test("buildWatchMembership: dedupes ids and reports watched/teamWatched per id", async () => {
  const calls = [];
  const deps = {
    queryPersonalWatchedIds: async (userId, itemType, itemIds) => {
      calls.push(["personal", userId, itemType, itemIds]);
      return new Set(["a", "b"]);
    },
    queryTeamWatchedIds: async (orgId, itemType, itemIds) => {
      calls.push(["team", orgId, itemType, itemIds]);
      return new Set(["b", "c"]);
    },
  };

  const map = await buildWatchMembership(deps, {
    userId: "u1",
    orgId: "o1",
    itemType: "market_series",
    itemIds: ["a", "b", "c", "a"], // "a" duplicated on purpose
  });

  assert.deepEqual(calls[0][3], ["a", "b", "c"], "deduped before either query ran");
  assert.deepEqual(map.get("a"), { watched: true, teamWatched: false, teamAvailable: true });
  assert.deepEqual(map.get("b"), { watched: true, teamWatched: true, teamAvailable: true });
  assert.deepEqual(map.get("c"), { watched: false, teamWatched: true, teamAvailable: true });
});

test("buildWatchMembership: no userId -> personal never queried, all false; no orgId -> teamAvailable false", async () => {
  let personalCalled = false;
  let teamCalled = false;
  const deps = {
    queryPersonalWatchedIds: async () => { personalCalled = true; return new Set(); },
    queryTeamWatchedIds: async () => { teamCalled = true; return new Set(); },
  };

  const map = await buildWatchMembership(deps, {
    userId: null,
    orgId: null,
    itemType: "market_series",
    itemIds: ["a"],
  });

  assert.equal(personalCalled, false, "personal dep never called for a signed-out/unresolved viewer");
  assert.equal(teamCalled, false, "team dep never called with no org resolved");
  assert.deepEqual(map.get("a"), { watched: false, teamWatched: false, teamAvailable: false });
});

test("buildWatchMembership: empty itemIds short-circuits without calling either dep", async () => {
  let called = false;
  const deps = {
    queryPersonalWatchedIds: async () => { called = true; return new Set(); },
    queryTeamWatchedIds: async () => { called = true; return new Set(); },
  };
  const map = await buildWatchMembership(deps, { userId: "u1", orgId: "o1", itemType: "reg", itemIds: [] });
  assert.equal(called, false);
  assert.equal(map.size, 0);
});

test("lookupWatchMembership: honest empty default for an id never fetched", async () => {
  const map = new Map();
  assert.deepEqual(lookupWatchMembership(map, "missing"), {
    watched: false,
    teamWatched: false,
    teamAvailable: false,
  });
});

test("getClientWatchMembership: N calls for the same item_type share ONE fetch", async () => {
  __resetClientWatchMembershipCacheForTests();
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({ watchedIds: ["s1"], teamWatchedIds: ["s2"], teamAvailable: true }),
    };
  };

  const [m1, m2, m3] = await Promise.all([
    getClientWatchMembership("market_series", { fetchImpl, authHeader: {} }),
    getClientWatchMembership("market_series", { fetchImpl, authHeader: {} }),
    getClientWatchMembership("market_series", { fetchImpl, authHeader: {} }),
  ]);

  assert.equal(fetchCount, 1, "three WatchButton instances of the same item_type fired exactly one fetch");
  assert.equal(m1, m2);
  assert.equal(m2, m3);
  assert.deepEqual(m1.get("s1"), { watched: true, teamWatched: false, teamAvailable: true });
  assert.deepEqual(m1.get("s2"), { watched: false, teamWatched: true, teamAvailable: true });
});

test("getClientWatchMembership: different item_types never share a cache entry", async () => {
  __resetClientWatchMembershipCacheForTests();
  const seenTypes = [];
  const fetchImpl = async (url) => {
    seenTypes.push(String(url));
    return { ok: true, json: async () => ({ watchedIds: [], teamWatchedIds: [], teamAvailable: false }) };
  };

  await getClientWatchMembership("reg", { fetchImpl, authHeader: {} });
  await getClientWatchMembership("market_series", { fetchImpl, authHeader: {} });

  assert.equal(seenTypes.length, 2, "two distinct item_types produced two distinct fetches");
});

test("getClientWatchMembership: a failed fetch resolves to an empty map, never rejects", async () => {
  __resetClientWatchMembershipCacheForTests();
  const fetchImpl = async () => { throw new Error("network down"); };
  const map = await getClientWatchMembership("signal", { fetchImpl, authHeader: {} });
  assert.equal(map.size, 0);
});

test("getClientWatchMembership: a non-ok response resolves to an empty map, never rejects", async () => {
  __resetClientWatchMembershipCacheForTests();
  const fetchImpl = async () => ({ ok: false, json: async () => ({ error: "unauthorized" }) });
  const map = await getClientWatchMembership("operations", { fetchImpl, authHeader: {} });
  assert.equal(map.size, 0);
});
