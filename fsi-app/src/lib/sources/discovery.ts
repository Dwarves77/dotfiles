// W2.B — sub-national-aware discovery agent (helper module).
//
// Pure module. Given a jurisdiction code (ISO 3166-1, ISO 3166-2, or one
// of the supported supranational/IGO free-text codes), this module:
//   1. Validates the jurisdiction shape via src/lib/jurisdictions/iso.ts.
//   2. Renders a human-readable label for the prompt and response.
//   3. Calls Claude Sonnet 4.6 with the web_search tool to discover
//      candidate canonical sources for the jurisdiction.
//   4. Parses the strict-JSON response (with a 3-tier fallback against
//      code-fence wrapping and stray prose).
//   5. Hands each candidate to the W2.F verification pipeline at
//      src/lib/sources/verification.ts (when present); otherwise queues
//      candidates straight into provisional_sources with the discovery
//      provenance recorded.
//
// Cost model: one Sonnet call per discoverForJurisdiction invocation.
// At Sonnet 4.6 pricing with the web_search tool engaged, expect roughly
// ~$0.05 (shallow), ~$0.10 (normal), ~$0.15 (deep) per call. Verification
// adds Haiku cost per candidate (~$0.001 each), so a deep run costs about
// $0.15 + 20*$0.001 ≈ $0.17.
//
// Failure semantics:
//   - Invalid jurisdiction → throws DiscoveryError("invalid_jurisdiction").
//   - Sonnet API failure → throws DiscoveryError("sonnet_api_error") with
//     the upstream status + body slice attached.
//   - JSON parse failure → throws DiscoveryError("parse_error") with the
//     raw assistant text attached. Caller should surface this as a 502.
//   - Verification pipeline failure on a single candidate → caught and
//     bucketed as `rejected` with the error noted; the run as a whole
//     succeeds.
//
// This module never reads or writes secrets directly — ANTHROPIC_API_KEY
// and Supabase credentials are pulled from process.env at call time.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isIsoCode, isoToDisplayLabel } from "@/lib/jurisdictions/iso";
import {
  verifyCandidate,
  type VerificationCandidate,
  type VerificationResult,
} from "@/lib/sources/verification";

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type DiscoveryDepth = "shallow" | "normal" | "deep";

export type DiscoveryCandidate = {
  name: string;
  url: string;
  type:
    | "regulator"
    | "gazette"
    | "standards-body"
    | "industry-association"
    | "court"
    | "court-tracker"
    | "aggregator";
  language: string;
  freight_relevance_score: number;
  rationale: string;
};

export type DiscoveryRequest = {
  jurisdiction_iso: string;
  depth?: DiscoveryDepth;
  language?: string;
  dryRun?: boolean;
};

export type DiscoveryAppliedCounts = {
  auto_approved: number;
  queued_provisional: number;
  rejected: number;
};

export type DiscoveryCandidateOutcome = {
  candidate: DiscoveryCandidate;
  verification?: VerificationResult;
  fallback_provisional_id?: string;
  error?: string;
};

export type DiscoveryResult = {
  jurisdiction_iso: string;
  jurisdiction_label: string;
  candidates: DiscoveryCandidate[];
  candidate_outcomes: DiscoveryCandidateOutcome[];
  agent_run_id?: string;
  applied: DiscoveryAppliedCounts;
  raw_assistant_text?: string;
  used_verification_pipeline: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export type DiscoveryErrorCode =
  | "invalid_jurisdiction"
  | "missing_api_key"
  | "sonnet_api_error"
  | "parse_error";

export class DiscoveryError extends Error {
  code: DiscoveryErrorCode;
  upstreamStatus?: number;
  upstreamBody?: string;
  rawAssistantText?: string;
  constructor(
    code: DiscoveryErrorCode,
    message: string,
    extras?: {
      upstreamStatus?: number;
      upstreamBody?: string;
      rawAssistantText?: string;
    }
  ) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
    this.upstreamStatus = extras?.upstreamStatus;
    this.upstreamBody = extras?.upstreamBody;
    this.rawAssistantText = extras?.rawAssistantText;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Depth → max-candidate cap and web_search budget
// ────────────────────────────────────────────────────────────────────────────

type DepthConfig = {
  maxCandidates: number;
  webSearchMaxUses: number;
  guidance: string;
};

const DEPTH_CONFIG: Readonly<Record<DiscoveryDepth, DepthConfig>> = {
  shallow: {
    maxCandidates: 5,
    webSearchMaxUses: 2,
    guidance:
      "Return at most 5 candidates. Do not perform deep verification searches per source. Aim for the highest-priority canonical publishers only.",
  },
  normal: {
    maxCandidates: 12,
    webSearchMaxUses: 5,
    guidance:
      "Return up to 12 candidates (10-15 typical). Use web_search to verify each URL is reachable and currently active.",
  },
  deep: {
    maxCandidates: 20,
    webSearchMaxUses: 10,
    guidance:
      "Return up to 20 candidates (15-20 for deep mode). Run multiple web searches to surface sub-agencies and adjacent regulators. Include sub-portals where they are the canonical regulatory publisher.",
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Sonnet model identifier
// ────────────────────────────────────────────────────────────────────────────
// The platform standard is `claude-sonnet-4-6` (see /api/agent/run and
// /api/admin/scan). Web search uses the same anthropic-beta header used
// by /api/admin/scan.

const SONNET_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL_NAME = "web_search_20250305";

// ────────────────────────────────────────────────────────────────────────────
// System prompt (the contract — see W2B-discovery-agent-spec.md)
// ────────────────────────────────────────────────────────────────────────────

export const DISCOVERY_SYSTEM_PROMPT = `You are a regulatory source discovery agent for a freight-sustainability
intelligence platform. Given a jurisdiction code, identify the government
bodies, regulatory agencies, official gazettes, and standards bodies in
that jurisdiction that publish content affecting:

- Climate / carbon / emissions regulation
- Sustainable freight / transport / shipping policy
- Customs and trade rules with sustainability dimensions
- Energy / fuel mandates affecting transport
- Labor/safety/environmental rules affecting freight operations

CRITICAL: Tier reflects canonicalness, not jurisdictional level.
A US state agency that issues primary regulation (CARB, NYSDEC) is T2,
the same as the federal-level EPA. Do not under-rate sub-national
publishers when they are the canonical source.

Return STRICT JSON ONLY:
{
  "jurisdiction_label": "full human-readable jurisdiction name",
  "candidates": [
    {
      "name": "Agency/body full name",
      "url": "primary public-facing URL where regulations live",
      "type": "regulator|gazette|standards-body|industry-association|court|court-tracker|aggregator",
      "language": "ISO 639-1 code",
      "freight_relevance_score": 0-100,
      "rationale": "<=200 char justification"
    }
  ]
}

Rules:
- Up to 20 candidates per call (aim for 10-15 typical, 5-8 for sparse jurisdictions, 15-20 for deep mode).
- Include sub-agency portals when they are the canonical regulatory publisher (e.g., CARB instead of just ca.gov).
- Skip pure news aggregators unless explicitly requested.
- Use web_search to verify each URL is reachable and currently active.
- Score freight_relevance_score conservatively. 100 = pure freight regulator. 50 = some freight overlap. 30 = freight is a small fraction of their content.
- For sub-national jurisdictions (ISO 3166-2 codes), include both the sub-national agencies AND a pointer back to relevant national agencies. Do not duplicate national entries that the parent country discovery would already produce.`;

// ────────────────────────────────────────────────────────────────────────────
// JSON extraction — 3-tier fallback (mirrors /api/admin/scan pattern)
// ────────────────────────────────────────────────────────────────────────────
//
// Tier 1: parse the entire text directly. Best case — model emitted clean JSON.
// Tier 2: strip ```json / ``` code fences, then parse.
// Tier 3: regex-match the outermost {...} block and parse that.
//
// Each step's failure is recorded so the parse error surfaces useful diagnostics.

type ParseAttempt = {
  ok: boolean;
  parsed?: unknown;
  error?: string;
  tier: 1 | 2 | 3;
};

function tryParseJson(text: string): ParseAttempt[] {
  const attempts: ParseAttempt[] = [];

  // Tier 1: raw parse
  try {
    const parsed = JSON.parse(text);
    attempts.push({ ok: true, parsed, tier: 1 });
    return attempts;
  } catch (e) {
    attempts.push({
      ok: false,
      tier: 1,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Tier 2: strip code fences
  const fenced = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
    .replace(/\s*```[\s\S]*$/i, "")
    .trim();
  if (fenced && fenced !== text) {
    try {
      const parsed = JSON.parse(fenced);
      attempts.push({ ok: true, parsed, tier: 2 });
      return attempts;
    } catch (e) {
      attempts.push({
        ok: false,
        tier: 2,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Tier 3: outermost {...} regex
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      attempts.push({ ok: true, parsed, tier: 3 });
      return attempts;
    } catch (e) {
      attempts.push({
        ok: false,
        tier: 3,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return attempts;
}

// ────────────────────────────────────────────────────────────────────────────
// Candidate shape validation
// ────────────────────────────────────────────────────────────────────────────

const CANDIDATE_TYPES: ReadonlySet<DiscoveryCandidate["type"]> = new Set([
  "regulator",
  "gazette",
  "standards-body",
  "industry-association",
  "court",
  "court-tracker",
  "aggregator",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCandidate(
  raw: unknown,
  fallbackLanguage: string
): DiscoveryCandidate | null {
  if (!isPlainObject(raw)) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const typeStr = typeof raw.type === "string" ? raw.type.trim() : "";
  const languageStr =
    typeof raw.language === "string" && raw.language.trim().length > 0
      ? raw.language.trim().toLowerCase()
      : fallbackLanguage;
  const scoreRaw = raw.freight_relevance_score;
  const rationale =
    typeof raw.rationale === "string" ? raw.rationale.trim().slice(0, 200) : "";

  if (!name) return null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (!CANDIDATE_TYPES.has(typeStr as DiscoveryCandidate["type"])) return null;

  let score: number;
  if (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) {
    score = scoreRaw;
  } else if (typeof scoreRaw === "string" && scoreRaw.trim().length > 0) {
    const parsed = Number(scoreRaw);
    if (!Number.isFinite(parsed)) return null;
    score = parsed;
  } else {
    return null;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    name,
    url,
    type: typeStr as DiscoveryCandidate["type"],
    language: languageStr,
    freight_relevance_score: score,
    rationale,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Sonnet call
// ────────────────────────────────────────────────────────────────────────────

type SonnetCallResult = {
  rawAssistantText: string;
  jurisdiction_label: string;
  candidates: DiscoveryCandidate[];
};

async function callSonnetForDiscovery(
  jurisdictionIso: string,
  jurisdictionLabel: string,
  depth: DiscoveryDepth,
  fallbackLanguage: string,
  apiKey: string
): Promise<SonnetCallResult> {
  const cfg = DEPTH_CONFIG[depth];

  const userMessage = `Jurisdiction code: ${jurisdictionIso}
Jurisdiction label: ${jurisdictionLabel}
Depth mode: ${depth}
Discovery language preference: ${fallbackLanguage}

Depth guidance: ${cfg.guidance}

Identify the canonical regulatory publishers for this jurisdiction relevant to freight sustainability. Output JSON only (no prose, no markdown, no code fences). The "jurisdiction_label" field must echo the human-readable label. The "candidates" array must conform to the schema in the system prompt.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": WEB_SEARCH_BETA,
    },
    body: JSON.stringify({
      model: SONNET_MODEL,
      max_tokens: 6000,
      tools: [
        {
          type: WEB_SEARCH_TOOL_NAME,
          name: "web_search",
          max_uses: cfg.webSearchMaxUses,
        },
      ],
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new DiscoveryError(
      "sonnet_api_error",
      `Sonnet API ${response.status}: ${body.slice(0, 300)}`,
      { upstreamStatus: response.status, upstreamBody: body.slice(0, 1000) }
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const rawAssistantText =
    (data.content || [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("") || "";

  const attempts = tryParseJson(rawAssistantText);
  const winning = attempts.find((a) => a.ok);

  if (!winning || !winning.parsed) {
    const errorTrace = attempts
      .map((a) => `tier${a.tier}:${a.error ?? "ok"}`)
      .join(" | ");
    throw new DiscoveryError(
      "parse_error",
      `Could not extract JSON from Sonnet output. Attempts: ${errorTrace}`,
      { rawAssistantText }
    );
  }

  const parsed = winning.parsed;
  if (!isPlainObject(parsed)) {
    throw new DiscoveryError(
      "parse_error",
      "Sonnet output parsed but is not a JSON object",
      { rawAssistantText }
    );
  }

  const labelOut =
    typeof parsed.jurisdiction_label === "string" &&
    parsed.jurisdiction_label.trim().length > 0
      ? parsed.jurisdiction_label.trim()
      : jurisdictionLabel;

  const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates: DiscoveryCandidate[] = [];
  const seenUrls = new Set<string>();
  for (const raw of candidatesRaw) {
    const v = validateCandidate(raw, fallbackLanguage);
    if (!v) continue;
    const key = v.url.toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    candidates.push(v);
    if (candidates.length >= cfg.maxCandidates) break;
  }

  return {
    rawAssistantText,
    jurisdiction_label: labelOut,
    candidates,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verification integration
// ────────────────────────────────────────────────────────────────────────────
//
// W2.F's verification.ts is present in the repo at the time this module
// was written, so we call verifyCandidate() per candidate. If a future
// refactor relocates or removes the helper, the import will fail at
// build time — that's intentional. The runtime fallback (writing straight
// into provisional_sources) is exercised when verifyCandidate throws.

async function verifyOrFallback(
  candidate: DiscoveryCandidate,
  jurisdictionIso: string,
  dryRun: boolean,
  supabase: SupabaseClient
): Promise<DiscoveryCandidateOutcome> {
  const verificationCandidate: VerificationCandidate = {
    url: candidate.url,
    name: candidate.name,
    jurisdiction_iso: [jurisdictionIso],
    discoveredFor: jurisdictionIso,
  };

  try {
    const verification = await verifyCandidate(verificationCandidate, {
      dryRun,
      supabase,
    });
    return { candidate, verification };
  } catch (e: unknown) {
    // Verification pipeline crash → fall back to provisional_sources insert
    // with the discovery provenance stamped. This preserves the candidate
    // for human review even when the auto-classifier fails entirely.
    const errMsg = e instanceof Error ? e.message : String(e);

    if (dryRun) {
      return { candidate, error: `verification_failed: ${errMsg}` };
    }

    try {
      const fallbackRow: Record<string, unknown> = {
        name: candidate.name,
        url: candidate.url,
        description: candidate.rationale || "",
        // Reuse the existing CHECK-allowed value most aligned with the
        // discovery agent ("worker_search" was originally minted for this
        // exact case — see migration 004).
        discovered_via: "worker_search",
        status: "pending_review",
        provisional_tier: 7,
        discovered_for_jurisdiction: jurisdictionIso,
        reviewer_notes: `Discovery agent fallback (${jurisdictionIso}): verification pipeline failed — ${errMsg.slice(0, 200)}`,
      };
      const { data, error } = await supabase
        .from("provisional_sources")
        .insert(fallbackRow)
        .select("id")
        .single();
      if (error) {
        // Unique-URL conflict is fine — the candidate is already queued.
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          return { candidate, error: "fallback_duplicate" };
        }
        return {
          candidate,
          error: `fallback_insert_failed: ${error.message}`,
        };
      }
      return {
        candidate,
        fallback_provisional_id: data?.id as string | undefined,
        error: `verification_failed_fell_back: ${errMsg.slice(0, 200)}`,
      };
    } catch (e2: unknown) {
      const errMsg2 = e2 instanceof Error ? e2.message : String(e2);
      return {
        candidate,
        error: `verification_and_fallback_failed: ${errMsg} | ${errMsg2}`,
      };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function discoverForJurisdiction(
  req: DiscoveryRequest,
  opts?: { supabase?: SupabaseClient }
): Promise<DiscoveryResult> {
  // Step 1 — validate
  const code = (req.jurisdiction_iso || "").trim();
  if (!isIsoCode(code)) {
    throw new DiscoveryError(
      "invalid_jurisdiction",
      `jurisdiction_iso "${code}" does not match a known ISO 3166-1 alpha-2, ISO 3166-2, or supported supranational/IGO code.`
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new DiscoveryError(
      "missing_api_key",
      "ANTHROPIC_API_KEY is not configured in the environment."
    );
  }

  const depth: DiscoveryDepth = req.depth ?? "normal";
  const fallbackLanguage = (req.language || "en").trim().toLowerCase();
  const dryRun = !!req.dryRun;
  const supabase = opts?.supabase ?? getServiceClient();

  // Step 2 — render label
  const renderedLabel = isoToDisplayLabel(code);
  const jurisdictionLabel = renderedLabel || code;

  // Step 3 — Sonnet call
  const sonnet = await callSonnetForDiscovery(
    code,
    jurisdictionLabel,
    depth,
    fallbackLanguage,
    apiKey
  );

  // Step 4-5 — verification per candidate. Always run sequentially: parallel
  // fan-out would multi-fire Haiku and trip Anthropic per-key concurrency.
  // Sequential keeps the cost predictable and the audit log deterministic.
  const candidate_outcomes: DiscoveryCandidateOutcome[] = [];
  let auto_approved = 0;
  let queued_provisional = 0;
  let rejected = 0;

  for (const candidate of sonnet.candidates) {
    const outcome = await verifyOrFallback(candidate, code, dryRun, supabase);
    candidate_outcomes.push(outcome);
    const action = outcome.verification?.action;
    if (action === "auto-approved") auto_approved++;
    else if (action === "queued-provisional") queued_provisional++;
    else if (action === "rejected") rejected++;
    else if (outcome.fallback_provisional_id) queued_provisional++;
    else rejected++;
  }

  // Step 6 — backfill discovered_for_jurisdiction on rows that the
  // verification pipeline wrote. The verification module doesn't carry
  // the jurisdiction onto the destination row (its `discoveredFor` only
  // lands in source_verifications.verification_log). We patch each
  // resulting row here so query surfaces can filter by the originating
  // discovery jurisdiction. Skipped on dryRun.
  if (!dryRun) {
    for (const outcome of candidate_outcomes) {
      const provisionalId = outcome.verification?.resulting_provisional_id;
      const sourceId = outcome.verification?.resulting_source_id;
      if (provisionalId) {
        try {
          await supabase
            .from("provisional_sources")
            .update({ discovered_for_jurisdiction: code })
            .eq("id", provisionalId);
        } catch {
          // Migration 038 may not be applied yet — silently skip.
          // The source_verifications row still carries the provenance.
        }
      }
      if (sourceId) {
        // sources table has no discovered_for_jurisdiction column —
        // provenance for auto-approved rows lives in source_verifications.
        // No-op here; left as a hook for a future schema extension.
        void sourceId;
      }
    }
  }

  return {
    jurisdiction_iso: code,
    jurisdiction_label: sonnet.jurisdiction_label,
    candidates: sonnet.candidates,
    candidate_outcomes,
    applied: { auto_approved, queued_provisional, rejected },
    raw_assistant_text: sonnet.rawAssistantText,
    used_verification_pipeline: true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Internals exported for tests
// ────────────────────────────────────────────────────────────────────────────

export const __internals = {
  DEPTH_CONFIG,
  SONNET_MODEL,
  DISCOVERY_SYSTEM_PROMPT,
  tryParseJson,
  validateCandidate,
};
