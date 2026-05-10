// Shared Haiku classification module.
//
// Two exports:
//   - haikuVerifyCandidate  used by src/lib/sources/verification.ts to
//                           triage discovered candidate URLs into the
//                           H/M/L verification tiers (relevance, freight
//                           score, trust tier).
//   - haikuClassify         used by Wave 1a content classification on
//                           successful raw_fetches: maps raw HTML to
//                           item_type, severity, priority, urgency_tier,
//                           topic_tags, and a brief title/summary.
//
// Both share the Anthropic SDK client setup, the Haiku model constant,
// the JSON-from-prose extraction regex, the score clamping helper, and
// the typed-error envelope return shape.

import Anthropic from "@anthropic-ai/sdk";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// Token-cost approximations for the Haiku 4.5 pricing page (USD per
// million tokens). Used by haikuClassify to populate cost_usd_estimated
// before the agent_runs row is finalized. Numbers updated 2026-05-09.
const HAIKU_INPUT_PER_MTOK_USD = 1.0;
const HAIKU_OUTPUT_PER_MTOK_USD = 5.0;

const CONTENT_MAX_CHARS = 6_000;

// ────────────────────────────────────────────────────────────────────────────
// Verification prompt (used by haikuVerifyCandidate)
// ────────────────────────────────────────────────────────────────────────────

export const VERIFICATION_HAIKU_SYSTEM_PROMPT = `You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,
  "ai_freight_score": 0-100,
  "ai_trust_tier": "T1"|"T2"|"T3",
  "rationale": "<=150 char summary"
}

Scoring guidance:

ai_relevance_score, sustainability or climate or environmental or energy or transport regulatory content. Government regulators with mandates covering ANY of: emissions, air quality, water, waste, energy, climate, fuel, building codes, vehicle standards, public utilities, transport planning, customs, trade. Canonical state-level publishers (CARB, CalEPA, CEC, CPUC, leginfo.legislature.ca.gov, NYDEC, etc.) score 80-95 even when their mandate is broader than just sustainability, they ARE the canonical place where sustainability regulations live. Only score below 60 when the source is unambiguously off-topic (tourism, museums, sports, entertainment, retail not regulated for sustainability).

ai_freight_score, does this jurisdiction's regulatory output operationally affect freight, cargo, shipping, transport, supply chain, or the operations that support them (warehouses, ports, distribution centers, fleets, logistics labor)? This includes INDIRECTLY freight-affecting domains:
- Air quality and emissions standards (truck fleets, port operations)
- Energy and fuel and alternative-fuel regulation (fuel costs, EV charging, hydrogen, SAF)
- Public utility regulation (electric trucks, port electrification, charging infrastructure)
- Vehicle registration and safety and inspection (commercial fleet operations)
- Building and facility codes (warehouses, distribution centers, cold-chain)
- Labor regulation (drivers, dock workers, warehouse staff)
- Customs and trade and sanctions and dangerous goods
- Transport planning and freight corridors and port master plans
- Legislative archives where freight-affecting bills are published (e.g., leginfo.legislature.ca.gov hosts SB 253, SB 261, AB 1305, all freight-affecting)

State-level umbrella regulators (CalEPA), legislative-archive sites where regulations are codified (leginfo, ecfr), and major regulator portals (CARB, CPUC, CEC) score 60-90 freight even when not pure-freight agencies.

Score below 30 ONLY when the source has no plausible operational impact on freight, tourism, recreation, cultural institutions, off-topic news.

ai_trust_tier reflects canonicalness, NOT jurisdictional level:
- T1: canonical primary regulatory publication (Federal Register, EUR-Lex, IMO, ICAO, gazettes, official legislative archives like leginfo.legislature.ca.gov)
- T2: canonical regulator (EPA, CARB, EMSA, CPUC, CEC, CalEPA, NYDEC, state-level primary regulators)
- T3: reputable secondary (industry associations, standards bodies, think tanks, academic centers)

Sub-state and state agencies issuing primary regulation are T2, same as EPA. Air-quality management districts (AQMDs) issuing district rules are T2. Regional boards under state umbrellas are T2.

Output JSON only, no prose, no markdown, no code fences.`;

// ────────────────────────────────────────────────────────────────────────────
// Content classification prompt (used by haikuClassify)
// ────────────────────────────────────────────────────────────────────────────

const CONTENT_HAIKU_SYSTEM_PROMPT = `You are a content classifier for a freight-sustainability intelligence platform.

Given a source URL, source metadata, and a content excerpt, return STRICT JSON:
{
  "item_type": "regulation"|"directive"|"standard"|"guidance"|"technology"|"market_signal"|"regional_data"|"research_finding"|"innovation"|"framework"|"tool"|"initiative",
  "severity": "ACTION REQUIRED"|"COST ALERT"|"WINDOW CLOSING"|"COMPETITIVE EDGE"|"MONITORING",
  "priority": "CRITICAL"|"HIGH"|"MODERATE"|"LOW",
  "urgency_tier": "watch"|"elevated"|"stable"|"informational",
  "topic_tags": ["tag1", "tag2", ...],
  "jurisdictions": ["ISO_CODE", ...],
  "title_candidate": "<=120 char title",
  "summary": "<=400 char one-paragraph summary",
  "rationale": "<=200 char explanation of priority and urgency assignment"
}

Classification guidance:

item_type, pick the single best match. Default to "regulation" only when the content is a binding rule from a regulator. Use "guidance" for non-binding advisories, "research_finding" for analysis, "technology" for product or systems coverage, "market_signal" for industry shifts.

severity uses the SKILL.md labels:
- ACTION REQUIRED, an explicit deadline or compliance trigger affects the platform's freight cargo verticals
- COST ALERT, a price, fee, fuel, or tariff change with material cost impact
- WINDOW CLOSING, a comment period, registration window, or grant cycle ending soon
- COMPETITIVE EDGE, an opportunity (incentive, grant, exemption, certification)
- MONITORING, baseline coverage, no immediate action

priority is the dashboard sort key:
- CRITICAL, deadline within 30 days, regulator-level publisher
- HIGH, deadline within 90 days OR direct freight impact
- MODERATE, broader sustainability impact, 90 to 365 day window
- LOW, informational or far-horizon

urgency_tier is the dashboard counter bin:
- watch, ACTION REQUIRED or WINDOW CLOSING with near deadline
- elevated, CRITICAL or HIGH priority items not yet at the deadline
- stable, MODERATE priority items in monitoring posture
- informational, LOW priority or background coverage

topic_tags are short slugs from the platform vocabulary (e.g. "emissions", "fuel-standards", "port-operations", "warehouse-codes", "labor", "customs"). Up to 6 tags.

jurisdictions are ISO 3166-1 alpha-2 country codes or ISO 3166-2 subdivision codes (e.g. "US-CA", "EU", "BR"). Empty array when unknown.

Output JSON only, no prose, no markdown, no code fences.`;

// ────────────────────────────────────────────────────────────────────────────
// Public types: verification
// ────────────────────────────────────────────────────────────────────────────

export type AiTrustTier = "T1" | "T2" | "T3";

export interface HaikuVerifyCandidateInput {
  url: string;
  name?: string;
  discoveredFor?: string;
}

export interface HaikuVerifyClassification {
  ai_relevance_score: number;
  ai_freight_score: number;
  ai_trust_tier: AiTrustTier;
  rationale: string;
}

export type HaikuVerifyResult =
  | { ok: true; result: HaikuVerifyClassification }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────────
// Public types: content classification
// ────────────────────────────────────────────────────────────────────────────

export interface ClassifyInput {
  html: string;
  source_id: string | null;
  source_url: string;
  source_tier?: number | null;
  source_jurisdictions?: string[];
  source_topic_tags?: string[];
}

export interface ClassifyOutput {
  item_type: string;
  severity: string;
  priority: string;
  urgency_tier: string;
  topic_tags: string[];
  jurisdictions: string[];
  title_candidate: string;
  summary: string;
  content_hash: string;
  cost_usd_estimated: number;
  rationale: string;
}

export type ClassifyResult =
  | { ok: true; result: ClassifyOutput }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractJsonObject(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function htmlToText(html: string, maxChars: number): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

async function sha256Hex(input: string): Promise<string> {
  // Web Crypto path. Available in Node 20 and Edge runtime.
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK_USD;
  const outputCost = (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK_USD;
  return Number((inputCost + outputCost).toFixed(6));
}

// ────────────────────────────────────────────────────────────────────────────
// Public: haikuVerifyCandidate
// ────────────────────────────────────────────────────────────────────────────

export async function haikuVerifyCandidate(
  candidate: HaikuVerifyCandidateInput,
  contentText: string,
  apiKey: string
): Promise<HaikuVerifyResult> {
  const userMessage = `Candidate URL: ${candidate.url}
Candidate name: ${candidate.name ?? "(unknown)"}
Discovered for jurisdiction: ${candidate.discoveredFor ?? "(unspecified)"}

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
    const jsonStr = extractJsonObject(text);
    if (!jsonStr) return { ok: false, error: "No JSON object in model output" };
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed.ai_relevance_score !== "number" ||
      typeof parsed.ai_freight_score !== "number" ||
      typeof parsed.ai_trust_tier !== "string" ||
      !["T1", "T2", "T3"].includes(parsed.ai_trust_tier) ||
      typeof parsed.rationale !== "string"
    ) {
      return { ok: false, error: "Malformed classification shape" };
    }
    return {
      ok: true,
      result: {
        ai_relevance_score: clampScore(parsed.ai_relevance_score),
        ai_freight_score: clampScore(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier as AiTrustTier,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public: haikuClassify
// ────────────────────────────────────────────────────────────────────────────

export async function haikuClassify(
  input: ClassifyInput,
  apiKey: string
): Promise<ClassifyResult> {
  const text = htmlToText(input.html, 12_000);
  const content_hash = await sha256Hex(input.html);

  const userMessage = `Source URL: ${input.source_url}
Source id: ${input.source_id ?? "(unknown)"}
Source tier: ${input.source_tier ?? "(unknown)"}
Source jurisdictions: ${JSON.stringify(input.source_jurisdictions ?? [])}
Source topic tags: ${JSON.stringify(input.source_topic_tags ?? [])}

Content excerpt (truncated to ~6000 chars):
---
${text.slice(0, CONTENT_MAX_CHARS)}
---

Output the JSON object only.`;

  const client = new Anthropic({ apiKey });
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 800,
      system: CONTENT_HAIKU_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const respText = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    const jsonStr = extractJsonObject(respText);
    if (!jsonStr) return { ok: false, error: "No JSON object in model output" };
    const parsed = JSON.parse(jsonStr);

    if (
      typeof parsed.item_type !== "string" ||
      typeof parsed.severity !== "string" ||
      typeof parsed.priority !== "string" ||
      typeof parsed.urgency_tier !== "string" ||
      !Array.isArray(parsed.topic_tags) ||
      !Array.isArray(parsed.jurisdictions) ||
      typeof parsed.title_candidate !== "string" ||
      typeof parsed.summary !== "string" ||
      typeof parsed.rationale !== "string"
    ) {
      return { ok: false, error: "Malformed classification shape" };
    }

    const inputTokens = resp.usage?.input_tokens ?? 0;
    const outputTokens = resp.usage?.output_tokens ?? 0;
    const cost_usd_estimated = estimateCostUsd(inputTokens, outputTokens);

    return {
      ok: true,
      result: {
        item_type: String(parsed.item_type),
        severity: String(parsed.severity),
        priority: String(parsed.priority),
        urgency_tier: String(parsed.urgency_tier),
        topic_tags: (parsed.topic_tags as unknown[]).map((t) => String(t)).slice(0, 6),
        jurisdictions: (parsed.jurisdictions as unknown[]).map((t) => String(t)).slice(0, 10),
        title_candidate: String(parsed.title_candidate).slice(0, 120),
        summary: String(parsed.summary).slice(0, 400),
        content_hash,
        cost_usd_estimated,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helper exports for tests
// ────────────────────────────────────────────────────────────────────────────

export const __internals = {
  clampScore,
  extractJsonObject,
  htmlToText,
  sha256Hex,
  estimateCostUsd,
  HAIKU_INPUT_PER_MTOK_USD,
  HAIKU_OUTPUT_PER_MTOK_USD,
  CONTENT_MAX_CHARS,
};
