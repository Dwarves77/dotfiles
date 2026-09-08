// forward-event-format.test.mjs — proves precision-honest date rendering: year/month/day precision
// each show exactly what the source stated, never a fabricated day/month.
import test from "node:test";
import assert from "node:assert/strict";
import { formatEventDate, formatEventDateCompact } from "./forward-event-format.mjs";

test("year precision: shows only the year, never a fabricated January 1st", () => {
  assert.equal(formatEventDate("2030-01-01", "year"), "2030");
});

test("month precision: shows month name + year, never a fabricated day", () => {
  assert.equal(formatEventDate("2026-11-01", "month"), "November 2026");
});

test("day precision: shows the full date", () => {
  assert.equal(formatEventDate("2026-12-31", "day"), "December 31, 2026");
});

test("day precision does not zero-pad the day number", () => {
  assert.equal(formatEventDate("2026-01-05", "day"), "January 5, 2026");
});

test("all twelve month names render correctly", () => {
  const expected = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, "0");
    assert.equal(formatEventDate(`2026-${mm}-15`, "month"), `${expected[i - 1]} 2026`);
  }
});

test("malformed date string: returned verbatim, never guessed", () => {
  assert.equal(formatEventDate("not-a-date", "day"), "not-a-date");
  assert.equal(formatEventDate("", "day"), "");
  assert.equal(formatEventDate(null, "day"), "");
  assert.equal(formatEventDate(undefined, "year"), "");
});

test("timezone-safety: does not roll the date back a day via locale/Date parsing", () => {
  // A naive `new Date(eventDate).toLocaleDateString()` in a negative-UTC-offset timezone would render
  // "2026-01-01" as December 31, 2025. This function must never do that — it parses the string parts
  // directly, so the result is identical regardless of the host's TZ.
  assert.equal(formatEventDate("2026-01-01", "day"), "January 1, 2026");
  assert.equal(formatEventDate("2026-01-01", "year"), "2026");
});

// formatEventDateCompact — the 48px rail-column form (artboard 02/id="p2" "OBLIGATIONS · NEXT 30
// DAYS" draws "Sep 25 2026"). Same precision honesty, shorter string.
test("compact: day precision renders the artboard's own 'Sep 25 2026' form", () => {
  assert.equal(formatEventDateCompact("2026-09-25", "day"), "Sep 25 2026");
  assert.equal(formatEventDateCompact("2026-10-01", "day"), "Oct 1 2026");
});

test("compact: month precision names no day, year precision names no month", () => {
  assert.equal(formatEventDateCompact("2026-11-01", "month"), "Nov 2026");
  assert.equal(formatEventDateCompact("2030-01-01", "year"), "2030");
});

test("compact: all twelve months render as their three-letter abbreviation", () => {
  const expected = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, "0");
    assert.equal(formatEventDateCompact(`2026-${mm}-15`, "month"), `${expected[i - 1]} 2026`);
  }
});

test("compact: malformed input verbatim, and no timezone roll", () => {
  assert.equal(formatEventDateCompact("not-a-date", "day"), "not-a-date");
  assert.equal(formatEventDateCompact("", "day"), "");
  assert.equal(formatEventDateCompact(null, "day"), "");
  assert.equal(formatEventDateCompact("2026-01-01", "day"), "Jan 1 2026");
});
