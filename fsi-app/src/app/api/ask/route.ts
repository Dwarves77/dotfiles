import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// POST /api/ask — AI-powered Q&A against platform intelligence data
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI assistant not configured" }, { status: 500 });
  }

  try {
    const { question, sectorProfile, transportModes, jurisdictions } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Sector context for personalized responses
    const sectors = sectorProfile?.length ? sectorProfile : ["general-freight"];
    const modes = transportModes?.length ? transportModes : ["ocean", "air", "road"];
    const jurisdictionList = jurisdictions?.length ? jurisdictions : ["global"];

    // Gather platform context for the AI
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch relevant intelligence items (top 20 by urgency-related fields)
    const { data: items } = await supabase
      .from("intelligence_items")
      .select("title, summary, why_matters, key_data, category, jurisdictions, transport_modes, priority, status")
      .eq("is_archived", false)
      .order("priority")
      .limit(30);

    // Fetch sources for credibility context
    const { data: sources } = await supabase
      .from("sources")
      .select("name, tier, status, update_frequency")
      .eq("status", "active")
      .order("tier")
      .limit(20);

    // Build context document
    const contextDoc = `
PLATFORM INTELLIGENCE CONTEXT (Caro's Ledge — Freight Sustainability Intelligence)

ACTIVE REGULATIONS AND INTELLIGENCE ITEMS (${items?.length || 0} items):
${items?.map((i) => `- ${i.title} [${i.priority}] — ${i.summary} | Jurisdictions: ${i.jurisdictions?.join(", ")} | Modes: ${i.transport_modes?.join(", ")}`).join("\n") || "No items available"}

TOP DATA SOURCES (${sources?.length || 0} sources):
${sources?.map((s) => `- ${s.name} (Tier ${s.tier}, ${s.status}, updates ${s.update_frequency})`).join("\n") || "No sources available"}
`.trim();

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: `You are the Intelligence Assistant for Caro's Ledge, a freight sustainability intelligence platform. You are a RESEARCH HELPER, not a decision engine, synthesis engine, or advisory service.

Your role is to surface relevant platform content for the user's research and to identify tradeoffs and considerations they should weigh. The user makes every decision. You do not.

WORKSPACE CONTEXT (use this to filter what content is relevant to surface, not to issue prescriptions):
- Sectors active in this workspace: ${sectors.join(", ")}
- Primary transport modes: ${modes.join(", ")}
- Active jurisdictions: ${jurisdictionList.join(", ")}

WHAT YOU DO:
- Surface relevant platform intelligence items by name when they bear on the user's question.
- Identify what the question depends on (variables, jurisdictional differences, sector differences, timing considerations) so the user can reason about it.
- Note tradeoffs between options the user is weighing.
- Distinguish item types when relevant: binding law, regulator guidance, political announcements, analytical research, market signals.

WHAT YOU DO NOT DO:
- Do NOT issue action plans, recommendations, or prescriptions.
- Do NOT tell the user "what to do" or what their next steps should be.
- Do NOT assign internal owners (Legal, Sustainability, Ocean Product, etc.).
- Do NOT set deadlines or urgency framings beyond reporting dates that appear on platform items.
- Do NOT assign per-sector risk grades or scores.
- Do NOT produce sector-by-sector decision matrices.

HANDLING DECISION-SEEKING QUERIES:
If the user asks "what should I do", "should I X or Y", "which option is better", "recommend an approach", or any variant that asks you to decide for them: surface the relevant platform items and considerations, then state explicitly that the decision is theirs to make. Do not proceed to make the recommendation. Example framing: "Here is what the platform surfaces on this question, and here are the considerations that bear on it. The decision is yours; review the items below and apply your own judgment."

CITATION DISCIPLINE (prevent fabrication):
- Reference platform content at a high level by name when you can identify it from the context document below (e.g., "the EU CBAM Q2 2026 obligations item", "the FuelEU Maritime guidance").
- Do NOT invent URLs, intelligence_item identifiers, source attributions, document titles, dates, dollar figures, or quoted passages.
- If a specific platform source cannot be identified for a claim, label that claim as general knowledge ("This is general industry context, not sourced from a specific platform item") and recommend the user search the platform directly for verification.
- If the context document does not contain content relevant to the question, say so plainly rather than improvising.

RESPONSE FORMAT:
- Keep responses concise, typically under 300 words.
- Plain prose or short bullet lists. No imposed multi-section template.
- End every response with this disclaimer, verbatim:

"This response surfaces relevant platform content for your research. It is not legal, regulatory, financial, or operational advice. Verify specifics against the cited platform items and consult appropriate professional counsel before taking action."

${contextDoc}`,
        messages: [
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `AI service error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || "Unable to generate a response.";

    return NextResponse.json(
      { answer, model: data.model },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
