// Red-then-green for the change-detection fingerprint (P2-6 / S1-10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentFingerprint, isContentChange, normalizeForFingerprint } from "./content-change.mjs";

const LONG = "Regulation (EU) 2025/40 on packaging and packaging waste. ".repeat(10);

test("identical text fingerprints identically", () => {
  assert.equal(contentFingerprint(LONG), contentFingerprint(LONG));
});

test("whitespace and case differences do NOT change the fingerprint", () => {
  const messy = LONG.replace(/ /g, "   \n\t").toUpperCase();
  assert.equal(contentFingerprint(messy), contentFingerprint(LONG));
});

test("a wording change flips the fingerprint", () => {
  const changed = LONG.replace("2025/40", "2025/41");
  assert.notEqual(contentFingerprint(changed), contentFingerprint(LONG));
});

test("thin captures (error-page band, <200ch) are not fingerprinted", () => {
  assert.equal(contentFingerprint("404 Not Found"), null);
  assert.equal(contentFingerprint(""), null);
  assert.equal(contentFingerprint(null), null);
});

test("isContentChange: true only when both hashes exist and differ", () => {
  const a = contentFingerprint(LONG);
  const b = contentFingerprint(LONG + " amended");
  assert.equal(isContentChange(a, b), true);
  assert.equal(isContentChange(a, a), false);       // same content
  assert.equal(isContentChange(null, b), false);    // first observation is not a change
  assert.equal(isContentChange(a, null), false);    // thin/failed capture is not a change
  assert.equal(isContentChange(null, null), false);
});

test("normalizeForFingerprint collapses runs and trims", () => {
  assert.equal(normalizeForFingerprint("  A\n\tB  C  "), "a b c");
});
