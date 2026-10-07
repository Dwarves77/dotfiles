// flag-namespaces.test.mjs, proves the SoT contract: disjoint namespaces, createdBy/buildSubjectRef
// shape, and the isInNamespace predicate analyze-corpus.mjs's dedup scan relies on.
import test from "node:test";
import assert from "node:assert/strict";
import {
  GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE, FLYWHEEL_DEFECT_NAMESPACE, TAG_NAMESPACE,
  QUESTION_NAMESPACE, HOLDINGS_NEED_NAMESPACE, HOLDINGS_NEED_ACTION, ALL_NAMESPACES,
  createdBy, buildSubjectRef, isInNamespace,
} from "./flag-namespaces.mjs";

test("namespaces are disjoint and every one ends with ':'", () => {
  assert.equal(new Set(ALL_NAMESPACES).size, ALL_NAMESPACES.length, "no duplicate namespace strings");
  for (const ns of ALL_NAMESPACES) assert.ok(ns.endsWith(":"), `${ns} must end with ':'`);
  // no namespace is a prefix of another distinct namespace (would break LIKE '<ns>%' isolation)
  for (const a of ALL_NAMESPACES) for (const b of ALL_NAMESPACES) {
    if (a === b) continue;
    assert.ok(!b.startsWith(a), `${a} must not be a prefix of ${b}`);
  }
});

test("createdBy: matches the pre-refactor inline shape ${NAMESPACE}${type}", () => {
  assert.equal(createdBy(GAP_NAMESPACE, "jurisdiction_span_gap"), "flywheel-gap:jurisdiction_span_gap");
  assert.equal(createdBy(ANTICIPATE_NAMESPACE, "no_coverage"), "flywheel-anticipate:no_coverage");
  assert.equal(createdBy(SIGNAL_NAMESPACE, "shared_regulation_identifier"), "flywheel-signal:shared_regulation_identifier");
  assert.equal(createdBy(FLYWHEEL_DEFECT_NAMESPACE, "discovery"), "flywheel-defect:discovery");
  assert.equal(createdBy(FLYWHEEL_DEFECT_NAMESPACE, "forward-events"), "flywheel-defect:forward-events");
  assert.equal(createdBy(TAG_NAMESPACE, "empty-signature"), "flywheel-tag:empty-signature");
});

test("TAG_NAMESPACE: registered in ALL_NAMESPACES, disjoint from the other four, subject_ref degrades to the bare item id", () => {
  assert.equal(TAG_NAMESPACE, "flywheel-tag:");
  assert.ok(ALL_NAMESPACES.includes(TAG_NAMESPACE));
  assert.equal(buildSubjectRef("item-xyz"), "item-xyz");
  assert.ok(isInNamespace(createdBy(TAG_NAMESPACE, "empty-signature"), TAG_NAMESPACE));
  assert.ok(!isInNamespace(createdBy(TAG_NAMESPACE, "empty-signature"), FLYWHEEL_DEFECT_NAMESPACE));
});

test("QUESTION_NAMESPACE: registered in ALL_NAMESPACES, disjoint from the other five, deliberately not 'flywheel-'-prefixed", () => {
  assert.equal(QUESTION_NAMESPACE, "question:");
  assert.ok(ALL_NAMESPACES.includes(QUESTION_NAMESPACE));
  assert.equal(createdBy(QUESTION_NAMESPACE, "what"), "question:what");
  assert.ok(isInNamespace(createdBy(QUESTION_NAMESPACE, "affects_me"), QUESTION_NAMESPACE));
  assert.ok(!isInNamespace(createdBy(QUESTION_NAMESPACE, "affects_me"), TAG_NAMESPACE));
  assert.ok(!isInNamespace(createdBy(TAG_NAMESPACE, "empty-signature"), QUESTION_NAMESPACE));
});

test("createdBy: refuses a namespace not ending in ':' and an empty subtype", () => {
  assert.throws(() => createdBy("flywheel-gap", "x"), /must end in ':'/);
  assert.throws(() => createdBy(GAP_NAMESPACE, ""), /subtype is required/);
  assert.throws(() => createdBy(GAP_NAMESPACE, "   "), /subtype is required/);
});

test("buildSubjectRef: single part degrades unchanged (gaps.mjs's existing theme.id convention)", () => {
  assert.equal(buildSubjectRef("theme-abc"), "theme-abc");
});

test("buildSubjectRef: multi-part joins with ':', drops empty/null/undefined parts, trims", () => {
  assert.equal(buildSubjectRef("item-a", "item-b", "shared_regulation_identifier", "2023/1804"), "item-a:item-b:shared_regulation_identifier:2023/1804");
  assert.equal(buildSubjectRef("a", null, "", undefined, "  b  "), "a:b");
  assert.equal(buildSubjectRef(), "");
});

test("buildSubjectRef: deterministic, same inputs, same output, order-sensitive", () => {
  assert.equal(buildSubjectRef("x", "y"), buildSubjectRef("x", "y"));
  assert.notEqual(buildSubjectRef("x", "y"), buildSubjectRef("y", "x"));
});

test("isInNamespace: matches only the correct namespace, never a lookalike prefix", () => {
  assert.ok(isInNamespace("flywheel-gap:jurisdiction_span_gap", GAP_NAMESPACE));
  assert.ok(!isInNamespace("flywheel-gap:jurisdiction_span_gap", ANTICIPATE_NAMESPACE));
  assert.ok(!isInNamespace("flywheel-gapx:foo", GAP_NAMESPACE));
  assert.ok(!isInNamespace(null, GAP_NAMESPACE));
  assert.ok(!isInNamespace(undefined, GAP_NAMESPACE));
});

test("HOLDINGS_NEED_NAMESPACE: registered, disjoint from every other namespace and from the lineage-gap flag, subtype is the product question", () => {
  assert.equal(HOLDINGS_NEED_NAMESPACE, "holdings-need:");
  assert.ok(ALL_NAMESPACES.includes(HOLDINGS_NEED_NAMESPACE));
  assert.equal(createdBy(HOLDINGS_NEED_NAMESPACE, "what"), "holdings-need:what");
  assert.ok(!"lineage-gap:absent-parent".startsWith(HOLDINGS_NEED_NAMESPACE));
  assert.equal(HOLDINGS_NEED_ACTION, "find-source");
  const ref = buildSubjectRef("item-1", "regulations", "what");
  assert.equal(ref, "item-1:regulations:what", "the target's subject_ref is the question's own");
});

test("TERM_NEED_NAMESPACE: registered, disjoint from every other namespace, shares the find-source action with holdings-need", async () => {
  const m = await import("./flag-namespaces.mjs");
  assert.equal(m.TERM_NEED_NAMESPACE, "term-need:");
  assert.ok(m.ALL_NAMESPACES.includes(m.TERM_NEED_NAMESPACE));
  assert.equal(m.createdBy(m.TERM_NEED_NAMESPACE, "standard"), "term-need:standard");
  assert.equal(m.TERM_NEED_ACTION, m.HOLDINGS_NEED_ACTION, "one reader, both namespaces: the same find-source action");
  for (const ns of m.ALL_NAMESPACES) {
    if (ns !== m.TERM_NEED_NAMESPACE) assert.ok(!ns.startsWith(m.TERM_NEED_NAMESPACE) && !m.TERM_NEED_NAMESPACE.startsWith(ns));
  }
});
