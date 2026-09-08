// pluralize / countNoun — the one home for a noun agreeing with its number.
//
// The production defect these would have caught (click-through audit 2026-09-08): the dashboard
// rail printed "1 regional rooms" — a plural noun against a count of one. The count itself was also
// the wrong quantity (fixed in surface-coverage.ts), but the grammar was independently broken, and
// with a hand-written ternary at every count site there was nothing that could have failed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { pluralize, countNoun } = jiti("./format.ts");

test("a count of one takes the singular", () => {
  assert.equal(pluralize(1, "room"), "room");
  assert.equal(countNoun(1, "regional room"), "1 regional room");
});

test("every other count takes the plural, zero included", () => {
  assert.equal(countNoun(0, "regional room"), "0 regional rooms");
  assert.equal(countNoun(7, "regional room"), "7 regional rooms");
  assert.equal(countNoun(2, "jurisdiction"), "2 jurisdictions");
});

test("an irregular plural is passed, never guessed", () => {
  assert.equal(pluralize(1, "analysis", "analyses"), "analysis");
  assert.equal(pluralize(3, "analysis", "analyses"), "analyses");
});

test("the count keeps its thousands separators", () => {
  assert.equal(countNoun(1317, "regulation"), "1,317 regulations");
});

test("minus one is still singular", () => {
  assert.equal(countNoun(-1, "day"), "-1 day");
});

test("the rail note and the nav badge read one field, so they cannot disagree", () => {
  // The shape of the live defect: two labels for one quantity, sourced from two different fields.
  const { readFileSync } = jiti("node:fs");
  const brief = readFileSync(resolve(APP, "components/dashboard/DashboardBrief.tsx"), "utf8");
  const nav = readFileSync(resolve(APP, "lib/nav/nav-counts.ts"), "utf8");
  const railLine = brief.split("\n").find((l) => l.includes('label="Community"'));
  assert.ok(railLine, "the Community rail stat exists");
  assert.ok(
    railLine.includes("community.regionalRooms") && railLine.includes("countNoun("),
    "the rail note reads the room roster through countNoun, not a hand-written plural"
  );
  assert.ok(
    nav.includes("coverage.community.regionalRooms"),
    "the nav badge reads the same field as the rail note"
  );
});
