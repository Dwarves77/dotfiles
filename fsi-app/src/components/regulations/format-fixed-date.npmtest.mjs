// format-fixed-date.npmtest.mjs — HYDRATION-418 regression proof.
//
// Named *.npmtest.mjs to match this directory's existing convention (band-empty-state.npmtest.mjs) so it
// is picked up by the `fsi-app/src/**/*.npmtest.mjs` glob-by-construction in the CI "App unit tests
// requiring npm deps" step (.github/workflows/discipline.yml) — it needs no npm package itself (the
// module under test has zero imports), but the directory's tests are wired that way, not through
// run-test-suite.sh's hand list (regulations/ has no *.test.mjs glob entry there).
//
// THE PROOF: pin two different runtime timezones (via `process.env.TZ`, read fresh by V8's Intl on every
// call — no process restart needed) and assert `formatMilestoneChip`/`formatShortDate`/`formatYearOnly`
// produce the IDENTICAL string in both, for the exact defect this file fixes: a UTC-midnight date-only
// value ("2026-09-25") that a naive `toLocaleDateString` with no `timeZone` renders as "Sep 25" on a UTC
// server and "Sep 24" on an America/New_York client (reproduced pre-fix, see this test's first case).

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMilestoneChip, formatShortDate, formatYearOnly } from "./format-fixed-date.ts";

/** Run `fn` with `process.env.TZ` set to `zone`, restoring the prior value after. */
function withTz(zone, fn) {
  const prev = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

test("formatMilestoneChip: same string in UTC (server) and America/New_York (client) for a UTC-midnight date", () => {
  const d = new Date("2026-09-25"); // date-only ISO -> UTC midnight, exactly item_timelines.milestone_date's shape
  const utc = withTz("UTC", () => formatMilestoneChip(d));
  const est = withTz("America/New_York", () => formatMilestoneChip(d));
  assert.equal(utc, "Sep 25");
  assert.equal(est, "Sep 25"); // pre-fix (no timeZone pinned) this reads "Sep 24" — the #418 mismatch
  assert.equal(utc, est);
});

test("formatMilestoneChip: null in, null out", () => {
  assert.equal(formatMilestoneChip(null), null);
});

test("formatShortDate: same string in UTC and America/New_York", () => {
  const d = new Date("2026-01-01"); // new year's day UTC midnight — the sharpest boundary case
  const utc = withTz("UTC", () => formatShortDate(d));
  const est = withTz("America/New_York", () => formatShortDate(d));
  assert.equal(utc, "Jan 1, 2026");
  assert.equal(est, "Jan 1, 2026"); // pre-fix: "Dec 31, 2025" in America/New_York
  assert.equal(utc, est);
});

test("formatYearOnly: same string in UTC and America/New_York across a year boundary", () => {
  const d = new Date("2026-01-01");
  const utc = withTz("UTC", () => formatYearOnly(d));
  const est = withTz("America/New_York", () => formatYearOnly(d));
  assert.equal(utc, "2026");
  assert.equal(est, "2026"); // pre-fix: "2025" in America/New_York — a year-boundary hydration mismatch
  assert.equal(utc, est);
});

// Sanity check on the reproduction itself: prove the UN-PINNED API (no timeZone option) really does
// differ across these two zones for this input — otherwise the three tests above would be vacuous (they'd
// pass even if formatMilestoneChip/etc. forgot to pin the zone, because nothing would ever disagree).
test("sanity: the underlying platform API DOES disagree across zones when timeZone is omitted (proves the tests above are not vacuous)", () => {
  const d = new Date("2026-09-25");
  const naive = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const utc = withTz("UTC", () => naive(d));
  const est = withTz("America/New_York", () => naive(d));
  assert.equal(utc, "Sep 25");
  assert.equal(est, "Sep 24");
  assert.notEqual(utc, est);
});
