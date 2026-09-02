// Run: node --test scripts/review/lib/canonical-candidates.test.mjs — pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKeyOf, recommendGroupDecision, groupRows, patchForDecision, freshestTimestamp } from "./canonical-candidates.mjs";

test("groupKeyOf: host x issue_classification", () => {
  assert.equal(
    groupKeyOf({ candidate_url: "https://eur-lex.europa.eu/x", issue_classification: "stale_url" }),
    "eur-lex.europa.eu::stale_url"
  );
});

test("recommendGroupDecision: both directions — unanimous verified+high accepts, unanimous unverified rejects, mixed is uncertain", () => {
  assert.equal(recommendGroupDecision([{ verified: true, confidence: "high" }, { verified: true, confidence: "high" }]), "accept");
  assert.equal(recommendGroupDecision([{ verified: false, confidence: "low" }, { verified: false, confidence: "medium" }]), "reject");
  assert.equal(recommendGroupDecision([{ verified: true, confidence: "high" }, { verified: false, confidence: "low" }]), "uncertain");
  assert.equal(recommendGroupDecision([{ verified: true, confidence: "medium" }]), "uncertain");
});

const ROWS = [
  { id: "c1", candidate_url: "https://eur-lex.europa.eu/a", candidate_title: "A", issue_classification: "stale_url", confidence: "high", verified: true, updated_at: "2026-09-01T00:00:00Z", reviewed_at: null },
  { id: "c2", candidate_url: "https://eur-lex.europa.eu/b", candidate_title: "B", issue_classification: "stale_url", confidence: "high", verified: true, updated_at: "2026-08-01T00:00:00Z", reviewed_at: "2026-09-02T00:00:00Z" },
  { id: "c3", candidate_url: "https://random.example.com/c", candidate_title: "C", issue_classification: "thin_match", confidence: "low", verified: false, updated_at: "2026-07-01T00:00:00Z", reviewed_at: null },
];

test("groupRows: deterministic order, groups accept-worthy rows apart from reject-worthy ones", () => {
  const g1 = groupRows(ROWS);
  const g2 = groupRows([...ROWS].reverse());
  assert.deepEqual(g1.map((g) => g.key), g2.map((g) => g.key));
  const eurLexGroup = g1.find((g) => g.key === "eur-lex.europa.eu::stale_url");
  assert.equal(eurLexGroup.count, 2);
  assert.equal(eurLexGroup.recommended_decision, "accept");
  const otherGroup = g1.find((g) => g.key === "random.example.com::thin_match");
  assert.equal(otherGroup.recommended_decision, "reject");
});

test("patchForDecision: accept/reject/skip", () => {
  assert.deepEqual(patchForDecision("reject", { reviewerNotes: "n" }), { decision: "rejected", reviewed: true, reviewer_notes: "n" });
  assert.deepEqual(patchForDecision("accept", {}), { decision: "approved", reviewed: true, reviewer_notes: null });
  assert.equal(patchForDecision("skip"), null);
});

test("freshestTimestamp: max of updated_at and reviewed_at across rows", () => {
  assert.equal(freshestTimestamp(ROWS), "2026-09-02T00:00:00.000Z");
});
