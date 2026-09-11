// Unit test for exemptions-law2-desktop.mjs (lane railfacets, train 62, 2026-09-08, operator item
// C1). Pure functions only, no npm, no browser — the same posture as exemptions-375.test.mjs beside
// it; run-rendering-guard.mjs's own wiring of these functions is proven by running the guard.
//
// What these cases are FOR: an exemption is a hole in a gate, so the test that matters is not that
// the hole works, it is that the hole is exactly the shape it claims. Every case below is a line
// the matcher must REFUSE.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAW2_DESKTOP_EXEMPTIONS,
  isExemptLaw2Desktop,
  activeLaw2Exemptions,
  viewportOf,
} from "./exemptions-law2-desktop.mjs";

const ACTIVE = activeLaw2Exemptions(LAW2_DESKTOP_EXEMPTIONS, 62);
const FLOOR = "interactive target(s) below the law-2 floor (≥44px, or ≥24px with 8px clearance)";
/** n facet-row targets, spelled exactly as assertUxClean spells them. */
const facet = (n) =>
  Array.from({ length: n }, () => "input[cl-facet-check] 1152×24px (0px from a neighbour)").join(", ");

test("the entry is the facet row, above 768, dated, with an expiry", () => {
  assert.equal(LAW2_DESKTOP_EXEMPTIONS.length, 1);
  const e = LAW2_DESKTOP_EXEMPTIONS[0];
  assert.equal(e.targetName, "input[cl-facet-check]");
  assert.equal(e.minViewport, 768);
  assert.equal(e.dated, "2026-09-08");
  assert.ok(Number.isInteger(e.expiryWave) && e.expiryWave > 62);
});

test("viewportOf reads the width out of a guard failure label", () => {
  assert.equal(viewportOf("market-rows:extreme@1280: 5 targets"), 1280);
  assert.equal(viewportOf("market-rows:extreme: 5 targets"), null);
});

test("GREEN: a desktop line naming only facet rows is exempt", () => {
  const line = `operations-ledger:empty@1280: 6 ${FLOOR} — ${facet(6)}`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), true);
});

test("RED: the same line at 375 is NOT exempt (that is where the 44px target must hold)", () => {
  const line = `operations-ledger:empty@375: 6 ${FLOOR} — ${facet(6)}`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("RED: a line mixing a facet row with any other undersized control is NOT exempt", () => {
  const line = `market-rows:extreme@1280: 2 ${FLOOR} — input[cl-facet-check] 1152×24px (0px from a neighbour), button[Dismiss] 20×20px (2px from a neighbour)`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("RED: a TRUNCATED line is NOT exempt — it could be hiding a target this file has never seen", () => {
  const line = `market-rows:extreme@1280: 12 ${FLOOR} — ${facet(8)}, …`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("RED: a line whose declared count exceeds the targets it names is NOT exempt", () => {
  const line = `market-rows:extreme@1280: 7 ${FLOOR} — ${facet(6)}`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("RED: no other detector is ever suppressed, whatever it names", () => {
  const line = `market-rows:extreme@1280: 1 element(s) clipped past the viewport's right edge with no scrolling ancestor — input[cl-facet-check] right=1300px > 1280px`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("RED: a target whose name merely BEGINS with the exempt class is not the exempt target", () => {
  const line = `market-rows:extreme@1280: 1 ${FLOOR} — input[cl-facet-checkbox-legacy] 40×20px (0px from a neighbour)`;
  assert.equal(isExemptLaw2Desktop(line, ACTIVE), false);
});

test("the entry expires: past its wave it covers nothing and the guard fails again", () => {
  const expired = activeLaw2Exemptions(LAW2_DESKTOP_EXEMPTIONS, LAW2_DESKTOP_EXEMPTIONS[0].expiryWave);
  assert.deepEqual(expired, []);
  const line = `operations-ledger:empty@1280: 6 ${FLOOR} — ${facet(6)}`;
  assert.equal(isExemptLaw2Desktop(line, expired), false);
});

// CORRECTED (coordinator review, 2026-09-11, task 0.1 follow-up, [CONFIRMED by the reviewer]): this
// test used to assert the OPPOSITE - "an unknown wave degrades to active, the same best-effort
// posture as F25's oracle" - and that assertion was itself the bug. A null wave is exactly what a
// depth-1 pull_request checkout resolves (no origin/master ref, no waveNN token on the one-commit
// HEAD), and "degrades to active" meant that checkout kept suppressing a finding that the
// corresponding push checkout, resolving a real and expired wave on the SAME tree, correctly failed
// on. fetch-depth: 0 (this lane's earlier commit) made the null path unreachable on the two observed
// CI events, but the predicate itself was still fail-open, so any OTHER path to an unknown wave (a
// future job that stays shallow, a local run with no git history) would silently re-open the
// suppression this exemption is supposed to close on schedule. A guard's default under uncertainty is
// closed, not open: rule 15's "a guard is proven by attack, not by presence" is why this line now
// reads what it reads instead of asserting the old default.
test("an unknown wave degrades to EXPIRED, fail closed, not to active", () => {
  assert.equal(activeLaw2Exemptions(LAW2_DESKTOP_EXEMPTIONS, null).length, 0);
});
