// timeline-parse.test.mjs -- proves parseTimeline (moved out of extract-regulation-sections.ts, task
// 6.1b, brief-chain-build-plan-2026-09-11, fix E) directly, independent of the .ts consumer's own jiti
// requirement. The lane pilot's exact lines are the RED-then-GREEN fixtures: a colon separator (the
// repo's dash ban means a compliant lane never writes a literal em/en dash) previously parsed as zero
// entries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimeline } from "./timeline-parse.mjs";
import { buildTimelineRows } from "./timeline-harvest.mjs";

const TODAY = "2026-09-12";

test("lane fixture 1: a colon-separated day-month-year entry parses (was zero entries before the widen)", () => {
  const entries = parseTimeline(
    "- 3 November 2023: Commission Decision (EU) 2023/2463 adopted, repealing Decision 2013/131/EU."
  );
  assert.deepEqual(entries, [
    {
      date: "3 November 2023",
      label: "Commission Decision (EU) 2023/2463 adopted, repealing Decision 2013/131/EU.",
      source: null,
    },
  ]);
  const { rows, skipped } = buildTimelineRows(entries, TODAY);
  assert.equal(skipped.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].milestone_date, "2023-11-03");
});

test("lane fixture 2: a colon separator with a qualifying clause between the date and the colon still yields the 2040 row", () => {
  const entries = parseTimeline(
    "- 31 December 2040 and each five-year anniversary: the obligation restates on each such date."
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "31 December 2040");
  assert.match(entries[0].label, /^and each five-year anniversary: /);
  const { rows, skipped } = buildTimelineRows(entries, TODAY);
  assert.equal(skipped.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].milestone_date, "2040-12-31");
});

test("dash separators (hyphen-minus, en dash, em dash) still parse -- the pre-widen shape stays green", () => {
  const hyphen = parseTimeline("- 2026-01-01 - First reporting window opens");
  assert.equal(hyphen.length, 1);
  assert.equal(hyphen[0].date, "2026-01-01");
  assert.equal(hyphen[0].label, "First reporting window opens");

  const enDash = parseTimeline(`- Q3 2026 ${String.fromCharCode(0x2013)} Consultation closes`);
  assert.equal(enDash.length, 1);
  assert.equal(enDash[0].date, "Q3 2026");
  assert.equal(enDash[0].label, "Consultation closes");

  const emDash = parseTimeline(`- 1 January 2030 ${String.fromCharCode(0x2014)} Recycled-content floor applies (Source: Art. 7)`);
  assert.equal(emDash.length, 1);
  assert.equal(emDash[0].date, "1 January 2030");
  assert.equal(emDash[0].label, "Recycled-content floor applies");
  assert.equal(emDash[0].source, "Art. 7");
});

test("a mid-word hyphen in the label is never mistaken for the separator", () => {
  const entries = parseTimeline("- 2026-06-01: post-implementation review begins");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-06-01");
  assert.equal(entries[0].label, "post-implementation review begins");
});

test("recognised date SHAPES: ISO, month-day-year, month-year, quarter, half, bare year", () => {
  const cases = [
    ["- 2026-08-12: entry into force", "2026-08-12"],
    ["- August 12, 2026: entry into force", "August 12, 2026"],
    ["- August 2026: reporting window opens", "August 2026"],
    ["- Q3 2026: consultation closes", "Q3 2026"],
    ["- H1 2027: phase-in begins", "H1 2027"],
    ["- 2028: full obligation applies", "2028"],
  ];
  for (const [line, expectedDate] of cases) {
    const entries = parseTimeline(line);
    assert.equal(entries.length, 1, `expected one entry for: ${line}`);
    assert.equal(entries[0].date, expectedDate, `expected date ${expectedDate} for: ${line}`);
  }
});

test("a range joined by 'to' keeps the first endpoint as the date token", () => {
  const entries = parseTimeline("- 2026-01-01 to 2026-03-31: First reporting window");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, "2026-01-01 to 2026-03-31");
  assert.equal(entries[0].label, "First reporting window");
});

test("table rows are unchanged: date = column 1, label = column 2, header/separator rows skipped", () => {
  const md = [
    "| Date | Milestone | Status |",
    "|---|---|---|",
    "| 12 August 2026 | Entry into force | Upcoming |",
    "| 1 March 2027 | First compliance deadline | Upcoming |",
  ].join("\n");
  const entries = parseTimeline(md);
  assert.deepEqual(entries, [
    { date: "12 August 2026", label: "Entry into force", source: null },
    { date: "1 March 2027", label: "First compliance deadline", source: null },
  ]);
});

test("a line with no recognisable leading date token yields no entry", () => {
  assert.deepEqual(parseTimeline("- Upon entry into force: obligations apply"), []);
});

test("a line with a date but no separator at all yields no entry (never guesses a boundary)", () => {
  assert.deepEqual(parseTimeline("- 2026-01-01 obligations apply with no separator"), []);
});
