import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

  try {
    const { topic, jurisdiction } = await request.json();

    // Get existing items to avoid duplicates
    const { data: existing } = await supabase
      .from("intelligence_items")
      .select("title")
      .limit(200);

    const existingTitles = (existing || []).map((e: any) => e.title.toLowerCase());

    // Call Claude to search for new regulations
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",  // Haiku for scanning — 12x cheaper than Sonnet, fast structured extraction
        max_tokens: 3000,
        system: `You are a regulatory intelligence researcher for the global freight forwarding industry. Search for current and upcoming regulations, standards, and policy developments that affect freight logistics sustainability.

For each regulation you find, provide:
- title: Official name of the regulation
- summary: One detailed paragraph explaining what it is, what it requires, and what changed recently
- why_matters: One paragraph explaining the operational impact on freight forwarders — how it affects costs, compliance, routing, or client relationships
- jurisdiction: Where it applies (EU, US, UK, Global, China, India, etc.)
- transport_modes: Array of affected modes (air, road, ocean, rail)
- priority: CRITICAL (action needed now), HIGH (action within 6 months), MODERATE (monitor), or LOW (awareness)
- status: proposed, adopted, in_force, monitoring
- source_url: Direct URL to the official text or announcement
- source_name: Name of the publishing body (e.g., "EUR-Lex", "Federal Register", "IMO")
- effective_date: When it takes effect (if known)
- key_deadlines: Array of upcoming deadline dates and what they require

Focus on regulations that are:
1. New or recently updated (last 6 months)
2. Directly relevant to freight forwarding operations
3. Not already in our database
4. Published by authoritative government or intergovernmental sources

Also identify any NEW sources (government portals, regulatory bodies) that publish these regulations which should be added to our monitoring registry.

Return a JSON object with two arrays:
{
  "regulations": [...],
  "new_sources": [{ "name": "...", "url": "...", "jurisdiction": "...", "publishes": "..." }]
}

Return ONLY the JSON object, no other text.`,
        messages: [{
          role: "user",
          content: `Search for new freight sustainability regulations${topic ? ` related to "${topic}"` : ""}${jurisdiction ? ` in ${jurisdiction}` : " globally"}. Find regulations not in this existing list: ${existingTitles.slice(0, 50).join(", ")}`,
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
      (d: any) => !existingTitles.includes(d.title?.toLowerCase())
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
    const staged = [];
    for (const item of newItems.slice(0, 10)) {
      const { error } = await supabase.from("staged_updates").insert({
        update_type: "new_item",
        proposed_changes: {
          title: item.title,
          summary: item.summary,
          why_matters: item.why_matters || "",
          domain: 1,
          item_type: "regulation",
          jurisdictions: item.jurisdiction ? [item.jurisdiction.toLowerCase()] : ["global"],
          transport_modes: item.transport_modes || [],
          priority: item.priority || "MODERATE",
          status: item.status || "monitoring",
          source_url: item.source_url || "",
          source_name: item.source_name || "",
          entry_into_force: item.effective_date || null,
          key_deadlines: item.key_deadlines || [],
        },
        reason: `AI scan: ${topic || "general"} ${jurisdiction || "global"}`,
        source_url: item.source_url || "",
        confidence: "MEDIUM",
      });

      if (!error) staged.push(item.title);
    }

    return NextResponse.json({
      success: true,
      discovered: regulations.length,
      new_items: newItems.length,
      staged: staged.length,
      staged_titles: staged,
      new_sources_discovered: sourcesAdded.length,
      new_source_names: sourcesAdded,
    }, { headers: rateLimitHeaders(auth.userId) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
