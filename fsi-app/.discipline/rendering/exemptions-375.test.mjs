// Unit test for exemptions-375.mjs (lane uiactions, 2026-09-07, addendum item 8). Pure functions
// only — run-rendering-guard.mjs's own integration behavior (the exemption actually suppressing a
// real Playwright failure) is proven live by that guard's own run; this file proves the two pure
// helpers it calls in isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RENDERING_375_EXEMPTIONS, isExempt375, activeExemptions } from "./exemptions-375.mjs";

test("exactly six entries: the five list pages the operator's ruling names, plus /map (coordinator-extended)", () => {
  assert.equal(RENDERING_375_EXEMPTIONS.length, 6);
  const pages = RENDERING_375_EXEMPTIONS.map((e) => e.page).sort();
  assert.deepEqual(pages, [
    "map",
    "market-list",
    "operations-list",
    "regulations-list",
    "research-list",
    "watchlist",
  ]);
});

test("every entry is dated and carries the same expiry (train wave 58)", () => {
  for (const e of RENDERING_375_EXEMPTIONS) {
    assert.match(e.dated, /^\d{4}-\d{2}-\d{2}$/, `${e.page} must carry a real date`);
    assert.equal(e.expiryWave, 58, `${e.page} must expire at wave58`);
    assert.ok(e.reason && e.reason.length > 0, `${e.page} must carry a reason`);
  }
});

test("the map entry's reason names it as coordinator-extended, operator confirmation pending (the ruling itself names only the five list pages)", () => {
  const map = RENDERING_375_EXEMPTIONS.find((e) => e.page === "map");
  assert.match(map.reason, /coordinator-extended/);
  assert.match(map.reason, /operator confirmation pending/);
});

test("isExempt375 only matches a failure line carrying '@375' from an active entry's exact fixturePrefix", () => {
  const active = RENDERING_375_EXEMPTIONS.filter((e) => e.page !== "watchlist"); // has a real fixturePrefix match in current failures
  assert.equal(isExempt375("market-rows:one-row@375: 7 element(s) clipped...", active), true);
  // Same page, different (non-375) viewport must NOT be exempt — this is not a global relaxation.
  assert.equal(isExempt375("market-rows:one-row@768: 7 element(s) clipped...", active), false);
  // A page with no matching entry must not be exempt.
  assert.equal(isExempt375("dashboard-brief:empty@375: something", active), false);
  // A prefix that is merely a SUBSTRING (not the label's own prefix) must not false-positive.
  assert.equal(isExempt375("not-market-rows:one-row@375: x", active), false);
});

test("activeExemptions drops an entry once the landed wave reaches its expiryWave (the guard fails again)", () => {
  const list = [{ page: "x", fixturePrefix: "x-list", reason: "r", dated: "2026-09-07", expiryWave: 58 }];
  assert.equal(activeExemptions(list, 57).length, 1, "still active one wave before expiry");
  assert.equal(activeExemptions(list, 58).length, 0, "expired the moment the landed wave reaches expiryWave");
  assert.equal(activeExemptions(list, 60).length, 0, "stays expired past it");
});

test("activeExemptions is best-effort (never throws) when the landed wave is unknown (null) — same posture as F25's own oracle", () => {
  assert.equal(activeExemptions(RENDERING_375_EXEMPTIONS, null).length, RENDERING_375_EXEMPTIONS.length);
});
