import { NextRequest, NextResponse } from "next/server";
import { workerAuthGuard } from "@/lib/api/worker-auth";
import { revalidateTag } from "next/cache";

// Generic tag-based cache-invalidation endpoint (perf lane, 2026-09-03).
//
// WHY THIS EXISTS, AND WHY IT'S NOT /api/cache/revalidate-item: that route
// already exists (generate-brief.ts's terminal step calls it) and is
// itemId-specific — it flushes exactly itemTag(id) + INTEL_ITEMS_TAG. This
// route is broader: it flushes an arbitrary LIST of tags the caller names,
// which is what the mint/apply scripts need (scripts/lib/revalidate.mjs) —
// after a population run they hold a batch of item ids (and, per surface,
// may want the coarse surfaceDetailTag(surface) flush too, e.g. after a
// reclassification pass that doesn't touch item_type but does touch related-
// item eligibility), not a single id. Reusing /api/cache/revalidate-item by
// overloading its body shape would have coupled a workflow-specific route
// (its whole doc comment is about generate-brief.ts) to a second, unrelated
// caller; adding a second endpoint with a more general contract is the
// smaller change, not a duplicate — the two routes share NO logic beyond the
// one-line workerAuthGuard() call itself (imported, not reimplemented) and
// revalidateTag() (Next's own primitive).
//
// AUTH: same WORKER_SECRET / x-worker-secret pattern as every other worker
// route (worker-auth.ts) — not user-facing, fail-closed when WORKER_SECRET
// is unset. Documented here as the "env var name" the lane brief asked for:
// WORKER_SECRET (already provisioned in Vercel for the existing worker
// routes; no new secret to add).
//
// Body: { tags: string[] } — 1 to 50 tags, each a non-empty string. Calls
// revalidateTag(tag, "max") for each. Never revalidatePath: every consumer
// of this route holds tags, not paths (mirrors revalidateItem's own
// revalidateTag-only shape in cache/revalidate-item.ts).
const MAX_TAGS = 50;

async function handlePOST(request: NextRequest) {
  const denied = workerAuthGuard(request);
  if (denied) return denied;

  let tags: string[];
  try {
    const body = await request.json();
    tags = Array.isArray(body?.tags) ? body.tags : [];
  } catch {
    return NextResponse.json({ error: "tags (string[]) is required" }, { status: 400 });
  }
  tags = tags.filter((t): t is string => typeof t === "string" && t.length > 0);
  if (tags.length === 0) {
    return NextResponse.json({ error: "tags must be a non-empty string[]" }, { status: 400 });
  }
  if (tags.length > MAX_TAGS) {
    return NextResponse.json({ error: `tags must have at most ${MAX_TAGS} entries` }, { status: 400 });
  }

  for (const tag of tags) {
    revalidateTag(tag, "max");
  }
  return NextResponse.json({ revalidated: true, tags }, { status: 200 });
}

export const POST = handlePOST;
