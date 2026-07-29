// gate-a-match tests. Locks the %-spacing normalization (operator ruling 2026-07-29) with the exact
// red/green cases the ruling specified (a-e), plus decimal and separator boundary cases, and confirms the
// prior literal-and-exact behavior is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { containsToken, norm } from "./gate-a-match.mjs";

// (a) a capture's "33 %" grounds the token "33%"
test("(a) '33 %' in capture grounds token '33%'", () => {
  assert.equal(containsToken("the electricity share is 33 % by 2030", "33%"), true);
  assert.equal(containsToken("55.4 % of electricity", "55.4%"), true); // decimal too
});

// (b) numeral boundaries respected: "33%" does NOT match inside "133 %" or "233%"
test("(b) '33%' does not match inside '133 %' or '233%'", () => {
  assert.equal(containsToken("133 %", "33%"), false);
  assert.equal(containsToken("233%", "33%"), false);
  assert.equal(containsToken("155.4%", "55.4%"), false); // decimal suffix guarded
  assert.equal(containsToken("1.33%", "33%"), false);     // preceded by a decimal separator
});

// (c) only a whitespace run between the COMPLETE numeral and % collapses: "3 3 %" does not ground "33%"
test("(c) '3 3 %' does not ground '33%' (space inside the numeral)", () => {
  assert.equal(containsToken("3 3 %", "33%"), false);
});

// (d) the non-breaking-space variants match (U+00A0, U+202F — EU PDF spaces)
test("(d) non-breaking-space variants ground ''33%''", () => {
  assert.equal(containsToken("33 %", "33%"), true);   // U+00A0 no-break space
  assert.equal(containsToken("33 %", "33%"), true);   // U+202F narrow no-break space
  assert.equal(containsToken("55.4 %", "55.4%"), true);
});

// (e) prior literal-and-exact behavior unchanged
test("(e) prior behavior: literal substring, fail-closed, case-insensitive, no digit reduction", () => {
  assert.equal(containsToken("Reporting due by August 2025", "August 2025"), true);
  assert.equal(containsToken("August 2025", "2025"), true);       // literal substring still matches
  assert.equal(containsToken("2025", "August 2025"), false);      // not reversible
  assert.equal(containsToken("installed 500 MW of solar", "500 MW"), true);
  assert.equal(containsToken("anything", ""), false);             // empty token fails closed
  assert.equal(containsToken("The RATE is 50%", "50%"), true);    // case-insensitive + % clean
  assert.equal(containsToken("EUR 57 million", "EUR 57"), true);
  assert.equal(containsToken("total 100% coverage", "100%"), true);
  assert.equal(norm("a  b"), "a b");                          // norm still folds unicode ws
});

// integer-% tokens the gov.si NECP capture uses ("70 %", "55 %" in the PDF)
test("integer-% tokens ground against space-formatted captures", () => {
  for (const [cap, tok] of [["70 % reduction", "70%"], ["at least 55 %", "55%"], ["90 % of the", "90%"]]) {
    assert.equal(containsToken(cap, tok), true, `${tok} should ground in ${cap}`);
  }
});
