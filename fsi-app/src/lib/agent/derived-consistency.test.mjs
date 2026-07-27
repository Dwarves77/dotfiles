// Gate B arithmetic-consistency guard (operator ruling 2026-07-27): a DERIVED mint is allowed ONLY when the
// derived date is arithmetically produced by its basis recurring rule. A wrong match becomes a rejected mint,
// never a mis-derivation in the corpus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecurringRule, parseDerivedDate, isDerivedConsistent } from "./derived-consistency.mjs";

const JUNE1 = "Reporting is due every year by June 1 for buildings with no residential utility accounts.";

test("parseRecurringRule: annual June-1 rule", () => {
  assert.deepEqual(parseRecurringRule(JUNE1), { kind: "annual", month: 6, day: 1 });
});
test("parseRecurringRule: no annual signal → null (a one-off dated event is not a recurring rule)", () => {
  assert.equal(parseRecurringRule("Effective June 9, 2026, the surcharge applies."), null);
});

test("parseDerivedDate: forms", () => {
  assert.deepEqual(parseDerivedDate("1 June 2027"), { day: 1, month: 6, year: 2027 });
  assert.deepEqual(parseDerivedDate("June 2026"), { day: null, month: 6, year: 2026 });
  assert.deepEqual(parseDerivedDate("2027"), { year: 2027, month: null, day: null });
  assert.deepEqual(parseDerivedDate("2026-06-10"), { year: 2026, month: 6, day: 10 });
  assert.equal(parseDerivedDate("13 percent"), null);
});

test("CONSISTENT: annual June-1 grounds June-1 dates, June-months, and bare years", () => {
  assert.equal(isDerivedConsistent(JUNE1, "1 June 2027"), true);
  assert.equal(isDerivedConsistent(JUNE1, "June 2026"), true);
  assert.equal(isDerivedConsistent(JUNE1, "2027"), true);
});

test("REJECT: month mismatch (a June-1 rule cannot ground a May/July date)", () => {
  assert.equal(isDerivedConsistent(JUNE1, "May 2026"), false);
  assert.equal(isDerivedConsistent(JUNE1, "3 July 2026"), false);
});
test("REJECT: day mismatch (June-1 rule cannot ground June-10)", () => {
  assert.equal(isDerivedConsistent(JUNE1, "2026-06-10"), false);
});
test("REJECT: non-recurring basis (no annual signal) → no rule → reject", () => {
  assert.equal(isDerivedConsistent("Effective June 9, 2026.", "1 June 2027"), false);
});
test("REJECT: token is not a date (a figure) → reject", () => {
  assert.equal(isDerivedConsistent(JUNE1, "13 percent"), false);
});
test("REJECT: year out of horizon", () => {
  assert.equal(isDerivedConsistent(JUNE1, "1 June 3200"), false);
});
