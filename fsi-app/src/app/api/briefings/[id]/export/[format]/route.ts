import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "../../../../_lib/supabase-admin";

interface RouteContext {
  params: Promise<{ id: string; format: string }>;
}

/**
 * GET /api/briefings/:id/export/:format
 * Export a briefing as HTML or Slack text.
 * format: "html" or "slack"
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id, format } = await context.params;

  if (format !== "html" && format !== "slack") {
    return NextResponse.json(
      { error: "Format must be 'html' or 'slack'" },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  const { data: briefing, error } = await supabase
    .from("briefings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !briefing) {
    return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
  }

  const content = briefing.content as Record<string, unknown>;

  if (format === "html") {
    const html = (content.html_content as string) || briefing.summary || "";
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="briefing-${briefing.week_date}.html"`,
      },
    });
  }

  // Slack format
  const slack = (content.slack_content as string) || briefing.summary || "";
  return new NextResponse(slack, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="briefing-${briefing.week_date}.txt"`,
    },
  });
}
