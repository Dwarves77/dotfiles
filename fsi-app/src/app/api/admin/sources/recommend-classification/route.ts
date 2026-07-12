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
import { getServiceSupabase } from "@/lib/supabase-service";

import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";


// Per Q4 bias tag vocabulary (Section 6 of source-credibility-model SKILL.md).
// Mirrored as a runtime allowlist so we can reject malformed Haiku output
// before it reaches the cache or the bias-tag write path. Keep in sync with
// migration 092's source_bias_tags_vocabulary_chk constraint.
const BIAS_TAG_VOCAB: Record<string, ReadonlyArray<string>> = {
  funding: [
    "industry-funded",
    "government-funded",
    "foundation-funded",
    "subscription-supported",
    "academic-institutional",
    "mixed-funded",
    "funding-opaque",
  ],
  methodology: [
    "peer-reviewed",
    "methodologically-transparent",
    "analytical-synthesis",
    "editorial-opinion",
    "advocacy",
    "factual-reporting",
    "standards-defining",
  ],
  stakeholder: [
    "industry-incumbent",
    "industry-challenger",
    "regulator-aligned",
    "environmental-advocate",
    "independent-research",
    "customer-perspective",
    "labor-perspective",
    "investor-perspective",
  ],
};

// Accept the bias_tags field when it's present AND well-formed; ALSO accept
// when it's absent (treat as empty assignment so we don't reject older
// cached recommendations or sources Haiku judges have no bias signal on).
// "Well-formed" means: object with the three expected keys, each mapping to
// an array of {tag, confidence} pairs where tag is in the per-dimension
// vocabulary and confidence is a number in [0, 1].
function validateBiasTags(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  for (const dim of ["funding", "methodology", "stakeholder"]) {
    const arr = obj[dim];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return false;
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) return false;
      const e = entry as Record<string, unknown>;
      if (typeof e.tag !== "string" || !BIAS_TAG_VOCAB[dim].includes(e.tag)) return false;
      if (typeof e.confidence !== "number" || e.confidence < 0 || e.confidence > 1) return false;
    }
  }
  // Reject keys that aren't one of the three dimensions; that's classifier drift.
  for (const k of Object.keys(obj)) {
    if (!["funding", "methodology", "stakeholder"].includes(k)) return false;
  }
  return true;
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

bias_tags (object with three keys: funding, methodology, stakeholder). Each key maps to an array of {tag, confidence} pairs where tag is from the per-dimension vocabulary below and confidence is a number 0.00-1.00 reflecting how sure you are this tag applies to this source. Emit zero or more tags per dimension; multi-value is expected (most sources carry multiple tags within at least one dimension). The three dimensions are orthogonal; a single source can carry any combination across them.

  Dimension 1 — funding (Funding / Institutional Affiliation):
    industry-funded | government-funded | foundation-funded | subscription-supported | academic-institutional | mixed-funded | funding-opaque

  Dimension 2 — methodology (Methodological Orientation):
    peer-reviewed | methodologically-transparent | analytical-synthesis | editorial-opinion | advocacy | factual-reporting | standards-defining

  Dimension 3 — stakeholder (Stakeholder Position):
    industry-incumbent | industry-challenger | regulator-aligned | environmental-advocate | independent-research | customer-perspective | labor-perspective | investor-perspective

Bias-tag confidence guidance: use >=0.80 when the source's bias is unambiguous from its institutional identity (e.g. ICCT is unambiguously foundation-funded and independent-research; EUR-Lex is unambiguously government-funded and regulator-aligned). Use 0.65-0.79 when the bias is likely but the source could plausibly be assigned differently. Use <0.65 when you are uncertain; emit the tag at low confidence rather than omitting if you have substantive evidence. The downstream pipeline auto-applies >=0.80 tags, surfaces 0.65-0.79 tags to operator review, and discards <0.65 tags.

Bias tags apply to external publisher sources only. Do not propose bias tags on user-generated content, on the platform's own internal records, or on sources whose institutional identity is unknown enough that all four +0.65 tags would be funding-opaque.

ICCT worked example (operator-supplied): funding [{tag: "foundation-funded", confidence: 0.90}], methodology [{tag: "methodologically-transparent", confidence: 0.85}, {tag: "analytical-synthesis", confidence: 0.85}], stakeholder [{tag: "independent-research", confidence: 0.85}, {tag: "environmental-advocate", confidence: 0.80}].

rationale (string, 1-2 sentences): explain the tier choice in plain language, citing the source's role and authority.

Analytical-press routing (additive guidance per platform-intent skill Section 3 + migration 086): trade journals, sustainability reporting outlets, and industry analyst commentary with named editorial provenance (Loadstar, FreightWaves, Edie, GreenBiz, Environmental Finance, Splash247, Supply Chain Digital, Reuters Sustainable Business and similar outlets) map to category='research' (Research surface, not Market Intel) with source_role='trade_press'. Use tier 5 for straight news reporting; tier 6 for analysis, opinion, or horizon-scanning commentary. Reuters trade-press analytical reporting is tier 5; outlets that lead with editorial analysis (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital, GreenBiz) are tier 6. Underlying source-row routing landed in migration 086 (sources.category='research', sources.source_role='trade_press', sources.tier per outlet).

Output JSON only. Example:
{"tier":4,"domains":[1,2],"jurisdictions":["global"],"transport_modes":["ocean"],"topic_tags":["emissions","fuels"],"bias_tags":{"funding":[{"tag":"foundation-funded","confidence":0.85}],"methodology":[{"tag":"standards-defining","confidence":0.90},{"tag":"methodologically-transparent","confidence":0.80}],"stakeholder":[{"tag":"independent-research","confidence":0.85}]},"rationale":"Classification society publishing regulatory interpretation; sits between primary regulator and industry analysis."}`;

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

  const supabase = getServiceSupabase();

  const admin = await isPlatformAdmin(auth.userId, supabase);
  if (!admin) {
    return NextResponse.json(
      { error: "Platform admin access required" },
      { status: 403, headers: rateLimitHeaders(auth.userId) }
    );
  }

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
      // 1200 vs original 600: prompt now requires bias_tags as a nested
      // object with up to ~22 tag/confidence pairs across three dimensions,
      // plus the existing classification fields.
      max_tokens: 1200,
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
    typeof recommendation.rationale === "string" &&
    validateBiasTags(recommendation.bias_tags);
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
