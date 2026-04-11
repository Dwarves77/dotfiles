import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── System Prompt: Delta Detection + Item Extraction ──

const DELTA_SYSTEM_PROMPT = `You are the Caro's Ledge Intelligence Agent. You analyze regulatory source documents and extract structured intelligence for freight forwarding operations.

SOURCE AUTHORITY HIERARCHY (cite every claim at the correct level):
1. Confirmed primary text — Published in Official Journal, Federal Register, or official gazette. This IS the law. Cite article numbers.
2. Official guidance — Regulator FAQ, Commission guidance, implementation portal. Authoritative but not legally binding.
3. Secondary legal — Law firm commentary, legal database analysis. Informed but not authoritative.
4. Industry operator interpretation — Trade press, consultancy, forwarder operational read. Useful signal, not legally dispositive.
5. Legal Confirmation Required — Where interpretation is needed and no authoritative source has confirmed, flag explicitly.

THREE-STAGE PROCESS — STAGE 1: DELTA DETECTION

Compare the source content against the existing intelligence items provided.
For each regulation or policy found in the source:
- If NEW: extract full item with all fields
- If CHANGED: identify what changed, previous value, new value, severity
- If UNCHANGED: skip — do not generate output

SIGNAL VS NOISE RULES:
Generate output ONLY when:
- A new binding regulation, directive, or implementing act is published
- An existing regulation's dates, thresholds, penalties, or scope change
- Official guidance is published that changes operational interpretation
- A compliance deadline moves
DO NOT generate output for:
- Press releases restating known positions
- Political announcements without legislative action
- Generic sustainability commentary
- Minor editorial corrections to existing texts

QUALITY BENCHMARK: PPWR v7
Every item must match the depth of a full regulatory intelligence brief:
- Specific article references for every claim
- Penalty amounts, cost mechanisms, threshold numbers
- Legal confirmation flags where interpretation is needed (use "**Action Required — Confirm for Your Business:**")
- Operational impact by transport mode and business function
- Full markdown brief with sections: What This Is, Issues Requiring Immediate Action, Operational Impact, Key Data tables, Compliance Risk Register, Recommended Actions, Implementation Timeline, Open Questions, Sources

OUTPUT FORMAT — Return ONLY valid JSON, no other text:
{
  "items": [
    {
      "action": "new" or "update",
      "existing_item_id": null or "uuid-of-existing-item",
      "title": "Official name of regulation",
      "what_is_it": "2-3 paragraph plain English explanation citing legal instrument",
      "why_matters": "3-4 paragraphs on freight forwarding operational impact with cost mechanisms",
      "key_data": ["array", "of", "specific", "data", "points"],
      "summary": "STATUS. ACTION NOW: specific action. Owner: team.",
      "full_brief": "Full markdown intelligence brief following the section structure above",
      "priority": "CRITICAL" or "HIGH" or "MODERATE" or "LOW",
      "jurisdictions": ["eu", "us", "uk", "global", etc.],
      "transport_modes": ["air", "ocean", "road", "rail"],
      "category": "topic category",
      "source_url": "direct URL to primary legal text",
      "source_name": "publishing body name",
      "authority_level": "primary_text" or "official_guidance" or "intergovernmental" or "expert_analysis" or "unconfirmed",
      "entry_into_force": "YYYY-MM-DD or null",
      "change_summary": "what changed (for updates only)",
      "change_severity": "critical" or "high" or "medium" or "low",
      "previous_value": "previous state (for updates only)",
      "new_value": "new state (for updates only)"
    }
  ]
}`;

// ── System Prompt: Sector Synopsis Generation ──

const SYNOPSIS_SYSTEM_PROMPT = `You are generating a sector-specific intelligence synopsis for Caro's Ledge.

You will receive:
1. A regulation/intelligence item with full details
2. A sector-specific analysis prompt describing the sector's operations, cargo types, and key concerns

Generate a THREE-PART synopsis:

PART 1 — WHAT CHANGED
One paragraph stating the regulatory fact. No interpretation yet. Cite the specific legal instrument, article, and effective date.

PART 2 — WHAT IT MEANS FOR THIS SECTOR
Two to four paragraphs translating the regulation into operational impact for THIS SPECIFIC sector. Reference the sector's cargo types, transport modes, compliance roles, and business model. Include cost mechanisms where applicable. Use "**Action Required — Confirm for Your Business:**" flags where the operator needs to determine how it applies to their specific operations.

PART 3 — WHAT TO DO
Numbered list of specific actions with:
- WHO should own each action (team name)
- WHEN it needs to happen (specific date or timeframe)
- WHAT the action produces (a document, a decision, a system change)

SECTOR RELEVANCE SCORING:
Also return an urgency_score from 0.1 to 1.0:
- 1.0 = regulation directly and explicitly affects this sector's operations
- 0.9 = affects this sector's primary transport mode
- 0.6 = indirect cost or compliance pass-through
- 0.3 = adjacent sector with possible spillover
- 0.1 = no meaningful connection to this sector

OUTPUT FORMAT — Return ONLY valid JSON:
{
  "summary": "The full three-part synopsis in markdown",
  "urgency_score": 0.8
}`;

// ── Helper: Call Claude API ──

async function callClaude(
  system: string,
  userMessage: string,
  maxTokens: number = 8000,
  useWebSearch: boolean = false
): Promise<string> {
  const tools: any[] = [];
  if (useWebSearch) {
    tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
      ...(tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  const textBlocks = data.content?.filter((b: any) => b.type === "text") || [];
  return textBlocks.map((b: any) => b.text).join("\n\n");
}

// ── Helper: Fetch URL content as text ──

async function fetchSourceContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "CarosLedge-IntelligenceAgent/1.0" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

  const html = await response.text();
  // Strip HTML tags, scripts, styles — extract readable text
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000); // Cap at 50k chars to fit context
}

// ── Helper: Parse JSON from Claude response ──

function parseJSON(text: string): any {
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try extracting JSON block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// ── Main Route ──

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { sourceUrl } = await request.json();
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
    }

    const jobStart = Date.now();
    const log: string[] = [];

    // ── Step 1: Fetch source content ──
    log.push(`Fetching source: ${sourceUrl}`);
    let sourceContent: string;
    try {
      sourceContent = await fetchSourceContent(sourceUrl);
      log.push(`Source fetched: ${sourceContent.length} chars`);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to fetch source: ${e.message}` }, { status: 502 });
    }

    // ── Step 2: Load existing items for delta comparison ──
    const { data: existingItems } = await supabase
      .from("intelligence_items")
      .select("id, title, summary, what_is_it, priority, jurisdictions, transport_modes, source_url, entry_into_force")
      .eq("is_archived", false);

    const existingContext = (existingItems || [])
      .map((i: any) => `[${i.id}] ${i.title} | ${i.priority} | ${i.summary?.slice(0, 100)}`)
      .join("\n");

    log.push(`Loaded ${existingItems?.length || 0} existing items for delta comparison`);

    // ── Step 3: Load sector contexts ──
    const { data: sectorContexts } = await supabase
      .from("sector_contexts")
      .select("*");

    if (!sectorContexts?.length) {
      return NextResponse.json({ error: "No sector contexts found in database" }, { status: 500 });
    }
    log.push(`Loaded ${sectorContexts.length} sector contexts`);

    // ── STAGE 1: Delta Detection ──
    log.push("STAGE 1: Running delta detection...");

    const deltaPrompt = `Analyze this source document and compare against our existing intelligence database.

SOURCE URL: ${sourceUrl}

SOURCE CONTENT:
${sourceContent.slice(0, 40000)}

EXISTING INTELLIGENCE ITEMS (${existingItems?.length || 0} items):
${existingContext}

Extract any NEW regulations or CHANGES to existing regulations found in this source. Follow the signal vs noise rules strictly. Return only actionable intelligence.`;

    const deltaResponse = await callClaude(DELTA_SYSTEM_PROMPT, deltaPrompt, 12000);
    const deltaResult = parseJSON(deltaResponse);

    if (!deltaResult?.items?.length) {
      log.push("No new or changed items detected");
      return NextResponse.json({
        success: true,
        items_processed: 0,
        new_items: 0,
        updated_items: 0,
        synopses_written: 0,
        failures: 0,
        duration_ms: Date.now() - jobStart,
        log,
      });
    }

    log.push(`Delta detected: ${deltaResult.items.length} items`);

    // ── Process each item: write to DB + generate sector synopses ──
    let newItems = 0;
    let updatedItems = 0;
    let synopsesWritten = 0;
    let failures = 0;

    for (const item of deltaResult.items) {
      try {
        let itemId: string;

        if (item.action === "update" && item.existing_item_id) {
          // ── Update existing item ──
          const { error } = await supabase
            .from("intelligence_items")
            .update({
              summary: item.summary,
              what_is_it: item.what_is_it,
              why_matters: item.why_matters,
              key_data: item.key_data,
              full_brief: item.full_brief,
              priority: item.priority,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.existing_item_id);

          if (error) throw new Error(`Update failed: ${error.message}`);
          itemId = item.existing_item_id;
          updatedItems++;
          log.push(`Updated: ${item.title}`);

          // Write change record
          await supabase.from("intelligence_changes").insert({
            item_id: itemId,
            change_type: "update",
            change_severity: item.change_severity || "medium",
            change_summary: item.change_summary || null,
            previous_value: item.previous_value || null,
            new_value: item.new_value || null,
          });

        } else {
          // ── Insert new item ──
          const { data: inserted, error } = await supabase
            .from("intelligence_items")
            .insert({
              title: item.title,
              summary: item.summary,
              what_is_it: item.what_is_it,
              why_matters: item.why_matters,
              key_data: item.key_data || [],
              full_brief: item.full_brief,
              priority: item.priority || "MODERATE",
              domain: 1,
              item_type: "regulation",
              jurisdictions: item.jurisdictions || ["global"],
              transport_modes: item.transport_modes || [],
              category: item.category || "",
              source_url: item.source_url || sourceUrl,
              status: "monitoring",
              confidence: "medium",
              authority_level: item.authority_level,
              entry_into_force: item.entry_into_force || null,
              added_date: new Date().toISOString().slice(0, 10),
              is_archived: false,
            })
            .select("id")
            .single();

          if (error) throw new Error(`Insert failed: ${error.message}`);
          itemId = inserted.id;
          newItems++;
          log.push(`New item: ${item.title}`);

          // Write change record for new item
          await supabase.from("intelligence_changes").insert({
            item_id: itemId,
            change_type: "new",
            change_severity: item.priority === "CRITICAL" ? "critical" : item.priority === "HIGH" ? "high" : "medium",
            change_summary: `New item discovered from ${sourceUrl}`,
            new_value: item.title,
          });
        }

        // ── STAGE 2: Sector Synopsis Generation ──
        // One Claude call per sector for this item
        for (const sector of sectorContexts) {
          try {
            const sectorPrompt = `Generate a sector-specific synopsis for this intelligence item.

REGULATION:
Title: ${item.title}
Priority: ${item.priority}
Jurisdictions: ${(item.jurisdictions || []).join(", ")}
Transport Modes: ${(item.transport_modes || []).join(", ")}

What It Is:
${item.what_is_it}

Why It Matters:
${item.why_matters}

Key Data:
${(item.key_data || []).join("\n")}

Summary:
${item.summary}

SECTOR: ${sector.display_name}
Transport Modes: ${(sector.transport_modes || []).join(", ")}
Cargo Types: ${(sector.cargo_types || []).join(", ")}
Compliance Roles: ${(sector.compliance_roles || []).join(", ")}
Urgency Weights: ${JSON.stringify(sector.urgency_weights)}

SECTOR-SPECIFIC ANALYSIS INSTRUCTIONS:
${sector.synopsis_prompt}`;

            const synopsisResponse = await callClaude(
              SYNOPSIS_SYSTEM_PROMPT,
              sectorPrompt,
              3000
            );
            const synopsisResult = parseJSON(synopsisResponse);

            if (synopsisResult?.summary) {
              // Upsert synopsis — one per item+sector
              const { error: upsertErr } = await supabase
                .from("intelligence_summaries")
                .upsert(
                  {
                    item_id: itemId,
                    sector: sector.sector,
                    summary: synopsisResult.summary,
                    urgency_score: synopsisResult.urgency_score || null,
                    generated_at: new Date().toISOString(),
                    model_version: "claude-sonnet-4-20250514",
                  },
                  { onConflict: "item_id,sector" }
                );

              if (upsertErr) {
                // If upsert fails (no unique constraint), try insert
                await supabase.from("intelligence_summaries").insert({
                  item_id: itemId,
                  sector: sector.sector,
                  summary: synopsisResult.summary,
                  urgency_score: synopsisResult.urgency_score || null,
                  generated_at: new Date().toISOString(),
                  model_version: "claude-sonnet-4-20250514",
                });
              }

              synopsesWritten++;
            } else {
              failures++;
              log.push(`Synopsis failed for ${sector.sector} on ${item.title}`);
            }
          } catch (sectorErr: any) {
            failures++;
            log.push(`Synopsis error for ${sector.sector}: ${sectorErr.message?.slice(0, 100)}`);
          }

          // Rate limit between sector calls
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (itemErr: any) {
        failures++;
        log.push(`Item error (${item.title}): ${itemErr.message}`);
      }
    }

    // ── Return job summary ──
    const duration = Date.now() - jobStart;
    log.push(`Job complete in ${(duration / 1000).toFixed(1)}s`);

    return NextResponse.json({
      success: true,
      items_processed: deltaResult.items.length,
      new_items: newItems,
      updated_items: updatedItems,
      synopses_written: synopsesWritten,
      failures,
      duration_ms: duration,
      log,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
