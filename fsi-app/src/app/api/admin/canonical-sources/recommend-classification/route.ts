// POST /api/admin/canonical-sources/recommend-classification
//
// For a given canonical_source_candidate (whose URL is not already in the
// sources registry), return an AI-recommended classification for the
// reviewer's approve flow. Cached on the candidate row so subsequent
// reviews don't re-call the model.
//
// Mirrors /api/admin/sources/recommend-classification but pulls in the
// parent intelligence_item's domain / jurisdictions / topic_tags as
// additional grounding context for the classification — those signals
// give Haiku much more to work with than name+URL alone.
//
// Uses Haiku — taxonomy mapping against a fixed schema, not regulatory
// analysis. Sonnet would be overkill.

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

const CLASSIFICATION_SYSTEM_PROMPT = `You classify candidate canonical sources for a freight sustainability intelligence platform. Your output is a single JSON object — no prose, no markdown, no code fences.

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

topic_tags (array of strings, choose all that apply, 0-3 values):
  emissions | fuels | transport | reporting | packaging | corridors | research

rationale (string, 1-2 sentences): explain the tier choice in plain language, citing the candidate's role and authority. Reference the parent item's regulatory context if useful.

The candidate is a canonical-source replacement for an existing intelligence item whose source coverage is stale or missing. The parent item's domain, jurisdictions, and topic tags are provided as grounding — bias the candidate's classification to match unless the URL clearly indicates a different scope.

Output JSON only. Example:
{"tier":1,"domains":[1],"jurisdictions":["eu"],"transport_modes":["ocean","road","air"],"topic_tags":["emissions","reporting"],"rationale":"EUR-Lex Official Journal page is binding EU law and the canonical primary text for the parent regulation; tier 1 is exact-fit."}`;

interface Body {
  candidateId: string;
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
  if (!body.candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getServiceClient();

  const { data: cand, error: loadErr } = await supabase
    .from("canonical_source_candidates")
    .select(
      "id, candidate_url, candidate_title, candidate_publisher, rationale, intelligence_item_id, recommended_classification"
    )
    .eq("id", body.candidateId)
    .single();

  if (loadErr || !cand) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // Cache hit
  if (cand.recommended_classification) {
    return NextResponse.json(
      { recommendation: cand.recommended_classification, cached: true },
      { headers: rateLimitHeaders(auth.userId) }
    );
  }

  // Pull parent item for grounding context
  const { data: item } = await supabase
    .from("intelligence_items")
    .select("id, title, item_type, domain, jurisdictions, topic_tags")
    .eq("id", cand.intelligence_item_id)
    .single();

  const userMessage = `Classify this canonical source candidate.

CANDIDATE:
- URL: ${cand.candidate_url}
- Title: ${cand.candidate_title || "(none)"}
- Publisher: ${cand.candidate_publisher || "(none)"}
- Discovery rationale: ${cand.rationale || "(none)"}

PARENT INTELLIGENCE ITEM (grounding context):
- Title: ${item?.title || "(unknown)"}
- item_type: ${item?.item_type || "(unknown)"}
- Domain: ${item?.domain ?? "(null)"}
- Jurisdictions: ${JSON.stringify(item?.jurisdictions || [])}
- Topic tags: ${JSON.stringify(item?.topic_tags || [])}

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

  const { error: cacheErr } = await supabase
    .from("canonical_source_candidates")
    .update({ recommended_classification: recommendation })
    .eq("id", body.candidateId);
  if (cacheErr) {
    console.warn("Recommendation cache write failed (apply migration 022 if column missing):", cacheErr.message);
  }

  return NextResponse.json(
    { recommendation, cached: false },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
