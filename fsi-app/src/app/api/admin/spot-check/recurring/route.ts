// POST /api/admin/spot-check/recurring
//
// Gap 1 — recurring monthly spot-check. Hit by GitHub Actions
// (`.github/workflows/spot-check-monthly.yml`) on the 1st of each month at
// 03:00 UTC.
//
// Behaviour
// ──────────────────────────────────────────────────────────────────────────
// 1. Worker-secret auth (x-worker-secret header). NOT a user-facing route.
// 2. 4h cooldown gate (admin_action_cooldowns), matches /api/admin/scan
//    semantics. Prevents accidental double-runs.
// 3. Pulls 20 random `verification_tier='H'` rows from the past 30 days
//    (joined to sources). Smaller window than the W2.E "auto-approved
//    awaiting spot-check" UI surface (7 days) because the recurring
//    monthly cron is sampling for calibration drift, not in-flight review.
// 4. Re-runs the SAME Haiku classifier the pipeline used (model + prompt
//    imported from src/lib/sources/verification.ts — KNOWN_AUTHORITATIVE_
//    PATTERNS and VERIFICATION_HAIKU_SYSTEM_PROMPT are exported from there).
// 5. Computes verdicts at the CURRENT THRESHOLDS (75/55 post-Gap-1).
// 6. Inserts a `source_trust_events` row of type `manual_review` per
//    sampled source so the run is forensically logged (and queryable).
// 7. Returns JSON with sample stats. If false_positive_rate_pct > 5,
//    returns HTTP 502 so the GitHub workflow surfaces a failure alert in
//    the Actions UI (the workflow checks the status code, not the body).
//
// Cost: 20 × ~$0.001 Haiku ≈ $0.02 per run.
//
// Schema dependency: relies on `admin_action_cooldowns` (migration 024)
// for the cooldown gate. No new schema is added by this route.
//
// Why not a new `spot_check_runs` table?
// ──────────────────────────────────────────────────────────────────────────
// The simplest forensic record uses existing tables:
//   - per-source `source_trust_events` rows (event_type='manual_review')
//     capture each Haiku re-classification + verdict
//   - `admin_action_cooldowns` row keys 'admin_spot_check_recurring' is
//     stamped on each successful run with `metadata` carrying the summary
// This avoids adding a new table for a once-a-month run. If aggregate
// run history becomes a UI need, a `spot_check_runs` table is a
// follow-up — not silently added here.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  VERIFICATION_HAIKU_SYSTEM_PROMPT,
  __internals,
} from "@/lib/sources/verification";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const COOLDOWN_KEY = "admin_spot_check_recurring";
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h, matches /api/admin/scan
const SAMPLE_SIZE = 20;
const LOOKBACK_DAYS = 30;
const FP_RATE_ALERT_THRESHOLD_PCT = 5;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HEAD_TIMEOUT_MS = 8_000;
const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;
const MAX_REDIRECTS = 3;

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

type SampledSource = {
  source_id: string;
  name: string;
  url: string;
  tier: number;
  original_relevance: number | null;
  original_freight: number | null;
  original_trust_tier: string | null;
};

type HaikuOk = {
  ok: true;
  result: {
    ai_relevance_score: number;
    ai_freight_score: number;
    ai_trust_tier: "T1" | "T2" | "T3";
    rationale: string;
  };
};
type HaikuErr = { ok: false; error: string };

async function checkReachability(
  url: string
): Promise<{ ok: boolean; status: number | null; finalUrl: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    let current = url;
    let resp: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      resp = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "CarosLedge-SpotCheck/1.0" },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }
    clearTimeout(timer);
    const status = resp?.status ?? null;
    const ok =
      status !== null && ((status >= 200 && status < 300) || status === 405);
    return { ok, status, finalUrl: current };
  } catch {
    clearTimeout(timer);
    return { ok: false, status: null, finalUrl: null };
  }
}

async function fetchContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CarosLedge-SpotCheck/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return "";
    const html = await resp.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
  } catch {
    clearTimeout(timer);
    return "";
  }
}

async function classifyWithHaiku(
  name: string,
  url: string,
  contentText: string,
  apiKey: string
): Promise<HaikuOk | HaikuErr> {
  const userMessage = `Candidate URL: ${url}
Candidate name: ${name}
Discovered for jurisdiction: (recurring-spot-check)

Content excerpt (truncated to ~6000 chars):
---
${contentText.slice(0, CONTENT_MAX_CHARS)}
---

Output the JSON object only.`;

  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system: VERIFICATION_HAIKU_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "no JSON in model output" };
    const parsed = JSON.parse(m[0]);
    if (
      typeof parsed.ai_relevance_score !== "number" ||
      typeof parsed.ai_freight_score !== "number" ||
      typeof parsed.ai_trust_tier !== "string" ||
      !["T1", "T2", "T3"].includes(parsed.ai_trust_tier) ||
      typeof parsed.rationale !== "string"
    ) {
      return { ok: false, error: "malformed classification shape" };
    }
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      ok: true,
      result: {
        ai_relevance_score: clamp(parsed.ai_relevance_score),
        ai_freight_score: clamp(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function classifyVerdict(input: {
  reachable: boolean;
  relevance: number | null;
  freight: number | null;
}): "confirm-H" | "should-be-M" | "should-be-L" | "unreachable" {
  const T = __internals.THRESHOLDS;
  if (!input.reachable) return "unreachable";
  if (input.relevance == null || input.freight == null) return "unreachable";
  if (input.relevance < T.AI_RELEVANCE_M || input.freight < T.AI_FREIGHT_M) {
    return "should-be-L";
  }
  if (input.relevance < T.AI_RELEVANCE_H || input.freight < T.AI_FREIGHT_H) {
    return "should-be-M";
  }
  return "confirm-H";
}

async function fetchSample(supabase: SupabaseClient): Promise<SampledSource[]> {
  const lookbackISO = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("source_verifications")
    .select(
      `ai_relevance_score, ai_freight_score, ai_trust_tier, verification_tier, created_at, resulting_source_id,
       sources:resulting_source_id ( id, name, url, tier, status )`
    )
    .eq("verification_tier", "H")
    .gte("created_at", lookbackISO)
    .not("resulting_source_id", "is", null);

  if (error) {
    throw new Error(`failed to query source_verifications: ${error.message}`);
  }

  type Row = {
    ai_relevance_score: number | null;
    ai_freight_score: number | null;
    ai_trust_tier: string | null;
    sources: { id: string; name: string; url: string; tier: number; status: string } | null;
  };

  // PostgREST single-FK joins return a single embedded object; cast through
  // unknown to bridge the SupabaseClient's broader inferred shape.
  const rows = ((data ?? []) as unknown) as Row[];
  const eligible = rows.filter(
    (r) => r.sources && r.sources.id && r.sources.status === "active"
  );

  // Fisher-Yates shuffle, take first N.
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));

  return sample.map((row) => ({
    source_id: row.sources!.id,
    name: row.sources!.name,
    url: row.sources!.url,
    tier: row.sources!.tier,
    original_relevance: row.ai_relevance_score,
    original_freight: row.ai_freight_score,
    original_trust_tier: row.ai_trust_tier,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// POST handler
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1) Worker-secret auth
  const secret = request.headers.get("x-worker-secret");
  if (secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getServiceClient();

  // 2) 4h cooldown gate
  const { data: cooldownRow } = await supabase
    .from("admin_action_cooldowns")
    .select("last_triggered_at")
    .eq("action_key", COOLDOWN_KEY)
    .maybeSingle();

  if (cooldownRow?.last_triggered_at) {
    const elapsed = Date.now() - new Date(cooldownRow.last_triggered_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      const retryAfterSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        {
          error: "Recurring spot-check is on cooldown",
          retry_after_seconds: retryAfterSec,
          last_triggered_at: cooldownRow.last_triggered_at,
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  }

  // 3) Sample
  let sample: SampledSource[];
  try {
    sample = await fetchSample(supabase);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  if (sample.length === 0) {
    // Stamp cooldown anyway so we don't try again for 4h.
    await supabase.from("admin_action_cooldowns").upsert(
      {
        action_key: COOLDOWN_KEY,
        last_triggered_at: new Date().toISOString(),
        triggered_by: null,
        metadata: { sample_size: 0, note: "no eligible sources in lookback window" },
      },
      { onConflict: "action_key" }
    );
    return NextResponse.json({
      sample_size: 0,
      confirm_h: 0,
      should_be_m: 0,
      should_be_l: 0,
      unreachable: 0,
      false_positive_rate_pct: 0,
      recommendations: [
        `No eligible tier-H verifications in the past ${LOOKBACK_DAYS} days — nothing to spot-check.`,
      ],
    });
  }

  // 4) Re-classify each source
  const results: Array<{
    source_id: string;
    name: string;
    url: string;
    original_relevance: number | null;
    original_freight: number | null;
    new_relevance: number | null;
    new_freight: number | null;
    new_trust_tier: string | null;
    verdict: "confirm-H" | "should-be-M" | "should-be-L" | "unreachable";
    reachable: boolean;
    rationale: string;
  }> = [];

  for (const row of sample) {
    const reach = await checkReachability(row.url);
    let contentText = "";
    if (reach.ok) {
      contentText = await fetchContent(row.url);
    }
    let newRelevance: number | null = null;
    let newFreight: number | null = null;
    let newTrustTier: string | null = null;
    let rationale = "";
    if (contentText.length > 0) {
      const cls = await classifyWithHaiku(row.name, row.url, contentText, ANTHROPIC_API_KEY);
      if (cls.ok) {
        newRelevance = cls.result.ai_relevance_score;
        newFreight = cls.result.ai_freight_score;
        newTrustTier = cls.result.ai_trust_tier;
        rationale = cls.result.rationale;
      }
    }

    const verdict = classifyVerdict({
      reachable: reach.ok,
      relevance: newRelevance,
      freight: newFreight,
    });

    // Forensic per-source row in source_trust_events.
    await supabase
      .from("source_trust_events")
      .insert({
        source_id: row.source_id,
        event_type: "manual_review",
        details: {
          subtype: "recurring_spot_check",
          sample_run_at: new Date().toISOString(),
          original_scores: {
            relevance: row.original_relevance,
            freight: row.original_freight,
            trust_tier: row.original_trust_tier,
          },
          new_scores: {
            relevance: newRelevance,
            freight: newFreight,
            trust_tier: newTrustTier,
            rationale,
          },
          verdict,
          thresholds: __internals.THRESHOLDS,
          reachable: reach.ok,
          head_status: reach.status,
        },
        created_by: "system",
      })
      .then(
        () => undefined,
        () => undefined
      ); // best-effort — don't fail the run for an audit-log write blip

    results.push({
      source_id: row.source_id,
      name: row.name,
      url: row.url,
      original_relevance: row.original_relevance,
      original_freight: row.original_freight,
      new_relevance: newRelevance,
      new_freight: newFreight,
      new_trust_tier: newTrustTier,
      verdict,
      reachable: reach.ok,
      rationale,
    });
  }

  // 5) Aggregate
  const counts = {
    confirm_h: results.filter((r) => r.verdict === "confirm-H").length,
    should_be_m: results.filter((r) => r.verdict === "should-be-M").length,
    should_be_l: results.filter((r) => r.verdict === "should-be-L").length,
    unreachable: results.filter((r) => r.verdict === "unreachable").length,
  };
  const fp = counts.should_be_m + counts.should_be_l;
  const fpRate = results.length > 0 ? (fp / results.length) * 100 : 0;
  const fpRateRounded = Number(fpRate.toFixed(2));

  const recommendations: string[] = [];
  if (fpRate > FP_RATE_ALERT_THRESHOLD_PCT) {
    recommendations.push(
      `False-positive rate ${fpRateRounded}% exceeds the ${FP_RATE_ALERT_THRESHOLD_PCT}% target — recommend full audit and threshold review.`
    );
  }
  if (counts.unreachable > 0) {
    recommendations.push(
      `${counts.unreachable} source(s) were unreachable; investigate for stale URLs or rate-limit issues.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      `False-positive rate ${fpRateRounded}% is within the ${FP_RATE_ALERT_THRESHOLD_PCT}% target. Calibration holds.`
    );
  }

  // 6) Stamp cooldown ledger with summary metadata.
  await supabase.from("admin_action_cooldowns").upsert(
    {
      action_key: COOLDOWN_KEY,
      last_triggered_at: new Date().toISOString(),
      triggered_by: null,
      metadata: {
        sample_size: results.length,
        ...counts,
        false_positive_rate_pct: fpRateRounded,
        thresholds: __internals.THRESHOLDS,
      },
    },
    { onConflict: "action_key" }
  );

  const responseBody = {
    sample_size: results.length,
    confirm_h: counts.confirm_h,
    should_be_m: counts.should_be_m,
    should_be_l: counts.should_be_l,
    unreachable: counts.unreachable,
    false_positive_rate_pct: fpRateRounded,
    recommendations,
    results: results.map((r) => ({
      source_id: r.source_id,
      name: r.name,
      url: r.url,
      original: { relevance: r.original_relevance, freight: r.original_freight },
      new: {
        relevance: r.new_relevance,
        freight: r.new_freight,
        trust_tier: r.new_trust_tier,
      },
      verdict: r.verdict,
      rationale: r.rationale,
    })),
  };

  // 7) If FP rate > threshold, return 502 so the workflow surfaces a fail.
  const status = fpRate > FP_RATE_ALERT_THRESHOLD_PCT ? 502 : 200;
  return NextResponse.json(responseBody, { status });
}
