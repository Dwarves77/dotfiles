// Sprint 4 Block 1 — task 1.0c: generate-brief workflow STEP SKELETON.
//
// This file stands up the Vercel Workflow DevKit substrate for Phase 4 gated
// generation. Block 1 ships ONLY the skeleton: each named step is registered
// and invoked so it appears as a durable checkpoint in
// `npx workflow inspect run <runId>`, proving the step graph registers and
// checkpoints correctly. The step BODIES are placeholder stubs — the real
// active-sourcing / persistence / validation / routing logic lands in Block 4.
//
// Substrate primitives (per the Workflow DevKit):
//   - "use workflow" : makes generateBriefWorkflow durable / replayable.
//   - "use step"     : each step is a cached, retryable, checkpointed unit.
//   - createHook     : per-claim human-verification gate (CRITICAL/HIGH).
//   - DurableAgent   : Block 4 active-sourcing agent (reserved here).
//   - RetryableError : Block 4 / task 1.14 span-check retry signal (reserved).
import { createHook, RetryableError } from "workflow";
import { DurableAgent } from "@workflow/ai/agent";
import { createClient } from "@supabase/supabase-js";
import { verifyHookToken } from "../lib/agent/verify-token";

// Reserved substrate primitives — wired now, exercised in Block 4. The `void`
// references keep them genuinely used (the DevKit bundler 500s on unused
// workflow imports, and tsc may flag unused locals).
void DurableAgent;
void RetryableError;

export interface ProvenanceValidationResult {
  valid: boolean;
  failures: unknown[];
}

export interface ClaimGrounding {
  source_span: string | null;
  source_id: string | null;
}

interface PendingClaim {
  claimId: string;
}

// ── Named steps (durable checkpoints) — stub bodies, real logic in Block 4 ──

// Active sourcing: if the FACT appears in the item's source_url, return that
// span + source_id; else web_search for an authoritative (Tier 1-2 for
// CRITICAL/HIGH) source; else signal an explicit GAP. (Block 4: DurableAgent.)
export async function sourceOrFindForClaim(
  itemId: string,
  claim: unknown,
): Promise<ClaimGrounding> {
  "use step";
  void itemId;
  void claim;
  return { source_span: null, source_id: null };
}

// Persist each web_search call (query, result_url, result_title, result_index,
// result_content_excerpt) to agent_run_searches for this run. Returns row count.
export async function persistAgentRunSearches(
  itemId: string,
  searches: unknown[],
): Promise<number> {
  "use step";
  void itemId;
  void searches;
  return 0;
}

// Call public.validate_item_provenance(item_id) and return its result.
export async function validateItemProvenance(
  itemId: string,
): Promise<ProvenanceValidationResult> {
  "use step";
  void itemId;
  return { valid: false, failures: [] };
}

// On valid -> write intelligence_items + sections (the set_provenance_status
// trigger then sets verified / pending_human_verify). On invalid -> write
// staged_updates with the failures payload. Returns the terminal route taken.
export async function routeOnValidation(
  itemId: string,
  result: ProvenanceValidationResult,
): Promise<string> {
  "use step";
  void itemId;
  void result;
  return "noop";
}

// ── Task 1.12 steps — per-claim human verification (UNVERIFIED-PENDING-RUNTIME) ──

function verifyServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// Load the item's FACT claims that still need a human tick (verified_at IS NULL).
export async function loadPendingFactClaims(itemId: string): Promise<PendingClaim[]> {
  "use step";
  const supabase = verifyServiceClient();
  const { data } = await supabase
    .from("section_claim_provenance")
    .select("id")
    .eq("intelligence_item_id", itemId)
    .eq("claim_kind", "FACT")
    .is("verified_at", null);
  return (data ?? []).map((r: { id: string }) => ({ claimId: r.id }));
}

// On a tick, stamp verified_by + verified_at on the claim (also the 1.13 audit log).
export async function recordClaimVerification(
  itemId: string,
  claimId: string,
  reviewer: string,
): Promise<void> {
  "use step";
  const supabase = verifyServiceClient();
  await supabase
    .from("section_claim_provenance")
    .update({ verified_by: reviewer, verified_at: new Date().toISOString() })
    .eq("intelligence_item_id", itemId)
    .eq("id", claimId);
}

// When every FACT claim for the item is ticked, flip pending_human_verify ->
// verified (and stamp provenance_verified_at). Returns whether it flipped.
export async function flipToVerifiedIfAllTicked(itemId: string): Promise<boolean> {
  "use step";
  const supabase = verifyServiceClient();
  const { data: facts } = await supabase
    .from("section_claim_provenance")
    .select("verified_at")
    .eq("intelligence_item_id", itemId)
    .eq("claim_kind", "FACT");
  const rows = facts ?? [];
  const allTicked = rows.length > 0 && rows.every((f: { verified_at: string | null }) => f.verified_at != null);
  if (!allTicked) return false;
  await supabase
    .from("intelligence_items")
    .update({ provenance_status: "verified", provenance_verified_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("provenance_status", "pending_human_verify");
  return true;
}

// ── Workflow orchestration (durable) ──
export async function generateBriefWorkflow(
  itemId: string,
): Promise<{ itemId: string; status: string }> {
  "use workflow";

  // Invoke each named step so it registers as a durable checkpoint. Stubs only.
  await sourceOrFindForClaim(itemId, null);
  await persistAgentRunSearches(itemId, []);
  const validation = await validateItemProvenance(itemId);
  const routed = await routeOnValidation(itemId, validation);

  // Per-claim human-verification loop scaffold (CRITICAL/HIGH gate). Deterministic
  // token per claim: `verify-<itemId>-<claimId>`. The admin verification queue
  // (task 1.12) calls resumeHook(token, { tick, claim_id, reviewer }) to advance.
  // Block 4 loads the real pending FACT claims; here the list is empty so the
  // skeleton completes without suspending.
  // Task 1.12 (UNVERIFIED-PENDING-RUNTIME): load the item's pending FACT claims
  // and open one durable hook per claim so the admin queue can tick them in ANY
  // order (all tokens active concurrently via Promise.all — the concurrent-hook
  // shape is the highest-risk unverified piece; runtime-verify it first). Each
  // tick records verified_by/at; once all are ticked the item flips to verified.
  // Token is built by the SHARED verifyHookToken so it is byte-identical to the
  // resumeHook call in the admin tick route. Block 4 still owns producing the
  // claims upstream; the wiring + token contract are complete here.
  const pendingClaims = await loadPendingFactClaims(itemId);
  await Promise.all(
    pendingClaims.map(async (claim) => {
      const hook = createHook<{ tick: boolean; claim_id: string; reviewer: string }>({
        token: verifyHookToken(itemId, claim.claimId),
      });
      const payload = await hook; // suspends until resumeHook delivers the tick
      await recordClaimVerification(itemId, claim.claimId, payload.reviewer);
    }),
  );
  const flipped = await flipToVerifiedIfAllTicked(itemId);
  void flipped;

  return { itemId, status: routed };
}
