import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase-service";
import { isGloballyPaused } from "@/lib/api/pause";
import { runReconcilePass } from "@/lib/sources/reconcile";
import { workerAuthGuard } from "@/lib/api/worker-auth";

// POST /api/worker/reconcile — the reconcile-loop CONSUMER, manual re-drive.
//
// Thin wrapper over runReconcilePass (src/lib/sources/reconcile.ts) — the SAME consumer
// check-sources/route.ts now also calls in-process after every scan batch, so one dispatch of
// source-monitoring.yml both detects AND reconciles with no HTTP self-call. This route stays live for a
// manual re-drive (e.g. after a check-sources run that failed mid-reconcile, or an operator-triggered
// catch-up over a larger batch) and remains worker-secret gated exactly as before.
//
// Reads monitoring_queue rows where the detector flagged a content change (change_detected=true) and has
// not yet been reconciled (reconciled_at IS NULL); for each affected LIVE item, records the change into
// intelligence_changes (recordSourceChangeTrigger) AND stages an update_item staged_updates row via the
// change-sweep amendment-diff bridge (bridgeChangedSourceToStagedUpdates) so the existing review/apply
// path can re-verify content and rule 16 can re-run the flywheel on apply. The detailed field-diff
// (recordItemChange) and the provenance reset are written by generation/re-ground once content is
// available (Browserless) — and the provenance flip requires the bound reconciler credential (#43 guard,
// migration 118), so that step does NOT run as service-role here.
//
// Idempotent: each processed row is stamped reconciled_at, so re-runs do not double-record.
// Authentication: WORKER_SECRET header. Honors the global pause gate.

export async function POST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();

  if (await isGloballyPaused(supabase)) {
    return NextResponse.json({ message: "Global processing pause is active; reconcile worker exiting", processed: 0 });
  }

  const result = await runReconcilePass(supabase);
  if (result.pending === 0 && result.errors.length > 0) {
    // The claim query itself failed (see runReconcilePass) — surface it as an error, not a friendly no-op.
    return NextResponse.json({ error: result.errors[0] }, { status: 500 });
  }
  if (result.pending === 0) {
    return NextResponse.json({ message: "no pending content changes to reconcile", processed: 0, changesRecorded: 0, staged: 0 });
  }

  return NextResponse.json({
    message: "reconcile pass complete",
    ...result,
    note: "Detailed field-diff + provenance reset (re-ground) run via generation once content is available (Browserless) under the reconciler credential.",
  });
}
