import { NextRequest, NextResponse } from "next/server";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { revalidateItem } from "@/lib/cache/revalidate-item";

// Internal cache-invalidation endpoint for the regulation detail route.
//
// WHY THIS EXISTS: the per-item detail data (fetchIntelligenceItem /
// fetchIntelligenceItemSections) is cached via unstable_cache to remove the
// Supabase-saturation ceiling that produced the /regulations/[slug] 503 under
// burst. Cache entries carry `item:{id}` + `intel-items` tags. revalidateTag
// must run in a request scope, which raw Vercel Workflow steps do NOT provide —
// so the generate-brief workflow (fire-and-forget, started by /api/agent/run)
// pings THIS route on its terminal path to flush the just-regenerated item's
// detail cache promptly instead of waiting out the 300s revalidate backstop.
//
// AUTH: worker-secret (x-worker-secret), same pattern as /api/worker/* and the
// cron endpoints. Not a user-facing route — the only caller is the workflow,
// running server-side with WORKER_SECRET in its env. The call is best-effort;
// a 401/500/network failure never affects the generation run.
async function handlePOST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  let itemId: string | undefined;
  try {
    const body = await request.json();
    itemId =
      typeof body.itemId === "string" && body.itemId.length > 0
        ? body.itemId
        : undefined;
  } catch {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  // Flushes `item:{itemId}` + the coarse `intel-items` tag. The workflow passes
  // the item's UUID; the coarse tag is what actually lands the flush on the
  // detail cache (which is keyed by legacy_id for most items).
  revalidateItem(itemId);
  return NextResponse.json({ revalidated: true, itemId }, { status: 200 });
}

export const POST = handlePOST;
