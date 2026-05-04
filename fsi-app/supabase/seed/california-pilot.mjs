// California pilot — one-shot dry-run validation of the discovery + verification
// pipeline against jurisdiction US-CA. NO database writes. Replicates the logic
// of fsi-app/src/lib/sources/discovery.ts and fsi-app/src/lib/sources/verification.ts
// in plain Node ESM. The system prompts and the KNOWN_AUTHORITATIVE_PATTERNS
// list are copied verbatim from those modules so this run captures a snapshot
// of the prompts as deployed on the run date.
//
// Usage (from fsi-app/):
//   node supabase/seed/california-pilot.mjs
//
// Outputs:
//   - ../docs/california-pilot-results.json  (machine-readable report)
//   - ../docs/california-pilot-summary.md    (human-readable summary)
//
// Cost model (deep mode):
//   - 1 Sonnet 4.6 call with web_search (10 max uses) ≈ $0.15
//   - up to 20 Haiku 4.5 candidate calls + 3 control calls ≈ $0.001 each ≈ $0.023
//   - Total ≈ $0.17

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ────────────────────────────────────────────────────────────────────────────
// Resolve paths
// ────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// supabase/seed/california-pilot.mjs → fsi-app/.env.local
const ENV_PATH = resolve(__dirname, "..", "..", ".env.local");
// supabase/seed/california-pilot.mjs → docs/
const DOCS_DIR = resolve(__dirname, "..", "..", "..", "docs");
const REPORT_JSON_PATH = resolve(DOCS_DIR, "california-pilot-results.json");
const REPORT_MD_PATH = resolve(DOCS_DIR, "california-pilot-summary.md");

// ────────────────────────────────────────────────────────────────────────────
// Env loading (manual parse — no dotenv dep needed)
// ────────────────────────────────────────────────────────────────────────────

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `Could not read env file at ${path}. Make sure fsi-app/.env.local exists. Error: ${e.message}`
    );
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_PATH);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY missing from fsi-app/.env.local. Aborting."
  );
  process.exit(1);
}
// Supabase creds aren't strictly needed (dry-run skips DB writes and we're
// also skipping the duplicate check) but we surface a hint if missing so the
// operator knows the .env.local is right.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "WARN: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. " +
      "Dry-run does not need them, but the rest of the platform does."
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Models + constants (mirrors discovery.ts and verification.ts)
// ────────────────────────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";
const WEB_SEARCH_BETA = "web-search-2025-03-05";
const WEB_SEARCH_TOOL_NAME = "web_search_20250305";

const DEPTH = "deep";
const DEPTH_CONFIG = {
  maxCandidates: 20,
  webSearchMaxUses: 10,
  guidance:
    "Return up to 20 candidates (15-20 for deep mode). Run multiple web searches to surface sub-agencies and adjacent regulators. Include sub-portals where they are the canonical regulatory publisher.",
};

const JURISDICTION_ISO = "US-CA";
const JURISDICTION_LABEL = "California (US state)";
const FALLBACK_LANGUAGE = "en";

// Cost estimates (USD). Sonnet 4.6: $3/M input, $15/M output. Haiku 4.5: $1/M input, $5/M output.
// Web search billed at $0.01/use plus the underlying tokens. Conservative deep estimates:
const SONNET_COST_DEEP_USD = 0.15;
const HAIKU_COST_PER_CALL_USD = 0.001;

// ────────────────────────────────────────────────────────────────────────────
// DISCOVERY_SYSTEM_PROMPT — copied VERBATIM from
// fsi-app/src/lib/sources/discovery.ts
// ────────────────────────────────────────────────────────────────────────────

const DISCOVERY_SYSTEM_PROMPT = `You are a regulatory source discovery agent for a freight-sustainability
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
// VERIFICATION_HAIKU_SYSTEM_PROMPT — copied VERBATIM from
// fsi-app/src/lib/sources/verification.ts
// ────────────────────────────────────────────────────────────────────────────

const VERIFICATION_HAIKU_SYSTEM_PROMPT = `You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,
  "ai_freight_score": 0-100,
  "ai_trust_tier": "T1"|"T2"|"T3",
  "rationale": "<=150 char summary"
}

Scoring guidance:

ai_relevance_score — sustainability / climate / environmental / energy / transport regulatory content. Government regulators with mandates covering ANY of: emissions, air quality, water, waste, energy, climate, fuel, building codes, vehicle standards, public utilities, transport planning, customs, trade. Canonical state-level publishers (CARB, CalEPA, CEC, CPUC, leginfo.legislature.ca.gov, NYDEC, etc.) score 80-95 even when their mandate is broader than just sustainability — they ARE the canonical place where sustainability regulations live. Only score below 60 when the source is unambiguously off-topic (tourism, museums, sports, entertainment, retail not regulated for sustainability).

ai_freight_score — does this jurisdiction's regulatory output operationally affect freight, cargo, shipping, transport, supply chain, or the operations that support them (warehouses, ports, distribution centers, fleets, logistics labor)? This includes INDIRECTLY freight-affecting domains:
- Air quality / emissions standards (truck fleets, port operations)
- Energy / fuel / alternative-fuel regulation (fuel costs, EV charging, hydrogen, SAF)
- Public utility regulation (electric trucks, port electrification, charging infrastructure)
- Vehicle registration / safety / inspection (commercial fleet operations)
- Building / facility codes (warehouses, distribution centers, cold-chain)
- Labor regulation (drivers, dock workers, warehouse staff)
- Customs / trade / sanctions / dangerous goods
- Transport planning / freight corridors / port master plans
- Legislative archives where freight-affecting bills are published (e.g., leginfo.legislature.ca.gov hosts SB 253, SB 261, AB 1305 — all freight-affecting)

State-level umbrella regulators (CalEPA), legislative-archive sites where regulations are codified (leginfo, ecfr), and major regulator portals (CARB, CPUC, CEC) score 60-90 freight even when not pure-freight agencies.

Score below 30 ONLY when the source has no plausible operational impact on freight — tourism, recreation, cultural institutions, off-topic news.

ai_trust_tier — reflects canonicalness, NOT jurisdictional level:
- T1: canonical primary regulatory publication (Federal Register, EUR-Lex, IMO, ICAO, gazettes, official legislative archives like leginfo.legislature.ca.gov)
- T2: canonical regulator (EPA, CARB, EMSA, CPUC, CEC, CalEPA, NYDEC, state-level primary regulators)
- T3: reputable secondary (industry associations, standards bodies, think tanks, academic centers)

Sub-state and state agencies issuing primary regulation are T2 — same as EPA. Air-quality management districts (AQMDs) issuing district rules are T2. Regional boards under state umbrellas are T2.

Output JSON only, no prose, no markdown, no code fences.`;

// ────────────────────────────────────────────────────────────────────────────
// KNOWN_AUTHORITATIVE_PATTERNS — copied VERBATIM (54 patterns) from
// fsi-app/src/lib/sources/verification.ts
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_AUTHORITATIVE_PATTERNS = [
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

  // ── US Federal regulators ──
  { pattern: /(^|\.)federalregister\.gov$/i,      confidence: "high",   label: "us-fr" },
  { pattern: /(^|\.)regulations\.gov$/i,          confidence: "high",   label: "us-reg" },
  { pattern: /(^|\.)epa\.gov$/i,                  confidence: "high",   label: "us-epa" },
  { pattern: /(^|\.)dot\.gov$/i,                  confidence: "high",   label: "us-dot" },
  { pattern: /(^|\.)cbp\.gov$/i,                  confidence: "high",   label: "us-cbp" },
  { pattern: /(^|\.)faa\.gov$/i,                  confidence: "high",   label: "us-faa" },
  { pattern: /(^|\.)fmcsa\.dot\.gov$/i,           confidence: "high",   label: "us-fmcsa" },

  // ── US State agencies ──
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

const THRESHOLDS = {
  AI_RELEVANCE_H: 70,
  AI_RELEVANCE_M: 50,
  AI_FREIGHT_H: 50,
  AI_FREIGHT_M: 25,
};

// ────────────────────────────────────────────────────────────────────────────
// JSON parse — 3-tier fallback (mirrors discovery.ts)
// ────────────────────────────────────────────────────────────────────────────

function tryParseJson(text) {
  const attempts = [];

  try {
    const parsed = JSON.parse(text);
    attempts.push({ ok: true, parsed, tier: 1 });
    return attempts;
  } catch (e) {
    attempts.push({ ok: false, tier: 1, error: e.message });
  }

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
      attempts.push({ ok: false, tier: 2, error: e.message });
    }
  }

  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      attempts.push({ ok: true, parsed, tier: 3 });
      return attempts;
    } catch (e) {
      attempts.push({ ok: false, tier: 3, error: e.message });
    }
  }

  return attempts;
}

// ────────────────────────────────────────────────────────────────────────────
// Candidate validation (mirrors discovery.ts validateCandidate)
// ────────────────────────────────────────────────────────────────────────────

const CANDIDATE_TYPES = new Set([
  "regulator",
  "gazette",
  "standards-body",
  "industry-association",
  "court",
  "court-tracker",
  "aggregator",
]);

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateCandidate(raw, fallbackLanguage) {
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
  if (!CANDIDATE_TYPES.has(typeStr)) return null;

  let score;
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
    type: typeStr,
    language: languageStr,
    freight_relevance_score: score,
    rationale,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Sonnet discovery call (mirrors discovery.ts callSonnetForDiscovery)
// ────────────────────────────────────────────────────────────────────────────

async function runDiscovery() {
  const userMessage = `Jurisdiction code: ${JURISDICTION_ISO}
Jurisdiction label: ${JURISDICTION_LABEL}
Depth mode: ${DEPTH}
Discovery language preference: ${FALLBACK_LANGUAGE}

Depth guidance: ${DEPTH_CONFIG.guidance}

Identify the canonical regulatory publishers for this jurisdiction relevant to freight sustainability. Output JSON only (no prose, no markdown, no code fences). The "jurisdiction_label" field must echo the human-readable label. The "candidates" array must conform to the schema in the system prompt.`;

  console.log(`[discovery] Sonnet ${SONNET_MODEL} call (depth=${DEPTH})...`);
  const t0 = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
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
          max_uses: DEPTH_CONFIG.webSearchMaxUses,
        },
      ],
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Sonnet API ${response.status}: ${body.slice(0, 600)}`
    );
  }

  const data = await response.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const rawAssistantText =
    (data.content || [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("") || "";

  // Count web_search tool uses for the report.
  const webSearchCalls =
    (data.content || []).filter(
      (b) => b.type === "server_tool_use" && b.name === "web_search"
    ).length;

  const attempts = tryParseJson(rawAssistantText);
  const winning = attempts.find((a) => a.ok);
  if (!winning) {
    const errorTrace = attempts
      .map((a) => `tier${a.tier}:${a.error ?? "ok"}`)
      .join(" | ");
    throw new Error(
      `Could not extract JSON from Sonnet output. Attempts: ${errorTrace}\n--- raw ---\n${rawAssistantText.slice(0, 2000)}`
    );
  }

  const parsed = winning.parsed;
  if (!isPlainObject(parsed)) {
    throw new Error("Sonnet output parsed but is not a JSON object");
  }

  const labelOut =
    typeof parsed.jurisdiction_label === "string" &&
    parsed.jurisdiction_label.trim().length > 0
      ? parsed.jurisdiction_label.trim()
      : JURISDICTION_LABEL;

  const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = [];
  const seenUrls = new Set();
  for (const raw of candidatesRaw) {
    const v = validateCandidate(raw, FALLBACK_LANGUAGE);
    if (!v) continue;
    const key = v.url.toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    candidates.push(v);
    if (candidates.length >= DEPTH_CONFIG.maxCandidates) break;
  }

  console.log(
    `[discovery] ${elapsed}s, ${candidates.length} valid candidates, ${webSearchCalls} web_search calls (parse tier ${winning.tier})`
  );

  return {
    jurisdiction_label: labelOut,
    candidates,
    rawAssistantText,
    webSearchCalls,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verification helpers (mirror verification.ts)
// ────────────────────────────────────────────────────────────────────────────

const HEAD_TIMEOUT_MS = 8_000;
const HEAD_BACKOFF_MS = [200, 800, 3200];
const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkReachability(url) {
  const redirects = [];
  let finalStatus = null;
  let finalUrl = null;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await sleep(HEAD_BACKOFF_MS[attempt - 1]);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
      let current = url;
      let resp = null;
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
      if (finalStatus !== null && finalStatus >= 200 && finalStatus < 300) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
      if (finalStatus === 405) {
        return { ok: true, finalStatus, finalUrl, attempts: attempt, redirects };
      }
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
    } catch (e) {
      clearTimeout(timer);
      lastError = e instanceof Error ? e.message : String(e);
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

async function fetchContent(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CarosLedge-Verifier/1.0 (+https://carosledge.com)",
        Accept: "text/html,application/xhtml+xml",
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
  } catch (e) {
    clearTimeout(timer);
    return { fetched: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function checkDomainAuthority(url) {
  let host;
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

async function classifyWithHaiku(candidate, contentText) {
  const userMessage = `Candidate URL: ${candidate.url}
Candidate name: ${candidate.name ?? "(unknown)"}
Discovered for jurisdiction: ${candidate.discoveredFor ?? "(unspecified)"}

Content excerpt (truncated to ~6000 chars):
---
${contentText.slice(0, CONTENT_MAX_CHARS)}
---

Output the JSON object only.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system: VERIFICATION_HAIKU_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
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
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      ok: true,
      result: {
        ai_relevance_score: clamp(parsed.ai_relevance_score),
        ai_freight_score: clamp(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier,
        rationale: String(parsed.rationale).slice(0, 200),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function aggregateTier(input) {
  const triggers = [];

  if (!input.reachable) {
    triggers.push("reachability_fail");
    return { tier: "L", triggers, rejection_reason: "reachability" };
  }
  if (input.ai && input.ai.ai_relevance_score < THRESHOLDS.AI_RELEVANCE_M) {
    triggers.push(`ai_relevance_low(${input.ai.ai_relevance_score})`);
    return { tier: "L", triggers, rejection_reason: "ai_relevance_low" };
  }
  if (input.ai && input.ai.ai_freight_score < THRESHOLDS.AI_FREIGHT_M) {
    triggers.push(`ai_freight_low(${input.ai.ai_freight_score})`);
    return { tier: "L", triggers, rejection_reason: "not_freight_relevant" };
  }
  if (!input.ai) {
    triggers.push("ai_call_failed");
    return { tier: "M", triggers, rejection_reason: "ai_call_failed" };
  }
  if (input.language !== "en") {
    triggers.push(`language_${input.language ?? "unknown"}`);
    return { tier: "M", triggers, rejection_reason: "language_non_english" };
  }
  if (input.domainConfidence === "low") {
    triggers.push("domain_unknown");
    return { tier: "M", triggers, rejection_reason: "domain_unknown" };
  }

  const hRelevance = input.ai.ai_relevance_score >= THRESHOLDS.AI_RELEVANCE_H;
  const hFreight = input.ai.ai_freight_score >= THRESHOLDS.AI_FREIGHT_H;
  if (hRelevance && hFreight && input.domainConfidence === "high") {
    triggers.push(
      `H_clear(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=high)`
    );
    return { tier: "H", triggers };
  }

  triggers.push(
    `M_default(rel=${input.ai.ai_relevance_score},frt=${input.ai.ai_freight_score},dom=${input.domainConfidence})`
  );
  return { tier: "M", triggers };
}

function tierToAction(tier) {
  return tier === "H"
    ? "auto-approved"
    : tier === "M"
    ? "queued-provisional"
    : "rejected";
}

// ────────────────────────────────────────────────────────────────────────────
// verifyOne — runs the full verification pipeline on a single URL.
// duplicate-check is SKIPPED (per spec — we want all candidates including
// duplicates of existing sources for calibration). Language is treated
// English-only; we still run the heuristic so the audit log captures it.
// ────────────────────────────────────────────────────────────────────────────

async function verifyOne(candidate) {
  const result = {
    url: candidate.url,
    name: candidate.name,
    head_status: null,
    domain_confidence: "low",
    domain_pattern: null,
    ai_relevance_score: null,
    ai_freight_score: null,
    ai_trust_tier: null,
    rationale: null,
    tier: "L",
    would_action: "rejected",
    rejection_reason: null,
    triggers: [],
    haiku_called: false,
    haiku_error: null,
    head_error: null,
    content_fetched: false,
    content_length: 0,
    detected_language: null,
  };

  // Step 1: HEAD reachability
  const reach = await checkReachability(candidate.url);
  result.head_status = reach.finalStatus;
  if (!reach.ok) {
    result.head_error = reach.error;
    const agg = aggregateTier({
      reachable: false,
      domainConfidence: "low",
      language: null,
      ai: null,
    });
    result.tier = agg.tier;
    result.triggers = agg.triggers;
    result.rejection_reason = agg.rejection_reason ?? null;
    result.would_action = tierToAction(agg.tier);
    return result;
  }

  const resolvedUrl = reach.finalUrl ?? candidate.url;

  // Step 3: Domain authority pattern
  const domain = checkDomainAuthority(resolvedUrl);
  result.domain_confidence = domain.confidence;
  result.domain_pattern = domain.pattern;

  // Step 2: Content fetch
  const content = await fetchContent(resolvedUrl);
  result.content_fetched = content.fetched;
  result.content_length = content.text?.length ?? 0;
  const contentText = content.text ?? "";

  // Step 5: Language — California pilot is English-only by spec; we tag 'en'
  // when we have any reasonable text length, otherwise null. We don't run
  // the full heuristic because non-English here is irrelevant.
  result.detected_language = contentText.length > 100 ? "en" : null;

  // Step 6: Haiku
  let aiResult = null;
  if (!contentText) {
    result.haiku_called = false;
    result.haiku_error = "no content to classify";
  } else {
    const aiCall = await classifyWithHaiku(candidate, contentText);
    result.haiku_called = true;
    if (aiCall.ok) {
      aiResult = aiCall.result;
      result.ai_relevance_score = aiResult.ai_relevance_score;
      result.ai_freight_score = aiResult.ai_freight_score;
      result.ai_trust_tier = aiResult.ai_trust_tier;
      result.rationale = aiResult.rationale;
    } else {
      result.haiku_error = aiCall.error;
    }
  }

  // Step 7: Aggregate
  const agg = aggregateTier({
    reachable: true,
    domainConfidence: domain.confidence,
    language: result.detected_language,
    ai: aiResult,
  });
  result.tier = agg.tier;
  result.triggers = agg.triggers;
  result.rejection_reason = agg.rejection_reason ?? null;
  result.would_action = tierToAction(agg.tier);

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Control sets
// ────────────────────────────────────────────────────────────────────────────

const KNOWN_GOOD = [
  { name: "California Air Resources Board", url: "https://ww2.arb.ca.gov/" },
  { name: "California Public Utilities Commission", url: "https://www.cpuc.ca.gov/" },
  { name: "California Environmental Protection Agency", url: "https://calepa.ca.gov/" },
  { name: "California Energy Commission", url: "https://www.energy.ca.gov/" },
  { name: "CARB Rulemaking", url: "https://ww2.arb.ca.gov/rulemaking" },
];

const KNOWN_IRRELEVANT = [
  { name: "Visit California (tourism)", url: "https://www.visitcalifornia.com/", expected_tier: "L" },
  { name: "Los Angeles County Museum of Art", url: "https://www.lacma.org/", expected_tier: "L" },
  { name: "California DMV (borderline)", url: "https://www.dmv.ca.gov/", expected_tier: "M" },
];

// Match a discovered candidate against a known-good URL. Loose match —
// trims trailing slashes and lowercases, but otherwise checks for substring
// to handle path variants (e.g., /rulemaking vs /rulemaking/).
function matchUrl(candidateUrl, expectedUrl) {
  const norm = (u) => u.toLowerCase().replace(/\/+$/, "");
  const a = norm(candidateUrl);
  const b = norm(expectedUrl);
  return a === b || a.startsWith(b) || b.startsWith(a);
}

// ────────────────────────────────────────────────────────────────────────────
// Calibration notes generator
// ────────────────────────────────────────────────────────────────────────────

function buildCalibrationNotes(verResults, knownGoodChecks, knownIrrelevantChecks) {
  const notes = [];

  // Known-good calibration
  for (const kg of knownGoodChecks) {
    if (!kg.discovered) {
      notes.push(
        `Known-good "${kg.name}" (${kg.url}) was NOT discovered — discovery prompt may need a hint about this agency.`
      );
      continue;
    }
    const v = kg.verification;
    if (!v) continue;
    const rel = v.ai_relevance_score;
    const frt = v.ai_freight_score;
    if (v.tier === "H") {
      notes.push(
        `${kg.name} scored ${rel}/${frt} (rel/frt) — tier H confirmed. Threshold correctly placed.`
      );
    } else if (v.tier === "M") {
      notes.push(
        `${kg.name} scored ${rel}/${frt} — landed at tier M. If this is a known canonical regulator, consider lowering AI_RELEVANCE_H from ${THRESHOLDS.AI_RELEVANCE_H} or AI_FREIGHT_H from ${THRESHOLDS.AI_FREIGHT_H}.`
      );
    } else {
      notes.push(
        `${kg.name} scored ${rel}/${frt} — tier L. Review reachability/content fetch for this URL.`
      );
    }
  }

  // Known-irrelevant calibration
  for (const ki of knownIrrelevantChecks) {
    const v = ki.verification;
    if (!v) {
      notes.push(`Known-irrelevant "${ki.name}" verification did not run.`);
      continue;
    }
    if (v.tier === ki.expected_tier) {
      notes.push(
        `${ki.name} scored ${v.ai_relevance_score}/${v.ai_freight_score} — tier ${v.tier} as expected. Threshold well-calibrated for this case.`
      );
    } else if (ki.expected_tier === "L" && v.tier !== "L") {
      notes.push(
        `${ki.name} scored ${v.ai_relevance_score}/${v.ai_freight_score} — tier ${v.tier} (expected L). Raise AI_RELEVANCE_M from ${THRESHOLDS.AI_RELEVANCE_M} or AI_FREIGHT_M from ${THRESHOLDS.AI_FREIGHT_M} to reject this kind of source.`
      );
    } else if (ki.expected_tier === "M" && v.tier === "L") {
      notes.push(
        `${ki.name} scored ${v.ai_relevance_score}/${v.ai_freight_score} — tier L (expected M). Possibly too aggressive on rejection thresholds.`
      );
    } else if (ki.expected_tier === "M" && v.tier === "H") {
      notes.push(
        `${ki.name} scored ${v.ai_relevance_score}/${v.ai_freight_score} — tier H (expected M). Borderline source auto-approved; consider tightening H thresholds.`
      );
    }
  }

  // Aggregate distribution check
  const tierCounts = { H: 0, M: 0, L: 0 };
  for (const v of verResults) tierCounts[v.tier]++;
  if (tierCounts.H === 0 && verResults.length > 0) {
    notes.push(
      "ZERO discovered candidates landed at tier H. The H thresholds (rel≥85, frt≥60, domain=high) may be too strict for this jurisdiction."
    );
  }
  if (tierCounts.L > tierCounts.H && tierCounts.L > tierCounts.M) {
    notes.push(
      `Tier-L dominates (${tierCounts.L} of ${verResults.length}). Either discovery is surfacing too many irrelevant URLs or thresholds are too aggressive.`
    );
  }

  return notes;
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown report builder
// ────────────────────────────────────────────────────────────────────────────

function buildMarkdown(report) {
  const {
    ran_at,
    jurisdiction_iso,
    depth,
    discovery,
    verification,
    tier_distribution,
    control_check,
    calibration_notes,
  } = report;

  const sonnetCost = discovery.sonnet_cost_usd_estimated.toFixed(4);
  const haikuCost = verification.haiku_cost_usd_estimated.toFixed(4);
  const totalCost = (
    discovery.sonnet_cost_usd_estimated + verification.haiku_cost_usd_estimated
  ).toFixed(4);

  const lines = [];
  lines.push(`# California Pilot Results`);
  lines.push("");
  lines.push(`- **Run timestamp:** ${ran_at}`);
  lines.push(`- **Jurisdiction:** ${jurisdiction_iso}`);
  lines.push(`- **Depth:** ${depth}`);
  lines.push(
    `- **Estimated cost:** Sonnet $${sonnetCost} + Haiku $${haikuCost} = **$${totalCost} total**`
  );
  lines.push(
    `- **Discovery candidates:** ${discovery.candidate_count} (web_search calls: ${discovery.web_search_calls})`
  );
  lines.push(`- **Haiku verification calls:** ${verification.haiku_calls}`);
  lines.push("");

  // Discovery table
  lines.push(`## Discovery — candidates returned by Sonnet ${SONNET_MODEL}`);
  lines.push("");
  lines.push(`| # | Name | Type | URL | Lang | Freight Score | Rationale |`);
  lines.push(`|---|------|------|-----|------|--------------:|-----------|`);
  discovery.candidates.forEach((c, i) => {
    const rationale = (c.rationale || "").replace(/\|/g, "\\|").slice(0, 120);
    lines.push(
      `| ${i + 1} | ${c.name} | ${c.type} | ${c.url} | ${c.language} | ${c.freight_relevance_score} | ${rationale} |`
    );
  });
  lines.push("");

  // Verification table
  lines.push(`## Verification — pipeline output per candidate`);
  lines.push("");
  lines.push(
    `| # | URL | HEAD | Domain | AI Rel | AI Frt | Trust | Tier | Action | Rationale |`
  );
  lines.push(
    `|---|-----|-----:|--------|-------:|-------:|------:|:----:|--------|-----------|`
  );
  verification.results.forEach((r, i) => {
    const rationale = (r.rationale || "").replace(/\|/g, "\\|").slice(0, 100);
    lines.push(
      `| ${i + 1} | ${r.url} | ${r.head_status ?? "-"} | ${r.domain_confidence} | ${r.ai_relevance_score ?? "-"} | ${r.ai_freight_score ?? "-"} | ${r.ai_trust_tier ?? "-"} | ${r.tier} | ${r.would_action} | ${rationale} |`
    );
  });
  lines.push("");

  // Tier distribution bar chart (text)
  lines.push(`## Tier Distribution`);
  lines.push("");
  lines.push("```");
  const total =
    tier_distribution.H + tier_distribution.M + tier_distribution.L;
  const bar = (n) => "█".repeat(Math.max(0, n));
  lines.push(`H  ${String(tier_distribution.H).padStart(2)}  ${bar(tier_distribution.H)}`);
  lines.push(`M  ${String(tier_distribution.M).padStart(2)}  ${bar(tier_distribution.M)}`);
  lines.push(`L  ${String(tier_distribution.L).padStart(2)}  ${bar(tier_distribution.L)}`);
  lines.push(`        total = ${total}`);
  lines.push("```");
  lines.push("");

  // Control check tables
  lines.push(`## Control Check — Known-Good (must be discovered + tier H)`);
  lines.push("");
  lines.push(`| Name | URL | Discovered? | Tier | AI Trust | Pass |`);
  lines.push(`|------|-----|:-----------:|:----:|:--------:|:----:|`);
  for (const kg of control_check.known_good) {
    lines.push(
      `| ${kg.name} | ${kg.url} | ${kg.discovered ? "yes" : "**no**"} | ${kg.tier ?? "-"} | ${kg.ai_trust_tier ?? "-"} | ${kg.pass ? "PASS" : "**FAIL**"} |`
    );
  }
  lines.push("");

  lines.push(`## Control Check — Known-Irrelevant (verified directly, not via discovery)`);
  lines.push("");
  lines.push(
    `| Name | URL | Expected | Actual | AI Rel | AI Frt | Pass |`
  );
  lines.push(
    `|------|-----|:--------:|:------:|-------:|-------:|:----:|`
  );
  for (const ki of control_check.known_irrelevant) {
    lines.push(
      `| ${ki.name} | ${ki.url} | ${ki.expected_tier} | ${ki.tier ?? "-"} | ${ki.ai_relevance_score ?? "-"} | ${ki.ai_freight_score ?? "-"} | ${ki.pass ? "PASS" : "**FAIL**"} |`
    );
  }
  lines.push("");

  // Calibration notes
  lines.push(`## Threshold Calibration Recommendations`);
  lines.push("");
  if (calibration_notes.length === 0) {
    lines.push("_No calibration notes generated._");
  } else {
    for (const n of calibration_notes) {
      lines.push(`- ${n}`);
    }
  }
  lines.push("");

  // Threshold reference
  lines.push(`### Current thresholds (snapshot from verification.ts)`);
  lines.push("");
  lines.push("```");
  lines.push(`AI_RELEVANCE_H = ${THRESHOLDS.AI_RELEVANCE_H}    // ai_relevance_score >= this → eligible for H`);
  lines.push(`AI_RELEVANCE_M = ${THRESHOLDS.AI_RELEVANCE_M}    // below this → L (rejected)`);
  lines.push(`AI_FREIGHT_H   = ${THRESHOLDS.AI_FREIGHT_H}    // ai_freight_score >= this → eligible for H`);
  lines.push(`AI_FREIGHT_M   = ${THRESHOLDS.AI_FREIGHT_M}    // below this → L (not freight relevant)`);
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const ranAt = new Date().toISOString();
  console.log(`California pilot — dry run @ ${ranAt}`);
  console.log(`Jurisdiction: ${JURISDICTION_ISO} (${JURISDICTION_LABEL})`);
  console.log(`Depth: ${DEPTH}`);
  console.log(`Output JSON: ${REPORT_JSON_PATH}`);
  console.log(`Output MD:   ${REPORT_MD_PATH}`);
  console.log("");

  // ── Discovery ──
  const discoveryOut = await runDiscovery();
  console.log("");

  // ── Verification of each discovered candidate ──
  console.log(`[verification] running pipeline on ${discoveryOut.candidates.length} candidates...`);
  const verResults = [];
  let haikuCalls = 0;
  for (let i = 0; i < discoveryOut.candidates.length; i++) {
    const c = discoveryOut.candidates[i];
    process.stdout.write(`  [${i + 1}/${discoveryOut.candidates.length}] ${c.url} ... `);
    const v = await verifyOne({
      url: c.url,
      name: c.name,
      jurisdiction_iso: [JURISDICTION_ISO],
      discoveredFor: JURISDICTION_ISO,
    });
    if (v.haiku_called) haikuCalls++;
    process.stdout.write(`tier=${v.tier} rel=${v.ai_relevance_score ?? "-"} frt=${v.ai_freight_score ?? "-"}\n`);
    verResults.push(v);
  }
  console.log("");

  // ── Control: Known-good ──
  console.log("[control] cross-checking known-good URLs...");
  const knownGoodChecks = [];
  for (const kg of KNOWN_GOOD) {
    const matched = verResults.find((r) => matchUrl(r.url, kg.url));
    if (matched) {
      const pass = matched.tier === "H";
      knownGoodChecks.push({
        name: kg.name,
        url: kg.url,
        discovered: true,
        tier: matched.tier,
        ai_trust_tier: matched.ai_trust_tier,
        ai_relevance_score: matched.ai_relevance_score,
        ai_freight_score: matched.ai_freight_score,
        pass,
        verification: matched,
      });
      console.log(`  ${kg.name}: discovered, tier=${matched.tier} ${pass ? "PASS" : "FAIL"}`);
    } else {
      // Not discovered — run verification directly so we still get a signal.
      console.log(`  ${kg.name}: NOT discovered, running verification directly...`);
      const v = await verifyOne({
        url: kg.url,
        name: kg.name,
        jurisdiction_iso: [JURISDICTION_ISO],
        discoveredFor: JURISDICTION_ISO,
      });
      if (v.haiku_called) haikuCalls++;
      knownGoodChecks.push({
        name: kg.name,
        url: kg.url,
        discovered: false,
        tier: v.tier,
        ai_trust_tier: v.ai_trust_tier,
        ai_relevance_score: v.ai_relevance_score,
        ai_freight_score: v.ai_freight_score,
        pass: false, // not discovered = fail by spec
        verification: v,
      });
      console.log(`    direct verification: tier=${v.tier} (still FAIL because not discovered)`);
    }
  }
  console.log("");

  // ── Control: Known-irrelevant ──
  console.log("[control] verifying known-irrelevant URLs...");
  const knownIrrelevantChecks = [];
  for (const ki of KNOWN_IRRELEVANT) {
    process.stdout.write(`  ${ki.name} ... `);
    const v = await verifyOne({
      url: ki.url,
      name: ki.name,
      jurisdiction_iso: [JURISDICTION_ISO],
      discoveredFor: JURISDICTION_ISO,
    });
    if (v.haiku_called) haikuCalls++;
    const pass = v.tier === ki.expected_tier;
    knownIrrelevantChecks.push({
      name: ki.name,
      url: ki.url,
      expected_tier: ki.expected_tier,
      tier: v.tier,
      ai_trust_tier: v.ai_trust_tier,
      ai_relevance_score: v.ai_relevance_score,
      ai_freight_score: v.ai_freight_score,
      pass,
      verification: v,
    });
    process.stdout.write(`tier=${v.tier} (expected ${ki.expected_tier}) ${pass ? "PASS" : "FAIL"}\n`);
  }
  console.log("");

  // ── Tier distribution (discovery candidates only) ──
  const tierDistribution = { H: 0, M: 0, L: 0 };
  for (const v of verResults) tierDistribution[v.tier]++;

  // ── Calibration notes ──
  const calibrationNotes = buildCalibrationNotes(
    verResults,
    knownGoodChecks,
    knownIrrelevantChecks
  );

  // ── Build report ──
  const report = {
    ran_at: ranAt,
    jurisdiction_iso: JURISDICTION_ISO,
    depth: DEPTH,
    discovery: {
      candidate_count: discoveryOut.candidates.length,
      web_search_calls: discoveryOut.webSearchCalls,
      sonnet_cost_usd_estimated: SONNET_COST_DEEP_USD,
      candidates: discoveryOut.candidates,
    },
    verification: {
      haiku_calls: haikuCalls,
      haiku_cost_usd_estimated: haikuCalls * HAIKU_COST_PER_CALL_USD,
      results: verResults.map((r) => ({
        url: r.url,
        name: r.name,
        head_status: r.head_status,
        domain_confidence: r.domain_confidence,
        domain_pattern: r.domain_pattern,
        ai_relevance_score: r.ai_relevance_score,
        ai_freight_score: r.ai_freight_score,
        ai_trust_tier: r.ai_trust_tier,
        rationale: r.rationale,
        tier: r.tier,
        would_action: r.would_action,
        rejection_reason: r.rejection_reason,
        triggers: r.triggers,
        haiku_called: r.haiku_called,
        haiku_error: r.haiku_error,
        head_error: r.head_error,
        content_fetched: r.content_fetched,
        content_length: r.content_length,
      })),
    },
    tier_distribution: tierDistribution,
    control_check: {
      known_good: knownGoodChecks.map((kg) => ({
        name: kg.name,
        url: kg.url,
        discovered: kg.discovered,
        tier: kg.tier,
        ai_trust_tier: kg.ai_trust_tier,
        ai_relevance_score: kg.ai_relevance_score,
        ai_freight_score: kg.ai_freight_score,
        pass: kg.pass,
      })),
      known_irrelevant: knownIrrelevantChecks.map((ki) => ({
        name: ki.name,
        url: ki.url,
        expected_tier: ki.expected_tier,
        tier: ki.tier,
        ai_trust_tier: ki.ai_trust_tier,
        ai_relevance_score: ki.ai_relevance_score,
        ai_freight_score: ki.ai_freight_score,
        pass: ki.pass,
      })),
    },
    calibration_notes: calibrationNotes,
  };

  // ── Write outputs ──
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${REPORT_JSON_PATH}`);

  const md = buildMarkdown(report);
  writeFileSync(REPORT_MD_PATH, md, "utf8");
  console.log(`Wrote ${REPORT_MD_PATH}`);

  console.log("");
  console.log("──────────── Summary ────────────");
  console.log(`Discovery candidates: ${discoveryOut.candidates.length}`);
  console.log(`Tier H: ${tierDistribution.H}  M: ${tierDistribution.M}  L: ${tierDistribution.L}`);
  console.log(
    `Known-good pass: ${knownGoodChecks.filter((k) => k.pass).length}/${knownGoodChecks.length}`
  );
  console.log(
    `Known-irrelevant pass: ${knownIrrelevantChecks.filter((k) => k.pass).length}/${knownIrrelevantChecks.length}`
  );
  console.log(
    `Estimated cost: $${(SONNET_COST_DEEP_USD + haikuCalls * HAIKU_COST_PER_CALL_USD).toFixed(4)}`
  );
  console.log("Done.");
}

main().catch((e) => {
  console.error("FATAL:", e?.stack || e?.message || e);
  process.exit(1);
});
