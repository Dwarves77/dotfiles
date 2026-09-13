import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recentChangesWindowDays, BUILD_MODE_WINDOW_DAYS, LIVE_WINDOW_DAYS } from "./recent-changes-window.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("build mode (cadence off or unset) holds the What-changed feed on a 90-day window", () => {
  assert.equal(recentChangesWindowDays("off"), BUILD_MODE_WINDOW_DAYS);
  assert.equal(recentChangesWindowDays(null), BUILD_MODE_WINDOW_DAYS);
  assert.equal(recentChangesWindowDays(undefined), BUILD_MODE_WINDOW_DAYS);
  assert.equal(BUILD_MODE_WINDOW_DAYS, 90);
});

test("any set cadence returns the feed to its live 7-day window", () => {
  for (const c of ["daily", "weekly", "hourly", "monthly"]) assert.equal(recentChangesWindowDays(c), LIVE_WINDOW_DAYS);
  assert.equal(LIVE_WINDOW_DAYS, 7);
});

test("the feed call site passes the cadence-decided window, never a literal 7", () => {
  const src = readFileSync(resolve(HERE, "../supabase-server.ts"), "utf8");
  const call = src.match(/rpc\("get_workspace_recent_changes",\s*\{[^}]*\}/);
  assert.ok(call, "get_workspace_recent_changes call site present");
  assert.match(call[0], /p_days:\s*recentChangesWindowDays\(/, "p_days must come from recentChangesWindowDays");
  assert.doesNotMatch(call[0], /p_days:\s*7\b/);
});
