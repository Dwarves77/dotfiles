// Unit test for the WO-23 scope-conditional route validation added to
// /api/watchlist: market_series is a TEAM-scope-only watchable type
// (migration 270 widened org_watchlist's CHECK but deliberately left
// user_watchlist's narrow). ITEM_TYPES is a flat, scope-blind gate shared by
// GET/POST/DELETE; TEAM_ONLY_TYPES/isTeamOnlyScopeViolation is the second,
// scope-aware gate that must reject a personal-scope market_series write with
// the route's own clean 400 (naming the reason) rather than letting it reach
// the un-widened user_watchlist CHECK and surface as a raw Postgres 500.
//
// Exercises the REAL exported decision function and error builder (not a
// reimplementation) — same route.ts-exports-a-pure-function-for-testability
// pattern src/app/api/admin/sources/bulk-import/route.ts's
// headReachabilityDecision already uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { "@": resolve(ROOT, "src") },
});
const { ITEM_TYPES, TEAM_ONLY_TYPES, isTeamOnlyScopeViolation, teamOnlyError } =
  await jiti.import("./route.ts");

test("ITEM_TYPES admits market_series (the structural gate is widened)", () => {
  assert.equal(ITEM_TYPES.has("market_series"), true);
});

test("TEAM_ONLY_TYPES names market_series and nothing else", () => {
  assert.equal(TEAM_ONLY_TYPES.has("market_series"), true);
  assert.equal(TEAM_ONLY_TYPES.size, 1);
});

test("team scope: market_series is NOT a violation (accepted)", () => {
  assert.equal(isTeamOnlyScopeViolation("market_series", "team"), false);
});

test("personal scope: market_series IS a violation (rejected)", () => {
  assert.equal(isTeamOnlyScopeViolation("market_series", "personal"), true);
});

test("every pre-existing item_type is unaffected at either scope", () => {
  for (const t of ["source", "reg", "signal", "research", "operations"]) {
    assert.equal(isTeamOnlyScopeViolation(t, "personal"), false, `${t} personal`);
    assert.equal(isTeamOnlyScopeViolation(t, "team"), false, `${t} team`);
  }
});

test("teamOnlyError: 400 status, reason names the real cause (team-scope only), not a generic 'invalid type'", async () => {
  const resp = teamOnlyError("market_series");
  assert.equal(resp.status, 400);
  const body = await resp.json();
  assert.match(body.error, /market_series/);
  assert.match(body.error, /scope=team/);
  assert.doesNotMatch(body.error, /^invalid type$/i);
});
