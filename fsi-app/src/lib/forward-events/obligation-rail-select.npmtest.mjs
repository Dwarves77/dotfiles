// Proof for obligation-rail-select.mjs — the 30-day window and four-row cap the Regulations rail
// card "OBLIGATIONS · NEXT 30 DAYS" (artboard 02/id="p2") applies on top of the existing bounded
// read GET /api/obligations/upcoming.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OBLIGATION_RAIL_WINDOW_DAYS,
  OBLIGATION_RAIL_ROW_CAP,
  utcDayStart,
  daysFrom,
  selectObligationRailRows,
} from "./obligation-rail-select.mjs";

const NOW = new Date("2026-09-08T11:00:00Z");
const ev = (id, date) => ({ id, event_date: date, date_precision: "day", event_kind: "compliance_deadline", obligation_text: `o-${id}`, item: { id, title: `t-${id}`, legacy_id: null, jurisdiction_iso: ["eu"] } });

test("the window is 30 days and the cap is the artboard's four rows", () => {
  assert.equal(OBLIGATION_RAIL_WINDOW_DAYS, 30);
  assert.equal(OBLIGATION_RAIL_ROW_CAP, 4);
});

test("utcDayStart parses a date column without a timezone roll", () => {
  assert.equal(utcDayStart("2026-01-01"), Date.UTC(2026, 0, 1));
  assert.equal(utcDayStart("2026-09-25T00:00:00Z"), Date.UTC(2026, 8, 25));
  assert.equal(utcDayStart("not-a-date"), null);
  assert.equal(utcDayStart(null), null);
  assert.equal(utcDayStart(undefined), null);
});

test("daysFrom counts whole days, negative for a passed date", () => {
  assert.equal(daysFrom("2026-09-08", NOW), 0);
  assert.equal(daysFrom("2026-09-25", NOW), 17);
  assert.equal(daysFrom("2026-10-08", NOW), 30);
  assert.equal(daysFrom("2026-09-07", NOW), -1);
  assert.equal(daysFrom("nope", NOW), null);
});

test("keeps only dates inside [today, today + 30], dropping passed and far-future rows", () => {
  const rows = selectObligationRailRows(
    [ev("passed", "2026-09-01"), ev("today", "2026-09-08"), ev("edge", "2026-10-08"), ev("beyond", "2026-10-09")],
    NOW
  );
  assert.deepEqual(rows.map((r) => r.id), ["today", "edge"]);
});

test("sorts soonest first regardless of the order the API returned", () => {
  const rows = selectObligationRailRows([ev("c", "2026-10-01"), ev("a", "2026-09-10"), ev("b", "2026-09-30")], NOW);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c"]);
});

test("caps at four rows even when more fall inside the window", () => {
  const rows = selectObligationRailRows(
    ["09-10", "09-12", "09-14", "09-16", "09-18", "09-20"].map((d, i) => ev(`e${i}`, `2026-${d}`)),
    NOW
  );
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.id), ["e0", "e1", "e2", "e3"]);
});

test("an undated event is dropped, never rendered undated", () => {
  const rows = selectObligationRailRows([ev("no-date", null), ev("dated", "2026-09-20")], NOW);
  assert.deepEqual(rows.map((r) => r.id), ["dated"]);
});

test("a non-array, empty or all-out-of-window input yields no rows, so the caller renders Absence", () => {
  assert.deepEqual(selectObligationRailRows(null, NOW), []);
  assert.deepEqual(selectObligationRailRows(undefined, NOW), []);
  assert.deepEqual(selectObligationRailRows([], NOW), []);
  assert.deepEqual(selectObligationRailRows([ev("far", "2027-01-01")], NOW), []);
});
