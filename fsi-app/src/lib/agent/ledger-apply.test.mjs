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
