import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { type SupabaseClient } from "@supabase/supabase-js";
import { isGloballyPaused } from "@/lib/api/pause";
import { recordSourceChangeTrigger } from "@/lib/sources/reconcile";
import { workerAuthGuard } from "@/lib/api/worker-auth";

// POST /api/worker/reconcile — the reconcile-loop CONSUMER (activation).
//
// Reads monitoring_queue rows where the detector flagged a content change
// (change_detected=true) and has not yet been reconciled (reconciled_at IS NULL), and for each
// affected intelligence_item records the change into intelligence_changes (the table the
// wired-state census found writer-less). This is the part that runs WITHOUT content: it records
// "this source's content changed; the item is flagged for re-grounding". The detailed field-diff
// (recordItemChange) and the provenance reset are written by generation/re-ground once content
// is available (Browserless) — and the provenance flip requires the bound reconciler credential
// (#43 guard, migration 118), so that step does NOT run as service-role here.
//
// Idempotent: each processed row is stamped reconciled_at, so re-runs do not double-record.
// Authentication: WORKER_SECRET header. Honors the global pause gate.

const BATCH = 200;


export async function POST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();

  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Global processing pause is active; reconcile worker exiting", processed: 0 });
  }

  // Claim the pending change signals.
  const { data: pending, error: qErr } = await supabase
    .from("monitoring_queue")
    .select("id, source_id, checked_at")
    .eq("change_detected", true)
    .is("reconciled_at", null)
    .order("checked_at", { ascending: true })
    .limit(BATCH);
  if (qErr) return NextResponse.json({ error: `queue read failed: ${qErr.message}` }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ message: "no pending content changes to reconcile", processed: 0, changesRecorded: 0 });

  let processed = 0, changesRecorded = 0;
  const errors: string[] = [];

  for (const row of pending) {
    // The source's active items are the ones whose grounding is now suspect.
    const { data: items, error: itemsErr } = await supabase
      .from("intelligence_items")
      .select("id, source_url")
      .eq("source_id", row.source_id)
      .eq("is_archived", false);
    if (itemsErr) errors.push(`items read for source ${row.source_id}: ${itemsErr.message}`);

    for (const item of items ?? []) {
      const r = await recordSourceChangeTrigger(supabase, { itemId: item.id, sourceUrl: item.source_url });
      if (r.ok) changesRecorded++;
      else errors.push(`item ${item.id.slice(0, 8)}: ${r.error}`);
    }

    // Mark the queue row reconciled so re-runs are idempotent.
    const { error: mErr } = await supabase
      .from("monitoring_queue")
      .update({ reconciled_at: new Date().toISOString() })
      .eq("id", row.id);
    if (mErr) errors.push(`queue ${row.id}: ${mErr.message}`);
    else processed++;
  }

  return NextResponse.json({
    message: "reconcile pass complete",
    processed,
    changesRecorded,
    pending: pending.length,
    errors: errors.slice(0, 20),
    note: "Detailed field-diff + provenance reset (re-ground) run via generation once content is available (Browserless) under the reconciler credential.",
  });
}
