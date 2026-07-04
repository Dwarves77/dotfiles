// @ts-check
// Red-then-green for the floor-first span re-attribution (span-attribution unit, ruling 2026-07-03).
// The MOAT property: a FACT whose verbatim span sits in BOTH a floor-qualifying source and a sub-floor
// corroborator resolves to the FLOOR source — where the legacy single-URL attribution (extractor's chosen
// pool row) took the corroborator and walled on fact_below_authority_floor. Plus 4c never-forced.

import { test } from "node:test";
import assert from "node:assert/strict";
import { floorSources, reattributeToFloor, MIN_REATTRIB_SPAN } from "./floor-attribution.mjs";

// A binding legal clause, long enough to be a real FACT span (> MIN_REATTRIB_SPAN).
const CLAUSE = "producers shall ensure packaging is recyclable by design from 1 January 2030";
// The floor primary (T1, e.g. lovdata.no) carries the enacted clause in full.
const FLOOR = { url: "https://lovdata.no/eli/lov/2030/xyz", text: `Section 4. ${CLAUSE}. Section 5. ...`, tier: 1 };
// A sub-floor corroborator (T6 law-firm briefing) that ECHOES the same clause verbatim.
const CORROB = { url: "https://lr.org/insights/packaging", text: `Our reading: ${CLAUSE} — clients should act now.`, tier: 6 };
// Another sub-floor corroborator that carries an ANALYSIS-only sentence, NOT the clause.
const ANALYSIS_ONLY = { url: "https://edie.net/x", text: "Analysts expect knock-on costs across the sector.", tier: 6 };

const FLOOR_TIER = 2; // regulation family

test("floorSources filters + orders best-tier-first, drops null/sub-floor", () => {
  const pool = [CORROB, FLOOR, { url: "u", text: "t", tier: 2 }, { url: "n", text: "t", tier: null }];
  const fs = floorSources(pool, FLOOR_TIER);
  assert.deepEqual(fs.map((s) => s.tier), [1, 2]); // T6 and null excluded; T1 before T2
});

test("floorSources exempt type (null floor) -> empty", () => {
  assert.deepEqual(floorSources([FLOOR, CORROB], null), []);
});

test("RED->GREEN: span in BOTH corroborator and floor -> re-attributes to the floor source", () => {
  const ordered = floorSources([CORROB, FLOOR], FLOOR_TIER);
  // Legacy behaviour: the extractor attributed the span to the T6 corroborator -> currentTier 6 (> floor 2)
  // -> the fact_below_authority_floor wall. The re-attribution must rescue it to the T1 floor source.
  const got = reattributeToFloor(CLAUSE, 6, ordered, FLOOR_TIER);
  assert.ok(got, "expected re-attribution to a floor source (the moat)");
  assert.equal(got.url, FLOOR.url);
  assert.equal(got.tier, 1);
});

test("4c NEVER FORCED: span absent from every floor source -> null (honest wall, no floor stamp)", () => {
  // The corroborator carries the span, but NO floor source does — the fact is genuinely not in a floor
  // primary. It must NOT be forced onto one.
  const ordered = floorSources([CORROB, ANALYSIS_ONLY], FLOOR_TIER); // no floor-tier sources at all
  assert.equal(reattributeToFloor(CLAUSE, 6, ordered, FLOOR_TIER), null);
  // And even with a floor source present, an ANALYSIS-only span it doesn't contain stays unforced.
  const ordered2 = floorSources([FLOOR], FLOOR_TIER);
  assert.equal(reattributeToFloor("Analysts expect knock-on costs across the sector.", 6, ordered2, FLOOR_TIER), null);
});

test("already at/above floor -> no needless re-point", () => {
  const ordered = floorSources([FLOOR], FLOOR_TIER);
  assert.equal(reattributeToFloor(CLAUSE, 2, ordered, FLOOR_TIER), null); // currentTier 2 == floor
  assert.equal(reattributeToFloor(CLAUSE, 1, ordered, FLOOR_TIER), null); // currentTier 1 < floor
});

test("exempt item type (null floor) -> no re-attribution", () => {
  const ordered = floorSources([FLOOR], null);
  assert.equal(reattributeToFloor(CLAUSE, 6, ordered, null), null);
});

test("too-short span is not re-homed (avoids coincidental fragment match)", () => {
  const short = "shall".padEnd(MIN_REATTRIB_SPAN - 1, "x").slice(0, MIN_REATTRIB_SPAN - 1);
  const floor = { url: FLOOR.url, text: `prefix ${short} suffix`, tier: 1 };
  const ordered = floorSources([floor], FLOOR_TIER);
  assert.equal(reattributeToFloor(short, 6, ordered, FLOOR_TIER), null);
});

test("case-insensitive + trims whitespace on the verbatim match", () => {
  const ordered = floorSources([FLOOR], FLOOR_TIER);
  const got = reattributeToFloor(`  ${CLAUSE.toUpperCase()}  `, null, ordered, FLOOR_TIER);
  assert.ok(got);
  assert.equal(got.url, FLOOR.url);
});
