// Tests for null-tier-host-worklist.mjs, MOVED (D3, docs/plans/defect-fix-plan-2026-09-12.md,
// 2026-09-12) from scripts/maintenance/resolve-cited-host-gate.test.mjs verbatim (same assertions,
// same fixtures) when planHostDecision/buildNullTierHostWrite/NULL_TIER_CREATED_BY were extracted out
// of that file into this shared module. resolve-cited-host-gate.test.mjs keeps its own integration
// coverage (planFlag/main exercising these functions through the re-export) but no longer duplicates
// their unit tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planHostDecision, buildNullTierHostWrite, NULL_TIER_CREATED_BY } from "./null-tier-host-worklist.mjs";
import { classTierForHost } from "./host-authority.ts";

// ── planHostDecision ─────────────────────────────────────────────────────────────────────────────────

test("planHostDecision: a legal-primary host registers at tier 1 via the real classTierForHost", () => {
  const d = planHostDecision("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242", classTierForHost);
  assert.equal(d.host, "eur-lex.europa.eu");
  assert.equal(d.tier, 1);
  assert.equal(d.action, "register");
});

test("planHostDecision: an unrecognized host routes to the worklist (never a guessed tier)", () => {
  const d = planHostDecision("https://some-random-blog-nobody-classified.example/post", classTierForHost);
  assert.equal(d.tier, null);
  assert.equal(d.action, "worklist");
});

test("planHostDecision: injected classTierForHostFn is honored (unit-testable without the real class table)", () => {
  const fakeTier = () => 4;
  const d = planHostDecision("https://anything.example/x", fakeTier);
  assert.equal(d.tier, 4);
  assert.equal(d.action, "register");
});

// ── buildNullTierHostWrite ───────────────────────────────────────────────────────────────────────────

test("buildNullTierHostWrite: no existing flag -> insert, with a fresh aggregate", () => {
  const w = buildNullTierHostWrite(null, "unknown-host.example", "item-1", "https://unknown-host.example/page", null);
  assert.equal(w.op, "insert");
  assert.equal(w.row.created_by, NULL_TIER_CREATED_BY);
  assert.equal(w.row.subject_ref, "unknown-host.example");
  assert.equal(w.row.status, "open");
  assert.deepEqual(w.row.recommended_actions[0].aggregate.perItemFacts, { "item-1": 1 });
});

test("buildNullTierHostWrite: existing flag -> update, merging the aggregate (idempotent per item)", () => {
  const existing = {
    id: "flag-9",
    recommended_actions: [{ aggregate: { perItemFacts: { "item-0": 3 }, sampleSpans: ["https://unknown-host.example/other"] } }],
  };
  const w = buildNullTierHostWrite(existing, "unknown-host.example", "item-1", "https://unknown-host.example/page", null);
  assert.equal(w.op, "update");
  assert.equal(w.id, "flag-9");
  assert.deepEqual(w.patch.recommended_actions[0].aggregate.perItemFacts, { "item-0": 3, "item-1": 1 });
});

test("buildNullTierHostWrite: a ruled aggregator/platform host gets the re-attribution wording, never register_source", () => {
  const w = buildNullTierHostWrite(null, "policycommons.net", "item-1", "https://policycommons.net/x", "aggregator");
  assert.equal(w.row.recommended_actions[0].action, "reattribute_to_publisher");
});

// ── D3's own idempotency property, at this module's level: calling buildNullTierHostWrite twice for
// the SAME host with the SAME item contribution, feeding the second call's existingFlag from the
// first call's own write, produces an UPDATE (never a second insert) and the per-item fact count does
// not double (a repeat contribution from the same item is one fact, not two). ─────────────────────────

test("buildNullTierHostWrite: calling it twice for the same host, threading the row through, updates rather than duplicates", () => {
  const first = buildNullTierHostWrite(null, "unknown.example", "item-1", "https://unknown.example/a", null);
  assert.equal(first.op, "insert");
  // Simulate the row now existing as returned by the DB after the first insert.
  const existingAfterFirst = { id: "flag-1", recommended_actions: first.row.recommended_actions };
  const second = buildNullTierHostWrite(existingAfterFirst, "unknown.example", "item-1", "https://unknown.example/a", null);
  assert.equal(second.op, "update");
  assert.equal(second.id, "flag-1");
  // Same item, same contribution: the fact count for item-1 stays 1, not 2.
  assert.deepEqual(second.patch.recommended_actions[0].aggregate.perItemFacts, { "item-1": 1 });
});
