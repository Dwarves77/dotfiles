import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";

// GET /api/briefings/:id/export/:format — export briefing as html or slack
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const { id, format } = await params;
  const db = getAdminClient();

  const { data: briefing, error } = await db
    .from("briefings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !briefing) {
    return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
  }

  if (format === "html") {
    return new NextResponse(briefing.html_content || "<p>No HTML content available</p>", {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `attachment; filename="briefing-${briefing.week_date}.html"`,
      },
    });
  }

  if (format === "slack") {
    return new NextResponse(briefing.slack_content || "No Slack content available", {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="briefing-${briefing.week_date}.txt"`,
      },
    });
  }

  return NextResponse.json({ error: "Invalid format. Use 'html' or 'slack'" }, { status: 400 });
}
