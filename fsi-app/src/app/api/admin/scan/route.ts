import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SCAN_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
const SCAN_COOLDOWN_KEY = "admin_scan";

/**
 * POST /api/admin/scan
 *
 * Admin-triggered regulatory scan. Uses Claude API with web_search
 * to find new regulations relevant to freight sustainability.
 * Results are staged for admin review — never auto-published.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  const limited = checkRateLimit(auth.userId);
  if (limited) return limited;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 4h cooldown gate. Migration 024 must be applied for this to be enforced.
  // If the table is missing (migration not yet applied), the cooldown is silently
  // skipped — the upsert at the end of a successful scan will also no-op.
  const { data: cooldownRow } = await supabase
    .from("admin_action_cooldowns")
    .select("last_triggered_at")
    .eq("action_key", SCAN_COOLDOWN_KEY)
    .maybeSingle();

  if (cooldownRow?.last_triggered_at) {
    const elapsed = Date.now() - new Date(cooldownRow.last_triggered_at).getTime();
    if (elapsed < SCAN_COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: "Scan is on cooldown",
          retry_after_seconds: retryAfterSec,
          last_triggered_at: cooldownRow.last_triggered_at,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  }

  try {
    const { topic, jurisdiction } = await request.json();

    // Get ALL existing items + ALL pending staged updates to avoid duplicates
    const [{ data: existing }, { data: staged }] = await Promise.all([
      supabase.from("intelligence_items").select("title"),
      supabase.from("staged_updates").select("proposed_changes").in("status", ["pending", "approved"]),
    ]);

    const existingTitles = new Set([
      ...(existing || []).map((e: any) => e.title.toLowerCase()),
      ...(staged || []).map((s: any) => (s.proposed_changes?.title || "").toLowerCase()).filter(Boolean),
    ]);

    // Call Claude with web_search to find new regulations from live sources
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        system: `You are the Sustainability & Climate Policy Intelligence Assistant for Caro's Ledge, a global freight forwarding intelligence platform. Your job is to translate regulatory and policy updates into operational impact, compliance risk, and recommended actions.

NON-NEGOTIABLES:
- Ground every claim in sources; include the direct URL to the primary legal text or official publication.
- Distinguish: (a) binding law/regulation, (b) regulator guidance/interpretation, (c) political announcements, (d) analysis/opinion.
- Always extract: jurisdiction(s), affected transport mode(s), affected business functions, deadlines, penalties, and data requirements.
- Provide a clear "What to do now" action with suggested owner (Legal, Sustainability, Ocean Product, Air Product, Customs, Sales).

For each regulation you find, provide ALL of these fields:
- title: Official name of the regulation
- what_is_it: Plain language explanation citing the specific legal instrument (directive/regulation number, Official Journal reference), jurisdiction, and enforcement body. 2-3 sentences minimum.
- why_matters: How this regulation affects freight forwarding operations — pricing, procurement, carrier contracts, customer reporting, customs processes, or route planning. Include specific cost mechanisms (surcharges, penalties, allowance costs) with real figures or ranges. No generic "this is important" language. 3-4 sentences minimum.
- key_data: Array of hard data points — effective dates, penalty amounts, phase-in percentages, tonnage thresholds, compliance deadlines. Every bullet must be specific and sourced.
- note: Current enforcement status + any 2025-2026 developments + what the forwarder should do RIGHT NOW + who owns the action internally.
- authority_level: "primary_text" | "official_guidance" | "intergovernmental" | "expert_analysis" | "unconfirmed"
- jurisdiction: Where it applies
- transport_modes: Array of affected modes (air, road, ocean, rail)
- priority: CRITICAL | HIGH | MODERATE | LOW
- status: proposed | adopted | in_force | monitoring
- source_url: Direct URL to the official text
- source_name: Name of the publishing body
- effective_date: When it takes effect
- penalty_range: Specific penalty amounts or ranges
- cost_mechanism: How the cost flows to the freight forwarder's invoice

Focus on:
1. New or recently updated regulations (last 6 months)
2. Directly relevant to freight forwarding operations
3. Not already in our database
4. Published by authoritative government or intergovernmental sources

Also identify NEW sources (government portals, regulatory bodies) to add to our monitoring registry.

Return a JSON object with two arrays:
{
  "regulations": [...],
  "new_sources": [{ "name": "...", "url": "...", "jurisdiction": "...", "publishes": "..." }]
}

Return ONLY the JSON object, no other text.`,
        messages: [{
          role: "user",
          content: `Search for new freight sustainability regulations${topic ? ` related to "${topic}"` : ""}${jurisdiction ? ` in ${jurisdiction}` : " globally"}. Do NOT return any regulation that matches or is similar to these existing titles:\n${[...existingTitles].join("\n")}`,
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Anthropic API error:", response.status, errBody);
      return NextResponse.json({ error: `AI search failed: ${response.status} — ${errBody.slice(0, 200)}` }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";

    // Parse the JSON response — expects { regulations: [...], new_sources: [...] }
    let regulations: any[] = [];
    let newSources: any[] = [];
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        regulations = parsed.regulations || [];
        newSources = parsed.new_sources || [];
      } else {
        // Fallback: try parsing as array (old format)
        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) regulations = JSON.parse(arrMatch[0]);
      }
    } catch {
      return NextResponse.json({
        error: "Could not parse AI response",
        raw: text.slice(0, 500),
      }, { status: 500 });
    }

    // Filter out duplicate regulations
    const newItems = regulations.filter(
      (d: any) => d.title && !existingTitles.has(d.title.toLowerCase())
    );

    // Stage new sources as provisional
    const sourcesAdded = [];
    for (const src of newSources.slice(0, 5)) {
      // Check if source URL already exists
      const { data: existingSource } = await supabase
        .from("sources")
        .select("id")
        .eq("url", src.url)
        .single();

      if (!existingSource && src.url) {
        await supabase.from("provisional_sources").upsert({
          name: src.name,
          url: src.url,
          description: src.publishes || "",
          discovered_via: "worker_search",
          status: "pending_review",
        }, { onConflict: "url" });
        sourcesAdded.push(src.name);
      }
    }

    // Stage regulations as proposed updates for admin review
    const stagedItems = [];
    for (const item of newItems.slice(0, 10)) {
      const { error } = await supabase.from("staged_updates").insert({
        update_type: "new_item",
        proposed_changes: {
          title: item.title,
          summary: item.note || item.summary || "",
          what_is_it: item.what_is_it || "",
          why_matters: item.why_matters || "",
          key_data: item.key_data || [],
          domain: 1,
          item_type: "regulation",
          jurisdictions: item.jurisdiction ? [item.jurisdiction.toLowerCase()] : ["global"],
          transport_modes: item.transport_modes || [],
          priority: item.priority || "MODERATE",
          status: item.status || "monitoring",
          source_url: item.source_url || "",
          source_name: item.source_name || "",
          entry_into_force: item.effective_date || null,
          penalty_range: item.penalty_range || "",
          cost_mechanism: item.cost_mechanism || "",
          authority_level: item.authority_level || "unconfirmed",
        },
        reason: `AI scan: ${topic || "general"} ${jurisdiction || "global"}`,
        source_url: item.source_url || "",
        confidence: "MEDIUM",
      });

      if (!error) stagedItems.push(item.title);
    }

    // Stamp the cooldown ledger on success. If migration 024 hasn't been applied
    // yet, this no-ops silently — cooldown will activate once the table exists.
    await supabase.from("admin_action_cooldowns").upsert({
      action_key: SCAN_COOLDOWN_KEY,
      last_triggered_at: new Date().toISOString(),
      triggered_by: auth.userId,
      metadata: { topic: topic || null, jurisdiction: jurisdiction || null, staged: stagedItems.length },
    }, { onConflict: "action_key" });

    return NextResponse.json({
      success: true,
      discovered: regulations.length,
      new_items: newItems.length,
      staged: stagedItems.length,
      staged_titles: stagedItems,
      new_sources_discovered: sourcesAdded.length,
      new_source_names: sourcesAdded,
    }, { headers: rateLimitHeaders(auth.userId) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
