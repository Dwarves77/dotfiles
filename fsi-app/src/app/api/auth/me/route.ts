import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// GET /api/auth/me — get current user info
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    userId: auth.userId,
    role: auth.role,
  });
}
