// Unit test for src/lib/watchlist-scope.ts — the L6 fix for Defect 3 (WO-23
// follow-up): market_series is TEAM SCOPE ONLY, and WatchButton must not
// offer a personal control the API will reject with a clean 400
// (isTeamOnlyScopeViolation in src/app/api/watchlist/route.ts).
//
// WHY THIS MODULE EXISTS. Before this fix, TEAM_ONLY_TYPES and
// isTeamOnlyScopeViolation were defined ONLY inside route.ts, a server file
// that also imports getServiceSupabase, next/cache's revalidateTag, and
// requireAuth — real runtime server code, not erasable types, so WatchButton
// (a "use client" component) could not import them directly without dragging
// server-only code into the client bundle. This module is the single,
// dependency-free home both sides import: route.ts re-exports it (so its own
// existing tests, which import ITEM_TYPES/TEAM_ONLY_TYPES/
// isTeamOnlyScopeViolation/teamOnlyError straight from route.ts, keep passing
// unchanged) and WatchButton.tsx imports isTeamOnlyWatchType directly to
// decide what to render.
//
// THIS FILE IS RED before src/lib/watchlist-scope.ts exists at all: every
// test below fails with "Cannot find module" / import error. Confirmed by
// hand this session (see report) before the module was written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { TEAM_ONLY_TYPES, isTeamOnlyWatchType, isTeamOnlyScopeViolation } =
  await jiti.import("./watchlist-scope.ts");

test("TEAM_ONLY_TYPES names market_series and nothing else", () => {
  assert.equal(TEAM_ONLY_TYPES.has("market_series"), true);
  assert.equal(TEAM_ONLY_TYPES.size, 1);
});

test("isTeamOnlyWatchType(market_series) is true", () => {
  assert.equal(isTeamOnlyWatchType("market_series"), true);
});

test("isTeamOnlyWatchType is false for every other live WatchlistItemType", () => {
  for (const t of ["source", "reg", "signal", "research", "operations"]) {
    assert.equal(isTeamOnlyWatchType(t), false, t);
  }
});

test("isTeamOnlyScopeViolation: market_series at scope=team is NOT a violation", () => {
  assert.equal(isTeamOnlyScopeViolation("market_series", "team"), false);
});

test("isTeamOnlyScopeViolation: market_series at scope=personal IS a violation", () => {
  assert.equal(isTeamOnlyScopeViolation("market_series", "personal"), true);
});

test("isTeamOnlyScopeViolation: every pre-existing item_type is unaffected at either scope", () => {
  for (const t of ["source", "reg", "signal", "research", "operations"]) {
    assert.equal(isTeamOnlyScopeViolation(t, "personal"), false, `${t} personal`);
    assert.equal(isTeamOnlyScopeViolation(t, "team"), false, `${t} team`);
  }
});
