// TARGET-MATCH: an instrument whose NUMBER is itself year-like must still be detected.
//
// DEFECT (found live 2026-07-30 on CELEX 32025R2083, CBAM simplification): `normPair` decides which half of an
// "N/N" pair is the year by range-testing both halves — but returns null when BOTH fall in 1950..2099. Its
// comment claims that branch means "neither looks like a year"; the real-world case is the opposite, BOTH do.
// EU instrument numbers now routinely exceed 2000 (2025/2083 is a real regulation), so every instrument numbered
// in the year range is INVISIBLE to the capture-side scan.
//
// Why that is worse than a silent miss: `expectedInstrumentIds` derives the item's own key via parseYearNumber,
// which takes the first group as the year unconditionally — so "2025/2083" IS expected but can never be FOUND.
// The asymmetry drives verifyTargetMatch to a hard MISMATCH ("the item's own identifier is absent") while the
// OTHER instruments the document cites are detected normally. CBAM's 75K draft was hard-held on exactly this,
// grounding zero claims — the false MISMATCH the module's own "precision over recall" comment calls the worst case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanInstrumentIds, expectedInstrumentIds, verifyTargetMatch } from "./target-match.mjs";

const has = (text, key) => scanInstrumentIds(text).has(key);

test("RED: prose form with a year-like NUMBER is detected", () => {
  assert.ok(has("REGULATION (EU) 2025/2083 OF THE EUROPEAN PARLIAMENT", "2025/2083"),
    "an instrument numbered 2083 in year 2025 must be found");
  assert.ok(has("Regulation (EU) 2025/2084", "2025/2084"));
});

test("RED: CELEX form with a year-like number is detected", () => {
  assert.ok(has("document 32025R2083 in the register", "2025/2083"),
    "the CELEX branch is structurally year-first; a year-like number must not drop it");
});

test("RED: the CBAM capture shape resolves to MATCH, not mismatch", () => {
  // The real header shape, plus the other instruments the regulation amends (which always scanned fine).
  const capture = "Official Journal of the European Union EN L series 2025/2083 17.10.2025 "
    + "REGULATION (EU) 2025/2083 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 8 October 2025 "
    + "amending Regulation (EU) 2023/956 as regards simplifying and strengthening the carbon border adjustment mechanism";
  const item = { title: "Regulation (EU) 2025/2083 CBAM simplification", item_type: "regulation", instrument_identifier: "32025R2083" };
  assert.deepEqual([...expectedInstrumentIds(item)], ["2025/2083"], "expected key derives from the item's own identifier");
  const v = verifyTargetMatch(item, capture);
  assert.equal(v.verdict, "match", `a document titling itself must MATCH; got ${v.verdict} — ${v.reason}`);
});

test("GREEN (unchanged): non-year-like numbers still resolve", () => {
  assert.ok(has("amending Regulation (EU) 2023/956", "2023/956"));
  assert.ok(has("Regulation (EU) 2025/999", "2025/999"));
  assert.ok(has("Commission Delegated Regulation (EU) 2023/2830", "2023/2830"));
});

test("GREEN (unchanged): pre-2015 number-first form still resolves", () => {
  // "No 1610/2024" is number/year; 1610 is outside the year range so the existing inference handles it.
  assert.ok(has("Regulation (EC) No 1610/2024", "2024/1610"));
});

test("GREEN (unchanged): trailing-suffix directive form still resolves", () => {
  assert.ok(has("Directive 2014/95/EU on non-financial reporting", "2014/95"));
});

test("GREEN (unchanged): a bare pair with no instrument word is still NOT counted", () => {
  assert.equal(scanInstrumentIds("published 2025/2083 on the portal").size, 0,
    "conservative context requirement is preserved — bare pairs remain noise");
});

test("a genuinely different instrument still MISMATCHES (the gate keeps working)", () => {
  const item = { title: "HDV CO2 in-service verification", item_type: "regulation", instrument_identifier: "32025R0035" };
  const capture = "REGULATION (EU) 2025/2083 OF THE EUROPEAN PARLIAMENT amending Regulation (EU) 2023/956";
  assert.equal(verifyTargetMatch(item, capture).verdict, "mismatch",
    "widening detection must not weaken the wrong-instrument hold");
});
