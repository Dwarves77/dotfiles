// POST /api/admin/sources/recommend-classification
//
// For a given provisional source, return an AI-recommended classification
// (tier 1-7, domains 1-7, jurisdictions, transport_modes, topic_tags) plus
// a 1-2 sentence rationale. Cached on the provisional row so subsequent
// reviews don't re-call the model.
//
// Uses Haiku — the task is taxonomy mapping against a fixed schema, not
// regulatory analysis. Sonnet would be overkill.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CLASSIFICATION_SYSTEM_PROMPT = `You classify provisional intelligence sources for a freight sustainability intelligence platform. Your output is a single JSON object — no prose, no markdown, no code fences.

Schema and constraints (apply exactly):

tier (integer 1-7):
  1 = Official legal text (gazettes, Federal Register, EUR-Lex Official Journal)
  2 = Regulator guidance (EPA rule summaries, EU Commission FAQs, agency interpretive bulletins)
  3 = Intergovernmental organisation positions (IMO MEPC, ICAO, UNFCCC, World Bank, IEA)
  4 = Industry body interpretation, classification societies, standards bodies (FIATA, CLECAT, ICCT, DNV, ABS, GHG Protocol, ISO, GLEC, CDP, SBTi, IFRS/ISSB)
  5 = News reporting and trade press (Reuters, FreightWaves, Lloyd's List, JOC, Splash247, TradeWinds, GreenBiz)
  6 = Commercial regulatory intelligence (Thomson Reuters Reg Intel, law firm trackers)
  7 = Provisional or unverified

domains (array of integers 1-7, choose all that apply):
  1 = Regulatory and Legislative
  2 = Energy and Technology Innovation
  3 = Regional Operations Intelligence
  4 = Geopolitical and Market Signals
  5 = Source Intelligence (meta — for sources about other sources)
  6 = Warehouse and Facility Optimization
  7 = University and Research Pipeline

jurisdictions (array of strings, choose all that apply):
  eu | us | uk | latam | asia | hk | meaf | global

transport_modes (array of strings, choose all that apply):
  air | road | ocean | rail

topic_tags (array of strings, choose all that apply):
  emissions | fuels | transport | reporting | packaging | corridors | research

rationale (string, 1-2 sentences): explain the tier choice in plain language, citing the source's role and authority.

Output JSON only. Example:
{"tier":4,"domains":[1,2],"jurisdictions":["global"],"transport_modes":["ocean"],"topic_tags":["emissions","fuels"],"rationale":"Classification society publishing regulatory interpretation; sits between primary regulator and industry analysis."}`;

interface Body {
  provisionalSourceId: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.provisionalSourceId) {
    return NextResponse.json({ error: "provisionalSourceId is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getServiceClient();

  const { data: prov, error: loadErr } = await supabase
    .from("provisional_sources")
    .select("id, name, url, description, recommended_classification")
    .eq("id", body.provisionalSourceId)
    .single();

  if (loadErr || !prov) {
    return NextResponse.json({ error: "Provisional source not found" }, { status: 404 });
  }

  // Cache hit
  if (prov.recommended_classification) {
    return NextResponse.json(
      { recommendation: prov.recommended_classification, cached: true },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  const userMessage = `Classify this provisional source.

Name: ${prov.name}
URL: ${prov.url}
Description: ${prov.description || "(none)"}

Output the JSON object only.`;

  const client = new Anthropic({ apiKey });
  let recommendation: any;
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = resp.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    // Extract JSON — be permissive about leading/trailing text just in case.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No JSON object found in model output");
    recommendation = JSON.parse(m[0]);
    recommendation.model = "claude-haiku-4-5-20251001";
    recommendation.computed_at = new Date().toISOString();
  } catch (e: any) {
    return NextResponse.json(
      { error: `Model call failed: ${e.message}` },
      { status: 502 }
    );
  }

  // Validate the shape — reject anything not matching the schema rather than
  // caching a malformed recommendation that would confuse the UI.
  const okShape =
    typeof recommendation.tier === "number" &&
    recommendation.tier >= 1 && recommendation.tier <= 7 &&
    Array.isArray(recommendation.domains) &&
    Array.isArray(recommendation.jurisdictions) &&
    Array.isArray(recommendation.transport_modes) &&
    Array.isArray(recommendation.topic_tags) &&
    typeof recommendation.rationale === "string";
  if (!okShape) {
    return NextResponse.json(
      { error: "Model returned malformed classification", raw: recommendation },
      { status: 502 }
    );
  }

  // Cache for next time. This requires migration 015 to be applied; if the
  // column doesn't exist the update silently no-ops at the SDK level (returns
  // an error which we ignore — the recommendation is still returned to the
  // caller).
  const { error: cacheErr } = await supabase
    .from("provisional_sources")
    .update({ recommended_classification: recommendation })
    .eq("id", body.provisionalSourceId);
  if (cacheErr) {
    console.warn("Recommendation cache write failed (apply migration 015 if column missing):", cacheErr.message);
  }

  return NextResponse.json(
    { recommendation, cached: false },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
