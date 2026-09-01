// flag-namespaces.test.mjs — proves the SoT contract: disjoint namespaces, createdBy/buildSubjectRef
// shape, and the isInNamespace predicate analyze-corpus.mjs's dedup scan relies on.
import test from "node:test";
import assert from "node:assert/strict";
import {
  GAP_NAMESPACE, ANTICIPATE_NAMESPACE, SIGNAL_NAMESPACE, ALL_NAMESPACES,
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

test("buildSubjectRef: deterministic — same inputs, same output, order-sensitive", () => {
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
