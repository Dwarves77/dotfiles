import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { d3AuditEvent } from "@/lib/d3/hooks.mjs";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { withErrorCapture } from "@/lib/telemetry/capture-error";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { start } from "workflow/api";
import { generateBriefWorkflow } from "@/workflows/generate-brief";

// Thin wrapper over the durable generate-brief workflow (Vercel Workflow DevKit) —
// the ONE canonical generation path.
//
// Pre-Sprint-4, this route inlined the whole pipeline: fetch source -> Sonnet
// call -> citation extraction -> YAML parse -> validate -> persist. That logic now
// lives in the workflow's REAL named steps in src/workflows/generate-brief.ts
// (budgetGuard -> generate -> section -> ground -> grow), each wrapping a
// canonical-pipeline lib fn proven by direct execution. The DevKit gives us
// durability and automatic per-step retry.
//
// start() returns a runId immediately and does not wait for completion. The chain
// then auto-runs: generate the brief, ground it (active sourcing + verbatim
// span-check + validate_item_provenance; the trigger flips a valid item to
// verified), and grow source credibility (register cited sources, record
// citations, compound trust). Callers poll via the workflow inspect/run APIs or the
// agent_runs cost ledger the steps write.
async function handlePOST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  // Wave-α A3 (2026-07-11, P1 finding 8 / CODE-3 F-03): this is the only
  // spend-triggering route; requireAuth alone let ANY authenticated user
  // (incl. viewer-role members) start paid generation workflows. Every
  // legitimate caller is a platform admin: the admin regenerate routes
  // forward an admin Bearer token, and the machine-gated intake cycle
  // (run-intake-cycle) runs under the F16-signed manual caller. (The former
  // drain-first-fetch worker and the staged-updates approve path were retired
  // 2026-07-12 / Unit 0c; they are no longer callers.) Gate accordingly,
  // plus the standard per-user limiter (the per-item 1h cooldown below is
  // per-ITEM and did not stop cross-corpus iteration).
  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  const gateClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const admin = await isPlatformAdmin(auth.userId, gateClient);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403 }
    );
  }

  let itemId: string | undefined;
  let sourceUrl: string | undefined;
  let refresh = false;
  try {
    const body = await request.json();
    itemId = typeof body.itemId === "string" && body.itemId.length > 0 ? body.itemId : undefined;
    sourceUrl =
      typeof body.sourceUrl === "string" && body.sourceUrl.length > 0 ? body.sourceUrl : undefined;
    refresh = body.refresh === true;
  } catch {
    return NextResponse.json({ error: "itemId or sourceUrl is required" }, { status: 400 });
  }

  // Backward compatibility: existing callers (admin "regenerate brief", the
  // corpus runners) pass sourceUrl. Resolve it to the intelligence_items id so
  // the workflow's single argument stays itemId.
  if (!itemId && sourceUrl) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id")
      .eq("source_url", sourceUrl)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn(`[agent/run] item lookup by source_url failed: ${error.message}`);
    }
    itemId = (data?.id as string | undefined) ?? undefined;
    if (!itemId) {
      return NextResponse.json(
        { error: `No intelligence_items row matches source_url=${sourceUrl}.` },
        { status: 404 }
      );
    }
  }

  if (!itemId) {
    return NextResponse.json({ error: "itemId or sourceUrl is required" }, { status: 400 });
  }

  // ── Per-item guards (DEEP-AUDIT S1-6 / option-2 item c). Service-role reads. ──
  const guardClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verified short-circuit: a certified item is NOT regenerated unless the caller
  // explicitly refreshes. Regenerating in place overwrote full_brief while
  // section/ground SKIP on a verified item (canonical-pipeline.ts:866/921) — the
  // 498-runs/39-items brief↔provenance desync.
  // RESIDUAL (flagged, deferred): those skip sites do not yet honor `refresh`, so
  // refresh re-fetches + regenerates the brief BODY but does not yet re-ground a
  // verified item's sections. The deeper half of the fix lives in the canonical
  // pipeline (SKILL.md-gated) and is out of this backend block.
  const { data: itemRow, error: itemErr } = await guardClient
    .from("intelligence_items")
    .select("provenance_status")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) console.warn(`[agent/run] provenance read failed: ${itemErr.message}`);
  if (itemRow?.provenance_status === "verified" && !refresh) {
    return NextResponse.json(
      {
        skipped: "already_verified",
        item_id: itemId,
        hint: "pass { refresh: true } to force a re-pull + regeneration",
      },
      { status: 200 }
    );
  }

  // Per-item cooldown: reject a second run within the hour — the no-cooldown
  // hammering that produced 498 runs across 39 items in a week. `refresh` does
  // NOT bypass the cooldown (a re-pull is the most expensive path of all).
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentRuns, error: cooldownErr } = await guardClient
    .from("agent_runs")
    .select("created_at")
    .eq("intelligence_item_id", itemId)
    .gte("created_at", oneHourAgoIso)
    .limit(1);
  if (cooldownErr) console.warn(`[agent/run] cooldown read failed: ${cooldownErr.message}`);
  if (recentRuns && recentRuns.length > 0) {
    return NextResponse.json(
      {
        error: "cooldown",
        item_id: itemId,
        hint: "an agent run for this item ran within the last hour; wait before retrying",
      },
      { status: 429 }
    );
  }

  // Hand off to the durable workflow. start() returns immediately with a runId;
  // it does not wait for completion. Callers poll via the workflow inspect/run
  // APIs or the agent_runs telemetry the steps write (Block 4).
  // D3 async audit (brief-gen + citation event class). The corpus mutation happens in
  // the durable workflow; this records that a gated-generation pass was triggered and
  // is a phase4 signal for self-liveness. Fresh client (the request-scoped one above is
  // block-scoped to the sourceUrl resolution). d3AuditEvent never throws.
  await d3AuditEvent(
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    { scope: "data", event: "ingest:brief-gen" }
  );
  // `refresh` rides the fetch path; while the scrape hold is LIVE the fetch gate
  // (F16) 503s it, so refresh is dormant-by-construction until hold-lift.
  const run = await start(generateBriefWorkflow, [itemId, refresh]);
  return NextResponse.json({ runId: run.runId, item_id: itemId, refresh }, { status: 202 });
}

// R0.2 first-party error tracking: capture any thrown failure on the
// highest-value route as an error_events group (mig 195), then rethrow —
// response semantics unchanged.
export const POST = withErrorCapture("/api/agent/run", handlePOST);
