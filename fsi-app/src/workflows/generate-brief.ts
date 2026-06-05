// THE canonical generation path (Sprint 4 — step 2b). ONE path, real bodies.
//
// The four named steps wrap the canonical-pipeline lib fns
// (src/lib/agent/canonical-pipeline.ts), each PROVEN by direct execution before
// being wrapped here (scripts/canonical-pipeline-proof.mjs: generate -> section ->
// ground -> VERIFIED -> grow on a fresh item). The workflow function only
// ORCHESTRATES; every Node / fetch / Supabase / Anthropic call happens inside a
// "use step" body (full Node access — the "use workflow" sandbox has none).
//
//   budgetGuard -> generate -> section -> ground -> grow
//
// /api/agent/run starts THIS workflow, so it is now the real generation path. The
// prior Block-1 stub step-skeleton and the scripts-as-path are retired (see git
// history): canonical-pipeline.groundBrief already does active sourcing (fetch the
// item + cited URLs, keep only FACT claims whose span is a verbatim substring of
// fetched content) + validate_item_provenance + the manual cleanup-on-invalid
// rollback; growSources runs the proven growSourcesFromBrief.
//
// HC3 spend cap (decision-log row 38): the start() refactor orphaned the old inline
// b2-runner cap. It is reconstituted HERE, in the substrate, reading the existing
// agent_runs.cost_usd_estimated ledger. The cap exists to halt a runaway SCALED
// pass (step 4); a single pull is ~$0.15, far under any sane cap.
import { RetryableError, FatalError, getStepMetadata } from "workflow";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spanCheckFetch, type SpanCheckResult } from "../lib/agent/span-check";
import { isGloballyPaused } from "../lib/api/pause";
import {
  generateBrief,
  sectionBrief,
  groundBrief,
  growSources,
  type StepResult,
} from "../lib/agent/canonical-pipeline";

// Estimated per-step Claude spend for the cost_usd_estimated ledger. CLAUDE.md
// baseline is ~$0.15/item: the generate pass and the ground pass each make one
// Sonnet call; section + grow make none. Honest as an ESTIMATE (the column name is
// cost_usd_estimated) and adequate for the cap's purpose (count items x est cost).
const EST_GENERATE_USD = 0.1;
const EST_GROUND_USD = 0.05;
// Daily estimated-spend ceiling. Override with GENERATION_DAILY_CAP_USD.
const DAILY_CAP_USD = Number(process.env.GENERATION_DAILY_CAP_USD ?? 5);

function svc(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// Best-effort cost telemetry — a failed telemetry write must never block generation.
async function recordRun(sb: SupabaseClient, itemId: string, label: string, costUsd: number, ok: boolean, detail: string) {
  const { data: it } = await sb.from("intelligence_items").select("source_id, source_url").eq("id", itemId).single();
  await sb.from("agent_runs").insert({
    intelligence_item_id: itemId,
    source_id: it?.source_id ?? null,
    source_url: it?.source_url ?? null,
    fetch_method: `canonical:${label}`,
    status: ok ? "completed" : "failed",
    cost_usd_estimated: costUsd,
    ended_at: new Date().toISOString(),
    errors: ok ? [] : [{ step: label, detail }],
  });
}

// ── Canonical steps (durable checkpoints) — real bodies wrapping the proven lib fns ──

// PREFLIGHT GUARD — restores the two cost controls the inline route honored before
// the stub workflow dropped them, REUSING existing infra (no new mechanism):
//   1. Global pause — isGloballyPaused (src/lib/api/pause.ts), the same flag the
//      admin GlobalPauseToggle writes. A paused platform must not spend.
//   2. HC3 spend cap (decision-log row 38) — sum today's estimated Claude spend from
//      the existing agent_runs.cost_usd_estimated ledger (the same ledger MtdSpendTile
//      reads); if at/over the daily cap, HALT before any new Sonnet call.
// FatalError (not Retryable): paused/over-budget is a permanent stop for this run.
export async function preflightStep(itemId: string): Promise<{ spentUsd: number; capUsd: number }> {
  "use step";
  void itemId;
  const sb = svc();
  if (await isGloballyPaused(sb)) {
    throw new FatalError("generation halted: global_processing_paused is set (admin pause)");
  }
  const midnightUtc = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const { data } = await sb.from("agent_runs").select("cost_usd_estimated").gte("started_at", midnightUtc);
  const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd_estimated || 0), 0);
  if (spent >= DAILY_CAP_USD) {
    throw new FatalError(
      `generation halted: today's estimated spend $${spent.toFixed(2)} >= cap $${DAILY_CAP_USD.toFixed(2)} (raise GENERATION_DAILY_CAP_USD to proceed)`
    );
  }
  return { spentUsd: spent, capUsd: DAILY_CAP_USD };
}

// Generate the format-selected brief (Sonnet). Records est. spend to the ledger.
export async function generateStep(itemId: string): Promise<StepResult> {
  "use step";
  const sb = svc();
  const r = await generateBrief(itemId);
  await recordRun(sb, itemId, "generate", r.ok ? EST_GENERATE_USD : 0, r.ok, r.detail).catch(() => {});
  return r;
}

// Format-selected section extraction (no Sonnet call).
export async function sectionStep(itemId: string): Promise<StepResult> {
  "use step";
  return sectionBrief(itemId);
}

// Active-sourcing claim ledger + verbatim span-check + validate_item_provenance
// (Sonnet). The set_provenance_status trigger flips a valid item to verified.
export async function groundStep(itemId: string): Promise<StepResult> {
  "use step";
  const sb = svc();
  const r = await groundBrief(itemId);
  await recordRun(sb, itemId, "ground", r.ok ? EST_GROUND_USD : 0, r.ok, r.detail).catch(() => {});
  return r;
}

// Source growth: register surfaced sources, record citations, compound credibility
// (the proven growSourcesFromBrief — no Sonnet call). Non-gating.
export async function growStep(itemId: string): Promise<StepResult> {
  "use step";
  return growSources(itemId);
}

// Task 1.14: span-check fetch step (Component 7) — RESERVED tested utility, not in
// the canonical orchestration (groundBrief does its own verbatim span-check). Kept
// because the retry contract is decision-log rows 22 + 45 and is runtime-verified:
//   - maxRetries PINNED to 3 (4 total attempts). A WDK default change must not be
//     able to silently alter the retry contract (same invisible-drift lesson as the
//     jq fail-open hook: pin it, don't depend on a default).
//   - EXPONENTIAL backoff: retryAfter = attempt^2 seconds, from
//     getStepMetadata().attempt. A constant retryAfter would not be exponential.
//   - On retry EXHAUSTION the step throws and the run ends FAILED — the claim is NOT
//     returned as validated (fail SAFE).
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
export interface GenerateBriefResult {
  itemId: string;
  status: string;
  steps: Partial<Record<"budget" | "generate" | "section" | "ground" | "grow", unknown>>;
}

export async function generateBriefWorkflow(itemId: string): Promise<GenerateBriefResult> {
  "use workflow";

  // Preflight first — halts (FatalError) before any Sonnet spend if paused or over budget.
  const budget = await preflightStep(itemId);

  const generate = await generateStep(itemId);
  if (!generate.ok) return { itemId, status: "generate_failed", steps: { budget, generate } };

  const section = await sectionStep(itemId);
  if (!section.ok) return { itemId, status: "section_failed", steps: { budget, generate, section } };

  const ground = await groundStep(itemId);
  if (!ground.ok) return { itemId, status: "ground_failed", steps: { budget, generate, section, ground } };

  // Grow is non-gating: source credibility compounds, but a failed grow does not
  // invalidate an already-verified brief. The set_provenance_status trigger (migration
  // 121) flipped the item to 'verified' on the grounding writes — no human tick.
  const grow = await growStep(itemId);

  return { itemId, status: "verified", steps: { budget, generate, section, ground, grow } };
}
