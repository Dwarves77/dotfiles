// Unit test for exemptions-375.mjs (lane uiactions, 2026-09-07, addendum item 8; entries narrowed
// 2026-09-07 by lane moblist once the mobile-390 build landed; market-list/research-list/
// operations-list removed 2026-09-07 by FOLD-56 once the three ledgers got PriorityDropdown's
// kebab wrapper and the rendering guard came back PASS with no exemptions firing — see
// exemptions-375.mjs's own header). Pure functions only — run-rendering-guard.mjs's own
// integration behavior (the exemption actually suppressing a real Playwright failure) is proven
// live by that guard's own run; this file proves the two pure helpers it calls in isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RENDERING_375_EXEMPTIONS, isExempt375, activeExemptions } from "./exemptions-375.mjs";

test("exactly one entry remains: /map (the five list pages are all clear at 375, FOLD-56)", () => {
  assert.equal(RENDERING_375_EXEMPTIONS.length, 1);
  const pages = RENDERING_375_EXEMPTIONS.map((e) => e.page).sort();
  assert.deepEqual(pages, ["map"]);
});

test("every entry is dated and carries the same expiry (train wave 58)", () => {
  for (const e of RENDERING_375_EXEMPTIONS) {
    assert.match(e.dated, /^\d{4}-\d{2}-\d{2}$/, `${e.page} must carry a real date`);
    assert.equal(e.expiryWave, 58, `${e.page} must expire at wave58`);
    assert.ok(e.reason && e.reason.length > 0, `${e.page} must carry a reason`);
  }
});

test("the map entry's reason is the operator's confirmed ruling, not a pending coordinator extension", () => {
  const map = RENDERING_375_EXEMPTIONS.find((e) => e.page === "map");
  assert.match(map.reason, /operator ruling/);
  assert.match(map.reason, /confirmed/);
  assert.doesNotMatch(map.reason, /confirmation pending/);
});

test("isExempt375 only matches a failure line carrying '@375' from an active entry's exact fixturePrefix", () => {
  const active = RENDERING_375_EXEMPTIONS;
  assert.equal(isExempt375("map-page:populated@375: 2 element(s) clipped...", active), true);
  // Same page, different (non-375) viewport must NOT be exempt — this is not a global relaxation.
  assert.equal(isExempt375("map-page:populated@768: 2 element(s) clipped...", active), false);
  // A page with no matching entry must not be exempt (market/research/operations are clear now).
  assert.equal(isExempt375("market-rows:one-row@375: something", active), false);
  // A prefix that is merely a SUBSTRING (not the label's own prefix) must not false-positive.
  assert.equal(isExempt375("not-map-page:populated@375: x", active), false);
});

test("activeExemptions drops an entry once the landed wave reaches its expiryWave (the guard fails again)", () => {
  const list = [{ page: "x", fixturePrefix: "x-list", reason: "r", dated: "2026-09-07", expiryWave: 58 }];
  assert.equal(activeExemptions(list, 57).length, 1, "still active one wave before expiry");
  assert.equal(activeExemptions(list, 58).length, 0, "expired the moment the landed wave reaches expiryWave");
  assert.equal(activeExemptions(list, 60).length, 0, "stays expired past it");
});

// CORRECTED (coordinator review, 2026-09-11, task 0.1 follow-up round 2, [CONFIRMED by the reviewer]):
// this test used to assert the OPPOSITE - "best-effort... same posture as F25's own oracle" meant a
// null wave degraded to EVERY entry counting as active. That is the same fail-open shape the
// push-vs-pull_request layout-guard divergence exploited in the sibling exemptions-law2-desktop.mjs
// (fixed in commit 2730ad23): a depth-1 pull_request checkout cannot resolve origin/master, so
// latestTrainWave() returns null, and "null degrades to active" is what would let that checkout keep
// suppressing an @375 finding a depth-1 push checkout, resolving a real and expired wave on the SAME
// tree, correctly reports. Never throwing is still the right posture (a null wave must not crash the
// guard); treating null as ACTIVE is not, per CLAUDE.md rule 15 - a guard's default under uncertainty
// is closed, not open.
test("activeExemptions never throws when the landed wave is unknown (null), and fails CLOSED, not active", () => {
  assert.equal(activeExemptions(RENDERING_375_EXEMPTIONS, null).length, 0);
});
