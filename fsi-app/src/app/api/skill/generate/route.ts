import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/auth";

/**
 * GET /api/skill/generate
 * Generate a downloadable SKILL.md file from current resources and sources.
 * Protected by admin auth.
 *
 * Phase 2 stub — will be implemented in Phase 5 with Claude API.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    {
      error: "Skill generator not yet implemented",
      message: "This endpoint will be available after Phase 5 implementation.",
    },
    { status: 501 }
  );
}
