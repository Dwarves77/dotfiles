import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { ENVIRONMENTAL_POLICY_SKILL_CORE } from "@/lib/llm/skill-loader";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Per-response disclaimer text. Kept identical to the Tier 1 wording so
// downstream UI rendering remains stable.
const ASSISTANT_DISCLAIMER =
  "This response surfaces relevant platform content for your research. " +
  "It is not legal, regulatory, financial, or operational advice. Verify " +
  "specifics against the cited platform items and consult appropriate " +
  "professional counsel before taking action.";

// Token-budget guard: include full_brief content per item but cap it so a
// handful of long briefs do not blow the prompt budget. The Assistant's job
// is to surface and point at items, not to ingest entire briefs verbatim
// per query.
const FULL_BRIEF_CHARS_PER_ITEM = 800;
const INTERSECTION_SUMMARY_CHARS_PER_ITEM = 600;

type FetchedItem = {
  id: string;
  title: string;
  summary: string | null;
  priority: string | null;
  severity: string | null;
  item_type: string | null;
  category: string | null;
  jurisdictions: string[] | null;
  transport_modes: string[] | null;
  source_id: string | null;
  source_url: string | null;
  intersection_summary: string | null;
  related_items: string[] | null;
  full_brief: string | null;
  // Joined source record. Supabase returns either a single object or null
  // depending on whether the FK resolves.
  source: {
    id: string;
    name: string | null;
    url: string | null;
    tier: number | null;
  } | null;
};

type Citation = {
  item_id: string;
  title: string;
  source_url: string | null;
  source_name: string | null;
  source_tier: number | null;
};

// POST /api/ask — Intelligence Assistant (research helper, not decision engine).
// Tier 3 closes OBS-27 (skill loading) and OBS-28 (citation surfacing).
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

    // Sector context for personalized filtering (not for prescriptions).
    const sectors = sectorProfile?.length ? sectorProfile : ["general-freight"];
    const modes = transportModes?.length ? transportModes : ["ocean", "air", "road"];
    const jurisdictionList = jurisdictions?.length ? jurisdictions : ["global"];

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Citation-grade SELECT.
    //
    // Tier 3 redesign (closes OBS-28). The Tier 1 SELECT omitted id,
    // source_id, source_url, intersection_summary, related_items, and
    // full_brief, which made structured citation surfacing mechanically
    // impossible because the LLM had no item identifiers to cite and no
    // verifiable URLs in its context.
    //
    // The LEFT JOIN to sources uses Supabase's foreign-key relationship
    // syntax so we get the canonical source name, tier, and URL alongside
    // each item without a second round-trip.
    const { data: itemsRaw } = await supabase
      .from("intelligence_items")
      .select(
        `
        id,
        title,
        summary,
        priority,
        severity,
        item_type,
        category,
        jurisdictions,
        transport_modes,
        source_id,
        source_url,
        intersection_summary,
        related_items,
        full_brief,
        source:sources!source_id (
          id,
          name,
          url,
          tier
        )
        `
      )
      .eq("is_archived", false)
      .order("priority")
      .limit(30);

    // Supabase returns the joined `source` as `{...} | {...}[]` in the
    // generated types. Normalize to a single object for downstream use.
    const items: FetchedItem[] = (itemsRaw ?? []).map((row: any) => ({
      ...row,
      source: Array.isArray(row.source) ? row.source[0] ?? null : row.source ?? null,
    }));

    // Build a lookup map for citation validation. The map is keyed by both
    // exact title and lowercased title so the LLM's casing variants still
    // resolve.
    const itemsByTitle = new Map<string, FetchedItem>();
    const itemsByLowerTitle = new Map<string, FetchedItem>();
    const itemsById = new Map<string, FetchedItem>();
    const validUrls = new Set<string>();

    for (const item of items) {
      itemsByTitle.set(item.title, item);
      itemsByLowerTitle.set(item.title.toLowerCase(), item);
      itemsById.set(item.id, item);
      if (item.source_url) validUrls.add(item.source_url);
      if (item.source?.url) validUrls.add(item.source.url);
    }

    // Fetch top sources for general credibility context (kept from Tier 1).
    const { data: sources } = await supabase
      .from("sources")
      .select("name, tier, status, update_frequency")
      .eq("status", "active")
      .order("tier")
      .limit(20);

    // Per-item context block. Each item carries id, title, severity,
    // priority, category, jurisdictions, modes, source name + tier + URL,
    // a truncated brief, a truncated intersection summary, and the count
    // of related items. The id is exposed so the LLM has a citation key,
    // but the citation contract (in the system prompt) instructs the LLM
    // to cite by `[Item: <title>]` rather than by raw id, which is easier
    // for a human to read and easier for server-side validation.
    const itemsContext = items
      .map((i, idx) => {
        const sourceLabel = i.source?.name
          ? `${i.source.name} (Tier ${i.source.tier ?? "?"})`
          : "no canonical source on record";
        const briefSnippet = i.full_brief
          ? i.full_brief.slice(0, FULL_BRIEF_CHARS_PER_ITEM) +
            (i.full_brief.length > FULL_BRIEF_CHARS_PER_ITEM ? " [brief truncated]" : "")
          : "(no full_brief authored yet)";
        const intersectionSnippet = i.intersection_summary
          ? i.intersection_summary.slice(0, INTERSECTION_SUMMARY_CHARS_PER_ITEM)
          : null;
        const relatedCount = Array.isArray(i.related_items) ? i.related_items.length : 0;
        return [
          `[${idx + 1}] ${i.title}`,
          `    id: ${i.id}`,
          `    severity: ${i.severity ?? "n/a"} | priority: ${i.priority ?? "n/a"} | item_type: ${i.item_type ?? "n/a"} | category: ${i.category ?? "n/a"}`,
          `    jurisdictions: ${(i.jurisdictions ?? []).join(", ") || "n/a"} | modes: ${(i.transport_modes ?? []).join(", ") || "n/a"}`,
          `    source: ${sourceLabel} | url: ${i.source_url ?? i.source?.url ?? "n/a"}`,
          `    summary: ${i.summary ?? "(no summary)"}`,
          `    brief excerpt: ${briefSnippet}`,
          intersectionSnippet
            ? `    intersection_summary: ${intersectionSnippet}`
            : `    intersection_summary: (none recorded)`,
          `    related_items_count: ${relatedCount}`,
        ].join("\n");
      })
      .join("\n\n");

    const sourcesContext =
      (sources ?? [])
        .map((s) => `- ${s.name} (Tier ${s.tier}, ${s.status}, updates ${s.update_frequency})`)
        .join("\n") || "No sources available";

    // System prompt. Tier 1 stripped decision-engine framing; Tier 3 adds
    // (a) the embedded skill subset as binding grounding, (b) explicit
    // citation contract, and (c) the five-surface platform self-description.
    const systemPrompt = `You are the Intelligence Assistant for Caro's Ledge, a freight sustainability intelligence platform. You are a RESEARCH HELPER, not a decision engine, synthesis engine, or advisory service.

PLATFORM YOU LIVE INSIDE (so you can describe yourself accurately):
Caro's Ledge has five customer-facing surfaces: Regulations, Market Intel, Research, Operations, and Community. You are a cross-cutting capability available on every surface plus the floating button in the global shell. You are NOT a separate decision engine and you are NOT the Operations decision layer; Operations surfaces structured content and you answer cross-cutting research questions about it. The Map is a geographic view of Regulations content.

Your role is to surface relevant platform content for the user's research and to identify tradeoffs and considerations they should weigh. The user makes every decision. You do not.

WORKSPACE CONTEXT (use this to filter what content is relevant to surface, not to issue prescriptions):
- Sectors active in this workspace: ${sectors.join(", ")}
- Primary transport modes: ${modes.join(", ")}
- Active jurisdictions: ${jurisdictionList.join(", ")}

GROUNDING (binding):
The block titled "Caro's Ledge Platform Expertise: environmental-policy-and-innovation (core subset)" below carries the platform's binding rules. Use these rules to ground every response. The integrity rule, the workspace-anchored rule, the source classification hierarchy, the severity-label vocabulary, the format mapping, and the four-category source taxonomy are NOT optional. Treat them as the operating standard for every answer you give.

WHAT YOU DO:
- Surface relevant platform intelligence items by name when they bear on the user's question, using the citation format defined below.
- Identify what the question depends on (variables, jurisdictional differences, sector differences, timing considerations) so the user can reason about it.
- Note tradeoffs between options the user is weighing.
- Distinguish item types when relevant per the source hierarchy: binding law, regulator guidance, political announcements, analytical research, market signals.
- Apply the workspace-anchored rule: refer to "the workspace" or to its role and operations, never by name. Never name individuals.

WHAT YOU DO NOT DO:
- Do NOT issue action plans, recommendations, or prescriptions.
- Do NOT tell the user "what to do" or what their next steps should be.
- Do NOT assign internal owners (Legal, Sustainability, Ocean Product, etc.).
- Do NOT set deadlines or urgency framings beyond reporting dates that appear on platform items.
- Do NOT assign per-sector risk grades or scores.
- Do NOT produce sector-by-sector decision matrices.
- Do NOT invent facts, costs, operators, supplier relationships, deadlines, or quoted passages. The integrity rule from the embedded skill is absolute.

HANDLING DECISION-SEEKING QUERIES:
If the user asks "what should I do", "should I X or Y", "which option is better", "recommend an approach", or any variant that asks you to decide for them: surface the relevant platform items and considerations, then state explicitly that the decision is theirs to make. Do not proceed to make the recommendation. Example framing: "Here is what the platform surfaces on this question, and here are the considerations that bear on it. The decision is yours; review the items below and apply your own judgment."

CITATION CONTRACT (binding; fabricated citations are forbidden):
- When you reference a platform item, cite it in the form [Item: <exact title as listed in AVAILABLE PLATFORM ITEMS>]. Server-side post-processing will validate every such citation against the items you were given. Citations to titles that are not in AVAILABLE PLATFORM ITEMS will be flagged as fabricated.
- Do NOT cite items by their UUID. Cite by exact title only.
- Do NOT invent URLs. If you want to reference a source URL, only quote URLs that appear verbatim in AVAILABLE PLATFORM ITEMS or AVAILABLE SOURCES.
- If no relevant item appears in AVAILABLE PLATFORM ITEMS for the user's question, say so plainly. Do not improvise an answer. Suggest the user search the platform directly or refine the question.
- When you describe a source's quality, use the Source Type Hierarchy in the embedded skill subset. Do not present industry analysis as binding regulation.

RESPONSE FORMAT:
- Keep responses concise, typically under 300 words.
- Plain prose or short bullet lists. No imposed multi-section template.
- End every response with the disclaimer (the API appends it server-side; you do NOT need to write it yourself, but if you do, do not paraphrase it).

${ENVIRONMENTAL_POLICY_SKILL_CORE}

AVAILABLE PLATFORM ITEMS (${items.length} items currently in your context; cite these by exact title in [Item: ...] form):

${itemsContext}

AVAILABLE SOURCES (top registered sources by tier, for credibility framing):
${sourcesContext}`;

    // Call Claude API.
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
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `AI service error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const rawAnswer: string = data.content?.[0]?.text || "Unable to generate a response.";

    // Citation post-processing.
    //
    // The system prompt instructs the LLM to cite via [Item: <title>]. We
    // extract every such marker, validate against the fetched item set, and
    // split into validated vs flagged. We also scan for raw http(s) URLs
    // and flag any URL not present in the fetched item set or source list.
    const itemMarkerRe = /\[Item:\s*([^\]]+?)\s*\]/g;
    const validatedCitations: Citation[] = [];
    const flaggedCitations: { raw: string; reason: string }[] = [];
    const seenTitles = new Set<string>();

    let m: RegExpExecArray | null;
    while ((m = itemMarkerRe.exec(rawAnswer)) !== null) {
      const cited = m[1].trim();
      const match =
        itemsByTitle.get(cited) ?? itemsByLowerTitle.get(cited.toLowerCase());
      if (match) {
        if (!seenTitles.has(match.title)) {
          seenTitles.add(match.title);
          validatedCitations.push({
            item_id: match.id,
            title: match.title,
            source_url: match.source_url ?? match.source?.url ?? null,
            source_name: match.source?.name ?? null,
            source_tier: match.source?.tier ?? null,
          });
        }
      } else {
        flaggedCitations.push({
          raw: cited,
          reason: "title not present in fetched item set",
        });
      }
    }

    const urlRe = /https?:\/\/[^\s)\]"']+/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRe.exec(rawAnswer)) !== null) {
      const candidate = urlMatch[0].replace(/[.,;:]+$/, "");
      if (!validUrls.has(candidate)) {
        flaggedCitations.push({
          raw: candidate,
          reason: "URL not present in fetched item set or registered sources",
        });
      }
    }

    // Preserve backward compatibility: `answer` is the field the current
    // AskAssistant.tsx consumes. Add `citations`, `disclaimer`, and
    // `flagged_citations` for forward consumers.
    const answer = rawAnswer.trim().endsWith(ASSISTANT_DISCLAIMER)
      ? rawAnswer
      : `${rawAnswer.trim()}\n\n${ASSISTANT_DISCLAIMER}`;

    return NextResponse.json(
      {
        answer,
        text: rawAnswer,
        citations: validatedCitations,
        flagged_citations: flaggedCitations,
        disclaimer: ASSISTANT_DISCLAIMER,
        model: data.model,
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
