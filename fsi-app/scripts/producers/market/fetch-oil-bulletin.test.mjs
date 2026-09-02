// fetch-oil-bulletin.test.mjs — proof for the PURE pieces of fetch-oil-bulletin.mjs's --since backfill
// support (Lane PROD, system-completion train, 2026-09-02): parseArgs's --since parsing and filterSince's
// date filter. See that script's own header ("HISTORY BACKFILL (--since)") for why this is a filter over
// the SAME extractEuSeries output every run already produces, not a new fetch or a new parser.
//
// WHY NOT A FULL --since CLI RUN HERE. main()'s --since path still needs a live network fetch (the
// workbook download) exactly like the existing single-week path — this sandbox cannot reach
// energy.ec.europa.eu (see the script's own header), and a test asserting either a live success or a live
// 403 would be flaky by construction, the same posture ecb-fx-producer.test.mjs's own header states for
// its live-fetch branch. What IS deterministic and IS proven here: argument parsing (never network-
// dependent) and the date filter (a pure function over already-extracted EuWeekRow objects, independent of
// how those rows were obtained).
//
// LOCATION: scripts/producers/*/*.test.mjs is a run-test-suite.sh glob (no-npm gate), same convention
// ecb-fx-producer.test.mjs already uses in this directory.
//
// $0, pure, in-process — no network, no filesystem beyond node:fs itself, no database.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, filterSince, SINCE_ALL_WEEKS } from "./fetch-oil-bulletin.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: no flags at all defaults to weeks=1, outPath=null, since=null", () => {
  const args = parseArgs(["node", "fetch-oil-bulletin.mjs"]);
  assert.deepEqual(args, { weeks: 1, outPath: null, since: null });
});

test("parseArgs: --weeks N is parsed as before, unaffected by --since's addition", () => {
  const args = parseArgs(["node", "fetch-oil-bulletin.mjs", "--weeks", "4"]);
  assert.equal(args.weeks, 4);
  assert.equal(args.since, null);
});

test("parseArgs: --since captures its argument verbatim, without validating the date shape itself (main() validates before use)", () => {
  const args = parseArgs(["node", "fetch-oil-bulletin.mjs", "--since", "2025-01-01"]);
  assert.equal(args.since, "2025-01-01");
});

test("parseArgs: --since and --out and --weeks compose (order-independent, like the original two flags)", () => {
  const args = parseArgs(["node", "fetch-oil-bulletin.mjs", "--out", "/tmp/x.csv", "--since", "2020-06-15", "--weeks", "9"]);
  assert.deepEqual(args, { weeks: 9, outPath: "/tmp/x.csv", since: "2020-06-15" });
});

test("parseArgs: a malformed --since value (e.g. missing) is still captured verbatim — the shape check lives in main(), not here", () => {
  const args = parseArgs(["node", "fetch-oil-bulletin.mjs", "--since", "not-a-date"]);
  assert.equal(args.since, "not-a-date");
});

// ── filterSince ──────────────────────────────────────────────────────────────────────────────────────

const SERIES = [
  { week_ending: "2026-08-24", prices: { "eurosuper-95": 1007.68 }, warnings: [] },
  { week_ending: "2026-08-17", prices: { "eurosuper-95": 1001.2 }, warnings: [] },
  { week_ending: "2026-08-10", prices: { "eurosuper-95": 998.4 }, warnings: [] },
  { week_ending: "2026-08-03", prices: { "eurosuper-95": 994.1 }, warnings: [] },
];

test("filterSince: null since returns the series unchanged (the default, no-backfill path)", () => {
  const out = filterSince(SERIES, null);
  assert.equal(out, SERIES, "must be the SAME array reference when no filter is requested — never a needless copy");
});

test("filterSince: keeps weeks on/after the since date, drops everything earlier", () => {
  const out = filterSince(SERIES, "2026-08-10");
  assert.deepEqual(out.map((w) => w.week_ending), ["2026-08-24", "2026-08-17", "2026-08-10"]);
});

test("filterSince: an exact boundary match is INCLUSIVE (on/after, never strictly-after)", () => {
  const out = filterSince(SERIES, "2026-08-24");
  assert.deepEqual(out.map((w) => w.week_ending), ["2026-08-24"]);
});

test("filterSince: a since date after every week in the series returns an empty array, never throws", () => {
  const out = filterSince(SERIES, "2099-01-01");
  assert.deepEqual(out, []);
});

test("filterSince: a since date before every week in the series returns everything", () => {
  const out = filterSince(SERIES, "2000-01-01");
  assert.deepEqual(out.map((w) => w.week_ending), SERIES.map((w) => w.week_ending));
});

test("filterSince: preserves the input's own order (most-recent-first) — never re-sorts", () => {
  const shuffled = [SERIES[2], SERIES[0], SERIES[3], SERIES[1]]; // deliberately NOT most-recent-first
  const out = filterSince(shuffled, "2026-08-10");
  assert.deepEqual(out.map((w) => w.week_ending), ["2026-08-10", "2026-08-24", "2026-08-17"]);
});

test("filterSince: an empty series filters to an empty series", () => {
  assert.deepEqual(filterSince([], "2020-01-01"), []);
});

// ── SINCE_ALL_WEEKS ──────────────────────────────────────────────────────────────────────────────────

test("SINCE_ALL_WEEKS is a positive integer comfortably larger than the real history (weekly since 2005 is ~1,100 rows at 2026)", () => {
  assert.ok(Number.isInteger(SINCE_ALL_WEEKS));
  assert.ok(SINCE_ALL_WEEKS > 5000, "must be large enough that extractEuSeries's slice(0, weeks) never truncates real history");
});
