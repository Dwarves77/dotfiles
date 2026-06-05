import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { d3AuditEvent } from "@/lib/d3/hooks.mjs";
import { requireAuth, isAuthError } from "@/lib/api/auth";
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
  // D3 async audit (brief-gen + citation event class). The corpus mutation happens in
  // the durable workflow; this records that a gated-generation pass was triggered and
  // is a phase4 signal for self-liveness. Fresh client (the request-scoped one above is
  // block-scoped to the sourceUrl resolution). d3AuditEvent never throws.
  await d3AuditEvent(
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
    { scope: "data", event: "ingest:brief-gen" }
  );
  const run = await start(generateBriefWorkflow, [itemId]);
  return NextResponse.json({ runId: run.runId, item_id: itemId }, { status: 202 });
}
