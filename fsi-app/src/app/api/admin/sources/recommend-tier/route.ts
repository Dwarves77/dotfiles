import { NextRequest, NextResponse } from "next/server";
import { isRefusal, requireAdminRoute } from "@/lib/api/route-guard";
import { rateLimitHeaders } from "@/lib/api/rate-limit";
import { recommendSourceTier } from "@/lib/sources/recommend-source-tier";


export async function POST(request: NextRequest) {
  const auth = await requireAdminRoute(request);
  if (isRefusal(auth)) return auth;

  let body: { source_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.source_id) {
    return NextResponse.json({ error: "source_id is required" }, { status: 400 });
  }

  try {
    const recommendation = await recommendSourceTier(body.source_id);
    return NextResponse.json({ recommendation }, { headers: rateLimitHeaders(auth.userId) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
