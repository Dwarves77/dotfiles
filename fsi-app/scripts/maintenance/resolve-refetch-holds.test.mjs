// resolve-refetch-holds.test.mjs -- dependency-injected, no database, no network. Zero-fetch reuse of
// cheap-verify.mjs's own spanPresent/normalizeForMatch (indirectly, via planItemReground/main); this
// file never re-implements it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupHoldsByItem,
  planItemReground,
  captureRowLabel,
  captureLength,
  degradedNewestClause,
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

// ── planItemReground (the zero-fetch, snapshot-first re-check, fix round 2: EVERY stored capture) ─────

test("planItemReground: no capture at all -> outcome no_capture", () => {
  const plan = planItemReground({ claims: [{ claim_kind: "FACT", source_span: "x" }], captures: [] });
  assert.equal(plan.outcome, "no_capture");
});

test("planItemReground: a capture exists but no FACT claims -> outcome no_fact_claims", () => {
  const plan = planItemReground({
    claims: [{ claim_kind: "ANALYSIS", source_span: "x" }],
    captures: [{ id: "cap-1", result_content: "some captured text here" }],
  });
  assert.equal(plan.outcome, "no_fact_claims");
});

test("planItemReground: every FACT span verifies against the single capture -> outcome re_grounded", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "the levy applies from 2027" },
    { id: "c2", claim_kind: "FACT", source_span: "a second confirmed span" },
  ];
  const captures = [{ id: "cap-1", result_content: "... the levy applies from 2027 ... a second confirmed span ..." }];
  const plan = planItemReground({ claims, captures });
  assert.equal(plan.outcome, "re_grounded");
  assert.equal(plan.factTotal, 2);
  assert.equal(plan.unmatchedFactClaims.length, 0);
  assert.equal(plan.dominantCapture.id, "cap-1");
  assert.equal(plan.degradedNewest, null);
});

test("planItemReground: a span absent from the ONLY capture -> outcome needs_supersede, names the exact claim", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "the levy applies from 2027" },
    { id: "c2", claim_kind: "FACT", source_span: "this span is no longer in the capture" },
  ];
  const captures = [{ id: "cap-1", result_content: "... the levy applies from 2027 ... something entirely different now ..." }];
  const plan = planItemReground({ claims, captures });
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
  const captures = [{ id: "cap-1", result_content: "... present span ..." }];
  const plan = planItemReground({ claims, captures });
  assert.equal(plan.outcome, "re_grounded");
});

// ── fix round 2 (2026-09-13, "Fix round 2 for L11, family 11"): the dominance guard over the WHOLE pool ─

test("REQUIRED: a full older capture plus a stub newer one -> zero supersessions, a degraded-newest note", () => {
  const claims = [
    { id: "c1", claim_kind: "FACT", source_span: "the levy of EUR 40 per tonne applies from 1 January 2027" },
    { id: "c2", claim_kind: "FACT", source_span: "operators must report emissions annually" },
  ];
  const oldFullCapture = {
    id: "old-full",
    searched_at: "2026-06-01T00:00:00Z",
    result_content:
      "FULL INSTRUMENT TEXT. ... the levy of EUR 40 per tonne applies from 1 January 2027 ... " +
      "operators must report emissions annually ... (thousands more characters of real enacted text)",
  };
  const newStubCapture = {
    id: "new-stub",
    searched_at: "2026-07-31T00:00:00Z",
    result_content: "Error: page unavailable", // a degraded fetch, 24 chars
  };
  const plan = planItemReground({ claims, captures: [oldFullCapture, newStubCapture] });
  assert.equal(plan.outcome, "re_grounded", "the older capture still verifies every span -- never a supersession");
  assert.equal(plan.unmatchedFactClaims.length, 0);
  assert.equal(plan.dominantCapture.id, "old-full", "grounds on the capture that actually verifies the spans");
  assert.ok(plan.degradedNewest, "the newest capture verifies FEWER spans than the dominant -- flagged degraded");
  assert.equal(plan.degradedNewest.newest.id, "new-stub");
  assert.equal(plan.degradedNewest.newestVerified, 0);
  assert.equal(plan.degradedNewest.dominant.id, "old-full");
  assert.equal(plan.degradedNewest.dominantVerified, 2);

  const note = buildDryResolutionNote(plan);
  assert.match(note, /Degraded newest/);
  assert.match(note, /row new-stub/);
  assert.match(note, /row old-full/);
  assert.doesNotMatch(note, /supersede/i, "zero supersessions -- the note must never say a claim would be superseded");
});

test("REQUIRED: an older capture that ALSO lacks the span -> a genuine supersession (no capture anywhere verifies it)", () => {
  const claims = [{ id: "c1", claim_kind: "FACT", source_span: "the levy applies from 2027" }];
  const oldCapture = { id: "old-1", searched_at: "2026-06-01T00:00:00Z", result_content: "This page never mentioned any levy at all, a genuinely different document." };
  const newCapture = { id: "new-1", searched_at: "2026-07-31T00:00:00Z", result_content: "Also nothing about a levy here either." };
  const plan = planItemReground({ claims, captures: [oldCapture, newCapture] });
  assert.equal(plan.outcome, "needs_supersede");
  assert.equal(plan.unmatchedFactClaims.length, 1);
  assert.equal(plan.unmatchedFactClaims[0].id, "c1");
});

test("planItemReground: a genuinely unparseable searched_at is never assumed newest", () => {
  const claims = [{ id: "c1", claim_kind: "FACT", source_span: "present only in capture B" }];
  const captureA = { id: "a", searched_at: "not-a-date", result_content: "capture A has nothing relevant" };
  const captureB = { id: "b", searched_at: "2026-08-01T00:00:00Z", result_content: "present only in capture B" };
  const plan = planItemReground({ claims, captures: [captureA, captureB] });
  assert.equal(plan.outcome, "re_grounded");
  assert.equal(plan.newestCapture.id, "b", "the only capture with a parseable date is 'newest', regardless of array order");
});

// ── captureRowLabel / captureLength / degradedNewestClause ──────────────────────────────────────────

test("captureRowLabel/captureLength: name the row and its honest length, never fabricate an id", () => {
  assert.equal(captureRowLabel({ id: "abc" }), "row abc");
  assert.equal(captureRowLabel({}), "an unidentified row");
  assert.equal(captureRowLabel(null), "an unidentified row");
  assert.equal(captureLength({ result_content: "12345" }), 5);
  assert.equal(captureLength({}), 0);
});

test("degradedNewestClause: empty when there is nothing to report", () => {
  assert.equal(degradedNewestClause(null), "");
});

// ── note builders ────────────────────────────────────────────────────────────────────────────────────

test("buildDryResolutionNote: one distinct, honest message per outcome", () => {
  assert.match(buildDryResolutionNote({ outcome: "no_capture" }), /no stored capture/);
  assert.match(buildDryResolutionNote({ outcome: "no_fact_claims" }), /nothing to supersede/);
  assert.match(buildDryResolutionNote({ outcome: "re_grounded", factTotal: 3, dominantCapture: { id: "x", result_content: "abc" }, degradedNewest: null }), /all 3 FACT span\(s\)/);
  assert.match(
    buildDryResolutionNote({ outcome: "needs_supersede", factTotal: 4, unmatchedFactClaims: [1, 2], dominantCapture: null, degradedNewest: null }),
    /2 of 4 FACT span\(s\)/,
  );
});

test("buildAppliedSupersedeNote: names the quarantine enqueue when provenance flips, else re-grounded", () => {
  const plan = { unmatchedFactClaims: [1], dominantCapture: { id: "cap-1", result_content: "abc" }, degradedNewest: null };
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

test("idempotent (fix round 1, review-l11.md): a second apply over the SAME underlying flag writes nothing (it resolves out of the candidate read)", async () => {
  const flagStore = [{ id: "f1", subject_ref: "item-1" }];
  const claimsByItem = { "item-1": [{ id: "c1", claim_kind: "FACT", source_span: "still here" }] };
  const capturesByItem = { "item-1": [{ result_content: "... still here ...".repeat(20) }] };
  const deps = {
    nowIso: "2026-09-12T00:00:00.000Z",
    readCandidates: async () => flagStore.filter((f) => !f.resolved),
    readClaims: async (itemId) => claimsByItem[itemId] ?? [],
    readCaptures: async (itemId) => capturesByItem[itemId] ?? [],
    readClaimVersions: async () => [],
    archiveClaimVersion: async () => ({ inserted: { id: "v-1" } }),
    holdClaimPendingReground: async () => ({ updated: 1 }),
    readItemProvenanceStatus: async () => "verified",
    resolveFlags: async (ids) => {
      for (const f of flagStore) if (ids.includes(f.id)) f.resolved = true;
      return { updated: ids.length };
    },
    readRemainingOpen: async () => flagStore.filter((f) => !f.resolved),
  };
  const first = await main({ mode: "apply" }, deps);
  assert.equal(first.applied, 1);
  assert.equal(first.read_back.remaining_open, 0);

  const second = await main({ mode: "apply" }, deps);
  assert.equal(second.applied, 0);
  assert.equal(second.counts.flags_scanned, 0);
  assert.equal(second.counts.items_scanned, 0);
  assert.equal(second.read_back.remaining_open, 0);
});

test("constants match the plan's own writer/resolver names", () => {
  assert.equal(HOLD_CREATED_BY, "refetch-capped-worklist");
  assert.equal(RESOLVED_BY, "resolve-refetch-holds");
});
