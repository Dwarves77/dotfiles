import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, isSupabaseConfigured } from "@/lib/supabase-admin";
import { requireAuth } from "@/lib/api-auth";
import { SKILL_GENERATION_PROMPT } from "@/lib/worker/prompts";

// GET /api/skill/generate — generate and download current SKILL.md
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "admin");
  if (!auth.ok) return auth.response;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const db = getAdminClient();

  // Fetch all context
  const [
    { data: resources },
    { data: sources },
    { data: disputes },
    { data: changelog },
  ] = await Promise.all([
    db.from("resources").select("id, title, category, type, priority, tags, modes, topic, jurisdiction, url, note").eq("is_archived", false),
    db.from("source_registry").select("*").eq("is_active", true),
    db.from("disputes").select("*").eq("active", true),
    db.from("changelog").select("*").order("date", { ascending: false }).limit(20),
  ]);

  const userPrompt = `${SKILL_GENERATION_PROMPT}

CURRENT RESOURCES (${resources?.length || 0}):
${JSON.stringify(resources || [], null, 2)}

SOURCE REGISTRY (${sources?.length || 0}):
${JSON.stringify(sources || [], null, 2)}

ACTIVE DISPUTES:
${JSON.stringify(disputes || [], null, 2)}

RECENT CHANGES:
${JSON.stringify(changelog || [], null, 2)}`;

  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!claudeResponse.ok) {
    const errBody = await claudeResponse.text();
    return NextResponse.json({ error: `Claude API error: ${claudeResponse.status}` }, { status: 500 });
  }

  const result = await claudeResponse.json();
  let skillContent = "";
  for (const block of result.content || []) {
    if (block.type === "text") skillContent += block.text;
  }

  // Strip markdown fences if Claude wrapped it
  skillContent = skillContent.replace(/^```(?:markdown|md)?\n?/, "").replace(/\n?```$/, "").trim();

  return new NextResponse(skillContent, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="SKILL.md"`,
    },
  });
}
