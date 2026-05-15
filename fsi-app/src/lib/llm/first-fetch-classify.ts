// Shared first-fetch Haiku classifier for the Wave 1b drain worker and
// any other code path that needs to enrich a freshly-seeded
// intelligence_items stub with title/summary/priority/etc.
//
// Mirrors the prompt + JSON shape used by scripts/wave1-cold-start.mjs's
// inline haikuClassify (Wave 1a cold-start path). Both code paths must
// produce the same field set for the same input so a stub created via
// the drain worker is indistinguishable from a stub created via the
// cold-start script.
//
// Output (ClassifyOutput) populates:
//   - title_candidate -> intelligence_items.title
//   - summary         -> intelligence_items.summary
//   - severity, priority, urgency_tier, item_type, topic_tags, jurisdictions
//
// Cost: ~$0.001 per call at 6KB excerpts (Haiku 4.5 pricing). Acceptable
// per the wave1b stub-quality investigation, 2026-05-11.

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_INPUT_PER_MTOK_USD = 1.0;
const HAIKU_OUTPUT_PER_MTOK_USD = 5.0;
const CONTENT_MAX_CHARS = 6_000;

const FIRST_FETCH_HAIKU_SYSTEM_PROMPT = `You are a content classifier. Given source URL, source metadata, and a content excerpt, return STRICT JSON {"item_type":"...","severity":"...","priority":"...","urgency_tier":"...","topic_tags":[],"jurisdictions":[],"title_candidate":"...","summary":"...","rationale":"..."}.

item_type: regulation|directive|standard|guidance|technology|market_signal|regional_data|research_finding|innovation|framework|tool|initiative
severity: ACTION REQUIRED|COST ALERT|WINDOW CLOSING|COMPETITIVE EDGE|MONITORING
priority: CRITICAL|HIGH|MODERATE|LOW
urgency_tier: watch|elevated|stable|informational

Output JSON only.`;

export interface FirstFetchClassifyInput {
  source_id: string;
  source_url: string;
  source_name?: string | null;
  source_tier?: number | null;
  /** Excerpt text from the fetch (already stripped of HTML). */
  text: string;
}

export interface FirstFetchClassifyOutput {
  item_type: string;
  severity: string;
  priority: string;
  urgency_tier: string;
  topic_tags: string[];
  jurisdictions: string[];
  title_candidate: string;
  summary: string;
  rationale: string;
  cost_usd_estimated: number;
  render_ms: number;
}

export type FirstFetchClassifyResult =
  | { ok: true; result: FirstFetchClassifyOutput }
  | { ok: false; error: string };

function extractJsonObject(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK_USD;
  const outputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK_USD;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Call Haiku to produce title/summary/priority/etc. for a freshly-seeded
 * first-fetch stub. Returns {ok:false} on any failure (network, parse,
 * shape) so callers can decide whether to insert the stub with empty
 * fields (degraded) or skip the insert and retry on the next cron tick.
 *
 * The shape mirrors scripts/wave1-cold-start.mjs's inline haikuClassify
 * output. Do not drift the JSON contract without updating both paths.
 */
export async function firstFetchClassify(
  input: FirstFetchClassifyInput,
  apiKey: string
): Promise<FirstFetchClassifyResult> {
  const text = input.text.slice(0, CONTENT_MAX_CHARS);
  const userMessage = `Source URL: ${input.source_url}
Source id: ${input.source_id}
Source tier: ${input.source_tier ?? "unknown"}
Content excerpt:
---
${text}
---
Output the JSON object only.`;

  const start = Date.now();
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 800,
        system: FIRST_FETCH_HAIKU_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const ms = Date.now() - start;
  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: `Haiku ${resp.status}: ${body.slice(0, 200)} (${ms}ms)` };
  }
  let data: {
    usage?: { input_tokens?: number; output_tokens?: number };
    content?: Array<{ type: string; text?: string }>;
  };
  try {
    data = await resp.json();
  } catch (e: unknown) {
    return { ok: false, error: `Haiku response JSON parse: ${e instanceof Error ? e.message : String(e)}` };
  }
  const inputTokens = data?.usage?.input_tokens ?? 0;
  const outputTokens = data?.usage?.output_tokens ?? 0;
  const cost = estimateCostUsd(inputTokens, outputTokens);
  const blocks = data.content ?? [];
  const rawText = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const jsonStr = extractJsonObject(rawText);
  if (!jsonStr) {
    return { ok: false, error: "Haiku output did not contain a JSON object" };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (e: unknown) {
    return { ok: false, error: `Haiku JSON parse: ${e instanceof Error ? e.message : String(e)}` };
  }

  const item_type = typeof parsed.item_type === "string" ? parsed.item_type : "regulation";
  const severity = typeof parsed.severity === "string" ? parsed.severity : "MONITORING";
  const priority = typeof parsed.priority === "string" ? parsed.priority : "MODERATE";
  const urgency_tier = typeof parsed.urgency_tier === "string" ? parsed.urgency_tier : "stable";
  const topic_tags = Array.isArray(parsed.topic_tags)
    ? (parsed.topic_tags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const jurisdictions = Array.isArray(parsed.jurisdictions)
    ? (parsed.jurisdictions as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const title_candidate = typeof parsed.title_candidate === "string" && parsed.title_candidate.trim()
    ? parsed.title_candidate.trim().slice(0, 200)
    : input.source_name || input.source_url;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1000) : "";
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 400) : "";

  return {
    ok: true,
    result: {
      item_type,
      severity,
      priority,
      urgency_tier,
      topic_tags,
      jurisdictions,
      title_candidate,
      summary,
      rationale,
      cost_usd_estimated: cost,
      render_ms: ms,
    },
  };
}

export const __test = {
  FIRST_FETCH_HAIKU_SYSTEM_PROMPT,
  HAIKU_MODEL,
  CONTENT_MAX_CHARS,
  extractJsonObject,
  estimateCostUsd,
};
