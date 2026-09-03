// Proves spec 05 §6 acceptance criteria 1 and 9 against the LIVE shared vocabulary — a future edit that
// accidentally widens ORIGIN_CLASS.community.admissibleInCalculation to true fails THIS test, not just a
// prose claim in an audit doc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdmissibleInCalculation, isCitableAsFact, filterOperationsAdmissible, recordsNotCitableAsFact } from "./lineage-guard.mjs";

test("acceptance criterion 1: community is never admissible in a calculation/Operations figure", () => {
  assert.equal(isAdmissibleInCalculation("community"), false);
});

test("acceptance criterion 1: community-corroborated is still never admissible (may be a signal, never a point estimate — spec 05 §4 gate 2)", () => {
  assert.equal(isAdmissibleInCalculation("community-corroborated"), false);
});

test("acceptance criterion 1: verified content IS admissible (it has left Community, editorially traced to a primary source)", () => {
  assert.equal(isAdmissibleInCalculation("verified"), true);
});

test("filterOperationsAdmissible: strips every community/community-corroborated record from a mixed set", () => {
  const records = [
    { id: "a", originClass: "community" },
    { id: "b", originClass: "community-corroborated" },
    { id: "c", originClass: "verified" },
    { id: "d", originClass: "official" },
  ];
  const kept = filterOperationsAdmissible(records);
  assert.deepEqual(kept.map((r) => r.id), ["c", "d"]);
});

test("acceptance criterion 9: community is never citable as fact", () => {
  assert.equal(isCitableAsFact("community"), false);
  assert.equal(isCitableAsFact("community-corroborated"), false);
});

test("recordsNotCitableAsFact: names every record the Assistant must refuse to cite", () => {
  const records = [
    { id: "a", originClass: "community" },
    { id: "b", originClass: "verified" },
  ];
  const refused = recordsNotCitableAsFact(records);
  assert.deepEqual(refused.map((r) => r.id), ["a"]);
});

test("an unknown/unclassified origin_class is never admissible and never citable (fail closed)", () => {
  assert.equal(isAdmissibleInCalculation("not-a-real-class"), false);
  assert.equal(isCitableAsFact(undefined), false);
});
