/**
 * sprint4-hc1-verify.mjs — HARD CHECKPOINT 1 verification orchestrator.
 *
 * Runs the checks that are runnable WITHOUT a dev server now, and prints the
 * EXACT commands for the runtime-gated also-confirms so HC1 next session is
 * "run this," not "design it at the checkpoint." Produces the evidence for the
 * operator's HC1 review; it does NOT auto-advance anything.
 *
 * Six invariant criteria: validate_item_provenance against 6 sentinel cases
 * (one per criterion) via supabase/seed/apply-114.mjs (idempotent CREATE OR
 * REPLACE + sentinel fixtures, cleaned up by that script).
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const run = (cmd) => {
  try { execSync(cmd, { stdio: "inherit" }); return true; } catch { return false; }
};

console.log("=".repeat(68));
console.log("HARD CHECKPOINT 1 — verification (run before the operator HC1 review)");
console.log("=".repeat(68));

console.log("\n[1] SIX INVARIANT CRITERIA — validate_item_provenance, 6 sentinel cases:");
const crit = run("node supabase/seed/apply-114.mjs");
console.log(`    -> ${crit ? "PASS (C1-C6: source validity, URL grounding, FACT span, labeling, slots, human-verify)" : "FAIL — see output above"}`);

console.log("\n[2] ALSO-CONFIRM — span-check timeout retry fires (RetryableError on unreachable URL):");
const span = run("node scripts/sprint4-114-spancheck-test.mjs");
console.log(`    -> ${span ? "PASS (throw verified; WDK retry-loop still runtime-pending)" : "FAIL"}`);

console.log("\n[3] RUNTIME-GATED ALSO-CONFIRMS — run AFTER one test generation (need a runId + TEST item id):");
console.log("    a) agent_run_searches populated:");
console.log("       SELECT count(*) FROM agent_run_searches WHERE intelligence_item_id = '<TEST_ITEM>';   -- expect > 0");
console.log("    b) section_claim_provenance rows created:");
console.log("       SELECT count(*) FROM section_claim_provenance WHERE intelligence_item_id = '<TEST_ITEM>';  -- expect > 0");
console.log("    c) 1.0c step-skeleton checkpoints visible in the workflow run:");
console.log("       npx workflow inspect run <RUN_ID>");
console.log("       -- expect: sourceOrFindForClaim, persistAgentRunSearches, validateItemProvenance, routeOnValidation");

console.log("\n[4] ALSO runtime-verify (the write-ahead pieces marked UNVERIFIED-PENDING-RUNTIME):");
console.log("    - 1.12 tick (HIGHEST RISK): start a workflow for a sentinel CRITICAL/HIGH item with FACT claims,");
console.log("      confirm it suspends, POST /api/admin/verify-claim per claim, verify verified_by/verified_at + the");
console.log("      pending_human_verify -> verified flip. Watch the concurrent-hook (Promise.all) shape.");
console.log("    - 1.13 audit log: confirm verified_by/verified_at render in the queue after a tick.");
console.log("    - 1.15: recommend-tier round-trip (spends Haiku; Phase 1.5) + commit-tier-change writes base_tier.");
console.log("    - 1.11: render-verify the 6 sentinel staged rows (already live).");

console.log("\n[5] THEN: compile the per-criterion report + branch/commit hashes from governing-state 3.2.1,");
console.log("    reconcile 3.2 on the merge base, and HALT for the operator. Do NOT auto-advance to Phase 1.5.");
console.log("\n(HC1 is an operator checkpoint — this script gathers evidence; the operator gates the merge.)");
