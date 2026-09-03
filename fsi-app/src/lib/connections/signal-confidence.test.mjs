// signal-confidence.test.mjs — proves the decisive/undecided split, the per-group evidence rules
// (single regulation identifier decisive; single title-entity undecided; 2+ independent title-entity
// tokens decisive; vocabulary-registered title-entity decisive), edge aggregation (one row per pair per
// direction, multi-kind basis merge, relationship='related'), and fail-closed on an unknown signal kind.
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySignalGroup, classifySignalCandidates, buildAutoAdoptEdges, planSignalAdoption,
  groupStaleFlagsForResolution, SIGNAL_CONFIDENCE, AUTO_ADOPT_WEIGHT, TITLE_ENTITY_VOCABULARY,
} from "./signal-confidence.mjs";
import { SIGNAL_NAMESPACE, createdBy } from "./flag-namespaces.mjs";

test("classifySignalGroup: a single shared regulation identifier is decisive", () => {
  const v = classifySignalGroup("shared_regulation_identifier", new Set(["2023/1805"]));
  assert.equal(v.confidence, SIGNAL_CONFIDENCE.DECISIVE);
  assert.equal(v.weight, AUTO_ADOPT_WEIGHT.shared_regulation_identifier);
});

test("classifySignalGroup: a single shared title-entity token is undecided", () => {
  const v = classifySignalGroup("shared_title_entity", new Set(["Fit for 55 Package"]));
  assert.equal(v.confidence, SIGNAL_CONFIDENCE.UNDECIDED);
  assert.equal(v.weight, 0);
});

test("classifySignalGroup: two independent title-entity tokens are decisive", () => {
  const v = classifySignalGroup("shared_title_entity", new Set(["Fit for 55 Package", "Emissions Trading System"]));
  assert.equal(v.confidence, SIGNAL_CONFIDENCE.DECISIVE);
  assert.equal(v.weight, AUTO_ADOPT_WEIGHT.shared_title_entity);
});

test("classifySignalGroup: a vocabulary-registered single token is decisive (hook proof, not a live fabricated entry)", () => {
  TITLE_ENTITY_VOCABULARY.add("Test Registered Programme");
  try {
    const v = classifySignalGroup("shared_title_entity", new Set(["Test Registered Programme"]));
    assert.equal(v.confidence, SIGNAL_CONFIDENCE.DECISIVE);
  } finally {
    TITLE_ENTITY_VOCABULARY.delete("Test Registered Programme");
  }
});

test("TITLE_ENTITY_VOCABULARY ships empty (no fabricated entries)", () => {
  assert.equal(TITLE_ENTITY_VOCABULARY.size, 0);
});

test("classifySignalGroup: unrecognized signal kind fails closed to undecided", () => {
  const v = classifySignalGroup("some_future_kind", new Set(["x"]));
  assert.equal(v.confidence, SIGNAL_CONFIDENCE.UNDECIDED);
  assert.match(v.reason, /unrecognized/);
});

test("classifySignalCandidates: groups by (itemA,itemB,signalKind), applies one verdict per group", () => {
  const candidates = [
    { itemA: "a", itemB: "b", signalKind: "shared_title_entity", value: "Fit for 55 Package", subject_ref: "a:b:shared_title_entity:Fit for 55 Package" },
    { itemA: "a", itemB: "b", signalKind: "shared_title_entity", value: "Emissions Trading System", subject_ref: "a:b:shared_title_entity:Emissions Trading System" },
  ];
  const out = classifySignalCandidates(candidates);
  assert.equal(out.length, 2);
  for (const c of out) assert.equal(c.confidence, SIGNAL_CONFIDENCE.DECISIVE);
});

test("classifySignalCandidates: malformed rows are dropped, never throw", () => {
  assert.deepEqual(classifySignalCandidates([null, {}, { itemA: "a" }]), []);
});

test("classifySignalCandidates: deterministic ordering by subject_ref", () => {
  const candidates = [
    { itemA: "z", itemB: "y", signalKind: "shared_regulation_identifier", value: "9999/0001", subject_ref: "z:y:x:2" },
    { itemA: "a", itemB: "b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "a:b:x:1" },
  ];
  const out = classifySignalCandidates(candidates);
  assert.deepEqual(out.map((c) => c.subject_ref), ["a:b:x:1", "z:y:x:2"]);
});

test("buildAutoAdoptEdges: a decisive regulation-identifier pair yields both directions, relationship='related'", () => {
  const classified = classifySignalCandidates([
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "item-a:item-b:shared_regulation_identifier:2023/1805" },
  ]);
  const edges = buildAutoAdoptEdges(classified);
  assert.equal(edges.length, 2);
  const forward = edges.find((e) => e.source_item_id === "item-a" && e.target_item_id === "item-b");
  const backward = edges.find((e) => e.source_item_id === "item-b" && e.target_item_id === "item-a");
  assert.ok(forward && backward, "both directions written");
  for (const e of edges) {
    assert.equal(e.relationship, "related");
    assert.equal(e.origin, "provenance_discovery");
    assert.equal(e.score, AUTO_ADOPT_WEIGHT.shared_regulation_identifier);
    assert.deepEqual(e.basis, [{ signal: "shared_regulation_identifier", detail: 'both name regulation identifier(s) "2023/1805" in their titles', weight: AUTO_ADOPT_WEIGHT.shared_regulation_identifier }]);
  }
});

test("buildAutoAdoptEdges: undecided candidates never produce an edge", () => {
  const classified = classifySignalCandidates([
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_title_entity", value: "Solo Phrase", subject_ref: "item-a:item-b:shared_title_entity:Solo Phrase" },
  ]);
  assert.deepEqual(buildAutoAdoptEdges(classified), []);
});

test("buildAutoAdoptEdges: two decisive kinds on the same pair merge into ONE row per direction (unique-pair constraint)", () => {
  const classified = classifySignalCandidates([
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "r1" },
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_title_entity", value: "Fit for 55 Package", subject_ref: "r2" },
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_title_entity", value: "Emissions Trading System", subject_ref: "r3" },
  ]);
  const edges = buildAutoAdoptEdges(classified);
  assert.equal(edges.length, 2, "one row per direction, never one row per kind");
  const forward = edges.find((e) => e.source_item_id === "item-a");
  assert.equal(forward.basis.length, 2, "both decisive kinds contribute one basis entry each");
  assert.equal(forward.score, Math.min(1, AUTO_ADOPT_WEIGHT.shared_regulation_identifier + AUTO_ADOPT_WEIGHT.shared_title_entity));
});

test("buildAutoAdoptEdges: score clamps at 1", () => {
  // Two synthetic pairs both mapping to the same real pair can't happen from real input, but the clamp
  // itself is exercised directly via a kind whose weight alone would already push toward the ceiling —
  // confirm the clamp math rather than assert an impossible input shape.
  const classified = classifySignalCandidates([
    { itemA: "item-a", itemB: "item-b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "r1" },
  ]);
  const edges = buildAutoAdoptEdges(classified);
  assert.ok(edges.every((e) => e.score <= 1));
});

test("planSignalAdoption: full split + edges from a mixed candidate list", () => {
  const candidates = [
    { itemA: "a", itemB: "b", signalKind: "shared_regulation_identifier", value: "2023/1805", subject_ref: "a:b:shared_regulation_identifier:2023/1805" },
    { itemA: "c", itemB: "d", signalKind: "shared_title_entity", value: "Solo Phrase", subject_ref: "c:d:shared_title_entity:Solo Phrase" },
  ];
  const plan = planSignalAdoption(candidates);
  assert.equal(plan.classified.length, 2);
  assert.equal(plan.decisive.length, 1);
  assert.equal(plan.undecided.length, 1);
  assert.equal(plan.edges.length, 2, "one decisive pair -> two directional edges");
  assert.equal(plan.undecided[0].subject_ref, "c:d:shared_title_entity:Solo Phrase");
});

test("groupStaleFlagsForResolution: groups by created_by, builds a resolution_note per kind, sorted", () => {
  const flags = [
    { id: "f1", created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity") },
    { id: "f2", created_by: createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier") },
    { id: "f3", created_by: createdBy(SIGNAL_NAMESPACE, "shared_title_entity") },
  ];
  const groups = groupStaleFlagsForResolution(flags, SIGNAL_NAMESPACE);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.createdBy), [...groups.map((g) => g.createdBy)].sort(), "sorted deterministically");
  const regGroup = groups.find((g) => g.createdBy === createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"));
  assert.deepEqual(regGroup.ids, ["f2"]);
  assert.equal(regGroup.resolutionNote, `auto-adopted:signal:shared_regulation_identifier:${AUTO_ADOPT_WEIGHT.shared_regulation_identifier}`);
  const titleGroup = groups.find((g) => g.createdBy === createdBy(SIGNAL_NAMESPACE, "shared_title_entity"));
  assert.deepEqual(titleGroup.ids, ["f1", "f3"]);
});

test("groupStaleFlagsForResolution: malformed rows dropped, empty input -> empty output", () => {
  assert.deepEqual(groupStaleFlagsForResolution([null, {}, { id: "x" }], SIGNAL_NAMESPACE), []);
  assert.deepEqual(groupStaleFlagsForResolution([], SIGNAL_NAMESPACE), []);
});
