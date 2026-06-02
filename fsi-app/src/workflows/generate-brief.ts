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
import { RetryableError, getStepMetadata } from "workflow";
import { DurableAgent } from "@workflow/ai/agent";
import { spanCheckFetch, type SpanCheckResult } from "../lib/agent/span-check";

// Reserved substrate primitives — wired now, exercised in Block 4. The `void`
// references keep them genuinely used (the DevKit bundler 500s on unused
// workflow imports, and tsc may flag unused locals).
void DurableAgent;
// RetryableError is now genuinely used in spanCheckClaim (task 1.14).

export interface ProvenanceValidationResult {
  valid: boolean;
  failures: unknown[];
}

export interface ClaimGrounding {
  source_span: string | null;
  source_id: string | null;
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

// NOTE: the task-1.12 per-claim human-verification steps (loadPendingFactClaims,
// recordClaimVerification, flipToVerifiedIfAllTicked) were REMOVED — promotion is
// now uniform and fully automated (migration 121): a valid item flips to
// 'verified' for ALL tiers, no human tick. There is no human backstop.

// Task 1.14: span-check fetch step (Component 7). The operator's Component-7 retry
// contract is made EXPLICIT here, not left to WDK defaults:
//   - maxRetries PINNED to 3 (4 total attempts). A WDK default change must not be
//     able to silently alter the retry contract (same invisible-drift lesson as the
//     jq fail-open hook: pin it, don't depend on a default).
//   - EXPONENTIAL backoff: retryAfter = attempt^2 seconds, from
//     getStepMetadata().attempt. A constant retryAfter would not be exponential.
//   - On retry EXHAUSTION the step throws and the workflow run ends FAILED — the
//     claim is NOT returned as validated (fail SAFE). The route-to-staging
//     DESTINATION on exhaustion is Block 4 (routeOnValidation real body + wiring
//     spanCheckClaim into the generation path); Block 1 guarantees fail-safe only.
// The timeout/network -> RetryableError throw is unit-verified
// (scripts/sprint4-114-spancheck-test.mjs); the retry loop + exponential backoff +
// fail-safe-on-exhaustion are runtime-verified via the worker probe (2026-05-30).
export async function spanCheckClaim(url: string): Promise<SpanCheckResult> {
  "use step";
  const meta = getStepMetadata();
  try {
    return await spanCheckFetch(url);
  } catch (e) {
    if (e instanceof RetryableError) {
      const attempt = typeof meta?.attempt === "number" ? meta.attempt : 1;
      // Exponential backoff per the operator ruling (attempt^2 seconds).
      throw new RetryableError(`span-check unverified for ${url} (attempt ${attempt})`, {
        retryAfter: attempt ** 2 * 1000,
      });
    }
    throw e;
  }
}
// Pinned: 4 total attempts (1 + 3 retries). Do NOT rely on the WDK default.
spanCheckClaim.maxRetries = 3;

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

  // Promotion is fully automated: the set_provenance_status trigger flips a valid
  // item to 'verified' (migration 121, uniform across all tiers). No per-claim
  // human-verification hook loop — there is no human backstop.

  return { itemId, status: routed };
}
