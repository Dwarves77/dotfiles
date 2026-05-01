// POST /api/admin/canonical-sources/bulk-classify
//
// Pre-caches Haiku classifications for a batch of canonical_source_candidates
// rows. Avoids the browser-side expand-every-card flow, which triggers a
// re-render + a 2s Haiku call per card and causes CDP timeouts in agent-
// driven review tabs reviewing 80+ candidates.
//
// Request: { candidateIds: string[] }  (max 30 per call to stay within
// Vercel's 60s function timeout — at 5 concurrent Haiku calls × 2s each,
// 30 candidates = ~12s server-side)
//
// Behavior:
//   1. Load all requested candidates + their parent intelligence_items.
//   2. Skip ones whose URL already exists in sources registry (no need
//      to classify — the existing source row will be reused on approve).
//   3. Skip ones that already have recommended_classification cached.
//   4. For the rest, fire Haiku in parallel batches of 5 with the same
//      prompt as the single /recommend-classification route.
//   5. Persist each result to canonical_source_candidates.recommended_classification.
//
// Response: { total, classified, already_cached, already_in_registry,
//             failed: [{candidateId, error}] }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

export const maxDuration = 60;

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

Output JSON only.`;

interface Body {
  candidateIds: string[];
}

async function classifyOne(
  client: Anthropic,
  cand: any,
  parentItem: any
): Promise<any> {
  const userMessage = `Classify this canonical source candidate.

CANDIDATE:
- URL: ${cand.candidate_url}
- Title: ${cand.candidate_title || "(none)"}
- Publisher: ${cand.candidate_publisher || "(none)"}
- Discovery rationale: ${cand.rationale || "(none)"}

PARENT INTELLIGENCE ITEM (grounding context):
- Title: ${parentItem?.title || "(unknown)"}
- item_type: ${parentItem?.item_type || "(unknown)"}
- Domain: ${parentItem?.domain ?? "(null)"}
- Jurisdictions: ${JSON.stringify(parentItem?.jurisdictions || [])}
- Topic tags: ${JSON.stringify(parentItem?.topic_tags || [])}

Output the JSON object only.`;

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
  if (!m) throw new Error("No JSON object in model output");
  const rec = JSON.parse(m[0]);
  rec.model = "claude-haiku-4-5-20251001";
  rec.computed_at = new Date().toISOString();
  if (
    typeof rec.tier !== "number" ||
    rec.tier < 1 || rec.tier > 7 ||
    !Array.isArray(rec.domains) ||
    !Array.isArray(rec.jurisdictions) ||
    !Array.isArray(rec.transport_modes) ||
    !Array.isArray(rec.topic_tags) ||
    typeof rec.rationale !== "string"
  ) {
    throw new Error("Malformed classification shape");
  }
  return rec;
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
  if (!Array.isArray(body.candidateIds) || body.candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds (non-empty array) is required" }, { status: 400 });
  }
  if (body.candidateIds.length > 30) {
    return NextResponse.json({ error: "Max 30 candidates per call (Vercel 60s timeout budget)" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getServiceClient();

  const { data: candidates } = await supabase
    .from("canonical_source_candidates")
    .select("id, candidate_url, candidate_title, candidate_publisher, rationale, intelligence_item_id, recommended_classification")
    .in("id", body.candidateIds);

  const cands = candidates || [];

  // Pre-resolve which URLs already exist in sources registry — those skip
  // classification entirely (existing source will be reused on approve).
  const urls = [...new Set(cands.map((c) => c.candidate_url))];
  const { data: existingSources } = await supabase
    .from("sources")
    .select("url")
    .in("url", urls);
  const existingUrlSet = new Set((existingSources || []).map((s: any) => s.url));

  // Pre-load parent items for grounding context (one batched query)
  const parentIds = [...new Set(cands.map((c) => c.intelligence_item_id))];
  const { data: parents } = await supabase
    .from("intelligence_items")
    .select("id, title, item_type, domain, jurisdictions, topic_tags")
    .in("id", parentIds);
  const parentById = new Map((parents || []).map((p: any) => [p.id, p]));

  const client = new Anthropic({ apiKey });

  // Build the to-classify list, skipping cached + already-in-registry rows
  const toClassify = cands.filter((c) => {
    if (c.recommended_classification) return false;
    if (existingUrlSet.has(c.candidate_url)) return false;
    return true;
  });

  let alreadyCached = 0;
  let alreadyInRegistry = 0;
  for (const c of cands) {
    if (c.recommended_classification) alreadyCached++;
    else if (existingUrlSet.has(c.candidate_url)) alreadyInRegistry++;
  }

  // Run classifications with concurrency=5
  const failed: Array<{ candidateId: string; error: string }> = [];
  let classified = 0;
  const CONCURRENCY = 5;

  async function worker(slice: typeof toClassify) {
    for (const c of slice) {
      try {
        const parent = parentById.get(c.intelligence_item_id);
        const rec = await classifyOne(client, c, parent);
        const { error: cacheErr } = await supabase
          .from("canonical_source_candidates")
          .update({ recommended_classification: rec })
          .eq("id", c.id);
        if (cacheErr) {
          failed.push({ candidateId: c.id, error: `cache write: ${cacheErr.message}` });
          continue;
        }
        classified++;
      } catch (e: any) {
        failed.push({ candidateId: c.id, error: e.message?.slice(0, 200) || String(e).slice(0, 200) });
      }
    }
  }

  // Round-robin slice the work across CONCURRENCY workers
  const slices: typeof toClassify[] = Array.from({ length: CONCURRENCY }, () => []);
  toClassify.forEach((c, i) => slices[i % CONCURRENCY].push(c));
  await Promise.all(slices.map((s) => worker(s)));

  return NextResponse.json(
    {
      success: true,
      total: body.candidateIds.length,
      classified,
      already_cached: alreadyCached,
      already_in_registry: alreadyInRegistry,
      failed_count: failed.length,
      failed,
    },
    { headers: rateLimitHeaders(auth.userId) }
  );
}
