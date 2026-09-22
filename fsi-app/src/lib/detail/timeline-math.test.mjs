// timeline-math.test.mjs: the ActionCard TIMELINE part's pure date/collapse logic (lane
// W10-ActionCard-a, 2026-09-21). Relative import + explicit .ts extension, same convention as
// requirement-trajectory-classify.test.mjs, so this runs under bare `node --test` with no bundler.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDayMonthYear,
  daysBetween,
  daysPhrase,
  classifyMilestones,
  timelineHeaderCounts,
  collapseTimeline,
  nextMilestoneClause,
} from "./timeline-math.ts";

test("formatDayMonthYear: day-month-year shape, matching the review's own worked example", () => {
  assert.equal(formatDayMonthYear("2026-09-29"), "29 Sep 2026");
  assert.equal(formatDayMonthYear("1999-09-15"), "15 Sep 1999");
});

test("formatDayMonthYear: malformed input passes through unchanged rather than throwing", () => {
  assert.equal(formatDayMonthYear("not-a-date"), "not-a-date");
});

test("daysBetween: pinned 'from' date, exact day count", () => {
  assert.equal(daysBetween("2026-09-29", "2026-09-21"), 8);
  assert.equal(daysBetween("2026-09-21", "2026-09-21"), 0);
  assert.equal(daysBetween("2026-09-18", "2026-09-21"), -3);
});

test("daysBetween: same string in every TZ (UTC-midnight parse, no local-clock drift)", () => {
  const prev = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const est = daysBetween("2026-09-29", "2026-09-21");
    process.env.TZ = "UTC";
    const utc = daysBetween("2026-09-29", "2026-09-21");
    assert.equal(est, utc);
    assert.equal(est, 8);
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
});

test("daysPhrase: today / future / past", () => {
  assert.equal(daysPhrase(0), "today");
  assert.equal(daysPhrase(1), "in 1 day");
  assert.equal(daysPhrase(8), "in 8 days");
  assert.equal(daysPhrase(-1), "1 day ago");
  assert.equal(daysPhrase(-3), "3 days ago");
});

function entry(date, label, status) {
  return { date, label, status };
}

test("classifyMilestones: carries a stable index alongside the shared classifier's state", () => {
  const list = [entry("2026-01-01", "A", "past"), entry("2026-06-01", "B", "current"), entry("2026-12-01", "C", "future")];
  const classified = classifyMilestones(list);
  assert.deepEqual(classified.map((c) => c.state), ["passed", "next", "ahead"]);
  assert.deepEqual(classified.map((c) => c.index), [0, 1, 2]);
});

test("timelineHeaderCounts: total, passed, and the next milestone's own date", () => {
  const list = [entry("2026-01-01", "A", "past"), entry("2026-06-01", "B", "past"), entry("2026-09-29", "C", "current"), entry("2026-12-01", "D", "future")];
  const counts = timelineHeaderCounts(classifyMilestones(list));
  assert.deepEqual(counts, { total: 4, passed: 2, nextDate: "2026-09-29" });
});

test("timelineHeaderCounts: no next milestone (all passed) -> nextDate is null", () => {
  const list = [entry("2026-01-01", "A", "past"), entry("2026-02-01", "B", "past")];
  const counts = timelineHeaderCounts(classifyMilestones(list));
  assert.deepEqual(counts, { total: 2, passed: 2, nextDate: null });
});

test("collapseTimeline: 7 milestones (at the '1440 one line is fine' bound) -> not collapsed", () => {
  const list = Array.from({ length: 7 }, (_, i) => entry(`2026-0${i + 1}-01`, `M${i}`, i < 3 ? "past" : i === 3 ? "current" : "future"));
  const result = collapseTimeline(classifyMilestones(list));
  assert.equal(result.collapsed, false);
  assert.equal(result.visible.length, 7);
  assert.equal(result.hiddenCount, 0);
});

test("collapseTimeline: 8 milestones (the bound itself) -> not collapsed", () => {
  const list = Array.from({ length: 8 }, (_, i) => entry(`2026-0${Math.min(i + 1, 9)}-01`, `M${i}`, i < 3 ? "past" : i === 3 ? "current" : "future"));
  const result = collapseTimeline(classifyMilestones(list));
  assert.equal(result.collapsed, false);
  assert.equal(result.visible.length, 8);
});

test("collapseTimeline: 9 milestones (past the bound) -> next-three plus +N", () => {
  const list = Array.from({ length: 9 }, (_, i) =>
    entry(`2026-${String(i + 1).padStart(2, "0")}-01`, `M${i}`, i < 4 ? "past" : i === 4 ? "current" : "future"),
  );
  const result = collapseTimeline(classifyMilestones(list));
  assert.equal(result.collapsed, true);
  assert.equal(result.visible.length, 3);
  // "next" is index 4; the visible window is the next milestone plus the two immediately following it.
  assert.deepEqual(result.visible.map((c) => c.index), [4, 5, 6]);
  assert.equal(result.hiddenCount, 6);
});

test("collapseTimeline: 9 milestones, all passed (no 'next') -> trailing three, never a crash", () => {
  const list = Array.from({ length: 9 }, (_, i) => entry(`2026-${String(i + 1).padStart(2, "0")}-01`, `M${i}`, "past"));
  const result = collapseTimeline(classifyMilestones(list));
  assert.equal(result.collapsed, true);
  assert.equal(result.visible.length, 3);
  assert.deepEqual(result.visible.map((c) => c.index), [6, 7, 8]);
  assert.equal(result.hiddenCount, 6);
});

test("collapseTimeline: 1 milestone -> trivially not collapsed", () => {
  const result = collapseTimeline(classifyMilestones([entry("2026-09-29", "Only one", "current")]));
  assert.equal(result.collapsed, false);
  assert.equal(result.visible.length, 1);
});

test("nextMilestoneClause: the EXPOSURE cell's compact clause, matching the review's worked example", () => {
  const list = [entry("2026-09-29", "Transition deadline", "current")];
  const clause = nextMilestoneClause(classifyMilestones(list));
  assert.equal(clause, "Transition deadline · 29 Sep 2026 · in " + daysBetween("2026-09-29") + " days");
});

test("nextMilestoneClause: null when nothing is classified as next", () => {
  const list = [entry("2026-01-01", "A", "past")];
  assert.equal(nextMilestoneClause(classifyMilestones(list)), null);
});

test("nextMilestoneClause: empty list -> null, no crash", () => {
  assert.equal(nextMilestoneClause(classifyMilestones([])), null);
});
