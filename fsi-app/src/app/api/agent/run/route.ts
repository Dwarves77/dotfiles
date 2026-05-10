import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, isAuthError } from "@/lib/api/auth";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { pauseReason } from "@/lib/api/pause";
import { parseAgentOutput, AgentOutputParseError } from "@/lib/agent/parse-output";
import { buildSourcePool } from "@/lib/agent/source-pool";
import { browserlessRender, BrowserlessError, type BrowserlessResult } from "@/lib/sources/browserless";
import { apiFetch, ApiFetchError } from "@/lib/sources/api-fetch";
import { rssFetch, RssFetchError } from "@/lib/sources/rss-fetch";
import { checkFetchQuality } from "@/lib/sources/fetch-quality";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SCAN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per source URL

// Sonnet 4.6 pricing (USD per million tokens). Used for cost_usd_estimated
// telemetry on agent_runs. Numbers updated 2026-05-09 from the Anthropic
// pricing page; verify against current rates before relying on the meter.
const SONNET_INPUT_PER_MTOK_USD = 3.0;
const SONNET_OUTPUT_PER_MTOK_USD = 15.0;

function estimateSonnetCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK_USD;
  const outputCost = (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK_USD;
  return Number((inputCost + outputCost).toFixed(6));
}

interface SourceLookupRow {
  id: string;
  last_scanned: string | null;
  status: string;
  tier: number | null;
  access_method: string | null;
  api_endpoint_url: string | null;
  api_auth_method: string | null;
  api_response_format: string | null;
  rss_feed_url: string | null;
}

interface SourceLookupRowSafe {
  id: string;
  last_scanned: string | null;
  status: string;
  tier: number | null;
  access_method: string | null;
  api_endpoint_url: string | null;
  api_auth_method: string | null;
  api_response_format: string | null;
  rss_feed_url: string | null;
}

// HttpResponseError is the typed wrapper that signals "convert me to a
// NextResponse with this status and body". Throwing this from anywhere
// in the route lets the catch block produce the response uniformly so
// the finally-block telemetry update fires for every code path.
class HttpResponseError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>
  ) {
    super(typeof body.error === "string" ? body.error : `HTTP ${statusCode}`);
    this.name = "HttpResponseError";
  }
}

function statusToTelemetry(httpStatus: number): "success" | "skipped" | "error" {
  if (httpStatus >= 200 && httpStatus < 300) return "success";
  if (
    httpStatus === 403 ||
    httpStatus === 409 ||
    httpStatus === 429 ||
    httpStatus === 404 ||
    httpStatus === 412
  ) {
    return "skipped";
  }
  return "error";
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function gzipString(input: string): Promise<Uint8Array> {
  // Web streams CompressionStream is available on Node 20+ and Edge.
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function persistRawFetch(
  supabase: SupabaseClient,
  sourceId: string,
  result: BrowserlessResult
): Promise<{ raw_fetch_id: string | null; content_hash: string | null }> {
  // Wrapped in try/catch so missing table or storage bucket (migrations
  // 052 not yet applied) does not break the route. Returns null ids on
  // any failure; the caller logs and proceeds.
  try {
    const content_hash = await sha256Hex(result.html);
    const yyyy = new Date().toISOString().slice(0, 10);
    const file_path = `${sourceId}/${yyyy}/${content_hash}.html.gz`;
    const gz = await gzipString(result.html);
    const upload = await supabase.storage
      .from("raw_fetches")
      .upload(file_path, gz, {
        contentType: "application/gzip",
        upsert: true,
      });
    if (upload.error) {
      console.warn(`[agent/run] raw_fetches storage upload failed: ${upload.error.message}`);
      return { raw_fetch_id: null, content_hash };
    }
    const { data, error } = await supabase
      .from("raw_fetches")
      .upsert(
        {
          source_id: sourceId,
          content_hash,
          file_path,
          http_status: result.status,
          html_bytes: result.htmlLength,
        },
        { onConflict: "source_id,content_hash" }
      )
      .select("id")
      .single();
    if (error || !data) {
      console.warn(`[agent/run] raw_fetches insert failed: ${error?.message ?? "no data"}`);
      return { raw_fetch_id: null, content_hash };
    }
    return { raw_fetch_id: data.id as string, content_hash };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[agent/run] persistRawFetch caught: ${msg}`);
    return { raw_fetch_id: null, content_hash: null };
  }
}

async function fetchByAccessMethod(
  source: SourceLookupRowSafe | null,
  sourceUrl: string
): Promise<BrowserlessResult> {
  const method = (source?.access_method ?? "html_scrape").toLowerCase();
  if (method === "api") {
    return apiFetch(
      {
        url: sourceUrl,
        api_endpoint_url: source?.api_endpoint_url ?? null,
        api_auth_method: source?.api_auth_method ?? null,
        api_response_format: source?.api_response_format ?? null,
      },
      { maxTextLength: 80000 }
    );
  }
  if (method === "rss") {
    return rssFetch(
      { url: sourceUrl, rss_feed_url: source?.rss_feed_url ?? null },
      { maxTextLength: 80000 }
    );
  }
  // html_scrape, scrape (legacy alias), gazette, manual all fall through
  // to the Browserless render path as before.
  return browserlessRender(sourceUrl, { maxTextLength: 80000 });
}

export async function POST(request: NextRequest) {
  // Auth check stays outside the telemetry envelope; unauthenticated
  // calls do not warrant an agent_runs row.
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return auth;

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const jobStart = Date.now();
  let sourceUrl = "";
  let bypassPause = false;
  try {
    const body = await request.json();
    sourceUrl = body.sourceUrl;
    bypassPause = body.bypassPause;
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "sourceUrl is required" }, { status: 400 });
  }

  // Telemetry envelope. agent_runs row is created at request start,
  // updated at the end with terminal state. Wrapped in try/catch so
  // missing table (migration 057 not applied) does not break the
  // route, falls back to console logging.
  let agentRunId: string | null = null;
  try {
    const { data: ar, error: arErr } = await supabase
      .from("agent_runs")
      .insert({
        source_url: sourceUrl,
        fetch_method: "unknown",
        status: "running",
      })
      .select("id")
      .single();
    if (arErr) {
      console.warn(`[agent/run] agent_runs insert failed: ${arErr.message}`);
    } else if (ar?.id) {
      agentRunId = ar.id as string;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[agent/run] agent_runs insert threw: ${msg}`);
  }

  const failures: string[] = [];
  let terminalStatus: "success" | "skipped" | "error" = "error";
  let terminalCostUsd = 0;
  let terminalErrors: Array<Record<string, unknown>> = [];
  let terminalFetchStatus: number | null = null;
  let terminalFetchHtmlBytes: number | null = null;
  let terminalFetchTextBytes: number | null = null;
  let terminalFetchRenderMs: number | null = null;
  let terminalRawFetchId: string | null = null;
  let terminalIntelligenceItemId: string | null = null;
  let terminalFetchMethod: string | null = null;
  let httpResponse: NextResponse | null = null;

  try {
    // ── Step 2: Source lookup with all access_method routing fields ──
    const { data: sourceRecord, error: sourceLookupError } = (await supabase
      .from("sources")
      .select(
        "id, last_scanned, status, tier, access_method, api_endpoint_url, api_auth_method, api_response_format, rss_feed_url"
      )
      .eq("url", sourceUrl)
      .single()) as { data: SourceLookupRow | null; error: { message: string; code?: string } | null };
    if (sourceLookupError) {
      console.warn(
        `[agent/run] sources lookup error for url=${sourceUrl}: ${sourceLookupError.message} (code=${sourceLookupError.code ?? "?"})`
      );
    }

    terminalFetchMethod = sourceRecord?.access_method ?? "html_scrape";

    // Provisional gate: do not process provisional sources.
    if (sourceRecord?.status === "provisional") {
      throw new HttpResponseError(403, {
        error: "Source is provisional. Activate it (status='active') before processing.",
      });
    }

    // Pause gate, both global and per-source.
    if (!bypassPause) {
      const reason = await pauseReason(supabase, sourceRecord?.id);
      if (reason) {
        throw new HttpResponseError(409, { error: reason });
      }
    }

    if (sourceRecord?.last_scanned) {
      const lastScanned = new Date(sourceRecord.last_scanned).getTime();
      const elapsed = Date.now() - lastScanned;
      if (elapsed < SCAN_COOLDOWN_MS) {
        const nextAvailable = new Date(lastScanned + SCAN_COOLDOWN_MS).toISOString();
        throw new HttpResponseError(429, {
          error: "Source scanned too recently",
          next_available: nextAvailable,
        });
      }
    }

    // ── Step 3: Fetch source content via access_method routing ──
    let sourceContent: string;
    let fetchStatus = 0;
    let fetchHtmlLength = 0;
    let fetchTextLength = 0;
    let fetchMs = 0;
    let fetchedHtml = "";
    try {
      const r = await fetchByAccessMethod(sourceRecord, sourceUrl);
      sourceContent = r.text;
      fetchStatus = r.status;
      fetchHtmlLength = r.htmlLength;
      fetchTextLength = r.textLength;
      fetchMs = r.renderMs;
      fetchedHtml = r.html;
    } catch (e: unknown) {
      let ms = 0;
      let status = 0;
      if (e instanceof BrowserlessError || e instanceof ApiFetchError || e instanceof RssFetchError) {
        ms = e.renderMs ?? 0;
        status = e.status ?? 0;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        `[agent/run] FETCH FAIL  url=${sourceUrl}  ms=${ms}  status=${status}  err=${msg.slice(0, 200)}`
      );
      terminalFetchStatus = status;
      terminalFetchRenderMs = ms;
      failures.push(`Fetch: ${msg}`);
      throw new HttpResponseError(502, { error: `Failed to fetch source: ${msg}` });
    }
    console.log(
      `[agent/run] FETCH OK    url=${sourceUrl}  ms=${fetchMs}  status=${fetchStatus}  html=${fetchHtmlLength}  text=${fetchTextLength}`
    );
    terminalFetchStatus = fetchStatus;
    terminalFetchHtmlBytes = fetchHtmlLength;
    terminalFetchTextBytes = fetchTextLength;
    terminalFetchRenderMs = fetchMs;

    // ── Step 3.5: Fetch-quality pre-filter ──
    // Cheap pattern gate that drops Cloudflare blocks, CAPTCHA pages,
    // 404s, maintenance pages, and content-too-short bodies before
    // any LLM call. 412 maps to 'skipped' in statusToTelemetry, the
    // reason is recorded in agent_runs.errors via the finally block.
    const qualityCheck = checkFetchQuality({
      html: fetchedHtml,
      text: sourceContent,
      httpStatus: fetchStatus,
    });
    if (!qualityCheck.ok) {
      console.log(
        `[agent/run] FETCH QUALITY FAIL  url=${sourceUrl}  reason=${qualityCheck.reason}`
      );
      throw new HttpResponseError(412, {
        error: "fetch_quality_failed",
        reason: qualityCheck.reason,
      });
    }

    // ── Step 3a: Persist raw fetch ──
    // Wrapped inside persistRawFetch so missing table or bucket
    // (migration 052 not applied) does not fail the route. Returns
    // null ids on any failure; the row scoring continues regardless.
    if (sourceRecord?.id && fetchedHtml) {
      const persisted = await persistRawFetch(supabase, sourceRecord.id, {
        status: fetchStatus,
        html: fetchedHtml,
        text: sourceContent,
        htmlLength: fetchHtmlLength,
        textLength: fetchTextLength,
        renderMs: fetchMs,
      });
      terminalRawFetchId = persisted.raw_fetch_id;
      // Update sources scoreboard columns; wrapped to tolerate missing
      // columns (migration 054 not applied).
      try {
        if (persisted.content_hash) {
          await supabase
            .from("sources")
            .update({
              last_content_hash: persisted.content_hash,
              last_content_fetched_at: new Date().toISOString(),
            })
            .eq("id", sourceRecord.id);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[agent/run] sources scoreboard update threw: ${msg}`);
      }
    }

    // ── Step 4: Load existing intelligence_items row for this source URL ──
    const { data: existingItems } = await supabase
      .from("intelligence_items")
      .select(
        "id, title, summary, what_is_it, why_matters, key_data, priority, source_url, source_id, domain, jurisdictions, topic_tags, item_type, full_brief, updated_at"
      )
      .eq("source_url", sourceUrl);

    type ExistingItem = {
      id: string;
      title: string;
      summary: string;
      what_is_it: string;
      why_matters: string;
      key_data: string[];
      priority: string;
      source_url: string;
      source_id: string | null;
      domain: number | null;
      jurisdictions: string[] | null;
      topic_tags: string[] | null;
      item_type: string;
      full_brief: string | null;
      updated_at: string | null;
    };
    const items = (existingItems as ExistingItem[] | null) ?? [];
    const targetItem = items.find((e) => e.source_url === sourceUrl);
    if (!targetItem) {
      throw new HttpResponseError(404, {
        error: `No intelligence_items row matches source_url=${sourceUrl}.`,
      });
    }
    terminalIntelligenceItemId = targetItem.id;

    // ── Step 5: Build dynamic per-item source pool ──
    const pool = await buildSourcePool(supabase, {
      id: targetItem.id,
      source_id: targetItem.source_id,
      domain: targetItem.domain,
      jurisdictions: targetItem.jurisdictions,
      topic_tags: targetItem.topic_tags,
    });

    // ── Step 6: Build the user message ──
    const userMessage = `INPUT ITEM:
- id: ${targetItem.id}
- title: ${targetItem.title}
- item_type: ${targetItem.item_type}
- domain: ${targetItem.domain ?? "(null)"}
- jurisdictions: ${JSON.stringify(targetItem.jurisdictions || [])}
- topic_tags: ${JSON.stringify(targetItem.topic_tags || [])}
- source_url: ${targetItem.source_url || "(none)"}
- existing brief preview: ${(targetItem.full_brief || "").slice(0, 1500)}

SOURCE CONTENT (truncated):
${sourceContent}

WORKSPACE PROFILE:
- cargo_verticals: live events, fine art, luxury goods, film and TV, high-value automotive, humanitarian
- transport_mode_priority: air primary, road secondary, ocean tertiary
- trade_lanes: Americas, Europe, Asia
- supply_chain_role: freight forwarder

AVAILABLE SOURCES (for sources_used; use only these UUIDs, pool size ${pool.pool_size}, primary included: ${pool.primary_included}):
${JSON.stringify(pool.sources, null, 2)}

Generate the brief per the format selected by item_type, then emit the YAML frontmatter block as instructed.`;

    // ── Step 7: Single Claude API call ──
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 24000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeResponse.ok) {
      const errBody = await claudeResponse.text();
      throw new HttpResponseError(502, {
        error: `Claude API ${claudeResponse.status}: ${errBody.slice(0, 300)}`,
      });
    }

    // ── Step 8: Parse response ──
    const claudeData = await claudeResponse.json();
    const inputTokens = (claudeData?.usage?.input_tokens as number) ?? 0;
    const outputTokens = (claudeData?.usage?.output_tokens as number) ?? 0;
    terminalCostUsd = estimateSonnetCostUsd(inputTokens, outputTokens);

    type AnthropicTextBlock = { type: "text"; text: string };
    type AnthropicBlock = AnthropicTextBlock | { type: string };
    const blocks: AnthropicBlock[] = (claudeData.content as AnthropicBlock[]) ?? [];
    const rawText = blocks
      .filter((b): b is AnthropicTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // ── Step 8a: Citation extraction ──
    const citations: Array<{ name: string; url: string; tier: number; why: string }> = [];
    try {
      const sectionMatch = rawText.match(
        /(?:^|\n)#{0,3}\s*New Sources Identified[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i
      );
      if (sectionMatch) {
        const tableBody = sectionMatch[1];
        const rows = tableBody.split(/\r?\n/);
        for (const row of rows) {
          const trimmed = row.trim();
          if (!trimmed.startsWith("|")) continue;
          if (/^\|\s*-+/.test(trimmed)) continue;
          const cells = trimmed
            .split("|")
            .map((c: string) => c.trim())
            .filter((c: string) => c.length > 0);
          if (cells.length < 4) continue;
          const [name, url, tierRaw, why] = cells;
          if (/^source\s*name$/i.test(name) || /^url$/i.test(url)) continue;
          const tier = parseInt(tierRaw.replace(/[^\d]/g, ""), 10);
          if (!url.startsWith("http") || isNaN(tier) || tier < 1 || tier > 7) continue;
          citations.push({ name, url, tier, why });
        }
      }
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.warn("Citation extraction failed (non-fatal):", msg);
    }

    // ── Step 8b: Process citations ──
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
            const ids = Array.isArray(existingProv.citing_source_ids)
              ? (existingProv.citing_source_ids as string[])
              : [];
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
        } catch (citationErr: unknown) {
          const msg = citationErr instanceof Error ? citationErr.message : String(citationErr);
          failures.push(`Citation ${c.url}: ${msg}`);
        }
      }
    }

    // ── Step 9: Parse YAML frontmatter + markdown body ──
    let parsedBody: string;
    let metadata: ReturnType<typeof parseAgentOutput>["metadata"];
    try {
      const parsed = parseAgentOutput(rawText);
      parsedBody = parsed.body;
      metadata = parsed.metadata;
    } catch (e: unknown) {
      const msg = e instanceof AgentOutputParseError ? e.message : `Parse error: ${e instanceof Error ? e.message : String(e)}`;
      console.warn("[agent/run] YAML frontmatter parse failed:", msg);
      throw new HttpResponseError(502, {
        error: "Agent output failed contract validation. No row updated.",
        detail: msg,
        raw_tail: rawText.slice(-500),
      });
    }

    // ── Step 10: Update intelligence_items row ──
    const { error: updateErr } = await supabase
      .from("intelligence_items")
      .update({
        full_brief: parsedBody,
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        topic_tags: metadata.topic_tags,
        operational_scenario_tags: metadata.operational_scenario_tags,
        compliance_object_tags: metadata.compliance_object_tags,
        related_items: metadata.related_items,
        intersection_summary: metadata.intersection_summary,
        sources_used: metadata.sources_used,
        last_regenerated_at: metadata.last_regenerated_at,
        regeneration_skill_version: metadata.regeneration_skill_version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetItem.id);

    if (updateErr) {
      throw new HttpResponseError(500, {
        error: `Failed to update intelligence_items: ${updateErr.message}`,
      });
    }

    // intelligence_item_versions row is written by the trigger on
    // intelligence_items UPDATE (migration 053). When the trigger is
    // not yet present (migration not applied) the UPDATE still
    // succeeds and the route returns success without a version row,
    // matching pre-Wave-1a behavior.

    // ── Step 11: Update source scan timestamp + last_intelligence_item_at ──
    if (sourceRecord?.id) {
      try {
        await supabase
          .from("sources")
          .update({
            last_scanned: new Date().toISOString(),
            last_intelligence_item_at: new Date().toISOString(),
          })
          .eq("id", sourceRecord.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[agent/run] sources timestamp update threw: ${msg}`);
        // Fall back to the original update without the new column.
        await supabase
          .from("sources")
          .update({ last_scanned: new Date().toISOString() })
          .eq("id", sourceRecord.id);
      }
    }

    terminalStatus = "success";

    // ── Step 12: Return job summary ──
    httpResponse = NextResponse.json({
      source_url: sourceUrl,
      item_id: targetItem.id,
      brief_length: parsedBody.length,
      fetch: {
        status: fetchStatus,
        render_ms: fetchMs,
        html_length: fetchHtmlLength,
        text_length: fetchTextLength,
        truncated_at: 80000,
        method: terminalFetchMethod,
      },
      metadata: {
        severity: metadata.severity,
        priority: metadata.priority,
        urgency_tier: metadata.urgency_tier,
        format_type: metadata.format_type,
        topic_tags: metadata.topic_tags,
        operational_scenario_tags: metadata.operational_scenario_tags,
        compliance_object_tags: metadata.compliance_object_tags,
        related_items_count: metadata.related_items.length,
        intersection_summary_present: metadata.intersection_summary !== null,
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
      raw_fetch_id: terminalRawFetchId,
      agent_run_id: agentRunId,
    });
  } catch (e: unknown) {
    if (e instanceof HttpResponseError) {
      terminalStatus = statusToTelemetry(e.statusCode);
      terminalErrors = [{ kind: "http", status: e.statusCode, body: e.body }];
      httpResponse = NextResponse.json(e.body, { status: e.statusCode });
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      terminalStatus = "error";
      terminalErrors = [{ kind: "exception", message: msg }];
      httpResponse = NextResponse.json({ error: msg }, { status: 500 });
    }
  } finally {
    if (agentRunId) {
      try {
        await supabase
          .from("agent_runs")
          .update({
            ended_at: new Date().toISOString(),
            duration_ms: Date.now() - jobStart,
            status: terminalStatus,
            cost_usd_estimated: terminalCostUsd,
            errors: terminalErrors,
            fetch_status: terminalFetchStatus,
            fetch_html_bytes: terminalFetchHtmlBytes,
            fetch_text_bytes: terminalFetchTextBytes,
            fetch_render_ms: terminalFetchRenderMs,
            raw_fetch_id: terminalRawFetchId,
            intelligence_item_id: terminalIntelligenceItemId,
            fetch_method: terminalFetchMethod,
          })
          .eq("id", agentRunId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[agent/run] agent_runs finalize update threw: ${msg}`);
      }
    }
  }

  return httpResponse ?? NextResponse.json({ error: "no response built" }, { status: 500 });
}
