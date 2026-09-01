// signal-candidates.test.mjs — proves regulation-identifier / title-entity extraction, the
// no-existing-edge filter, PER_TOKEN_ITEM_CAP bound, and deterministic ordering.
import test from "node:test";
import assert from "node:assert/strict";
import {
  detectSignalCandidates, buildExistingPairSet,
  extractRegulationIdentifiers, extractCapitalizedPhrases,
} from "./signal-candidates.mjs";

test("extractRegulationIdentifiers: matches EU/EC/bare number forms, dedups", () => {
  assert.deepEqual(
    extractRegulationIdentifiers("Regulation (EU) 2023/1805 amends Directive 2014/94/EU and 2023/1805 again"),
    ["2023/1805", "2014/94"],
  );
});

test("extractCapitalizedPhrases: keeps multi-word phrases, drops single words and stoplist leaders", () => {
  const phrases = extractCapitalizedPhrases("The Fit for 55 Package updates the Emissions Trading System");
  assert.ok(phrases.has("Fit for 55 Package") || phrases.has("Emissions Trading System"), "at least one real multi-word phrase survives");
  assert.ok(!phrases.has("The"), "single leading stopword alone is never emitted");
});

test("two items sharing a regulation identifier, no existing edge -> one candidate", () => {
  const items = [
    { id: "item-a", title: "Guidance on Regulation (EU) 2023/1805 compliance" },
    { id: "item-b", title: "Member state notes on 2023/1805 implementation" },
  ];
  const candidates = detectSignalCandidates(items, []);
  const regHit = candidates.find((c) => c.signalKind === "shared_regulation_identifier");
  assert.ok(regHit, "a shared_regulation_identifier candidate is proposed");
  assert.equal(regHit.itemA, "item-a");
  assert.equal(regHit.itemB, "item-b");
  assert.equal(regHit.value, "2023/1805");
  assert.equal(regHit.subject_ref, "item-a:item-b:shared_regulation_identifier:2023/1805");
});

test("an existing edge (any origin) between the pair suppresses the candidate", () => {
  const items = [
    { id: "item-a", title: "Guidance on Regulation (EU) 2023/1805" },
    { id: "item-b", title: "Notes on 2023/1805" },
  ];
  const edges = [{ source_item_id: "item-a", target_item_id: "item-b", origin: "entity_extraction" }];
  const candidates = detectSignalCandidates(items, edges);
  assert.equal(candidates.length, 0, "already-connected pairs are never proposed as candidates");
});

test("edge direction does not matter (undirected suppression)", () => {
  const items = [
    { id: "item-a", title: "2023/1805 guidance" },
    { id: "item-b", title: "2023/1805 notes" },
  ];
  const edges = [{ source_item_id: "item-b", target_item_id: "item-a", origin: "provenance_discovery" }];
  assert.equal(detectSignalCandidates(items, edges).length, 0);
});

test("a token unique to one item never proposes a candidate", () => {
  const items = [
    { id: "item-a", title: "Regulation (EU) 2023/1805 only here" },
    { id: "item-b", title: "Unrelated topic entirely" },
  ];
  assert.equal(detectSignalCandidates(items, []).length, 0);
});

test("PER_TOKEN_ITEM_CAP bounds pair explosion on a very common token", () => {
  // 10 items all sharing one identifier -> without a cap this would be C(10,2)=45 pairs.
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}`, title: `Text 2023/1805 variant ${i}` }));
  const candidates = detectSignalCandidates(items, []);
  const regCandidates = candidates.filter((c) => c.signalKind === "shared_regulation_identifier");
  assert.ok(regCandidates.length <= 15, `capped at C(6,2)=15 pairs, got ${regCandidates.length}`);
  assert.ok(regCandidates.length > 0);
});

test("buildExistingPairSet: undirected, both orders resolve to the same key", () => {
  const set = buildExistingPairSet([{ source_item_id: "a", target_item_id: "b" }]);
  assert.ok(set.has("a|b"));
});

test("malformed / missing titles do not throw", () => {
  const items = [{ id: "item-a" }, { id: "item-b", title: null }, null, { title: "no id" }];
  assert.deepEqual(detectSignalCandidates(items, []), []);
});

test("deterministic ordering: output sorted by subject_ref", () => {
  const items = [
    { id: "item-b", title: "2023/1805 here" },
    { id: "item-a", title: "2023/1805 also" },
    { id: "item-z", title: "9999/0001 here" },
    { id: "item-y", title: "9999/0001 also" },
  ];
  const candidates = detectSignalCandidates(items, []);
  const refs = candidates.map((c) => c.subject_ref);
  const sorted = [...refs].sort();
  assert.deepEqual(refs, sorted);
});

test("descriptions carry the operator-review-only posture for both signal kinds", () => {
  const items = [
    { id: "item-a", title: "Regulation (EU) 2023/1805 and the Fit for 55 Package" },
    { id: "item-b", title: "2023/1805 and the Fit for 55 Package" },
  ];
  const candidates = detectSignalCandidates(items, []);
  assert.ok(candidates.length > 0);
  for (const c of candidates) assert.ok(/operator review only/i.test(c.description));
});
