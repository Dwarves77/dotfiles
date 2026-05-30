import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { start } from "workflow/api";
import { generateBriefWorkflow } from "@/workflows/generate-brief";

// Sprint 4 Block 1 — task 1.5: thin wrapper over the durable generate-brief
// workflow (Vercel Workflow DevKit substrate).
//
// Pre-Sprint-4, this route inlined the whole pipeline: fetch source -> Sonnet
// call -> citation extraction -> YAML parse -> validate -> persist to
// intelligence_items + raw_fetches + source_citations + agent_runs telemetry.
// That logic now lives in the workflow's named steps in
// src/workflows/generate-brief.ts (sourceOrFindForClaim, persistAgentRunSearches,
// validateItemProvenance, routeOnValidation) and is filled with real bodies in
// Block 4. The DevKit gives us durability, automatic per-step retry, and the
// createHook/resumeHook human-verify gate for CRITICAL/HIGH items.
//
// In Block 1 the step bodies are stubs, so this returns a runId without writing
// briefs. The prior implementation is preserved in git history (commit before
// this one) for the Block 4 step-body migration. Master is unaffected until the
// branch merges post-HARD-CHECKPOINT-1.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  let itemId: string | undefined;
  let sourceUrl: string | undefined;
  try {
    const body = await request.json();
    itemId = typeof body.itemId === "string" && body.itemId.length > 0 ? body.itemId : undefined;
    sourceUrl =
      typeof body.sourceUrl === "string" && body.sourceUrl.length > 0 ? body.sourceUrl : undefined;
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

  // Hand off to the durable workflow. start() returns immediately with a runId;
  // it does not wait for completion. Callers poll via the workflow inspect/run
  // APIs or the agent_runs telemetry the steps write (Block 4).
  const run = await start(generateBriefWorkflow, [itemId]);
  return NextResponse.json({ runId: run.runId, item_id: itemId }, { status: 202 });
}
