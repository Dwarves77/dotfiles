import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { pauseReason } from "@/lib/api/pause";
import { parseAgentOutput, AgentOutputParseError } from "@/lib/agent/parse-output";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SCAN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per source URL

export async function POST(request: NextRequest) {
  // ── Step 1: Auth check ──
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
    const { sourceUrl, bypassPause } = await request.json();
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
    }

    const jobStart = Date.now();
    const failures: string[] = [];

    // ── Step 2: Rate limit + provisional gate ──
    const { data: sourceRecord } = await supabase
      .from("sources")
      .select("id, last_scanned, status, tier")
      .eq("url", sourceUrl)
      .single();

    // Gate: do not process provisional sources — no API spend on unverified sources
    if (sourceRecord?.status === "provisional") {
      return NextResponse.json(
        { error: "Source is provisional. Activate it (status='active') before processing." },
        { status: 403 }
      );
    }

    // Pause gate — both global and per-source. Manual admin paths bypass
    // this by setting bypassPause: true in the body (the regenerate-brief
    // admin route does this). Auth is required for all callers, so the
    // bypass is gated by admin authentication.
    if (!bypassPause) {
      const reason = await pauseReason(supabase, sourceRecord?.id);
      if (reason) {
        return NextResponse.json({ error: reason }, { status: 409 });
      }
    }

    if (sourceRecord?.last_scanned) {
      const lastScanned = new Date(sourceRecord.last_scanned).getTime();
      const elapsed = Date.now() - lastScanned;
      if (elapsed < SCAN_COOLDOWN_MS) {
        const nextAvailable = new Date(lastScanned + SCAN_COOLDOWN_MS).toISOString();
        return NextResponse.json(
          { error: "Source scanned too recently", next_available: nextAvailable },
          { status: 429, headers: { "Retry-After": String(Math.ceil((SCAN_COOLDOWN_MS - elapsed) / 1000)) } }
        );
      }
    }

    // ── Step 3: Fetch source content once ──
    let sourceContent: string;
    try {
      const res = await fetch(sourceUrl, {
        headers: { "User-Agent": "CarosLedge-IntelligenceAgent/1.0" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      sourceContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80000);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to fetch source: ${e.message}` }, { status: 502 });
    }

    // ── Step 4: Load sector contexts — single query, all 15 ──
    const { data: sectorContexts, error: sectorErr } = await supabase
      .from("sector_contexts")
      .select("sector, display_name, synopsis_prompt, transport_modes, cargo_types, compliance_roles, urgency_weights")
      .order("sector");

    if (sectorErr || !sectorContexts?.length) {
      return NextResponse.json({ error: "Failed to load sector contexts" }, { status: 500 });
    }

    // ── Step 5: Load existing intelligence items for this source ──
    const { data: existingItems } = await supabase
      .from("intelligence_items")
      .select("id, title, summary, what_is_it, why_matters, key_data, priority, source_url, updated_at")
      .eq("source_url", sourceUrl);

    // ── Step 6: Build the user message ──
    const userMessage = `SOURCE URL: ${sourceUrl}

SOURCE CONTENT:
${sourceContent}

EXISTING ITEMS FROM THIS SOURCE FOR DELTA DETECTION:
${JSON.stringify(existingItems || [], null, 2)}

SECTOR CONTEXTS:
${JSON.stringify(sectorContexts, null, 2)}`;

    // ── Step 7: Single Claude API call ──
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text();
      return NextResponse.json(
        { error: `Claude API ${claudeResponse.status}: ${errBody.slice(0, 300)}` },
        { status: 502 }
      );
    }

    // ── Step 8: Parse response ──
    const claudeData = await claudeResponse.json();
    const rawText = claudeData.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("") || "";

    // ── Step 8a: Citation extraction (runs before JSON parse so it survives parse failures) ──
    // Look for a "New Sources Identified" section per the system prompt. The
    // agent emits a markdown table with columns | Source Name | URL | Tier (1-7) | Why |.
    // Failures here log warnings only — we never fail the run on citation parsing.
    const citations: Array<{ name: string; url: string; tier: number; why: string }> = [];
    try {
      const sectionMatch = rawText.match(/(?:^|\n)#{0,3}\s*New Sources Identified[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i);
      if (sectionMatch) {
        const tableBody = sectionMatch[1];
        const rows = tableBody.split(/\r?\n/);
        for (const row of rows) {
          const trimmed = row.trim();
          if (!trimmed.startsWith("|")) continue;
          // Skip table-header separator rows like |----|----|
          if (/^\|\s*-+/.test(trimmed)) continue;
          const cells = trimmed.split("|").map((c: string) => c.trim()).filter((c: string) => c.length > 0);
          if (cells.length < 4) continue;
          const [name, url, tierRaw, why] = cells;
          // Skip the header row ("Source Name | URL | Tier estimate ...")
          if (/^source\s*name$/i.test(name) || /^url$/i.test(url)) continue;
          const tier = parseInt(tierRaw.replace(/[^\d]/g, ""), 10);
          if (!url.startsWith("http") || isNaN(tier) || tier < 1 || tier > 7) continue;
          citations.push({ name, url, tier, why });
        }
      }
    } catch (parseErr: any) {
      console.warn("Citation extraction failed (non-fatal):", parseErr.message);
    }

    // ── Step 8b: Process citations now — independent of JSON parse outcome ──
    // Citations write before the JSON parse step so a parse failure on the
    // brief body (which can happen when the agent produces markdown rather
    // than JSON) doesn't lose the citations. Failures here are logged but
    // don't fail the run.
    let citationsWritten = 0;
    let provisionalsCreated = 0;
    let provisionalsUpdated = 0;
    if (sourceRecord?.id && citations.length) {
      const citingId = sourceRecord.id;
      const citingTier = sourceRecord.tier;

      for (const c of citations) {
        try {
          const { data: existingSource } = await supabase
            .from("sources")
            .select("id, total_citations, confirmation_count")
            .eq("url", c.url)
            .maybeSingle();

          if (existingSource) {
            if (existingSource.id === citingId) continue;
            const { error: cErr } = await supabase
              .from("source_citations")
              .upsert(
                {
                  citing_source_id: citingId,
                  cited_source_id: existingSource.id,
                  context: c.why,
                  detected_at: new Date().toISOString(),
                },
                { onConflict: "citing_source_id,cited_source_id" }
              );
            if (!cErr) {
              citationsWritten++;
              await supabase
                .from("sources")
                .update({
                  total_citations: (existingSource.total_citations || 0) + 1,
                  confirmation_count: (existingSource.confirmation_count || 0) + 1,
                })
                .eq("id", existingSource.id);
            } else {
              failures.push(`Citation ${c.url}: ${cErr.message}`);
            }
            continue;
          }

          const { data: existingProv } = await supabase
            .from("provisional_sources")
            .select("id, citation_count, citing_source_ids, highest_citing_tier")
            .eq("url", c.url)
            .maybeSingle();

          if (existingProv) {
            const ids = Array.isArray(existingProv.citing_source_ids) ? existingProv.citing_source_ids : [];
            const updatedIds = ids.includes(citingId) ? ids : [...ids, citingId];
            const newHighest = Math.min(
              existingProv.highest_citing_tier ?? 99,
              citingTier ?? 99
            );
            const { error: pErr } = await supabase
              .from("provisional_sources")
              .update({
                citation_count: (existingProv.citation_count || 0) + 1,
                citing_source_ids: updatedIds,
                independent_citers: updatedIds.length,
                highest_citing_tier: newHighest === 99 ? null : newHighest,
              })
              .eq("id", existingProv.id);
            if (!pErr) provisionalsUpdated++;
            else failures.push(`Provisional update ${c.url}: ${pErr.message}`);
            continue;
          }

          const { error: insertErr } = await supabase.from("provisional_sources").insert({
            name: c.name.slice(0, 200),
            url: c.url,
            description: c.why.slice(0, 500),
            discovered_via: "citation_detection",
            cited_by_source_id: citingId,
            cited_by_source_tier: citingTier,
            citation_count: 1,
            citing_source_ids: [citingId],
            independent_citers: 1,
            highest_citing_tier: citingTier,
            provisional_tier: c.tier,
            status: "pending_review",
          });
          if (!insertErr) provisionalsCreated++;
          else failures.push(`Provisional insert ${c.url}: ${insertErr.message}`);
        } catch (citationErr: any) {
          failures.push(`Citation ${c.url}: ${citationErr.message}`);
        }
      }
    }

    // ── Step 9: Parse YAML frontmatter + markdown body (SKILL.md 2026-04-28 contract) ──
    // Per the agent contract, the output is a markdown brief followed by an
    // optional "New Sources Identified" table, terminated by a mandatory YAML
    // frontmatter block. Missing or malformed YAML is a failed regeneration
    // — abort without writing any partial state to intelligence_items.
    let body: string;
    let metadata: ReturnType<typeof parseAgentOutput>["metadata"];
    try {
      const parsed = parseAgentOutput(rawText);
      body = parsed.body;
      metadata = parsed.metadata;
    } catch (e: any) {
      const msg = e instanceof AgentOutputParseError ? e.message : `Parse error: ${e.message}`;
      console.warn("[agent/run] YAML frontmatter parse failed:", msg);
      return NextResponse.json(
        {
          error: "Agent output failed contract validation. No row updated.",
          detail: msg,
          raw_tail: rawText.slice(-500),
        },
        { status: 502 }
      );
    }

    // ── Step 10: Update intelligence_items row by source_url ──
    // Match the existing row whose source_url matches this run. If no row
    // matches, return error — agent runs target known items, not net-new
    // inserts. (Citation extraction creates new provisional sources, not
    // intelligence_items.)
    const targetItem = (existingItems || []).find((e: any) => e.source_url === sourceUrl);
    if (!targetItem) {
      return NextResponse.json(
        { error: `No intelligence_items row matches source_url=${sourceUrl}. Aborting.` },
        { status: 404 }
      );
    }

    const { error: updateErr } = await supabase
      .from("intelligence_items")
      .update({
        full_brief: body,
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        sources_used: metadata.sources_used,
        last_regenerated_at: metadata.last_regenerated_at,
        regeneration_skill_version: metadata.regeneration_skill_version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetItem.id);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update intelligence_items: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // ── Step 11: Update source scan timestamp ──
    if (sourceRecord?.id) {
      await supabase
        .from("sources")
        .update({ last_scanned: new Date().toISOString() })
        .eq("id", sourceRecord.id);
    }

    // ── Step 12: Return job summary ──
    return NextResponse.json({
      source_url: sourceUrl,
      item_id: targetItem.id,
      brief_length: body.length,
      metadata: {
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        sources_used_count: metadata.sources_used.length,
        last_regenerated_at: metadata.last_regenerated_at,
        regeneration_skill_version: metadata.regeneration_skill_version,
      },
      citations_extracted: citations.length,
      citations_written: citationsWritten,
      provisionals_created: provisionalsCreated,
      provisionals_updated: provisionalsUpdated,
      failures,
      duration_ms: Date.now() - jobStart,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
