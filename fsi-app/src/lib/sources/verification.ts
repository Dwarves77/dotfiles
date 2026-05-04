// W2.F — auto-verification pipeline.
//
// Pure module that triages each discovered candidate URL into one of three
// confidence tiers (H/M/L) and acts on the classification:
//
//   H — auto-approved   → INSERT INTO sources    (status='active', admin_only=false)
//   M — queued-provisional → INSERT INTO provisional_sources (status='pending_review')
//   L — rejected        → no source-row write; only audit log
//
// Every candidate writes one row to source_verifications regardless of
// outcome (migration 037). The pipeline is idempotent: running twice on
// the same candidate produces two source_verifications rows but only one
// downstream source/provisional row — the duplicate check rejects the
// second pass.
//
// Cost model: Haiku-only. We never call Sonnet from this pipeline. A
// single combined Haiku call returns relevance + freight + trust tier
// + rationale in one JSON payload (~600 tokens out, ~3500 tokens in).
//
// Failure semantics: every step has a defined fallback. Reachability
// failure → tier L immediately (no Haiku call). Haiku failure → tier
// M (don't auto-approve a row we couldn't classify, but don't toss
// it to L either — operator review is the safety net). Domain regex
// gives a confidence band that tilts but never alone forces L.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type VerificationCandidate = {
  url: string;
  name?: string;
  jurisdiction_iso?: string[];
  /** Jurisdiction code passed by the discovery agent. Recorded in the log. */
  discoveredFor?: string;
};

export type VerificationTier = "H" | "M" | "L";
export type VerificationAction = "auto-approved" | "queued-provisional" | "rejected";
export type AiTrustTier = "T1" | "T2" | "T3";

export type VerificationResult = {
  tier: VerificationTier;
  action: VerificationAction;
  ai_relevance_score: number | null;
  ai_freight_score: number | null;
  ai_trust_tier: AiTrustTier | null;
  language: string | null;
  rejection_reason?: string;
  log: VerificationLog;
  resulting_source_id?: string;
  resulting_provisional_id?: string;
};

export type VerificationLog = {
  candidate_url: string;
  candidate_name?: string;
  discoveredFor?: string;
  reachability: {
    attempts: number;
    finalStatus: number | null;
    finalUrl: string | null;
    redirects: string[];
    error?: string;
  };
  content: {
    fetched: boolean;
    httpStatus?: number;
    textLength?: number;
    error?: string;
  };
  domain: {
    pattern: string | null;
    confidence: "high" | "medium" | "low";
    matchedHost: string | null;
  };
  duplicate: {
    skipped: boolean;
    matched: boolean;
    matchedSourceId?: string;
    method?: "host" | "path" | "skipped";
  };
  language: {
    detected: string | null;
    method: "heuristic" | "fallback" | "skipped";
  };
  ai: {
    called: boolean;
    rationale?: string;
    error?: string;
  };
  aggregation: {
    triggers: string[];
    decision: VerificationTier;
  };
  action: {
    taken: VerificationAction;
    error?: string;
  };
  timing: {
    totalMs: number;
  };
};

// ────────────────────────────────────────────────────────────────────────────
// Domain authority pattern list
// ────────────────────────────────────────────────────────────────────────────
// Patterns are tested against the candidate URL's hostname (lowercased).
// Order matters only for log readability — first match wins. Patterns are
// case-insensitive regex literals. "high" confidence = canonical primary
// publisher; "medium" = recognized intergovernmental / standards body;
// nothing in this list emits "low" — un-matched hosts get "low".

type DomainPattern = {
  pattern: RegExp;
  confidence: "high" | "medium";
  label: string;
};

const KNOWN_AUTHORITATIVE_PATTERNS: DomainPattern[] = [
  // ── National government TLDs ──
  { pattern: /(^|\.)gov$/i,                       confidence: "high",   label: "us-gov" },
  { pattern: /(^|\.)gov\.uk$/i,                   confidence: "high",   label: "uk-gov" },
  { pattern: /(^|\.)gc\.ca$/i,                    confidence: "high",   label: "ca-gov" },
  { pattern: /(^|\.)canada\.ca$/i,                confidence: "high",   label: "ca-canada" },
  { pattern: /(^|\.)gov\.au$/i,                   confidence: "high",   label: "au-gov" },
  { pattern: /(^|\.)govt\.nz$/i,                  confidence: "high",   label: "nz-gov" },
  { pattern: /(^|\.)gov\.in$/i,                   confidence: "high",   label: "in-gov" },
  { pattern: /(^|\.)gov\.sg$/i,                   confidence: "high",   label: "sg-gov" },
  { pattern: /(^|\.)gov\.br$/i,                   confidence: "high",   label: "br-gov" },
  { pattern: /(^|\.)go\.kr$/i,                    confidence: "high",   label: "kr-gov" },
  { pattern: /(^|\.)go\.jp$/i,                    confidence: "high",   label: "jp-gov" },
  { pattern: /(^|\.)gob\.cl$/i,                   confidence: "high",   label: "cl-gob" },
  { pattern: /(^|\.)bcn\.cl$/i,                   confidence: "high",   label: "cl-bcn" },
  { pattern: /(^|\.)gob\.mx$/i,                   confidence: "high",   label: "mx-gob" },
  { pattern: /(^|\.)gov\.cn$/i,                   confidence: "high",   label: "cn-gov" },
  { pattern: /(^|\.)npc\.gov\.cn$/i,              confidence: "high",   label: "cn-npc" },

  // ── EU institutions ──
  { pattern: /(^|\.)europa\.eu$/i,                confidence: "high",   label: "eu-europa" },
  { pattern: /(^|\.)eur-lex\.europa\.eu$/i,       confidence: "high",   label: "eu-eurlex" },
  { pattern: /(^|\.)consilium\.europa\.eu$/i,     confidence: "high",   label: "eu-consilium" },
  { pattern: /(^|\.)ec\.europa\.eu$/i,            confidence: "high",   label: "eu-commission" },
  { pattern: /(^|\.)emsa\.europa\.eu$/i,          confidence: "high",   label: "eu-emsa" },

  // ── US Federal regulators (sub-domains under .gov caught above; explicit
  //    listings here for log clarity and to bias certain hosts to high) ──
  { pattern: /(^|\.)federalregister\.gov$/i,      confidence: "high",   label: "us-fr" },
  { pattern: /(^|\.)regulations\.gov$/i,          confidence: "high",   label: "us-reg" },
  { pattern: /(^|\.)epa\.gov$/i,                  confidence: "high",   label: "us-epa" },
  { pattern: /(^|\.)dot\.gov$/i,                  confidence: "high",   label: "us-dot" },
  { pattern: /(^|\.)cbp\.gov$/i,                  confidence: "high",   label: "us-cbp" },
  { pattern: /(^|\.)faa\.gov$/i,                  confidence: "high",   label: "us-faa" },
  { pattern: /(^|\.)fmcsa\.dot\.gov$/i,           confidence: "high",   label: "us-fmcsa" },

  // ── US State agencies issuing primary regulation (T2 trust tier per
  //    spec — canonical regulator, not jurisdictional level) ──
  { pattern: /(^|\.)ca\.gov$/i,                   confidence: "high",   label: "us-ca" },
  { pattern: /(^|\.)arb\.ca\.gov$/i,              confidence: "high",   label: "us-carb" },
  { pattern: /(^|\.)ny\.gov$/i,                   confidence: "high",   label: "us-ny" },
  { pattern: /(^|\.)wa\.gov$/i,                   confidence: "high",   label: "us-wa" },
  { pattern: /(^|\.)oregon\.gov$/i,               confidence: "high",   label: "us-or" },
  { pattern: /(^|\.)mass\.gov$/i,                 confidence: "high",   label: "us-ma" },

  // ── Intergovernmental organizations ──
  { pattern: /(^|\.)un\.org$/i,                   confidence: "high",   label: "un" },
  { pattern: /(^|\.)unfccc\.int$/i,               confidence: "high",   label: "unfccc" },
  { pattern: /(^|\.)imo\.org$/i,                  confidence: "high",   label: "imo" },
  { pattern: /(^|\.)icao\.int$/i,                 confidence: "high",   label: "icao" },
  { pattern: /(^|\.)iea\.org$/i,                  confidence: "high",   label: "iea" },
  { pattern: /(^|\.)worldbank\.org$/i,            confidence: "high",   label: "worldbank" },
  { pattern: /(^|\.)oecd\.org$/i,                 confidence: "high",   label: "oecd" },
  { pattern: /(^|\.)wto\.org$/i,                  confidence: "high",   label: "wto" },
  { pattern: /(^|\.)wcoomd\.org$/i,               confidence: "high",   label: "wco" },

  // ── Standards bodies and recognized industry/research authorities ──
  { pattern: /(^|\.)iso\.org$/i,                  confidence: "high",   label: "iso" },
  { pattern: /(^|\.)ifrs\.org$/i,                 confidence: "high",   label: "ifrs" },
  { pattern: /(^|\.)ghgprotocol\.org$/i,          confidence: "medium", label: "ghg-protocol" },
  { pattern: /(^|\.)sciencebasedtargets\.org$/i,  confidence: "medium", label: "sbti" },
  { pattern: /(^|\.)cdp\.net$/i,                  confidence: "medium", label: "cdp" },
  { pattern: /(^|\.)smartfreightcentre\.org$/i,   confidence: "medium", label: "sfc-glec" },
  { pattern: /(^|\.)theicct\.org$/i,              confidence: "medium", label: "icct" },
  { pattern: /(^|\.)itf-oecd\.org$/i,             confidence: "medium", label: "itf" },
  { pattern: /(^|\.)fiata\.org$/i,                confidence: "medium", label: "fiata" },
  { pattern: /(^|\.)clecat\.org$/i,               confidence: "medium", label: "clecat" },
  { pattern: /(^|\.)iru\.org$/i,                  confidence: "medium", label: "iru" },
  { pattern: /(^|\.)eea\.europa\.eu$/i,           confidence: "high",   label: "eu-eea" },
  { pattern: /(^|\.)climate-laws\.org$/i,         confidence: "medium", label: "climate-laws" },
  { pattern: /(^|\.)ecolex\.org$/i,               confidence: "medium", label: "ecolex" },
];

// ────────────────────────────────────────────────────────────────────────────
// Haiku classifier prompt
// ────────────────────────────────────────────────────────────────────────────
// Single combined call returning relevance + freight + trust tier + rationale.
// Three separate calls would triple the cost and add latency without buying
// independence (the underlying judgment shares context). The prompt is
// strict-JSON-only; the parser tolerates leading/trailing prose just in case.

export const VERIFICATION_HAIKU_SYSTEM_PROMPT = `You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,        // sustainability/climate/freight regulatory content relevance
  "ai_freight_score": 0-100,          // does this jurisdiction publish things that affect freight (cargo, shipping, customs, trade, transport, supply chain)
  "ai_trust_tier": "T1"|"T2"|"T3",    // T1 = canonical primary source (Federal Register, EUR-Lex, IMO); T2 = canonical regulator (EPA, CARB, EMSA); T3 = reputable secondary (industry assoc, standards bodies, think tanks)
  "rationale": "<=150 char summary"
}

Rules:
- Tier reflects canonicalness, not jurisdictional level. CARB = T2 (same as EPA). State agencies issuing primary regulation = T2.
- Score 100 only for explicit primary-source government/IGO regulatory publications.
- Score < 60 means not relevant — pipeline will reject.
- Be strict: when in doubt about freight relevance, score lower. Operator review is the safety net.
- Output JSON only, no prose, no markdown, no code fences.`;

// ────────────────────────────────────────────────────────────────────────────
// Tier thresholds (calibration constants)
// ────────────────────────────────────────────────────────────────────────────
// All thresholds are conservative on initial deployment. The California
// pilot will calibrate; expect the M→H boundary to shift but the L→M
// boundary (60/30) to stay roughly fixed since false positives there
// carry the highest reputational risk.

const THRESHOLDS = {
  AI_RELEVANCE_H: 85,        // ai_relevance_score >= this → eligible for H
  AI_RELEVANCE_M: 60,        // below this → L (rejected)
  AI_FREIGHT_H: 60,          // ai_freight_score >= this → eligible for H
  AI_FREIGHT_M: 30,          // below this → L (not freight relevant)
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Models
// ────────────────────────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// ────────────────────────────────────────────────────────────────────────────
// Step 1: HEAD reachability + redirect resolution
// ────────────────────────────────────────────────────────────────────────────

const HEAD_TIMEOUT_MS = 8_000;
const HEAD_BACKOFF_MS = [200, 800, 3200] as const;

async function checkReachability(url: string): Promise<{
  ok: boolean;
  finalStatus: number | null;
  finalUrl: string | null;
  attempts: number;
  redirects: string[];
  error?: string;
}> {
  const redirects: string[] = [];
  let finalStatus: number | null = null;
  let finalUrl: string | null = null;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      // Exponential backoff between retries.
      await sleep(HEAD_BACKOFF_MS[attempt - 1]);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      // Manual redirect tracking — fetch follows up to 20 by default but
      // we want to log the chain. Cap at 3 redirects (per spec).
      let current = url;
      let resp: Response | null = null;
      for (let hop = 0; hop <= 3; hop++) {
        resp = await fetch(current, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": "CarosLedge-Verifier/1.0 (+https://carosledge.com)",
          },
        });
        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get("location");
          if (!loc) break;
          // Resolve relative redirects.
          const next = new URL(loc, current).toString();
          redirects.push(next);
          current = next;
          continue;
        }
        break;
      }
      clearTimeout(timer);
      finalStatus = resp?.status ?? null;
      finalUrl = current;
      // Success criteria: 2xx after redirect resolution. 4xx/5xx counts
      // as a hard fail and we move on; transient 5xx triggers retry.
      if (finalStatus !== null && finalStatus >= 200 && finalStatus < 300) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
      // Some servers reject HEAD with 405 but accept GET. Treat 405 as
      // "reachable" so we don't lose legitimate sources to method-policy.
      if (finalStatus === 405) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
      // 5xx → retry. 4xx (except 405) → don't retry, fail fast.
      if (finalStatus !== null && finalStatus >= 400 && finalStatus < 500) {
        return {
          ok: false,
          finalStatus,
          finalUrl,
          attempts: attempt,
          redirects,
          error: `HTTP ${finalStatus}`,
        };
      }
      lastError = `HTTP ${finalStatus}`;
    } catch (e: unknown) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.message : String(e);
      // Network error / timeout / abort → retry.
    }
  }
  return {
    ok: false,
    finalStatus,
    finalUrl,
    attempts: 3,
    redirects,
    error: lastError ?? "exhausted retries",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2: Content fetch
// ────────────────────────────────────────────────────────────────────────────
// Plain fetch + strip-html. Browserless is overkill for the ~6000 chars
// Haiku needs — most authoritative sources serve content in static HTML
// that fetch can read directly. If a particular host turns out to need
// JS rendering we can swap in browserlessRender() per-host without
// changing the pipeline shape.

const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;

async function fetchContent(url: string): Promise<{
  fetched: boolean;
  httpStatus?: number;
  text?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CarosLedge-Verifier/1.0 (+https://carosledge.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { fetched: false, httpStatus: resp.status, error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
    return { fetched: true, httpStatus: resp.status, text };
  } catch (e: unknown) {
    clearTimeout(timer);
    return {
      fetched: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3: Domain authority pattern check
// ────────────────────────────────────────────────────────────────────────────

function checkDomainAuthority(url: string): {
  pattern: string | null;
  confidence: "high" | "medium" | "low";
  matchedHost: string | null;
} {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { pattern: null, confidence: "low", matchedHost: null };
  }
  for (const dp of KNOWN_AUTHORITATIVE_PATTERNS) {
    if (dp.pattern.test(host)) {
      return { pattern: dp.label, confidence: dp.confidence, matchedHost: host };
    }
  }
  return { pattern: null, confidence: "low", matchedHost: host };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4: Duplicate check
// ────────────────────────────────────────────────────────────────────────────
// Two-stage: (1) exact host+pathname match against existing sources rows
// (cheap, indexed), (2) fuzzy host similarity (Levenshtein distance ≤ 2
// on the hostname only). We don't fuzzy-match the path because path
// fragments like "/news/2024/" naturally drift; URL canonicalization
// is a separate W2.G concern.

async function checkDuplicate(
  url: string,
  supabase: SupabaseClient
): Promise<{ matched: boolean; matchedSourceId?: string; method?: "host" | "path" }> {
  let host: string;
  let pathname: string;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return { matched: false };
  }

  // Exact host+path match — covers the common case where the same URL
  // is rediscovered. We pull a small window of rows for the host and
  // compare paths client-side, since Postgres' `host()` function lives
  // in inet not text — we'd need a stored-generated column to index it.
  const { data: hostMatches } = await supabase
    .from("sources")
    .select("id, url")
    .ilike("url", `%${host}%`)
    .limit(50);

  if (hostMatches && hostMatches.length > 0) {
    for (const row of hostMatches) {
      try {
        const existing = new URL(row.url);
        const existingHost = existing.hostname.toLowerCase();
        const existingPath = existing.pathname.replace(/\/+$/, "") || "/";
        if (existingHost === host) {
          if (existingPath === pathname) {
            return { matched: true, matchedSourceId: row.id, method: "path" };
          }
          // Same host, different path: count as duplicate at the
          // /api/admin/sources level if the existing row's path is the
          // root of the candidate (the candidate is a sub-page of an
          // already-monitored source). This is the right call for
          // verification — discovering EPA /vehicles/foo when EPA root
          // is already monitored is not a new source.
          if (pathname.startsWith(existingPath) || existingPath === "/") {
            return { matched: true, matchedSourceId: row.id, method: "host" };
          }
        }
      } catch {
        continue;
      }
    }
  }

  return { matched: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 5: Language detection
// ────────────────────────────────────────────────────────────────────────────
// Inlined heuristic — checks for English ASCII letter ratio + presence
// of high-frequency English stopwords. We don't pull `franc` to keep
// the bundle lean; the heuristic is good enough for the binary
// English / non-English call we need at this stage. False negatives
// (true English flagged as non-English) drop the row to tier M, which
// is the safe direction.

const ENGLISH_STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "is", "it", "for", "on", "with",
  "as", "by", "this", "that", "from", "or", "be", "are", "an", "at",
]);

function detectLanguage(text: string): { language: string | null; method: "heuristic" | "fallback" } {
  if (!text || text.length < 100) {
    return { language: null, method: "fallback" };
  }
  // ASCII-letter ratio. Non-Latin scripts (CJK, Cyrillic, Arabic) drop
  // this far below the threshold even with mixed content.
  const sample = text.slice(0, 4000);
  const asciiLetters = (sample.match(/[a-zA-Z]/g) ?? []).length;
  const totalNonSpace = (sample.match(/\S/g) ?? []).length;
  if (totalNonSpace === 0) return { language: null, method: "fallback" };
  const asciiRatio = asciiLetters / totalNonSpace;
  if (asciiRatio < 0.5) {
    // Likely non-Latin script. Don't try to identify which language —
    // anything other than English drops to tier M for Phase D.
    return { language: "non-english", method: "heuristic" };
  }
  // English stopword density check. Latin-script non-English (French,
  // German, Spanish, Portuguese) rarely hits 5+ English stopwords in
  // a 4000-char sample; English content typically hits 30+.
  const words = sample.toLowerCase().split(/\s+/).filter(Boolean);
  let stopwordHits = 0;
  for (const w of words) {
    if (ENGLISH_STOPWORDS.has(w)) stopwordHits++;
  }
  if (stopwordHits >= 8) {
    return { language: "en", method: "heuristic" };
  }
  // Latin script but low English stopword density — likely Romance/
  // Germanic non-English.
  return { language: "non-english", method: "heuristic" };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 6: Combined Haiku classification
// ────────────────────────────────────────────────────────────────────────────

type HaikuClassification = {
  ai_relevance_score: number;
  ai_freight_score: number;
  ai_trust_tier: AiTrustTier;
  rationale: string;
};

async function classifyWithHaiku(
  candidate: VerificationCandidate,
  contentText: string,
  apiKey: string
): Promise<{ ok: true; result: HaikuClassification } | { ok: false; error: string }> {
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
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ok: false, error: "No JSON object in model output" };
    const parsed = JSON.parse(m[0]);
    if (
      typeof parsed.ai_relevance_score !== "number" ||
      typeof parsed.ai_freight_score !== "number" ||
      typeof parsed.ai_trust_tier !== "string" ||
      !["T1", "T2", "T3"].includes(parsed.ai_trust_tier) ||
      typeof parsed.rationale !== "string"
    ) {
      return { ok: false, error: "Malformed classification shape" };
    }
    // Clamp scores to [0, 100] in case the model overshoots.
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      ok: true,
      result: {
        ai_relevance_score: clamp(parsed.ai_relevance_score),
        ai_freight_score: clamp(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier as AiTrustTier,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 7: Score aggregation
// ────────────────────────────────────────────────────────────────────────────
// Conservative: any single L-trigger forces L. Otherwise apply H thresholds;
// fall through to M.

function aggregateTier(input: {
  reachable: boolean;
  duplicate: boolean;
  domainConfidence: "high" | "medium" | "low";
  language: string | null;
  ai: HaikuClassification | null;
}): { tier: VerificationTier; triggers: string[]; rejection_reason?: string } {
  const triggers: string[] = [];

  // L-triggers (any one → L)
  if (!input.reachable) {
    triggers.push("reachability_fail");
    return { tier: "L", triggers, rejection_reason: "reachability" };
  }
  if (input.duplicate) {
    triggers.push("duplicate");
    return { tier: "L", triggers, rejection_reason: "duplicate" };
  }
  if (input.ai && input.ai.ai_relevance_score < THRESHOLDS.AI_RELEVANCE_M) {
    triggers.push(`ai_relevance_low(${input.ai.ai_relevance_score})`);
    return { tier: "L", triggers, rejection_reason: "ai_relevance_low" };
  }
  if (input.ai && input.ai.ai_freight_score < THRESHOLDS.AI_FREIGHT_M) {
    triggers.push(`ai_freight_low(${input.ai.ai_freight_score})`);
    return { tier: "L", triggers, rejection_reason: "not_freight_relevant" };
  }

  // No AI scores at all (Haiku call failed) → M, not L. We don't reject
  // a row we couldn't classify; operator review is the safety net.
  if (!input.ai) {
    triggers.push("ai_call_failed");
    return { tier: "M", triggers, rejection_reason: "ai_call_failed" };
  }

  // Language other than English → M (Phase D).
  if (input.language !== "en") {
    triggers.push(`language_${input.language ?? "unknown"}`);
    return { tier: "M", triggers, rejection_reason: "language_non_english" };
  }

  // Domain pattern unclear → M.
  if (input.domainConfidence === "low") {
    triggers.push("domain_unknown");
    return { tier: "M", triggers, rejection_reason: "domain_unknown" };
  }

  // H thresholds.
  const hRelevance = input.ai.ai_relevance_score >= THRESHOLDS.AI_RELEVANCE_H;
  const hFreight = input.ai.ai_freight_score >= THRESHOLDS.AI_FREIGHT_H;
  if (hRelevance && hFreight && input.domainConfidence === "high") {
    triggers.push(
      `H_clear(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=high)`
    );
    return { tier: "H", triggers };
  }

  // Anything else → M.
  triggers.push(
    `M_default(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=${input.domainConfidence})`
  );
  return { tier: "M", triggers };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 8: Action execution
// ────────────────────────────────────────────────────────────────────────────

async function executeAction(
  candidate: VerificationCandidate,
  tier: VerificationTier,
  ai: HaikuClassification | null,
  language: string | null,
  rejection_reason: string | undefined,
  supabase: SupabaseClient
): Promise<{
  action: VerificationAction;
  resulting_source_id?: string;
  resulting_provisional_id?: string;
  error?: string;
}> {
  if (tier === "L") {
    return { action: "rejected" };
  }

  if (tier === "H") {
    // Map AI trust tier → numeric tier on sources table:
    //   T1 → tier 1 (canonical primary)
    //   T2 → tier 2 (canonical regulator)
    //   T3 → tier 4 (industry/standards body — matches recommend-classification scheme)
    const numericTier =
      ai?.ai_trust_tier === "T1" ? 1 : ai?.ai_trust_tier === "T2" ? 2 : 4;

    const newSource = {
      name: candidate.name || candidate.url,
      url: candidate.url,
      description: ai?.rationale ?? "",
      tier: numericTier,
      tier_at_creation: numericTier,
      domains: [1], // Regulatory & Legislative — refined later by spot-check
      jurisdictions: candidate.jurisdiction_iso ?? [],
      transport_modes: [],
      access_method: "scrape",
      // Note: the sources table has no scan_enabled column. The closest
      // proxy is `status`: 'active' = scannable, 'suspended' = paused.
      // Since W2.F always inserts English-detected H rows here (non-English
      // were downgraded to M in aggregation), all H rows go in as 'active'.
      status: "active",
      admin_only: false,
      update_frequency: "weekly",
      intelligence_types: ["GUIDE"],
      vertical_tags: [],
      notes: `Auto-approved by W2.F verification pipeline ${new Date().toISOString().slice(0, 10)}. ` +
        `AI scores: rel=${ai?.ai_relevance_score ?? "?"}, frt=${ai?.ai_freight_score ?? "?"}, trust=${ai?.ai_trust_tier ?? "?"}. ` +
        `Awaiting platform-admin spot-check.`,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("sources")
      .insert(newSource)
      .select("id")
      .single();

    if (insertErr || !inserted) {
      return {
        action: "rejected",
        error: `H insert failed: ${insertErr?.message ?? "unknown"}`,
      };
    }
    return { action: "auto-approved", resulting_source_id: inserted.id };
  }

  // tier === "M"
  // provisional_sources.status CHECK constraint allows 'pending_review',
  // 'confirmed', 'rejected', 'needs_more_data' — not 'pending'. Use the
  // existing canonical value to satisfy the constraint.
  const newProvisional = {
    name: candidate.name || candidate.url,
    url: candidate.url,
    description: ai?.rationale ?? `Queued by W2.F verification pipeline. Reason: ${rejection_reason ?? "uncertain"}.`,
    discovered_via: "worker_search",
    status: "pending_review",
    provisional_tier: 7,
    recommended_tier: ai?.ai_trust_tier === "T1" ? 1 : ai?.ai_trust_tier === "T2" ? 2 : ai?.ai_trust_tier === "T3" ? 4 : null,
    reviewer_notes: `Auto-queued ${new Date().toISOString().slice(0, 10)}: ${rejection_reason ?? "uncertain"}. ` +
      `lang=${language ?? "unknown"}. ai_rel=${ai?.ai_relevance_score ?? "?"}, ai_frt=${ai?.ai_freight_score ?? "?"}.`,
  };

  const { data: insertedProv, error: provErr } = await supabase
    .from("provisional_sources")
    .insert(newProvisional)
    .select("id")
    .single();

  if (provErr || !insertedProv) {
    // The provisional table has UNIQUE(url) — a duplicate URL here is the
    // idempotency safety net (running twice on the same candidate). Treat
    // it as a non-failure.
    if (provErr?.message?.toLowerCase().includes("unique") || provErr?.code === "23505") {
      return { action: "queued-provisional" };
    }
    return {
      action: "rejected",
      error: `M insert failed: ${provErr?.message ?? "unknown"}`,
    };
  }
  return { action: "queued-provisional", resulting_provisional_id: insertedProv.id };
}

// ────────────────────────────────────────────────────────────────────────────
// Audit log write — always happens, even on rejection
// ────────────────────────────────────────────────────────────────────────────

async function writeAuditLog(
  candidate: VerificationCandidate,
  result: VerificationResult,
  log: VerificationLog,
  supabase: SupabaseClient
): Promise<void> {
  const row = {
    candidate_url: candidate.url,
    candidate_name: candidate.name ?? null,
    jurisdiction_iso: candidate.jurisdiction_iso ?? [],
    language: result.language,
    ai_relevance_score: result.ai_relevance_score,
    ai_freight_score: result.ai_freight_score,
    ai_trust_tier: result.ai_trust_tier,
    verification_tier: result.tier,
    action_taken: result.action,
    rejection_reason: result.rejection_reason ?? null,
    verification_log: log,
    resulting_source_id: result.resulting_source_id ?? null,
    resulting_provisional_id: result.resulting_provisional_id ?? null,
  };
  const { error } = await supabase.from("source_verifications").insert(row);
  if (error) {
    // Audit-log failure shouldn't block the pipeline; log to console so
    // the operator notices but return cleanly.
    console.warn(`[verification] audit log write failed for ${candidate.url}: ${error.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helper — service-role Supabase client
// ────────────────────────────────────────────────────────────────────────────

function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public API: verifyCandidate
// ────────────────────────────────────────────────────────────────────────────

export async function verifyCandidate(
  candidate: VerificationCandidate,
  opts?: { skipDuplicateCheck?: boolean; dryRun?: boolean; supabase?: SupabaseClient }
): Promise<VerificationResult> {
  const startedAt = Date.now();
  const supabase = opts?.supabase ?? getServiceClient();
  const skipDuplicateCheck = opts?.skipDuplicateCheck ?? false;
  const dryRun = opts?.dryRun ?? false;

  const log: VerificationLog = {
    candidate_url: candidate.url,
    candidate_name: candidate.name,
    discoveredFor: candidate.discoveredFor,
    reachability: { attempts: 0, finalStatus: null, finalUrl: null, redirects: [] },
    content: { fetched: false },
    domain: { pattern: null, confidence: "low", matchedHost: null },
    duplicate: { skipped: skipDuplicateCheck, matched: false },
    language: { detected: null, method: "skipped" },
    ai: { called: false },
    aggregation: { triggers: [], decision: "L" },
    action: { taken: "rejected" },
    timing: { totalMs: 0 },
  };

  // Step 1 — reachability
  const reach = await checkReachability(candidate.url);
  log.reachability = {
    attempts: reach.attempts,
    finalStatus: reach.finalStatus,
    finalUrl: reach.finalUrl,
    redirects: reach.redirects,
    error: reach.error,
  };

  // If unreachable → tier L immediately. Skip Haiku entirely.
  if (!reach.ok) {
    const agg = aggregateTier({
      reachable: false,
      duplicate: false,
      domainConfidence: "low",
      language: null,
      ai: null,
    });
    log.aggregation = { triggers: agg.triggers, decision: agg.tier };
    log.action.taken = "rejected";
    log.timing.totalMs = Date.now() - startedAt;

    const result: VerificationResult = {
      tier: "L",
      action: "rejected",
      ai_relevance_score: null,
      ai_freight_score: null,
      ai_trust_tier: null,
      language: null,
      rejection_reason: agg.rejection_reason,
      log,
    };
    if (!dryRun) await writeAuditLog(candidate, result, log, supabase);
    return result;
  }

  // Step 3 — domain authority pattern (cheap, do before content fetch)
  const resolvedUrl = reach.finalUrl ?? candidate.url;
  const domain = checkDomainAuthority(resolvedUrl);
  log.domain = domain;

  // Step 4 — duplicate check
  let duplicate: { matched: boolean; matchedSourceId?: string; method?: "host" | "path" } = {
    matched: false,
  };
  if (!skipDuplicateCheck) {
    duplicate = await checkDuplicate(resolvedUrl, supabase);
    log.duplicate = {
      skipped: false,
      matched: duplicate.matched,
      matchedSourceId: duplicate.matchedSourceId,
      method: duplicate.method,
    };
  }

  if (duplicate.matched) {
    const agg = aggregateTier({
      reachable: true,
      duplicate: true,
      domainConfidence: domain.confidence,
      language: null,
      ai: null,
    });
    log.aggregation = { triggers: agg.triggers, decision: agg.tier };
    log.action.taken = "rejected";
    log.timing.totalMs = Date.now() - startedAt;

    const result: VerificationResult = {
      tier: "L",
      action: "rejected",
      ai_relevance_score: null,
      ai_freight_score: null,
      ai_trust_tier: null,
      language: null,
      rejection_reason: agg.rejection_reason,
      log,
    };
    if (!dryRun) await writeAuditLog(candidate, result, log, supabase);
    return result;
  }

  // Step 2 — content fetch (only if we're going to use it)
  const content = await fetchContent(resolvedUrl);
  log.content = {
    fetched: content.fetched,
    httpStatus: content.httpStatus,
    textLength: content.text?.length,
    error: content.error,
  };

  const contentText = content.text ?? "";

  // Step 5 — language detection (run on actual fetched content)
  const lang = detectLanguage(contentText);
  log.language = { detected: lang.language, method: lang.method };

  // Step 6 — Haiku classification (skip if no content was fetched)
  let aiResult: HaikuClassification | null = null;
  let aiError: string | undefined;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    aiError = "ANTHROPIC_API_KEY not configured";
    log.ai = { called: false, error: aiError };
  } else if (!contentText) {
    aiError = "no content to classify";
    log.ai = { called: false, error: aiError };
  } else {
    const aiCall = await classifyWithHaiku(candidate, contentText, apiKey);
    if (aiCall.ok) {
      aiResult = aiCall.result;
      log.ai = { called: true, rationale: aiCall.result.rationale };
    } else {
      aiError = aiCall.error;
      log.ai = { called: true, error: aiCall.error };
    }
  }

  // Step 7 — aggregate
  const agg = aggregateTier({
    reachable: true,
    duplicate: false,
    domainConfidence: domain.confidence,
    language: lang.language,
    ai: aiResult,
  });
  log.aggregation = { triggers: agg.triggers, decision: agg.tier };

  // Step 8 — execute action
  let action: VerificationAction;
  let resulting_source_id: string | undefined;
  let resulting_provisional_id: string | undefined;

  if (dryRun) {
    action = agg.tier === "H" ? "auto-approved" : agg.tier === "M" ? "queued-provisional" : "rejected";
    log.action.taken = action;
  } else {
    const exec = await executeAction(
      candidate,
      agg.tier,
      aiResult,
      lang.language,
      agg.rejection_reason,
      supabase
    );
    action = exec.action;
    resulting_source_id = exec.resulting_source_id;
    resulting_provisional_id = exec.resulting_provisional_id;
    log.action = { taken: action, error: exec.error };
  }

  log.timing.totalMs = Date.now() - startedAt;

  const result: VerificationResult = {
    tier: agg.tier,
    action,
    ai_relevance_score: aiResult?.ai_relevance_score ?? null,
    ai_freight_score: aiResult?.ai_freight_score ?? null,
    ai_trust_tier: aiResult?.ai_trust_tier ?? null,
    language: lang.language,
    rejection_reason: agg.rejection_reason,
    log,
    resulting_source_id,
    resulting_provisional_id,
  };

  if (!dryRun) await writeAuditLog(candidate, result, log, supabase);
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Exports for testing / external introspection
// ────────────────────────────────────────────────────────────────────────────

export const __internals = {
  KNOWN_AUTHORITATIVE_PATTERNS,
  THRESHOLDS,
  HAIKU_MODEL,
  checkDomainAuthority,
  detectLanguage,
  aggregateTier,
};
