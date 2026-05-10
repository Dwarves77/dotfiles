/**
 * wave1-cold-start.mjs, Wave 1a foundation cold-start backfill.
 *
 * One-time script. After Wave 1a foundation migrations are applied,
 * this script walks every active source once, persists the raw
 * fetch, classifies it (Haiku) when no intelligence_items row yet
 * exists for that source, then flips auto_run_enabled=false on all
 * 718 active sources so the scheduled GHA worker has nothing to do
 * until operators explicitly re-enable a source.
 *
 * Per-iteration HARD HALT at $200 cumulative spend (sum of
 * agent_runs.cost_usd_estimated rows where created_at >= cold_start
 * start). Estimated wall time at concurrency 5 is approximately 90
 * minutes; estimated total cost is approximately $55.
 *
 * Run with --dry-run first.
 *   node scripts/wave1-cold-start.mjs --dry-run
 *   node scripts/wave1-cold-start.mjs
 *
 * NOT auto-run by the foundation PR. The PR ships only the script;
 * the orchestrator runs it after migrations 052-059 are applied.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { checkFetchQuality } from "./lib/fetch-quality.mjs";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const FSI_APP_ROOT = resolve(__dirname, "..");
const DOTFILES_ROOT = resolve(FSI_APP_ROOT, "..");
process.loadEnvFile(resolve(FSI_APP_ROOT, ".env.local"));

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
// CONCURRENCY 1 (was 5): the Browserless free tier returned 429 on 91% of
// requests at concurrency 5 during the partial cold-start of 2026-05-10.
// Free tier supports only ~1 concurrent session. Single-thread the run.
const CONCURRENCY = 1;
// Pause between Browserless calls to be polite to the free tier, in addition
// to the natural latency of the render itself. Has no effect on api/rss
// sources which use plain fetch.
const INTER_BROWSERLESS_DELAY_MS = 1000;
const HARD_HALT_USD = 200;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!DRY_RUN && (!ANTHROPIC_API_KEY || !BROWSERLESS_API_KEY)) {
  console.error("Missing ANTHROPIC_API_KEY or BROWSERLESS_API_KEY (required outside --dry-run)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = resolve(DOTFILES_ROOT, "docs");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "wave1-cold-start-log.jsonl");

const COLD_START_AT = new Date().toISOString();
console.log(`[cold-start] started ${COLD_START_AT} dry_run=${DRY_RUN}`);

function logLine(obj) {
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n", "utf8");
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const SONNET_INPUT_PER_MTOK_USD = 3.0;
const SONNET_OUTPUT_PER_MTOK_USD = 15.0;
const HAIKU_INPUT_PER_MTOK_USD = 1.0;
const HAIKU_OUTPUT_PER_MTOK_USD = 5.0;

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function gzipString(input) {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browserlessRender(url) {
  // Retry on 429 with exponential backoff. Browserless free tier is the
  // single biggest source of cold-start failures.
  const backoffsMs = [5000, 15000, 45000];
  let lastErr = null;
  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    const start = Date.now();
    let res;
    try {
      res = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          waitForSelector: { selector: "body", timeout: 5000 },
          gotoOptions: { waitUntil: "networkidle2", timeout: 15000 },
        }),
      });
    } catch (e) {
      lastErr = new Error(`Browserless fetch threw: ${e.message}`);
      if (attempt < backoffsMs.length) { await sleep(backoffsMs[attempt]); continue; }
      throw lastErr;
    }
    const renderMs = Date.now() - start;
    if (res.status === 429) {
      const body = await res.text();
      lastErr = new Error(`Browserless 429 (attempt ${attempt + 1}): ${body.slice(0, 100)} (${renderMs}ms)`);
      if (attempt < backoffsMs.length) {
        await sleep(backoffsMs[attempt]);
        continue;
      }
      throw lastErr;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Browserless ${res.status}: ${body.slice(0, 200)} (${renderMs}ms)`);
    }
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Politeness pause between successful Browserless calls.
    await sleep(INTER_BROWSERLESS_DELAY_MS);
    return { html, text, status: res.status, renderMs };
  }
  throw lastErr ?? new Error("Browserless: exhausted retries");
}

async function apiFetch(source) {
  const endpoint = source.api_endpoint_url ?? source.url;
  const start = Date.now();
  const res = await fetch(endpoint, {
    method: "GET",
    headers: { "User-Agent": "CarosLedge-Ingest/1.0", Accept: "application/json, application/xml, */*;q=0.5" },
  });
  const renderMs = Date.now() - start;
  if (!res.ok) throw new Error(`API ${res.status} (${renderMs}ms)`);
  const html = await res.text();
  return { html, text: html.slice(0, 80000), status: res.status, renderMs };
}

async function rssFetch(source) {
  const url = source.rss_feed_url ?? source.url;
  const start = Date.now();
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "CarosLedge-Ingest/1.0", Accept: "application/rss+xml, application/atom+xml, */*;q=0.5" },
  });
  const renderMs = Date.now() - start;
  if (!res.ok) throw new Error(`RSS ${res.status} (${renderMs}ms)`);
  const html = await res.text();
  return { html, text: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80000), status: res.status, renderMs };
}

async function fetchByAccessMethod(source) {
  const method = (source.access_method ?? "html_scrape").toLowerCase();
  if (method === "api") return apiFetch(source);
  if (method === "rss") return rssFetch(source);
  return browserlessRender(source.url);
}

async function persistRaw(sourceId, fetchResult) {
  const content_hash = await sha256Hex(fetchResult.html);
  const yyyy = new Date().toISOString().slice(0, 10);
  const file_path = `${sourceId}/${yyyy}/${content_hash}.html.gz`;
  const gz = await gzipString(fetchResult.html);
  const upload = await supabase.storage.from("raw_fetches").upload(file_path, gz, {
    contentType: "application/gzip",
    upsert: true,
  });
  if (upload.error) throw new Error(`storage upload failed: ${upload.error.message}`);
  const { data, error } = await supabase
    .from("raw_fetches")
    .upsert(
      {
        source_id: sourceId,
        content_hash,
        file_path,
        http_status: fetchResult.status,
        html_bytes: fetchResult.html.length,
      },
      { onConflict: "source_id,content_hash" }
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`raw_fetches insert failed: ${error?.message ?? "no data"}`);
  return { raw_fetch_id: data.id, content_hash };
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_SYSTEM = `You are a content classifier. Given source URL, source metadata, and a content excerpt, return STRICT JSON {"item_type":"...","severity":"...","priority":"...","urgency_tier":"...","topic_tags":[],"jurisdictions":[],"title_candidate":"...","summary":"...","rationale":"..."}.

item_type: regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative
severity: ACTION REQUIRED|COST ALERT|WINDOW CLOSING|COMPETITIVE EDGE|MONITORING
priority: CRITICAL|HIGH|MODERATE|LOW
urgency_tier: watch|elevated|stable|informational

Output JSON only.`;

async function haikuClassify(source, fetchResult) {
  const text = fetchResult.text.slice(0, 6000);
  const userMessage = `Source URL: ${source.url}
Source id: ${source.id}
Source tier: ${source.tier ?? "unknown"}
Content excerpt:
---
${text}
---
Output the JSON object only.`;
  const start = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 800,
      system: HAIKU_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Haiku ${res.status}: ${body.slice(0, 200)} (${ms}ms)`);
  }
  const data = await res.json();
  const inputTokens = data?.usage?.input_tokens ?? 0;
  const outputTokens = data?.usage?.output_tokens ?? 0;
  const cost_usd_estimated = Number(
    ((inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK_USD +
      (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK_USD).toFixed(6)
  );
  const blocks = data.content ?? [];
  const rawText = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = rawText.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in Haiku output");
  const parsed = JSON.parse(m[0]);
  return { ...parsed, cost_usd_estimated, render_ms: ms };
}

async function getCostSoFar() {
  const { data, error } = await supabase
    .from("agent_runs")
    .select("cost_usd_estimated")
    .gte("created_at", COLD_START_AT);
  if (error) {
    console.warn(`[cold-start] cost lookup error: ${error.message}`);
    return 0;
  }
  return (data ?? []).reduce((sum, r) => sum + Number(r.cost_usd_estimated ?? 0), 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Concurrency limiter (lightweight inline p-limit)
// ────────────────────────────────────────────────────────────────────────────

function makeLimiter(concurrency) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (v) => {
        active--;
        resolve(v);
        next();
      },
      (err) => {
        active--;
        reject(err);
        next();
      }
    );
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const { data: sources, error: srcErr } = await supabase
    .from("sources")
    .select(
      "id, name, url, tier, access_method, api_endpoint_url, api_auth_method, api_response_format, rss_feed_url"
    )
    .eq("status", "active");
  if (srcErr) {
    console.error(`[cold-start] sources fetch error: ${srcErr.message}`);
    process.exit(2);
  }
  console.log(`[cold-start] sources count = ${sources.length}`);

  const { data: itemsRows, error: itemsErr } = await supabase
    .from("intelligence_items")
    .select("source_id");
  if (itemsErr) {
    console.error(`[cold-start] intelligence_items fetch error: ${itemsErr.message}`);
    process.exit(2);
  }
  const itemsBySourceId = new Set(
    (itemsRows ?? []).filter((r) => r.source_id).map((r) => r.source_id)
  );
  console.log(`[cold-start] sources already with items = ${itemsBySourceId.size}`);

  // Resume: skip sources that already have a success or backfill_only
  // agent_runs row in the last 24h (e.g., from a prior partial cold-start).
  // Sources whose only agent_runs rows are status='error' or 'running' get
  // re-attempted, which is the desired behavior.
  const resumeCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentSuccessRows, error: recentErr } = await supabase
    .from("agent_runs")
    .select("source_id, status")
    .in("status", ["success", "backfill_only"])
    .gte("created_at", resumeCutoff);
  if (recentErr) {
    console.warn(`[cold-start] resume query failed: ${recentErr.message}, will re-process all`);
  }
  const alreadyCompleted = new Set((recentSuccessRows ?? []).map((r) => r.source_id).filter(Boolean));
  console.log(`[cold-start] resume: ${alreadyCompleted.size} sources already succeeded in last 24h, skipping`);

  // Clean up any 'running' rows from prior killed runs so they do not pollute
  // the cost meter or status distribution.
  const { error: cleanupErr } = await supabase
    .from("agent_runs")
    .update({ status: "error", errors: ["killed-by-orchestrator-restart"] })
    .eq("status", "running")
    .lt("started_at", new Date().toISOString());
  if (cleanupErr) console.warn(`[cold-start] cleanup of stale 'running' rows failed: ${cleanupErr.message}`);

  let halted = false;
  let processed = 0;
  let succeeded = 0;
  let backfillOnly = 0;
  let errors = 0;

  const limit = makeLimiter(CONCURRENCY);

  const tasks = sources.map((source) =>
    limit(async () => {
      if (halted) return;
      if (alreadyCompleted.has(source.id)) {
        return;
      }
      const cost = await getCostSoFar();
      if (cost > HARD_HALT_USD) {
        if (!halted) {
          halted = true;
          console.error(`[cold-start] HARD HALT, cumulative spend ${cost.toFixed(2)} > ${HARD_HALT_USD}`);
        }
        return;
      }
      processed++;
      let agentRunId = null;
      if (!DRY_RUN) {
        const { data: ar } = await supabase
          .from("agent_runs")
          .insert({ source_id: source.id, source_url: source.url, fetch_method: source.access_method ?? "html_scrape", status: "running" })
          .select("id")
          .single();
        agentRunId = ar?.id ?? null;
      }
      try {
        if (DRY_RUN) {
          logLine({ kind: "dry_run", source_id: source.id, url: source.url, access_method: source.access_method });
          return;
        }
        const fetched = await fetchByAccessMethod(source);
        // Fetch-quality pre-filter: drop Cloudflare blocks, CAPTCHA pages,
        // 404s, maintenance pages, and content-too-short bodies before any
        // LLM call. Skip persistRaw + classify + intelligence_items.insert
        // and continue to the next source. This is a normal skip path; the
        // outer error counter is not incremented.
        const quality = checkFetchQuality({
          html: fetched.html,
          text: fetched.text,
          httpStatus: fetched.status,
        });
        if (!quality.ok) {
          if (agentRunId) {
            await supabase
              .from("agent_runs")
              .update({
                ended_at: new Date().toISOString(),
                status: "skipped",
                fetch_status: fetched.status,
                fetch_html_bytes: fetched.html.length,
                fetch_render_ms: fetched.renderMs,
                errors: [{ kind: "fetch_quality_failed", reason: quality.reason }],
              })
              .eq("id", agentRunId);
          }
          logLine({
            kind: "fetch_quality_failed",
            source_id: source.id,
            url: source.url,
            reason: quality.reason,
          });
          return;
        }
        const persisted = await persistRaw(source.id, fetched);
        let costUsd = 0;
        let backfillNote = null;
        let insertedItemId = null;
        if (itemsBySourceId.has(source.id)) {
          backfillOnly++;
          backfillNote = "backfill_only";
        } else {
          const cls = await haikuClassify(source, fetched);
          costUsd = cls.cost_usd_estimated ?? 0;
          const { data: itemRow, error: itemErr } = await supabase
            .from("intelligence_items")
            .insert({
              title: (cls.title_candidate ?? source.name ?? source.url).slice(0, 200),
              domain: 1,
              source_id: source.id,
              source_url: source.url,
              severity: cls.severity ?? null,
              priority: cls.priority ?? "MODERATE",
              urgency_tier: cls.urgency_tier ?? null,
              item_type: cls.item_type ?? "regulation",
              topic_tags: cls.topic_tags ?? [],
              summary: cls.summary ?? "",
              jurisdictions: cls.jurisdictions ?? [],
            })
            .select("id")
            .single();
          if (itemErr) throw new Error(`intelligence_items insert failed: ${itemErr.message}`);
          insertedItemId = itemRow?.id ?? null;
        }
        if (agentRunId) {
          await supabase
            .from("agent_runs")
            .update({
              ended_at: new Date().toISOString(),
              status: "success",
              cost_usd_estimated: costUsd,
              fetch_status: fetched.status,
              fetch_html_bytes: fetched.html.length,
              fetch_render_ms: fetched.renderMs,
              raw_fetch_id: persisted.raw_fetch_id,
              intelligence_item_id: insertedItemId,
              errors: backfillNote ? [{ note: backfillNote }] : [],
            })
            .eq("id", agentRunId);
        }
        succeeded++;
        logLine({ kind: "success", source_id: source.id, url: source.url, raw_fetch_id: persisted.raw_fetch_id, backfill: !!backfillNote });
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        logLine({ kind: "error", source_id: source.id, url: source.url, error: msg });
        if (agentRunId) {
          await supabase
            .from("agent_runs")
            .update({
              ended_at: new Date().toISOString(),
              status: "error",
              errors: [{ kind: "exception", message: msg }],
            })
            .eq("id", agentRunId);
        }
      }
      if (processed % 25 === 0) {
        const c = await getCostSoFar();
        console.log(`[cold-start] processed=${processed}/${sources.length} success=${succeeded} backfill=${backfillOnly} errors=${errors} cost=$${c.toFixed(2)}`);
      }
    })
  );

  await Promise.all(tasks);

  // Kill switch: flip auto_run_enabled=false on every active source so
  // the GHA worker is dormant until operators re-enable a source.
  if (!DRY_RUN) {
    console.log("[cold-start] flipping auto_run_enabled=false on all active sources");
    const { error: killErr } = await supabase
      .from("sources")
      .update({ auto_run_enabled: false })
      .eq("status", "active");
    if (killErr) {
      console.error(`[cold-start] kill switch error: ${killErr.message}`);
    } else {
      const ids = sources.map((s) => s.id);
      const rows = ids.map((id) => ({
        source_id: id,
        action: "auto_run_disabled",
        actor: "cold_start",
        reason: "wave1a foundation cold start",
      }));
      const { error: logErr } = await supabase.from("ingestion_control_log").insert(rows);
      if (logErr) console.warn(`[cold-start] ingestion_control_log error: ${logErr.message}`);
    }
  }

  const finalCost = await getCostSoFar();
  console.log(`[cold-start] DONE processed=${processed} success=${succeeded} backfill=${backfillOnly} errors=${errors} cost=$${finalCost.toFixed(2)} halted=${halted}`);
}

main().catch((e) => {
  console.error("[cold-start] fatal", e);
  process.exit(3);
});
