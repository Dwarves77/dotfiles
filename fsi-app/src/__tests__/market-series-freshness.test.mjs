// Proof for src/lib/market/series-freshness.mjs (Lane SURF: spec 02 §6 item 11 freshness panel).
//
// LOCATION: same reasoning as the other new market tests in this directory — run-test-suite.sh's
// src/lib/* directory globs do not cover src/lib/market/, but src/__tests__/*.test.mjs is a covered
// glob, so a test dropped here runs in pre-push AND CI by construction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenceNameForDays, deriveSeriesFreshness, summarizeBoardFreshness } from "../lib/market/series-freshness.mjs";
import { MARKET_SERIES_PRODUCERS, producerFor } from "../lib/market/series-registry.mjs";

// ── cadenceNameForDays: the registry cadenceDays -> stalenessOf's cadence-name adapter ────────────────

test("cadenceNameForDays maps eu-oil-bulletin's cadenceDays (7) to the exact 'weekly' cadence name", () => {
  assert.equal(cadenceNameForDays(7), "weekly");
});

test("cadenceNameForDays maps ecb-fx's cadenceDays (1) to an exact 1-day cadence name", () => {
  // Either "realtime" or "daily" is a correct exact match (both are 1 day in REFRESH_PERIOD_DAYS);
  // this pins that SOME exact match is chosen, not the arithmetic-losing fallback path.
  assert.ok(["realtime", "daily"].includes(cadenceNameForDays(1)));
});

test("cadenceNameForDays maps null (undecided cadence) to 'irregular'", () => {
  assert.equal(cadenceNameForDays(null), "irregular");
  assert.equal(cadenceNameForDays(undefined), "irregular");
});

test("cadenceNameForDays with no exact match picks the smallest period >= cadenceDays (conservative direction)", () => {
  // 10 has no exact match; weekly=7 is too short (< 10), biweekly=14 is the smallest declared period >= 10.
  assert.equal(cadenceNameForDays(10), "biweekly");
});

// ── deriveSeriesFreshness: reuses stalenessOf, never reimplements the threshold arithmetic ─────────────

const euOilBulletin = producerFor("eu-oil-bulletin");

test("a row observed today, weekly cadence, is 'current'", () => {
  const f = deriveSeriesFreshness({ as_at_date: "2026-09-02" }, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "current");
  assert.equal(f.degraded, false);
});

test("a row 10 days old, weekly cadence (period=7d), is 'ageing' (between 1x and 2x the period)", () => {
  const f = deriveSeriesFreshness({ as_at_date: "2026-08-23" }, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "ageing");
});

test("a row 20 days old, weekly cadence, is 'stale' (between 2x and 4x the period)", () => {
  const f = deriveSeriesFreshness({ as_at_date: "2026-08-13" }, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "stale");
  assert.equal(f.degraded, true);
});

test("a row 40 days old, weekly cadence, is 'frozen' — the source stopped publishing, not merely late", () => {
  const f = deriveSeriesFreshness({ as_at_date: "2026-07-24" }, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "frozen");
  assert.equal(f.label, "No longer updated");
  assert.notEqual(f.label.toLowerCase(), "pending");
  assert.ok(!f.label.toLowerCase().includes("pending"), "frozen must never read as pending");
});

test("a row with no as_at_date/reference_period at all is 'unknown', never defaulted to current", () => {
  const f = deriveSeriesFreshness({}, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "unknown");
});

test("an unregistered series (no producer entry) is 'unknown' — never guesses a cadence", () => {
  const f = deriveSeriesFreshness({ as_at_date: "2026-09-02" }, null, "2026-09-02");
  assert.equal(f.code, "unknown");
});

test("deriveSeriesFreshness accepts the buildSeriesBoard display-row field names (asAtDate/referencePeriod)", () => {
  const f = deriveSeriesFreshness({ asAtDate: "2026-09-02" }, euOilBulletin, "2026-09-02");
  assert.equal(f.code, "current");
});

test("every implemented registry producer resolves to a real cadence name (no silent 'irregular' for a decided cadence)", () => {
  for (const p of MARKET_SERIES_PRODUCERS.filter((p) => p.implemented)) {
    const name = cadenceNameForDays(p.cadenceDays);
    if (p.cadenceDays !== null) assert.notEqual(name, "irregular", `${p.keyPrefix} has a decided cadenceDays but mapped to irregular`);
  }
});

// ── summarizeBoardFreshness: panel summary, worst-governs rollup ───────────────────────────────────────

test("summarizeBoardFreshness on an empty list summarises as unknown with zero counts (never defaults to current)", () => {
  const s = summarizeBoardFreshness([]);
  assert.equal(s.total, 0);
  assert.equal(s.worst, "unknown");
  assert.deepEqual(s.counts, { current: 0, ageing: 0, stale: 0, frozen: 0, unknown: 0 });
});

test("summarizeBoardFreshness counts each state and surfaces the WORST state present", () => {
  const s = summarizeBoardFreshness([{ code: "current" }, { code: "current" }, { code: "stale" }, { code: "ageing" }]);
  assert.equal(s.total, 4);
  assert.deepEqual(s.counts, { current: 2, ageing: 1, stale: 1, frozen: 0, unknown: 0 });
  assert.equal(s.worst, "stale");
});

test("summarizeBoardFreshness accepts bare code strings, not just {code} objects", () => {
  const s = summarizeBoardFreshness(["current", "frozen"]);
  assert.equal(s.worst, "frozen");
});

test("summarizeBoardFreshness: one frozen series governs the summary even among mostly-current peers", () => {
  const s = summarizeBoardFreshness([{ code: "current" }, { code: "current" }, { code: "current" }, { code: "frozen" }]);
  assert.equal(s.worst, "frozen");
});
