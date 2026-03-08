import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "../../_lib/auth";

/**
 * POST /api/worker/run
 * Manually trigger the weekly intelligence worker.
 * Protected by X-API-Key header.
 *
 * Phase 2 stub — will be implemented in Phase 3 with Claude API + web_search.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error: "Worker not yet implemented",
      message: "This endpoint will be available after Phase 3 implementation.",
    },
    { status: 501 }
  );
}
