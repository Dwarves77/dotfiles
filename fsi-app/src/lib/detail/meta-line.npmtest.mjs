// The invariant: a detail sub-line names each thing once.
//
// The production defect this would have caught (click-through audit 2026-09-08, /market/[id]):
//   "Sustainable Packaging Coalition (a project of GreenBlue) ·
//    Sustainable Packaging Coalition (a project of GreenBlue) · published Sep 2, 2026"
// The page used `publisher` for BOTH the breadcrumb ("Market / <publisher>") and the first part of
// the deck, and the surface joined the two with " · ".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": APP } });
const { joinMetaSegments, splitMetaSegments } = jiti("./meta-line.ts");

const SPC = "Sustainable Packaging Coalition (a project of GreenBlue)";

test("the live market sub-line names its source once", () => {
  const crumb = `Market / ${SPC}`;
  const deck = `${SPC} · published Sep 2, 2026`;
  const line = joinMetaSegments([crumb, ...splitMetaSegments(deck), "2 independent sources corroborate"]);
  assert.equal(line, `Market / ${SPC} · published Sep 2, 2026 · 2 independent sources corroborate`);
  assert.equal(line.split(SPC).length - 1, 1, "exactly one occurrence of the source name");
});

test("the live regulation sub-line names its jurisdiction and publisher once each", () => {
  const groupLabel = "Global · IMO";
  const deck = "IMO · Effective Jan 1, 2027 · Reviewed Sep 1, 2026 · Global · Ocean";
  const line = joinMetaSegments([groupLabel, ...splitMetaSegments(deck)]);
  assert.equal(line, "Global · IMO · Effective Jan 1, 2027 · Reviewed Sep 1, 2026 · Ocean");
});

test("a repeat is dropped whether it is a whole earlier segment or one of its parts", () => {
  assert.equal(joinMetaSegments(["Ocean", "Ocean"]), "Ocean");
  assert.equal(joinMetaSegments(["Market / Acme", "Acme"]), "Market / Acme");
  assert.equal(joinMetaSegments(["Global · IMO", "IMO"]), "Global · IMO");
});

test("matching ignores case and inner whitespace, because two producers format differently", () => {
  assert.equal(joinMetaSegments(["Market / Acme Corp", "acme  corp"]), "Market / Acme Corp");
});

test("a partial word match is NOT a repeat", () => {
  assert.equal(joinMetaSegments(["Market", "Market signals"]), "Market · Market signals");
  assert.equal(joinMetaSegments(["Acme", "Acme Holdings"]), "Acme · Acme Holdings");
});

test("empty, null and false segments are dropped without leaving a stray separator", () => {
  assert.equal(joinMetaSegments(["Operations", null, "", undefined, false, "   ", "EU"]), "Operations · EU");
  assert.equal(joinMetaSegments([]), "");
  assert.equal(joinMetaSegments([null, undefined]), "");
});

test("the first occurrence keeps its own wording and position", () => {
  assert.equal(joinMetaSegments(["Acme Corp", "published Sep 2", "ACME CORP"]), "Acme Corp · published Sep 2");
});

test("splitMetaSegments round-trips a deck and tolerates an absent one", () => {
  assert.deepEqual(splitMetaSegments("a · b · c"), ["a", "b", "c"]);
  assert.deepEqual(splitMetaSegments(""), []);
  assert.deepEqual(splitMetaSegments(null), []);
  assert.deepEqual(splitMetaSegments(undefined), []);
});
