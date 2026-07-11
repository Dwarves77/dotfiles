import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { ENVIRONMENTAL_POLICY_SKILL_CORE } from "@/lib/llm/skill-loader";
import { spendStream } from "@/lib/llm/spend-client";

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
    // Phase 1.5: Q2 split. effective_tier per Intelligence Assistant
    // signal set (skill Section 8 Assistant row) — inline citations
    // render the dynamic credibility signal. Fall back to base_tier.
    base_tier: number | null;
    effective_tier: number | null;
  } | null;
};

type Citation = {
  item_id: string;
  title: string;
  source_id: string | null;
  source_url: string | null;
  source_name: string | null;
  source_tier: number | null;
  // Q8/OBS-28 provenance fields (v1 semantics; revisit when Q1
  // brief->source edge table lands). citation_count is the count of
  // intelligence_items where source_id = $1 OR sources_used @> [$1];
  // recency is max(added_date) over the same set. Both are nullable
  // because a source with zero citations (rare in the Assistant context
  // because the cited item is itself a citation but the source may still
  // not be referenced elsewhere) returns count=0 and recency=null.
  citation_count: number | null;
  recency: string | null;
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
    const CITATION_SELECT = `
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
          base_tier,
          effective_tier
        )
        `;

    // RETRIEVAL (S1-09, browser wave 2026-07-07). The context was previously the FIRST 30 items
    // by priority — no relevance to the question at all. Now: FTS retrieval first
    // (search_intelligence_items RPC, migration 159 — websearch syntax, ts_rank_cd over the
    // weighted search_tsv, verified+non-archived enforced INSIDE the RPC), falling back to the
    // old priority-ordered pull only when the question has too little lexical signal (< 3 hits —
    // e.g. "what's new?"), so generic questions keep working. Retrieved ids are re-fetched with
    // the citation-grade select and kept in rank order.
    let itemsRaw: unknown[] | null = null;
    const { data: ftsHits, error: ftsErr } = await supabase.rpc("search_intelligence_items", {
      q: question,
      max_rows: 12,
    });
    if (ftsErr) console.warn(`[ask] FTS retrieval failed (falling back to priority pull): ${ftsErr.message}`);
    const hitIds: string[] = ((ftsHits as Array<{ id: string }> | null) ?? []).map((h) => h.id);
    if (hitIds.length >= 3) {
      // Belt for the RPC's internal gate (mig 159): re-apply the customer
      // read gate on the re-fetch so a future drift inside
      // search_intelligence_items can never leak quarantined/archived
      // content into the assistant context via service-role.
      const { data: hitRows, error: hitErr } = await supabase
        .from("intelligence_items")
        .select(CITATION_SELECT)
        .eq("is_archived", false)
        .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
        .in("id", hitIds);
      if (hitErr) console.warn(`[ask] retrieval row fetch failed: ${hitErr.message}`);
      if (hitRows?.length) {
        const byId = new Map(hitRows.map((r: { id: string }) => [r.id, r]));
        itemsRaw = hitIds.map((id) => byId.get(id)).filter(Boolean) as unknown[];
      }
    }
    if (!itemsRaw) {
      const { data: fallbackRows, error: fallbackErr } = await supabase
        .from("intelligence_items")
        .select(CITATION_SELECT)
        .eq("is_archived", false)
        .eq("provenance_status", "verified") // Sprint 4 task 1.10: customer read gate
        .order("priority")
        .limit(30);
      if (fallbackErr) console.warn(`[ask] priority fallback fetch failed: ${fallbackErr.message}`);
      itemsRaw = fallbackRows ?? null;
    }

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
    // Phase 1.5: project base_tier + effective_tier per Q2 split; render
    // effective_tier per Assistant signal set (skill Section 8). Order by
    // base_tier for stable list ordering through Q7 recomputes.
    const { data: sources } = await supabase
      .from("sources")
      .select("name, base_tier, effective_tier, status, update_frequency")
      .eq("status", "active")
      .order("base_tier")
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
        // Phase 1.5: effective_tier per Assistant signal set; fall back to base_tier.
        const sourceTier = i.source?.effective_tier ?? i.source?.base_tier ?? null;
        const sourceLabel = i.source?.name
          ? `${i.source.name} (Tier ${sourceTier ?? "?"})`
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
        // Phase 1.5: effective_tier per Assistant signal set; fall back to base_tier.
        .map((s) => `- ${s.name} (Tier ${s.effective_tier ?? s.base_tier}, ${s.status}, updates ${s.update_frequency})`)
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

    // Call Claude THROUGH the spend chokepoint (F15). This route was the last raw
    // api.anthropic.com fetch on a customer path — an ungated, untelemetried spend site.
    // spendStream ticket-gates, budget-checks against the standing ceiling, and records the
    // per-call telemetry row that IS the cost ledger.
    let rawAnswer: string;
    try {
      const { text } = await spendStream(
        { system: systemPrompt, user: question, model: "claude-sonnet-4-6", maxTokens: 1500 },
        { purpose: "ask-assistant (/api/ask user question)" }
      );
      rawAnswer = text || "Unable to generate a response.";
    } catch (e) {
      console.warn(`[ask] model call failed: ${(e as Error).message}`);
      return NextResponse.json(
        { error: "AI service error" },
        { status: 502 }
      );
    }

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
            source_id: match.source?.id ?? match.source_id ?? null,
            source_url: match.source_url ?? match.source?.url ?? null,
            source_name: match.source?.name ?? null,
            // Phase 1.5: effective_tier per Assistant signal set; fall back to base_tier.
            source_tier: match.source?.effective_tier ?? match.source?.base_tier ?? null,
            citation_count: null,
            recency: null,
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

    // Q8/OBS-28 provenance enrichment.
    //
    // Each validated citation carries a source_id (or null). For the
    // unique non-null source_ids, call get_source_citation_stats(UUID[])
    // (migration 088) for a single round trip that returns
    // (source_id, citation_count, recency) per source. Merge back onto
    // the matching citations. Failures are non-fatal: if the RPC errors,
    // the citations still surface without the count/recency fields, and
    // the frontend renders the rest of the provenance panel.
    const uniqueSourceIds = Array.from(
      new Set(
        validatedCitations
          .map((c) => c.source_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    if (uniqueSourceIds.length > 0) {
      try {
        const { data: statsRows, error: statsErr } = await supabase.rpc(
          "get_source_citation_stats",
          { source_ids: uniqueSourceIds }
        );
        if (!statsErr && Array.isArray(statsRows)) {
          const statsBySourceId = new Map<string, { citation_count: number | null; recency: string | null }>();
          for (const r of statsRows as Array<{ source_id: string; citation_count: number | null; recency: string | null }>) {
            statsBySourceId.set(r.source_id, {
              citation_count: r.citation_count ?? null,
              recency: r.recency ?? null,
            });
          }
          for (const c of validatedCitations) {
            if (c.source_id) {
              const s = statsBySourceId.get(c.source_id);
              if (s) {
                c.citation_count = s.citation_count;
                c.recency = s.recency;
              }
            }
          }
        }
      } catch {
        // Swallow: provenance enrichment is supplementary; citations still
        // surface without it.
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
        model: "claude-sonnet-4-6",
      },
      { headers: rateLimitHeaders(auth.userId) }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
