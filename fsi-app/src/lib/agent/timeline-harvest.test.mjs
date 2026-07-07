// Red-then-green tests for the §14 timeline harvest (Phase-3b, DD-01/DD-02).
// The audit's exact defect classes are the fixtures: the PPWR day-precision case (12 August 2026
// stored as Aug-1 = fabricated precision), the empty-timeline class, and the silent-drop class.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toIsoDate, buildTimelineRows } from "./timeline-harvest.mjs";

const TODAY = "2026-07-07";

test("PPWR case (DD-02): '12 August 2026' is DAY-precise → exact date, clean label — never Aug-1", () => {
  assert.deepEqual(toIsoDate("12 August 2026"), { iso: "2026-08-12", precision: "day" });
  const { rows } = buildTimelineRows([{ date: "12 August 2026", label: "Regulation applies (Article 71)", source: null }], TODAY);
  assert.equal(rows[0].milestone_date, "2026-08-12");
  assert.equal(rows[0].label, "Regulation applies (Article 71)");
  assert.equal(rows[0].is_completed, false); // future as of 2026-07-07
});

test("day-precision variants: ISO, 'August 12, 2026', ordinals, abbreviations", () => {
  assert.equal(toIsoDate("2026-08-12").iso, "2026-08-12");
  assert.deepEqual(toIsoDate("August 12, 2026"), { iso: "2026-08-12", precision: "day" });
  assert.deepEqual(toIsoDate("12th Aug 2026"), { iso: "2026-08-12", precision: "day" });
});

test("non-day precisions keep the ORIGINAL token in the label (no fabricated day)", () => {
  assert.deepEqual(toIsoDate("Q3 2026"), { iso: "2026-07-01", precision: "quarter" });
  assert.deepEqual(toIsoDate("H2 2027"), { iso: "2027-07-01", precision: "half" });
  assert.deepEqual(toIsoDate("January 2030"), { iso: "2030-01-01", precision: "month" });
  assert.deepEqual(toIsoDate("2038"), { iso: "2038-01-01", precision: "year" });
  const { rows } = buildTimelineRows([{ date: "Q3 2026", label: "Consultation closes", source: null }], TODAY);
  assert.equal(rows[0].label, "Q3 2026 — Consultation closes");
  assert.equal(rows[0].milestone_date, "2026-07-01"); // period start, sort-order only
});

test("ranges normalize to the first endpoint and keep the full token in the label", () => {
  const r = toIsoDate("2026-01-01 to 2026-03-31");
  assert.deepEqual(r, { iso: "2026-01-01", precision: "range" });
  const { rows } = buildTimelineRows([{ date: "2026-01-01 to 2026-03-31", label: "First reporting window", source: null }], TODAY);
  assert.equal(rows[0].label, "2026-01-01 to 2026-03-31 — First reporting window");
});

test("unparseable tokens are SKIPPED AND REPORTED, never silently dropped or fabricated", () => {
  const { rows, skipped } = buildTimelineRows(
    [
      { date: "Upon entry into force", label: "Something", source: null },
      { date: "2026-13-40", label: "Bad date", source: null },
      { date: "12", label: "Not a year", source: null },
    ],
    TODAY
  );
  assert.equal(rows.length, 0);
  assert.equal(skipped.length, 3);
  assert.ok(skipped.every((s) => s.reason));
});

test("chronological sort, dedup, is_completed vs today, source appended", () => {
  const { rows } = buildTimelineRows(
    [
      { date: "1 January 2030", label: "Recycled-content floor", source: "Art. 7" },
      { date: "11 February 2025", label: "Entry into force", source: null },
      { date: "11 February 2025", label: "Entry into force", source: null }, // dup collapses
    ],
    TODAY
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].milestone_date, "2025-02-11");
  assert.equal(rows[0].is_completed, true); // past as of 2026-07-07
  assert.equal(rows[0].sort_order, 0);
  assert.equal(rows[1].milestone_date, "2030-01-01");
  assert.equal(rows[1].label, "Recycled-content floor (Art. 7)");
  assert.equal(rows[1].is_completed, false);
});

test("qualifier prefixes ('By 2030', 'From 12 August 2026') parse but stay label-qualified", () => {
  assert.deepEqual(toIsoDate("By 2030"), { iso: "2030-01-01", precision: "year" });
  // Day-precise inner date DEMOTES to 'qualified' — "From 12 August 2026" is not itself a day fact.
  assert.deepEqual(toIsoDate("From 12 August 2026"), { iso: "2026-08-12", precision: "qualified" });
  const { rows } = buildTimelineRows([{ date: "From 12 August 2026", label: "Obligations apply", source: null }], TODAY);
  assert.equal(rows[0].label, "From 12 August 2026 — Obligations apply"); // original token kept
});

test("season segments ('mid-2026', 'early 2027', 'late 2028') anchor for sort, token kept in label", () => {
  assert.deepEqual(toIsoDate("mid-2026"), { iso: "2026-06-01", precision: "segment" });
  assert.deepEqual(toIsoDate("Early 2027"), { iso: "2027-01-01", precision: "segment" });
  assert.deepEqual(toIsoDate("late 2028"), { iso: "2028-10-01", precision: "segment" });
});
