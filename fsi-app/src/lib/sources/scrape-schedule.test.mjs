// WAKE-PROOF (dormant-means-proven-wakeable, T8 census 2026-07-12): the scrape-cadence gate is the primary
// deliberate-OFF mechanism — it gates check-sources (the hourly cron) and the cadence-flip intake path. This
// proves the mechanism WAKES CORRECTLY when the operator flips the cadence, with the gate simulated open and a
// deterministic `now` — NO live fetch / spend / mutation. "It will work when flipped" is otherwise an untested
// claim (the flip-set launch-day risk).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrapeWindowOpen } from "./scrape-schedule.ts";

const D = (ymd) => new Date(ymd + "T12:00:00Z");

test("WAKE-PROOF: cadence OFF (the current dormant state) → window CLOSED", () => {
  assert.equal(scrapeWindowOpen({ cadence: "off", startDate: "2026-07-01" }, D("2026-07-12")), false);
  assert.equal(scrapeWindowOpen({ cadence: "weekly", startDate: null }, D("2026-07-12")), false, "no start → closed");
});

test("WAKE-PROOF: cadence WEEKLY set + on-cadence day → window OPENS (check-sources would run)", () => {
  assert.equal(scrapeWindowOpen({ cadence: "weekly", startDate: "2026-07-01" }, D("2026-07-01")), true, "day 0");
  assert.equal(scrapeWindowOpen({ cadence: "weekly", startDate: "2026-07-01" }, D("2026-07-08")), true, "+7 days");
  assert.equal(scrapeWindowOpen({ cadence: "weekly", startDate: "2026-07-01" }, D("2026-07-05")), false, "off-cadence day");
});

test("WAKE-PROOF: cadence MONTHLY set + anchor day → window OPENS", () => {
  assert.equal(scrapeWindowOpen({ cadence: "monthly", startDate: "2026-07-15" }, D("2026-08-15")), true);
  assert.equal(scrapeWindowOpen({ cadence: "monthly", startDate: "2026-07-15" }, D("2026-08-10")), false);
});

test("WAKE-PROOF: paused-until-start (today < startDate) → CLOSED even with cadence set", () => {
  assert.equal(scrapeWindowOpen({ cadence: "weekly", startDate: "2026-08-01" }, D("2026-07-12")), false);
});
