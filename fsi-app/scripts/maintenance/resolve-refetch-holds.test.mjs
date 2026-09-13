// resolve-refetch-holds.test.mjs -- dependency-injected, no database, no network. Zero-fetch reuse of
// cheap-verify.mjs's own spanPresent/normalizeForMatch and timeline-backfill-derive.mjs's pickBestCapture
// (indirectly, via planItemReground/main); this file never re-implements either.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupHoldsByItem,
  planItemReground,
  buildDryResolutionNote,
  buildAppliedSupersedeNote,
  main,
  HOLD_CREATED_BY,
  RESOLVED_BY,
} from "./resolve-refetch-holds.mjs";

// ── groupHoldsByItem ─────────────────────────────────────────────────────────────────────────────────

test("groupHoldsByItem: groups multiple hold flags sharing one subject_ref", () => {
  const rows = [
    { id: "f1", subject_ref: "item-1" },
    { id: "f2", subject_ref: "item-1" },
    { id: "f3", subject_ref: "item-2" },
  ];
  const byItem = groupHoldsByItem(rows);
  assert.equal(byItem.size, 2);
  assert.deepEqual(byItem.get("item-1").map((r) => r.id), ["f1", "f2"]);
  assert.deepEqual(byItem.get("item-2").map((r) => r.id), ["f3"]);
});

test("groupHoldsByItem: a row with no subject_ref is skipped, never crashes", () => {
  const byItem = groupHoldsByItem([{ id: "f1" }, { id: "f2", subject_ref: null }]);
  assert.equal(byItem.size, 0);
});

test("groupHoldsByItem: empty/absent input is safe", () => {
  assert.equal(groupHoldsByItem([]).size, 0);
  assert.equal(groupHoldsByItem(undefined).size, 0);
});

// ── planItemReground (the zero-fetch, snapshot-first re-check) ─────────────────────────────────────

test("planItemReground: no capture at all -> outcome no_capture", () => {
  const plan = planItemReground({ claims: [{ claim_kind: "FACT", source_span: "x" }], bestCapture: null });
  assert.equal(plan.outcome, "no_capture");
});

test("planItemReground: a capture exists but no FACT claims -> outcome no_fact_claims", () => {
  const plan = planItemReground({ claims: [{ claim_kind: "ANALYSIS", source_span: "x" }], bestCapture: { result_content: "some captured text here" } });
  assert.equal(plan.outcome, "no_fact_claims");
});

test("planItemReground: every FACT span still present -> outcome re_grounded", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "the levy applies from 2027" },
    { id: "c2", claim_kind: "FACT", source_span: "a second confirmed span" },
  ];
  const bestCapture = { result_content: "... the levy applies from 2027 ... a second confirmed span ..." };
  const plan = planItemReground({ claims, bestCapture });
  assert.equal(plan.outcome, "re_grounded");
  assert.equal(plan.factTotal, 2);
  assert.equal(plan.unmatchedFactClaims.length, 0);
});

test("planItemReground: a drifted FACT span -> outcome needs_supersede, names the exact claim", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "the levy applies from 2027" },
    { id: "c2", claim_kind: "FACT", source_span: "this span is no longer in the capture" },
  ];
  const bestCapture = { result_content: "... the levy applies from 2027 ... something entirely different now ..." };
  const plan = planItemReground({ claims, bestCapture });
  assert.equal(plan.outcome, "needs_supersede");
  assert.equal(plan.factTotal, 2);
  assert.equal(plan.unmatchedFactClaims.length, 1);
  assert.equal(plan.unmatchedFactClaims[0].id, "c2");
});

test("planItemReground: non-FACT claims (ANALYSIS) are never checked or superseded", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "present span" },
    { id: "c2", claim_kind: "ANALYSIS", source_span: "totally absent analysis text" },
  ];
  const bestCapture = { result_content: "... present span ..." };
  const plan = planItemReground({ claims, bestCapture });
  assert.equal(plan.outcome, "re_grounded");
});

// ── note builders ────────────────────────────────────────────────────────────────────────────────────

test("buildDryResolutionNote: one distinct, honest message per outcome", () => {
  assert.match(buildDryResolutionNote({ outcome: "no_capture" }), /no stored capture/);
  assert.match(buildDryResolutionNote({ outcome: "no_fact_claims" }), /nothing to supersede/);
  assert.match(buildDryResolutionNote({ outcome: "re_grounded", factTotal: 3 }), /all 3 FACT span\(s\)/);
  assert.match(buildDryResolutionNote({ outcome: "needs_supersede", factTotal: 4, unmatchedFactClaims: [1, 2] }), /2 of 4 FACT span\(s\)/);
});

test("buildAppliedSupersedeNote: names the quarantine enqueue when provenance flips, else re-grounded", () => {
  const plan = { unmatchedFactClaims: [1] };
  assert.match(buildAppliedSupersedeNote(plan, "quarantined"), /quarantined under the provenance gate/);
  assert.match(buildAppliedSupersedeNote(plan, "quarantined"), /regen-quarantined\.mjs/);
  assert.match(buildAppliedSupersedeNote(plan, "verified"), /re-grounded/);
});

// ── main() orchestration under injected deps ────────────────────────────────────────────────────────

function fakeDeps({
  flags = [],
  claimsByItem = {},
  capturesByItem = {},
  provenanceAfterByItem = {},
} = {}) {
  const archived = [];
  const held = [];
  const resolved = [];
  return {
    nowIso: "2026-09-12T00:00:00.000Z",
    readCandidates: async () => flags,
    readClaims: async (itemId) => claimsByItem[itemId] ?? [],
    readCaptures: async (itemId) => capturesByItem[itemId] ?? [],
    readClaimVersions: async () => [],
    archiveClaimVersion: async (row) => { archived.push(row); return { inserted: { id: `v-${archived.length}` } }; },
    holdClaimPendingReground: async (claimId) => { held.push(claimId); return { updated: 1 }; },
    readItemProvenanceStatus: async (itemId) => provenanceAfterByItem[itemId] ?? "verified",
    resolveFlags: async (ids, note) => { resolved.push({ ids, note }); return { updated: ids.length }; },
    readRemainingOpen: async () => [],
    _archived: () => archived,
    _held: () => held,
    _resolved: () => resolved,
  };
}

test("main(dry): reports per-outcome counts, writes nothing", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }, { id: "f2", subject_ref: "item-2" }],
    claimsByItem: {
      "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "still here" }],
      "item-2": [{ id: "c2", claim_kind: "FACT", source_span: "gone now" }],
    },
    capturesByItem: {
      "item-1": [{ result_content: "... still here ...".repeat(20) }],
      "item-2": [{ result_content: "... something else entirely ...".repeat(20) }],
    },
  });
  const summary = await main({ mode: "dry" }, deps);
  assert.equal(summary.counts.items_scanned, 2);
  assert.equal(summary.counts.by_outcome.re_grounded, 1);
  assert.equal(summary.counts.by_outcome.needs_supersede, 1);
  assert.equal(deps._archived().length, 0);
  assert.equal(deps._resolved().length, 0);
  assert.match(summary.note, /DRY/);
});

test("main(apply): re-grounded item resolves its flag(s) with the confirmed count, no supersede", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }],
    claimsByItem: { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "still here" }] },
    capturesByItem: { "item-1": [{ result_content: "... still here ...".repeat(20) }] },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._archived().length, 0);
  assert.equal(deps._resolved().length, 1);
  assert.deepEqual(deps._resolved()[0].ids, ["f1"]);
  assert.match(deps._resolved()[0].note, /all 1 FACT span/);
  assert.equal(summary.counts.by_outcome.re_grounded, 1);
  assert.equal(summary.applied, 1);
});

test("main(apply): a drifted span supersedes the claim and resolves as 'superseded' when the item stays verified", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }],
    claimsByItem: { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "gone now" }] },
    capturesByItem: { "item-1": [{ result_content: "... something else entirely ...".repeat(20) }] },
    provenanceAfterByItem: { "item-1": "verified" },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._archived().length, 1);
  assert.equal(deps._archived()[0].current_claim_id, "c1");
  assert.equal(deps._archived()[0].supersede_reason, "changed");
  assert.deepEqual(deps._held(), ["c1"]);
  assert.equal(summary.counts.by_outcome.superseded, 1);
  assert.equal(summary.counts.superseded_claims, 1);
  assert.match(deps._resolved()[0].note, /other claims still meet the provenance criteria/);
});

test("main(apply): a drifted span that quarantines the item resolves as 'quarantined' (Family 1 enqueue)", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }],
    claimsByItem: { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "gone now" }] },
    capturesByItem: { "item-1": [{ result_content: "... something else entirely ...".repeat(20) }] },
    provenanceAfterByItem: { "item-1": "quarantined" },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.counts.by_outcome.quarantined, 1);
  assert.match(deps._resolved()[0].note, /quarantined under the provenance gate/);
  assert.match(deps._resolved()[0].note, /regen-quarantined\.mjs/);
});

test("main(apply): multiple flags on the same item resolve together, one write", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }, { id: "f2", subject_ref: "item-1" }],
    claimsByItem: { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "still here" }] },
    capturesByItem: { "item-1": [{ result_content: "... still here ...".repeat(20) }] },
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(deps._resolved().length, 1);
  assert.deepEqual(deps._resolved()[0].ids.sort(), ["f1", "f2"]);
  assert.equal(summary.applied, 2);
});

test("main(apply): no usable capture resolves honestly without touching claims", async () => {
  const deps = fakeDeps({
    flags: [{ id: "f1", subject_ref: "item-1" }],
    claimsByItem: { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "x" }] },
    capturesByItem: {},
  });
  const summary = await main({ mode: "apply" }, deps);
  assert.equal(summary.counts.by_outcome.no_capture, 1);
  assert.equal(deps._archived().length, 0);
  assert.match(deps._resolved()[0].note, /no stored capture/);
});

test("constants match the plan's own writer/resolver names", () => {
  assert.equal(HOLD_CREATED_BY, "refetch-capped-worklist");
  assert.equal(RESOLVED_BY, "resolve-refetch-holds");
});
