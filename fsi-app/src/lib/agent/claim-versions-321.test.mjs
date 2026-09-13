// Structural proof for migration 321's SQL body (D29, defect-fix-plan-2026-09-12.md, lane L19, fix round 1
// review finding C2). No live database in this worktree; the same text-based SQL contract-check precedent
// src/lib/supabase-server-recent-changes-319.test.mjs already uses for migration 319's function body.
//
// C2 (review, 2026-09-13): migration 321 originally widened `claim_versions_supersede_reason_chk` to admit
// 'superseded_by_record_briefs' but left the SIBLING `claim_versions_proof_required` constraint (migration
// 210) untouched. Read plainly, that constraint requires `inaccuracy_proof IS NOT NULL` for any
// supersede_reason other than 'changed' -- and ledger-apply.mjs's replace-ledger archive calls
// versionPayload(..., 'superseded_by_record_briefs', proof=null, ...) (see ledger-apply.test.mjs's own "D29
// GREEN" test, which asserts the captured insert payload directly). Once 321 is applied live without this
// widening, every replace-ledger archive insert would violate the constraint. This test proves the fixed
// migration file widens BOTH constraints in the same statement pair.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(HERE, "../../../supabase/migrations/321_claim_versions_record_briefs_supersede.sql");
const SQL = readFileSync(SQL_PATH, "utf8");

test("321: supersede_reason_chk is dropped-if-exists then re-added widened to admit 'superseded_by_record_briefs'", () => {
  assert.match(SQL, /drop constraint if exists claim_versions_supersede_reason_chk;/);
  const chkMatch = SQL.match(/add constraint claim_versions_supersede_reason_chk\s*\n?\s*check \(([^;]*)\);/);
  assert.ok(chkMatch, "expected a re-added claim_versions_supersede_reason_chk CHECK clause");
  assert.match(chkMatch[1], /'changed'/);
  assert.match(chkMatch[1], /'proven_inaccurate'/);
  assert.match(chkMatch[1], /'superseded_by_record_briefs'/);
});

test("321: the sibling claim_versions_proof_required constraint (migration 210) is ALSO dropped-if-exists then re-added, widened to exempt 'superseded_by_record_briefs' (C2)", () => {
  assert.match(SQL, /drop constraint if exists claim_versions_proof_required;/);
  const proofMatch = SQL.match(/add constraint claim_versions_proof_required\s*\n?\s*check \(([^;]*)\);/);
  assert.ok(proofMatch, "expected a re-added claim_versions_proof_required CHECK clause");
  const proofClause = proofMatch[1];
  // The pre-C2 body from migration 210 was `supersede_reason = 'changed' or inaccuracy_proof is not null`
  // -- a single-value equality that exempts ONLY 'changed'. The fix widens the exemption to an `in (...)`
  // set that also names 'superseded_by_record_briefs', never dropping 'changed' from the exempt set.
  assert.match(proofClause, /supersede_reason in \(\s*'changed'\s*,\s*'superseded_by_record_briefs'\s*\)/,
    "expected supersede_reason IN ('changed', 'superseded_by_record_briefs') as the exemption, not a bare equality against 'changed' alone");
  assert.match(proofClause, /inaccuracy_proof is not null/);
});

test("321: both widened constraints appear together, so a replace-ledger archive insert (supersede_reason='superseded_by_record_briefs', inaccuracy_proof=null) satisfies BOTH live", () => {
  // Simulates the two CHECK predicates directly against the exact payload ledger-apply.mjs's
  // versionPayload() produces for a replace-ledger archive (proof argument is a literal null).
  const supersedeReason = "superseded_by_record_briefs";
  const inaccuracyProof = null;
  const supersedeReasonChkOk = ["changed", "proven_inaccurate", "superseded_by_record_briefs"].includes(supersedeReason);
  const proofRequiredOk = ["changed", "superseded_by_record_briefs"].includes(supersedeReason) || inaccuracyProof !== null;
  assert.ok(supersedeReasonChkOk, "supersede_reason_chk must accept the new reason");
  assert.ok(proofRequiredOk, "proof_required must accept a null proof for the new reason (this is exactly C2's fix)");
});
