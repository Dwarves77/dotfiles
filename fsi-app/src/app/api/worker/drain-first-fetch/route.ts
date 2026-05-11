import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browserlessRender, BrowserlessError } from "@/lib/sources/browserless";
import { apiFetch, ApiFetchError } from "@/lib/sources/api-fetch";
import { rssFetch, RssFetchError } from "@/lib/sources/rss-fetch";
import { firstFetchClassify } from "@/lib/llm/first-fetch-classify";

/**
 * POST /api/worker/drain-first-fetch
 *
 * Wave 1b drain worker. Pulls queued rows from pending_first_fetch
 * (populated by the trigger added in migration 065 on sources INSERT
 * or UPDATE OF auto_run_enabled), seeds a stub intelligence_items row
 * (enriched via Haiku classify), then forwards to /api/agent/run for
 * the full Sonnet brief.
 *
 * Pre-2026-05-11 the seed was a bare stub (title=source.name, summary='',
 * pipeline_stage='draft'), and /api/agent/run's UPDATE never overwrote
 * those columns, so stubs were stuck in Draft with the institution name
 * as the title and a blank summary forever. The Haiku call now mirrors
 * scripts/wave1-cold-start.mjs's Wave 1a pattern and populates
 * title/summary/priority/severity/urgency_tier/item_type/topic_tags
 * upfront. Cost: ~$0.001 per first fetch. See
 * docs/wave1b-stub-quality-investigation-2026-05-11.md.
 *
 * Authentication: x-worker-secret header (same WORKER_SECRET pattern
 * as /api/worker/check-sources). Called by the hourly GHA cron in
 * dotfiles/.github/workflows/source-monitoring.yml.
 *
 * Auth approach for the agent route call: this drain mints a one-shot
 * Supabase access_token via auth.admin.generateLink + verifyOtp for a
 * worker-designated admin email (env DRAIN_WORKER_EMAIL, falls back to
 * the project ADMIN_EMAIL or, last-resort, jasonlosh@hotmail.com used
 * by scripts/_smoke-run-task3.mjs). The token is held in memory for
 * the duration of the drain only and never logged. This keeps the
 * /api/agent/run route's auth contract unchanged (it still requires a
 * Bearer JWT) per design doc Section "Open questions" item 8.
 *
 * Per-invocation drain limit: env DRAIN_FIRST_FETCH_LIMIT, default 5
 * per design doc Section "Bulk-add handling".
 *
 * Design reference: dotfiles/docs/registry-to-ingestion-handoff-design-2026-05-10.md
 */

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_DRAIN_LIMIT = 5;
const MAX_RETRY_ATTEMPTS = 3;

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function getAnonClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

interface PendingRow {
  id: string;
  source_id: string;
  attempt_count: number;
}

interface SourceRow {
  id: string;
  url: string;
  name: string;
  status: string | null;
  processing_paused: boolean | null;
  auto_run_enabled: boolean | null;
  tier: number | null;
  access_method: string | null;
  api_endpoint_url: string | null;
  api_auth_method: string | null;
  api_response_format: string | null;
  rss_feed_url: string | null;
}

interface DrainResultRow {
  pending_id: string;
  source_id: string;
  source_url?: string;
  outcome: "success" | "error" | "skipped" | "retried";
  error?: string;
  agent_status?: number;
}

/**
 * Mint a one-shot Supabase access_token for the worker-designated
 * admin email. Returns null on any failure; caller falls back to
 * marking queue rows as 'error' so the next cron tick retries.
 */
async function mintWorkerAccessToken(
  serviceClient: SupabaseClient
): Promise<string | null> {
  const email =
    process.env.DRAIN_WORKER_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "jasonlosh@hotmail.com";

  try {
    const { data: linkData, error: linkErr } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) {
      console.warn(`[drain-first-fetch] generateLink failed: ${linkErr.message}`);
      return null;
    }
    // Extract email_otp from generateLink response. Type assertion
    // because the SDK does not expose properties.email_otp in its
    // public types but it is present in the response payload.
    const props = (linkData as unknown as { properties?: { email_otp?: string } })?.properties;
    const otp = props?.email_otp;
    if (!otp) {
      console.warn("[drain-first-fetch] no email_otp in generateLink response");
      return null;
    }

    const anon = getAnonClient();
    const { data: sessionData, error: vErr } = await anon.auth.verifyOtp({
      email,
      token: otp,
      type: "magiclink",
    });
    if (vErr) {
      console.warn(`[drain-first-fetch] verifyOtp failed: ${vErr.message}`);
      return null;
    }
    return sessionData?.session?.access_token ?? null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[drain-first-fetch] mintWorkerAccessToken threw: ${msg}`);
    return null;
  }
}

/**
 * Lightweight pre-fetch + Haiku classify so the seed stub can carry
 * title/summary/priority/etc. instead of seed defaults. Returns null
 * on any failure; the caller falls back to a bare stub so the queue
 * lifecycle still progresses (the Sonnet brief from /api/agent/run is
 * the primary value, the Haiku enrichment is a quality boost).
 *
 * Uses the same access_method routing as /api/agent/run so api/rss
 * sources do not hit Browserless unnecessarily.
 */
async function preFetchAndClassify(
  source: SourceRow
): Promise<HaikuEnrichment | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn("[drain-first-fetch] ANTHROPIC_API_KEY not set; bare stub fallback");
    return null;
  }
  const method = (source.access_method ?? "html_scrape").toLowerCase();
  try {
    let text: string;
    if (method === "api") {
      const r = await apiFetch(
        {
          url: source.url,
          api_endpoint_url: source.api_endpoint_url,
          api_auth_method: source.api_auth_method,
          api_response_format: source.api_response_format,
        },
        { maxTextLength: 8000 }
      );
      text = r.text;
    } else if (method === "rss") {
      const r = await rssFetch(
        { url: source.url, rss_feed_url: source.rss_feed_url },
        { maxTextLength: 8000 }
      );
      text = r.text;
    } else {
      const r = await browserlessRender(source.url, { maxTextLength: 8000 });
      text = r.text;
    }
    if (!text || text.length < 80) {
      console.warn(
        `[drain-first-fetch] pre-fetch returned short text (${text?.length ?? 0} chars) for ${source.url}; bare stub fallback`
      );
      return null;
    }
    const cls = await firstFetchClassify(
      {
        source_id: source.id,
        source_url: source.url,
        source_name: source.name,
        source_tier: source.tier,
        text,
      },
      ANTHROPIC_API_KEY
    );
    if (!cls.ok) {
      console.warn(`[drain-first-fetch] Haiku classify failed for ${source.url}: ${cls.error}`);
      return null;
    }
    return {
      title: cls.result.title_candidate,
      summary: cls.result.summary,
      severity: cls.result.severity,
      priority: cls.result.priority,
      urgency_tier: cls.result.urgency_tier,
      item_type: cls.result.item_type,
      topic_tags: cls.result.topic_tags,
      jurisdictions: cls.result.jurisdictions,
      cost_usd_estimated: cls.result.cost_usd_estimated,
    };
  } catch (e: unknown) {
    let detail = "";
    if (e instanceof BrowserlessError || e instanceof ApiFetchError || e instanceof RssFetchError) {
      detail = ` (status=${e.status ?? "?"}, ms=${e.renderMs ?? "?"})`;
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[drain-first-fetch] pre-fetch threw for ${source.url}: ${msg}${detail}`);
    return null;
  }
}

interface HaikuEnrichment {
  title: string;
  summary: string;
  severity: string;
  priority: string;
  urgency_tier: string;
  item_type: string;
  topic_tags: string[];
  jurisdictions: string[];
  cost_usd_estimated: number;
}

/**
 * Seed an intelligence_items row so /api/agent/run's pre-condition
 * (must find a row matching source_url) passes. When `enrichment` is
 * provided the row carries Haiku-populated title/summary/priority/etc.
 * When `enrichment` is null the row falls back to the legacy bare-stub
 * shape (title=source.name, summary='') so the queue still progresses.
 * Returns true on success or if a row already exists.
 */
async function seedStubIntelligenceItem(
  supabase: SupabaseClient,
  source: SourceRow,
  enrichment: HaikuEnrichment | null
): Promise<{ ok: boolean; itemId?: string; error?: string }> {
  // Defensive: if a row already exists for this source_url, the agent
  // route will pick it up. Re-check here so we do not insert a
  // duplicate row.
  const { data: existing } = await supabase
    .from("intelligence_items")
    .select("id")
    .eq("source_url", source.url)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, itemId: existing.id };
  }

  const seedRow: Record<string, unknown> = {
    source_id: source.id,
    source_url: source.url,
    domain: 1,
    status: "monitoring",
    pipeline_stage: "draft",
  };

  if (enrichment) {
    seedRow.title = (enrichment.title || source.name || source.url).slice(0, 200);
    seedRow.summary = enrichment.summary;
    seedRow.severity = enrichment.severity;
    seedRow.priority = enrichment.priority;
    seedRow.urgency_tier = enrichment.urgency_tier;
    seedRow.item_type = enrichment.item_type;
    seedRow.topic_tags = enrichment.topic_tags;
    seedRow.jurisdictions = enrichment.jurisdictions;
  } else {
    seedRow.title = source.name || source.url;
  }

  const { data, error } = await supabase
    .from("intelligence_items")
    .insert(seedRow)
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "insert returned no data" };
  }
  return { ok: true, itemId: data.id };
}

export async function POST(request: NextRequest) {
  // Worker-secret auth.
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional body: { limit?: number }
  let limit = DEFAULT_DRAIN_LIMIT;
  try {
    const body = await request.json().catch(() => ({}));
    const envLimit = parseInt(process.env.DRAIN_FIRST_FETCH_LIMIT || "", 10);
    const bodyLimit = typeof body?.limit === "number" ? body.limit : null;
    if (bodyLimit && bodyLimit > 0) {
      limit = Math.min(bodyLimit, 50);
    } else if (!isNaN(envLimit) && envLimit > 0) {
      limit = Math.min(envLimit, 50);
    }
  } catch {
    // Empty body is fine.
  }

  const supabase = getServiceClient();

  // Pickup query: oldest queued first.
  const { data: pending, error: pickErr } = await supabase
    .from("pending_first_fetch")
    .select("id, source_id, attempt_count")
    .eq("status", "queued")
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (pickErr) {
    return NextResponse.json(
      { error: `pickup query failed: ${pickErr.message}` },
      { status: 500 }
    );
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({
      message: "No pending first-fetch rows",
      drained: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      skipped: 0,
      results: [],
    });
  }

  // Mint one access_token for the whole batch.
  const accessToken = await mintWorkerAccessToken(supabase);
  if (!accessToken) {
    // Could not authenticate to /api/agent/run. Leave queue rows as
    // 'queued' (do not consume an attempt) so the next cron tick can
    // retry once the auth issue is resolved.
    return NextResponse.json(
      {
        error: "Failed to mint worker access token; rows left as queued",
        drained: 0,
        succeeded: 0,
        failed: 0,
        retried: 0,
        skipped: 0,
      },
      { status: 500 }
    );
  }

  const baseUrl = process.env.APP_URL || new URL(request.url).origin;
  const results: DrainResultRow[] = [];
  let succeeded = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  // Serial loop: respects the design doc's per-invocation Anthropic
  // concurrency consideration ("drain worker should serialise within
  // an invocation, existing pattern in /api/admin/sources/verify").
  for (const row of pending as PendingRow[]) {
    const result: DrainResultRow = {
      pending_id: row.id,
      source_id: row.source_id,
      outcome: "error",
    };

    // Mark fetching, increment attempt_count.
    const newAttemptCount = (row.attempt_count ?? 0) + 1;
    const { error: claimErr } = await supabase
      .from("pending_first_fetch")
      .update({
        status: "fetching",
        attempt_count: newAttemptCount,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "queued"); // optimistic guard against double-claim

    if (claimErr) {
      result.error = `claim failed: ${claimErr.message}`;
      results.push(result);
      failed++;
      continue;
    }

    // Look up source row. Includes access_method routing fields so the
    // pre-fetch below can mirror /api/agent/run's fetchByAccessMethod.
    const { data: source, error: srcErr } = (await supabase
      .from("sources")
      .select(
        "id, url, name, status, processing_paused, auto_run_enabled, tier, access_method, api_endpoint_url, api_auth_method, api_response_format, rss_feed_url"
      )
      .eq("id", row.source_id)
      .maybeSingle()) as { data: SourceRow | null; error: { message: string } | null };

    if (srcErr || !source) {
      const msg = srcErr?.message || "source row not found";
      await supabase
        .from("pending_first_fetch")
        .update({ status: "error", last_error_text: msg })
        .eq("id", row.id);
      result.error = msg;
      results.push(result);
      failed++;
      continue;
    }

    result.source_url = source.url;

    // Defensive eligibility re-check: between enqueue and drain a
    // source could have been paused or disabled. Skip terminally so
    // we do not waste retries.
    if (
      source.status !== "active" ||
      source.processing_paused === true ||
      source.auto_run_enabled === false
    ) {
      const reason = `Source no longer eligible (status=${source.status}, paused=${source.processing_paused}, auto_run=${source.auto_run_enabled})`;
      await supabase
        .from("pending_first_fetch")
        .update({ status: "skipped", last_error_text: reason })
        .eq("id", row.id);
      result.outcome = "skipped";
      result.error = reason;
      results.push(result);
      skipped++;
      continue;
    }

    // Pre-fetch + Haiku classify so the seed carries title/summary/
    // priority/etc. instead of seed defaults. Returns null on any
    // failure; the seed below falls back to the legacy bare-stub
    // shape so the queue lifecycle still progresses (the Sonnet brief
    // from /api/agent/run is the primary value; Haiku is enrichment).
    const enrichment = await preFetchAndClassify(source);

    // Seed stub intelligence_items row so /api/agent/run can find one.
    const seed = await seedStubIntelligenceItem(supabase, source, enrichment);
    if (!seed.ok) {
      const msg = `Stub seed failed: ${seed.error}`;
      const shouldRetry = newAttemptCount < MAX_RETRY_ATTEMPTS;
      await supabase
        .from("pending_first_fetch")
        .update({
          status: shouldRetry ? "queued" : "error",
          last_error_text: msg,
        })
        .eq("id", row.id);
      result.error = msg;
      result.outcome = shouldRetry ? "retried" : "error";
      results.push(result);
      if (shouldRetry) retried++;
      else failed++;
      continue;
    }

    // Forward to /api/agent/run with the minted Bearer token.
    let agentResp: Response;
    try {
      agentResp = await fetch(`${baseUrl}/api/agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sourceUrl: source.url }),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const errorMsg = `agent fetch threw: ${msg}`;
      const shouldRetry = newAttemptCount < MAX_RETRY_ATTEMPTS;
      await supabase
        .from("pending_first_fetch")
        .update({
          status: shouldRetry ? "queued" : "error",
          last_error_text: errorMsg,
        })
        .eq("id", row.id);
      result.error = errorMsg;
      result.outcome = shouldRetry ? "retried" : "error";
      results.push(result);
      if (shouldRetry) retried++;
      else failed++;
      continue;
    }

    result.agent_status = agentResp.status;

    if (agentResp.ok) {
      await supabase
        .from("pending_first_fetch")
        .update({ status: "done", last_error_text: null })
        .eq("id", row.id);
      result.outcome = "success";
      results.push(result);
      succeeded++;
      continue;
    }

    // Non-2xx from agent route. Read body for the error message.
    let errBody: Record<string, unknown> = {};
    try {
      errBody = await agentResp.json();
    } catch {
      // Non-JSON; ignore.
    }
    const errStr = (errBody?.error as string | undefined) || `agent returned ${agentResp.status}`;

    // Classification per design doc Section "Failure modes":
    // - 4xx with terminal semantics (404, 412): mark error, do not retry.
    //   The source needs operator action.
    // - 5xx and 429: retry up to MAX_RETRY_ATTEMPTS.
    const isTerminalClientError =
      agentResp.status === 404 || agentResp.status === 412 || agentResp.status === 403;
    const shouldRetry =
      !isTerminalClientError && newAttemptCount < MAX_RETRY_ATTEMPTS;

    await supabase
      .from("pending_first_fetch")
      .update({
        status: shouldRetry ? "queued" : "error",
        last_error_text: `agent ${agentResp.status}: ${errStr}`.slice(0, 500),
      })
      .eq("id", row.id);

    result.error = errStr;
    result.outcome = shouldRetry ? "retried" : "error";
    results.push(result);
    if (shouldRetry) retried++;
    else failed++;
  }

  return NextResponse.json({
    message: `Drained ${pending.length} pending first-fetch rows`,
    drained: pending.length,
    succeeded,
    failed,
    retried,
    skipped,
    results,
  });
}
