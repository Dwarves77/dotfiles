import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";
import { runWeeklyUpdate } from "@/lib/worker/run";

// POST /api/worker/run — manually trigger the weekly worker (admin + API key)
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  try {
    const result = await runWeeklyUpdate();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Worker Error]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
