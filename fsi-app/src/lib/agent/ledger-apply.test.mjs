// PROOF (Phase R, F5 — the CHANGE path is fail-closed, matching eraseClaimWithProof and this file's header).
// The prior claim state is preserved BEFORE the current row is changed. If the claim_versions archive FAILS,
// applyLedgerDiff THROWS before the section_claim_provenance UPDATE — the current row is never overwritten
// when its prior attribution was not durably archived (the retired warn-then-overwrite was a data-history-loss
// window). RED-then-GREEN: archive-fails -> throw + no overwrite (prior attribution survives); archive-ok ->
// versions-then-updates as before. Runs in the no-npm discipline glob (src/lib/agent/*.test.mjs); node builtins
// + a relative .mjs import only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLedgerDiff, diffLedger } from "./ledger-apply.mjs";

// A minimal supabase test double. claim_versions.select()...limit() feeds nextVersionNumber; claim_versions
// .insert() is the archive (made to fail on demand); section_claim_provenance.update() is the destructive
// overwrite we must prove is BLOCKED when the archive fails. It records every update() so the test can assert
// it was (not) reached.
function makeSb({ archiveFails }) {
  const updates = [];
  const sb = {
    updates,
    from(table) {
      if (table === "claim_versions") {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          insert() {
            return Promise.resolve(archiveFails ? { error: { message: "archive boom" } } : { error: null });
          },
        };
      }
      if (table === "section_claim_provenance") {
        return {
          update(payload) { updates.push(payload); return { eq() { return Promise.resolve({ error: null }); } }; },
          insert() { return { select() { return { single() { return Promise.resolve({ data: { id: "new" }, error: null }); } }; } }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return sb;
}

const EXISTING = [{ id: "c1", claim_text: "the cap is 45 percent", claim_kind: "FACT", source_span: "old span", source_id: "s-old", source_tier_at_grounding: 2, section_row_id: "sec1" }];
const INCOMING = [{ claim_text: "the cap is 45 percent", claim_kind: "FACT", source_span: "new span", source_id: "s-new", source_tier_at_grounding: 1, section_row_id: "sec1" }];

test("diffLedger classifies the re-attribution as a CHANGE (setup sanity)", () => {
  const diff = diffLedger(EXISTING, INCOMING);
  assert.equal(diff.change.length, 1);
  assert.equal(diff.add.length, 0);
});

test("F5 RED: archive failure THROWS and the current claim is NEVER overwritten (prior attribution survives)", async () => {
  const sb = makeSb({ archiveFails: true });
  const diff = diffLedger(EXISTING, INCOMING);
  await assert.rejects(
    () => applyLedgerDiff(sb, "item-1", diff),
    /change aborted — version archive failed/,
    "applyLedgerDiff must throw when the version archive fails",
  );
  assert.equal(sb.updates.length, 0, "the section_claim_provenance UPDATE (the overwrite) must NOT run when the archive failed — prior attribution survives");
});

test("F5 GREEN: archive success versions-then-updates as before (happy path preserved)", async () => {
  const sb = makeSb({ archiveFails: false });
  const diff = diffLedger(EXISTING, INCOMING);
  const res = await applyLedgerDiff(sb, "item-1", diff);
  assert.equal(sb.updates.length, 1, "the overwrite runs once on the happy path");
  assert.equal(res.applied.versioned, 1, "the prior state was archived");
  assert.equal(res.applied.changed, 1, "the change was applied");
  // the overwrite clears mint_hold_reason so the mint-gate re-evaluates the fresh attribution
  assert.equal(sb.updates[0].mint_hold_reason, null);
});

// D29 (defect-fix-plan-2026-09-12, lane L19): opts.replaceLedger. A test double covering claim_versions
// .insert() (captured for assertion) and section_claim_provenance .delete() (also captured), on top of the
// existing makeSb's insert()/update() shape (a replace-ledger apply never inserts or updates
// section_claim_provenance -- diffLedger's `add`/`change` are empty in every test below, only `notReproduced`
// is exercised).
function makeReplaceLedgerSb({ archiveFails = false } = {}) {
  const claimVersionInserts = [];
  const deletes = [];
  const sb = {
    claimVersionInserts,
    deletes,
    from(table) {
      if (table === "claim_versions") {
        return {
          select() { return this; },
          eq() { return this; },
          order() { return this; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          insert(payload) {
            claimVersionInserts.push(payload);
            return Promise.resolve(archiveFails ? { error: { message: "archive boom" } } : { error: null });
          },
        };
      }
      if (table === "section_claim_provenance") {
        return {
          delete() {
            return {
              eq(_col, id) {
                deletes.push(id);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return sb;
}

const REPLACE_EXISTING = [
  { id: "old-1", claim_text: "the fine is up to EUR 500,000", claim_kind: "FACT", source_span: "fines of up to EUR 500,000", source_id: "s-old", source_tier_at_grounding: 2, section_row_id: "sec1" },
];
// An EMPTY incoming ledger, so diffLedger classifies REPLACE_EXISTING's one row as notReproduced with
// nothing added or changed -- isolates the notReproduced path alone (add/change are already covered by
// EXISTING/INCOMING above), and keeps the fake `sb` below minimal (no section_claim_provenance.insert()/
// .update() needed for these tests; every real add/change call is unit-tested elsewhere in this file).
test("D29 setup sanity: an empty incoming ledger leaves the existing claim NOT-REPRODUCED, nothing added or changed", () => {
  const diff = diffLedger(REPLACE_EXISTING, []);
  assert.equal(diff.notReproduced.length, 1);
  assert.equal(diff.add.length, 0);
  assert.equal(diff.change.length, 0);
});

test("D29: no replaceLedger (default) keeps a not-reproduced prior claim -- today's behaviour, byte for byte", async () => {
  const sb = makeReplaceLedgerSb();
  const diff = diffLedger(REPLACE_EXISTING, []);
  const res = await applyLedgerDiff(sb, "item-1", diff); // opts omitted entirely
  assert.equal(res.applied.notReproduced, 1);
  assert.equal(res.applied.archived, 0);
  assert.equal(sb.claimVersionInserts.length, 0, "no archive write when replaceLedger is not set");
  assert.equal(sb.deletes.length, 0, "no delete when replaceLedger is not set");
  assert.ok(res.currentIds.includes("old-1"), "the not-reproduced claim stays in the current ledger");
});

test("D29 GREEN: replaceLedger archives a not-reproduced prior claim (supersede_reason=superseded_by_record_briefs, batch id in note) and drops it from the current ledger", async () => {
  const sb = makeReplaceLedgerSb();
  const diff = diffLedger(REPLACE_EXISTING, []);
  const res = await applyLedgerDiff(sb, "item-1", diff, { replaceLedger: true, batchId: "record-briefs-003" });
  assert.equal(res.applied.archived, 1);
  assert.equal(res.applied.notReproduced, 0, "an archived claim is not ALSO counted as kept-not-reproduced");
  assert.equal(sb.claimVersionInserts.length, 1);
  assert.equal(sb.claimVersionInserts[0].supersede_reason, "superseded_by_record_briefs");
  assert.equal(sb.claimVersionInserts[0].note, "batch record-briefs-003", "the batch id is named on the archive");
  assert.equal(sb.claimVersionInserts[0].current_claim_id, null, "current_claim_id is nulled once the current row is removed (mirrors proven_inaccurate)");
  assert.deepEqual(sb.deletes, ["old-1"], "the current section_claim_provenance row is deleted only AFTER the archive write");
  assert.ok(!res.currentIds.includes("old-1"), "the archived claim is no longer part of the current ledger validate_item_provenance judges");
});

test("D29: replaceLedger leaves a REPRODUCED (unchanged) prior claim untouched -- only notReproduced is ever archived", async () => {
  const claim = { id: "keep-1", claim_text: "the operator must register with the agency", claim_kind: "FACT", source_span: "must register with the agency", source_id: "s1", source_tier_at_grounding: 1, section_row_id: "sec1" };
  const { id, ...incomingShape } = claim;
  const sb = makeReplaceLedgerSb();
  const diff = diffLedger([claim], [incomingShape]);
  assert.equal(diff.unchanged.length, 1, "setup sanity: identical attribution classifies as unchanged, not notReproduced");
  const res = await applyLedgerDiff(sb, "item-1", diff, { replaceLedger: true, batchId: "record-briefs-003" });
  assert.equal(res.applied.unchanged, 1);
  assert.equal(res.applied.archived, 0);
  assert.equal(sb.claimVersionInserts.length, 0, "an unchanged (reproduced) claim is never archived");
  assert.equal(sb.deletes.length, 0);
  assert.ok(res.currentIds.includes("keep-1"));
});

test("D29 fail-closed: an archive-write failure keeps the claim in the current ledger (never dropped without a durable prior-state record)", async () => {
  const sb = makeReplaceLedgerSb({ archiveFails: true });
  const diff = diffLedger(REPLACE_EXISTING, []);
  const res = await applyLedgerDiff(sb, "item-1", diff, { replaceLedger: true, batchId: "record-briefs-003" });
  assert.equal(res.applied.archived, 0);
  assert.equal(res.applied.notReproduced, 1, "falls back to kept-not-reproduced when the archive itself failed");
  assert.equal(sb.deletes.length, 0, "never deletes the current row when its prior state was not durably archived");
  assert.ok(res.currentIds.includes("old-1"));
});
