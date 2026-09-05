// Run: node --test scripts/mint/migration-299-precheck.test.mjs — no DB, pure functions only.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEW_REQUIRED_SLOTS, NEW_REQUIRED_ITEM_TYPES, claimCoversSlot, computeGuard, evaluatePreCheck, evaluatePostCheck,
} from "./migration-299-precheck.mjs";

test("NEW_REQUIRED_SLOTS matches migration 299's own four (item_type, slot_key) pairs", () => {
  assert.deepEqual(NEW_REQUIRED_SLOTS, [
    { item_type: "market_signal", slot_key: "corridor_identity" },
    { item_type: "initiative", slot_key: "corridor_identity" },
    { item_type: "research_finding", slot_key: "evidence_agreement_signal" },
    { item_type: "research_finding", slot_key: "source_authority_signal" },
  ]);
  assert.deepEqual(NEW_REQUIRED_ITEM_TYPES, ["market_signal", "initiative", "research_finding"]);
});

// ── claimCoversSlot ──────────────────────────────────────────────────────────────────────────────────

test("claimCoversSlot: FACT claim mentioning the slot key -> true, case-insensitive", () => {
  assert.equal(claimCoversSlot({ claim_kind: "FACT", claim_text: "[Corridor_Identity] The captured source names a lane..." }, "corridor_identity"), true);
});

test("claimCoversSlot: GAP claim mentioning the slot key -> true (criterion 5 accepts GAP too)", () => {
  assert.equal(claimCoversSlot({ claim_kind: "GAP", claim_text: "[corridor_identity] No verbatim UN/LOCODE..." }, "corridor_identity"), true);
});

test("claimCoversSlot: ANALYSIS/DERIVED claim never counts, even if it mentions the slot", () => {
  assert.equal(claimCoversSlot({ claim_kind: "ANALYSIS", claim_text: "corridor_identity discussed here" }, "corridor_identity"), false);
  assert.equal(claimCoversSlot({ claim_kind: "DERIVED", claim_text: "corridor_identity discussed here" }, "corridor_identity"), false);
});

test("claimCoversSlot: claim not mentioning the slot key -> false", () => {
  assert.equal(claimCoversSlot({ claim_kind: "FACT", claim_text: "[due_date] The captured source states..." }, "corridor_identity"), false);
});

test("claimCoversSlot: null/undefined claim -> false, never throws", () => {
  assert.equal(claimCoversSlot(null, "corridor_identity"), false);
  assert.equal(claimCoversSlot(undefined, "corridor_identity"), false);
});

// ── computeGuard ─────────────────────────────────────────────────────────────────────────────────────

test("computeGuard: item with no covering claim at all is counted missing for its applicable pair", () => {
  const items = [{ id: "i1", item_type: "initiative" }];
  const claims = new Map([["i1", [{ claim_kind: "FACT", claim_text: "[title] ..." }]]]);
  const g = computeGuard(items, claims);
  assert.equal(g.n, 1);
  assert.deepEqual(g.failingIds, ["i1"]);
  const initPair = g.byPair.find((p) => p.item_type === "initiative");
  assert.equal(initPair.missing_count, 1);
});

test("computeGuard: item already carrying the slot claim (FACT or GAP) is covered, not counted", () => {
  const items = [{ id: "i1", item_type: "initiative" }];
  const claims = new Map([["i1", [{ claim_kind: "GAP", claim_text: "[corridor_identity] No verbatim..." }]]]);
  const g = computeGuard(items, claims);
  assert.equal(g.n, 0);
});

test("computeGuard: research_finding item missing BOTH new slots counts once, not twice (distinct items)", () => {
  const items = [{ id: "r1", item_type: "research_finding" }];
  const claims = new Map([["r1", [{ claim_kind: "FACT", claim_text: "[title] ..." }]]]);
  const g = computeGuard(items, claims);
  assert.equal(g.n, 1);
  const evidencePair = g.byPair.find((p) => p.slot_key === "evidence_agreement_signal");
  const authorityPair = g.byPair.find((p) => p.slot_key === "source_authority_signal");
  assert.equal(evidencePair.missing_count, 1);
  assert.equal(authorityPair.missing_count, 1);
  assert.equal(g.failingIds.length, 1);
});

test("computeGuard: research_finding item covered on one of two new slots still counts (the other is missing)", () => {
  const items = [{ id: "r1", item_type: "research_finding" }];
  const claims = new Map([["r1", [{ claim_kind: "FACT", claim_text: "[evidence_agreement_signal] peer-reviewed..." }]]]);
  const g = computeGuard(items, claims);
  assert.equal(g.n, 1);
});

test("computeGuard: a plain object claims map works the same as a Map", () => {
  const items = [{ id: "i1", item_type: "market_signal" }];
  const claims = { i1: [{ claim_kind: "GAP", claim_text: "[corridor_identity] No verbatim..." }] };
  const g = computeGuard(items, claims);
  assert.equal(g.n, 0);
});

test("computeGuard: an item of an item_type with no applicable pair (e.g. regulation) is never scanned", () => {
  const items = [{ id: "x1", item_type: "regulation" }];
  const claims = new Map();
  const g = computeGuard(items, claims);
  assert.equal(g.n, 0);
  assert.equal(g.failingIds.length, 0);
});

test("computeGuard: 149-shaped mixed population — matches the migration's own live self-check shape", () => {
  const items = [
    ...Array.from({ length: 70 }, (_, i) => ({ id: `init-${i}`, item_type: "initiative" })),
    ...Array.from({ length: 46 }, (_, i) => ({ id: `mkt-${i}`, item_type: "market_signal" })),
    ...Array.from({ length: 33 }, (_, i) => ({ id: `rf-${i}`, item_type: "research_finding" })),
  ];
  const claims = new Map(); // none carry any covering claim
  const g = computeGuard(items, claims);
  assert.equal(g.n, 149);
});

// ── evaluatePreCheck ─────────────────────────────────────────────────────────────────────────────────

test("evaluatePreCheck: n=0 -> ok true, safe-to-apply message", () => {
  const v = evaluatePreCheck({ n: 0, byPair: [] });
  assert.equal(v.ok, true);
  assert.match(v.message, /Safe to apply/);
});

test("evaluatePreCheck: n>0 -> ok false, refuses, names the backfill command", () => {
  const v = evaluatePreCheck({ n: 5, byPair: [] });
  assert.equal(v.ok, false);
  assert.match(v.message, /REFUSES/);
  assert.match(v.message, /kit-backfill/);
  assert.match(v.message, /slots-backfill/);
});

// ── evaluatePostCheck ────────────────────────────────────────────────────────────────────────────────

test("evaluatePostCheck: n=0 and no quarantined survivors -> ok true", () => {
  const v = evaluatePostCheck({ n: 0, byPair: [] }, []);
  assert.equal(v.ok, true);
  assert.equal(v.quarantined_count, 0);
});

test("evaluatePostCheck: n=0 but a survivor is quarantined -> ok false, names the id", () => {
  const v = evaluatePostCheck({ n: 0, byPair: [] }, [{ id: "q1", item_type: "initiative" }]);
  assert.equal(v.ok, false);
  assert.equal(v.quarantined_count, 1);
  assert.match(v.message, /q1/);
});

test("evaluatePostCheck: n still > 0 -> ok false regardless of quarantine read-back", () => {
  const v = evaluatePostCheck({ n: 3, byPair: [] }, []);
  assert.equal(v.ok, false);
});
