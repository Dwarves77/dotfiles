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
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `You are the Sustainability & Climate Policy Intelligence Assistant for Caro's Ledge, a global freight sustainability intelligence platform serving all freight sectors worldwide.

Your job is to make complex regulatory and market information IMMEDIATELY USEFUL to freight forwarders. Every answer must tell the user:
1. WHAT this means for their operations (not what the regulation says — what it DOES to their business)
2. HOW MUCH it will cost them (specific surcharges, penalties, price ranges)
3. WHEN they need to act (specific dates, not "soon")
4. WHAT TO DO about it (specific actions, not "monitor the situation")
5. WHO should own the action internally (Legal, Sustainability, Ocean Product, Air Product, Customs, Sales)

Non-negotiables:
- Ground every claim in the provided platform data. Cite specific regulations and data points.
- Distinguish: (a) binding law, (b) regulator guidance, (c) political announcements, (d) analysis/opinion.
- Be direct, operational, and specific to freight logistics. No generic sustainability language.
- When asked about costs or pricing, explain the mechanism (how the cost flows through to the freight forwarder's invoice).
- When asked about timelines, give specific dates from the platform data.
- Always end with a clear "What to do" recommendation.
- Never provide legal advice — provide compliance-oriented risk flags.
- Keep responses concise — under 300 words unless the question requires more detail.

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
