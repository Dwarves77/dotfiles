// W3 spot-check audit — re-validates a random 20 tier-H auto-approved sources.
//
// Background
// ──────────────────────────────────────────────────────────────────────────
// W3's verification pipeline auto-approves a candidate to tier H when its
// Haiku-derived ai_relevance_score ≥ 70 AND ai_freight_score ≥ 50, with the
// candidate URL also reachable and matching one of the 57 KNOWN_AUTHORITATIVE_
// PATTERNS. The pipeline batched ~105 sources to tier H in the last 7 days.
// Calibration was set conservatively but in production we want to confirm:
//
//   1. URLs are still reachable now (not transient).
//   2. The host still matches one of the 57 authoritative patterns.
//   3. Freshly-fetched content still scores ≥ tier-H thresholds when re-classified
//      by Haiku with the SAME system prompt used by the pipeline.
//   4. AI scoring is coherent — small drift OK, but big drift signals
//      mis-calibration or stale-content classifier behaviour.
//
// Outputs
// ──────────────────────────────────────────────────────────────────────────
//   docs/SPOT-CHECK-RESULTS.json   — machine-readable per-source verdict
//   docs/SPOT-CHECK-RESULTS.md     — human-readable summary table + recos
//
// Cost
// ──────────────────────────────────────────────────────────────────────────
// 20 Haiku calls × ~$0.001 each = ~$0.02 per run. Reachability HEAD/GET
// requests are free. Running total is printed as we go.
//
// Idempotency
// ──────────────────────────────────────────────────────────────────────────
// The random sample changes per run (ORDER BY RANDOM()). That's intentional
// — repeated runs build empirical evidence on the calibration distribution.
// The script writes a fresh SPOT-CHECK-RESULTS.json each run (overwrites).
//
// Usage (orchestrator-driven, not invoked here)
// ──────────────────────────────────────────────────────────────────────────
//   cd fsi-app && node supabase/seed/audit-tier-h-spot-check.mjs
//
// Env (.env.local in fsi-app/):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────────────
// Env
// ────────────────────────────────────────────────────────────────────────────

process.loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[fatal] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error("[fatal] ANTHROPIC_API_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ────────────────────────────────────────────────────────────────────────────
// Constants — copied verbatim from fsi-app/src/lib/sources/verification.ts
// ────────────────────────────────────────────────────────────────────────────
//
// IMPORTANT: if either the patterns list or the prompt drifts in
// verification.ts, this audit script must be updated to match. The whole
// point of the spot-check is to re-run the SAME logic the pipeline ran.

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SAMPLE_SIZE = 20;
const HAIKU_COST_USD = 0.001; // running-total estimate
const HEAD_TIMEOUT_MS = 8_000;
const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;
const MAX_REDIRECTS = 3;

const THRESHOLDS = {
  AI_RELEVANCE_H: 70,
  AI_RELEVANCE_M: 50,
  AI_FREIGHT_H: 50,
  AI_FREIGHT_M: 25,
};

// Verbatim copy of KNOWN_AUTHORITATIVE_PATTERNS from verification.ts (57 entries).
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

  // ── US State agencies issuing primary regulation ──
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

if (KNOWN_AUTHORITATIVE_PATTERNS.length !== 57) {
  console.warn(`[warn] expected 57 patterns, got ${KNOWN_AUTHORITATIVE_PATTERNS.length} — verification.ts may have drifted`);
}

// Verbatim copy of VERIFICATION_HAIKU_SYSTEM_PROMPT from verification.ts.
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
// Step 1 — Sample 20 random tier-H sources from last 7 days
// ────────────────────────────────────────────────────────────────────────────
//
// Strategy: pull the eligible set (tier H + verified in last 7 days) into
// memory, then random-sample 20 client-side. Two reasons:
//   1. PostgREST's `.order('random()')` would require a custom RPC; the
//      table is small (~105 rows), so a JS shuffle is fine.
//   2. We need fields from BOTH sources and source_verifications, joined
//      on resulting_source_id. PostgREST joins make this clean.

async function sampleTierH() {
  const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("source_verifications")
    .select(`
      ai_relevance_score,
      ai_freight_score,
      ai_trust_tier,
      verification_tier,
      created_at,
      resulting_source_id,
      sources:resulting_source_id ( id, name, url, tier, created_at )
    `)
    .eq("verification_tier", "H")
    .gte("created_at", sevenDaysAgoISO)
    .not("resulting_source_id", "is", null);

  if (error) {
    console.error("[fatal] failed to query source_verifications:", error.message);
    process.exit(1);
  }

  // Filter out any rows where the join didn't resolve (source row deleted
  // after verification), then shuffle and take SAMPLE_SIZE.
  const eligible = (data ?? []).filter((row) => row.sources && row.sources.id);
  if (eligible.length === 0) {
    console.error("[fatal] no eligible tier-H verifications found in last 7 days");
    process.exit(1);
  }

  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));

  console.log(
    `[sample] ${shuffled.length} eligible rows → drew ${sample.length} for spot-check`
  );

  return sample.map((row) => ({
    source_id: row.sources.id,
    name: row.sources.name,
    url: row.sources.url,
    tier: row.sources.tier,
    source_created_at: row.sources.created_at,
    original_relevance: row.ai_relevance_score,
    original_freight: row.ai_freight_score,
    original_trust_tier: row.ai_trust_tier,
    verified_at: row.created_at,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — HEAD reachability with manual redirect tracking
// ────────────────────────────────────────────────────────────────────────────

async function checkReachability(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    let current = url;
    let resp = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      resp = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "CarosLedge-SpotCheck/1.0 (+https://carosledge.com)",
        },
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
    // Treat 405 (Method Not Allowed) as reachable — many servers reject
    // HEAD but accept GET. Treat 2xx as reachable. Everything else fails.
    const ok = status !== null && ((status >= 200 && status < 300) || status === 405);
    return { ok, status, finalUrl: current };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: null, finalUrl: null, error: e?.message ?? String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — GET content, strip HTML, trim to 6000 chars
// ────────────────────────────────────────────────────────────────────────────

async function fetchContent(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CarosLedge-SpotCheck/1.0 (+https://carosledge.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return { fetched: false, status: resp.status, text: "" };
    }
    const html = await resp.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
    return { fetched: true, status: resp.status, text };
  } catch (e) {
    clearTimeout(timer);
    return { fetched: false, status: null, text: "", error: e?.message ?? String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4 — Domain pattern check (matches verification.ts exactly)
// ────────────────────────────────────────────────────────────────────────────

function checkDomainAuthority(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { match: false, label: null, confidence: "low", host: null };
  }
  for (const dp of KNOWN_AUTHORITATIVE_PATTERNS) {
    if (dp.pattern.test(host)) {
      return { match: true, label: dp.label, confidence: dp.confidence, host };
    }
  }
  return { match: false, label: null, confidence: "low", host };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 5 — Haiku re-classification (verbatim system prompt from verification.ts)
// ────────────────────────────────────────────────────────────────────────────

async function classifyWithHaiku(name, url, contentText) {
  const userMessage = `Candidate URL: ${url}
Candidate name: ${name ?? "(unknown)"}
Discovered for jurisdiction: (spot-check)

Content excerpt (truncated to ~6000 chars):
---
${contentText.slice(0, CONTENT_MAX_CHARS)}
---

Output the JSON object only.`;

  try {
    const resp = await anthropic.messages.create({
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
    if (!m) return { ok: false, error: "no JSON object in model output" };
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
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 6 — Per-source classification
// ────────────────────────────────────────────────────────────────────────────
//
// Decision matrix:
//   unreachable                              → "unreachable"
//   relevance < 50  OR  freight < 25         → "should-be-L"
//   relevance < 70  OR  freight < 50         → "should-be-M"
//   else                                     → "confirm-H"
//
// Domain match is informational on the report but does not flip the
// classification on its own — the original pipeline already required a
// domain match to put it in tier H, so a non-matching domain here would
// indicate the pattern list drifted, not that the original score was wrong.

function classifyResult({ reachable, newRelevance, newFreight }) {
  if (!reachable) return "unreachable";
  if (newRelevance == null || newFreight == null) return "unreachable";
  if (newRelevance < THRESHOLDS.AI_RELEVANCE_M || newFreight < THRESHOLDS.AI_FREIGHT_M) {
    return "should-be-L";
  }
  if (newRelevance < THRESHOLDS.AI_RELEVANCE_H || newFreight < THRESHOLDS.AI_FREIGHT_H) {
    return "should-be-M";
  }
  return "confirm-H";
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  console.log(`[start] ${startedAt.toISOString()} — tier-H spot-check (sample size ${SAMPLE_SIZE})`);

  const sample = await sampleTierH();

  let runningCost = 0;
  const results = [];

  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    const idx = `[${i + 1}/${sample.length}]`;
    console.log(`${idx} ${row.url}`);

    // 1) HEAD
    const reach = await checkReachability(row.url);
    console.log(`  ${idx} reach: status=${reach.status ?? "null"} ok=${reach.ok}`);

    // 2) Domain pattern
    const dom = checkDomainAuthority(row.url);
    console.log(`  ${idx} domain: match=${dom.match} label=${dom.label ?? "(none)"}`);

    // 3) GET content (skip if unreachable to save bandwidth)
    let contentText = "";
    let getStatus = null;
    if (reach.ok) {
      const c = await fetchContent(row.url);
      contentText = c.text ?? "";
      getStatus = c.status;
    }

    // 4) Haiku re-classify (skip if no content)
    let newRelevance = null;
    let newFreight = null;
    let newTrustTier = null;
    let rationale = "";

    if (contentText && contentText.length > 0) {
      const ai = await classifyWithHaiku(row.name, row.url, contentText);
      runningCost += HAIKU_COST_USD;
      if (ai.ok) {
        newRelevance = ai.result.ai_relevance_score;
        newFreight = ai.result.ai_freight_score;
        newTrustTier = ai.result.ai_trust_tier;
        rationale = ai.result.rationale;
        console.log(
          `  ${idx} haiku: rel=${newRelevance} frt=${newFreight} tier=${newTrustTier} ` +
            `(was rel=${row.original_relevance} frt=${row.original_freight} tier=${row.original_trust_tier})`
        );
      } else {
        console.log(`  ${idx} haiku error: ${ai.error}`);
      }
    } else {
      console.log(`  ${idx} skipping haiku — no content`);
    }

    const classification = classifyResult({
      reachable: reach.ok,
      newRelevance,
      newFreight,
    });

    const driftRelevance =
      newRelevance != null && row.original_relevance != null
        ? newRelevance - row.original_relevance
        : null;
    const driftFreight =
      newFreight != null && row.original_freight != null
        ? newFreight - row.original_freight
        : null;

    console.log(`  ${idx} verdict: ${classification}  (running cost ~$${runningCost.toFixed(3)})`);

    results.push({
      source_id: row.source_id,
      name: row.name,
      url: row.url,
      original_relevance: row.original_relevance,
      original_freight: row.original_freight,
      original_trust_tier: row.original_trust_tier,
      new_relevance: newRelevance,
      new_freight: newFreight,
      new_trust_tier: newTrustTier,
      head_status: reach.status,
      get_status: getStatus,
      domain_match: dom.match,
      domain_label: dom.label,
      classification,
      drift_relevance: driftRelevance,
      drift_freight: driftFreight,
      rationale,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Aggregate summary
  // ──────────────────────────────────────────────────────────────────────────

  const counts = {
    confirm_H: results.filter((r) => r.classification === "confirm-H").length,
    should_be_M: results.filter((r) => r.classification === "should-be-M").length,
    should_be_L: results.filter((r) => r.classification === "should-be-L").length,
    unreachable: results.filter((r) => r.classification === "unreachable").length,
  };
  const falsePositives = counts.should_be_M + counts.should_be_L;
  const fpRate = results.length > 0 ? (falsePositives / results.length) * 100 : 0;

  function median(values) {
    const arr = values.filter((v) => v != null).slice().sort((a, b) => a - b);
    if (arr.length === 0) return null;
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? (arr[m - 1] + arr[m]) / 2 : arr[m];
  }

  const medianRelevanceDrift = median(results.map((r) => r.drift_relevance));
  const medianFreightDrift = median(results.map((r) => r.drift_freight));

  // Recalibration recommendation
  // ──────────────────────────────────────────────────────────────────────────
  // Decision rules (intentionally conservative):
  //   FP rate <= 5%                 → "thresholds calibrated; no change needed"
  //   FP rate 5-20%                 → "raise H thresholds by ~5 points"
  //   FP rate > 20%                 → "raise H thresholds substantially + audit"
  //   median relevance drift < -10  → "Haiku is scoring stricter — review prompt"

  let recalibrationRecommendation;
  if (fpRate <= 5) {
    recalibrationRecommendation =
      `False-positive rate ${fpRate.toFixed(1)}% is within the 5% target. ` +
      `Thresholds (rel ≥ ${THRESHOLDS.AI_RELEVANCE_H}, frt ≥ ${THRESHOLDS.AI_FREIGHT_H}) appear calibrated.`;
  } else if (fpRate <= 20) {
    recalibrationRecommendation =
      `False-positive rate ${fpRate.toFixed(1)}% exceeds 5% target. ` +
      `Recommend raising H thresholds by ~5 points (rel ≥ 75, frt ≥ 55) and re-running the spot-check.`;
  } else {
    recalibrationRecommendation =
      `False-positive rate ${fpRate.toFixed(1)}% is high. Recommend raising H thresholds to ` +
      `rel ≥ 80, frt ≥ 60, and manually reviewing the ${falsePositives} flagged sources before any further auto-approval.`;
  }
  if (medianRelevanceDrift != null && medianRelevanceDrift < -10) {
    recalibrationRecommendation +=
      ` Note: median relevance drift is ${medianRelevanceDrift} — Haiku is now scoring stricter than at original verification time. ` +
      `Inspect prompt for drift before recalibrating thresholds.`;
  }

  const report = {
    ran_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    sample_size: results.length,
    pattern_count: KNOWN_AUTHORITATIVE_PATTERNS.length,
    haiku_model: HAIKU_MODEL,
    estimated_cost_usd: Number(runningCost.toFixed(4)),
    thresholds: THRESHOLDS,
    results,
    summary: {
      confirm_H_count: counts.confirm_H,
      should_be_M_count: counts.should_be_M,
      should_be_L_count: counts.should_be_L,
      unreachable_count: counts.unreachable,
      false_positive_rate_pct: Number(fpRate.toFixed(2)),
      median_relevance_drift: medianRelevanceDrift,
      median_freight_drift: medianFreightDrift,
    },
    recalibration_recommendation: recalibrationRecommendation,
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Write JSON + Markdown reports
  // ──────────────────────────────────────────────────────────────────────────
  // Paths are absolute against the repo root. The script lives at
  // C:\Users\jason\dotfiles\fsi-app\supabase\seed\, so docs/ is three
  // levels up.

  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const jsonPath = path.join(repoRoot, "docs", "SPOT-CHECK-RESULTS.json");
  const mdPath = path.join(repoRoot, "docs", "SPOT-CHECK-RESULTS.md");

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[write] ${jsonPath}`);

  // Markdown render
  // ──────────────────────────────────────────────────────────────────────────

  const md = renderMarkdown(report);
  await writeFile(mdPath, md, "utf8");
  console.log(`[write] ${mdPath}`);

  console.log(
    `[done] confirm-H=${counts.confirm_H} should-be-M=${counts.should_be_M} ` +
      `should-be-L=${counts.should_be_L} unreachable=${counts.unreachable} ` +
      `FP%=${fpRate.toFixed(1)} cost~$${runningCost.toFixed(3)}`
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown renderer
// ────────────────────────────────────────────────────────────────────────────

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Tier-H Spot-Check Results");
  lines.push("");
  lines.push(`- Ran at: \`${report.ran_at}\``);
  lines.push(`- Sample size: **${report.sample_size}**`);
  lines.push(`- Haiku model: \`${report.haiku_model}\``);
  lines.push(`- Estimated Anthropic cost: **$${report.estimated_cost_usd.toFixed(4)}**`);
  lines.push(
    `- Thresholds in effect: relevance ≥ ${report.thresholds.AI_RELEVANCE_H}, freight ≥ ${report.thresholds.AI_FREIGHT_H}`
  );
  lines.push("");
  lines.push("## Per-source verdicts");
  lines.push("");
  lines.push(
    "| # | Name | Original (rel/frt/tier) | New (rel/frt/tier) | Drift (rel/frt) | HEAD | Domain | Verdict |"
  );
  lines.push(
    "|---|------|-------------------------|--------------------|-----------------|------|--------|---------|"
  );
  report.results.forEach((r, i) => {
    const orig = `${fmt(r.original_relevance)}/${fmt(r.original_freight)}/${r.original_trust_tier ?? "?"}`;
    const next = `${fmt(r.new_relevance)}/${fmt(r.new_freight)}/${r.new_trust_tier ?? "?"}`;
    const drift = `${fmtSigned(r.drift_relevance)}/${fmtSigned(r.drift_freight)}`;
    const dom = r.domain_match ? r.domain_label : "no-match";
    const head = r.head_status ?? "ERR";
    const name = (r.name ?? "(unnamed)").replace(/\|/g, "/");
    lines.push(
      `| ${i + 1} | ${name} | ${orig} | ${next} | ${drift} | ${head} | ${dom} | **${r.classification}** |`
    );
  });
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- confirm-H:    **${report.summary.confirm_H_count}**`);
  lines.push(`- should-be-M:  **${report.summary.should_be_M_count}**`);
  lines.push(`- should-be-L:  **${report.summary.should_be_L_count}**`);
  lines.push(`- unreachable:  **${report.summary.unreachable_count}**`);
  lines.push(
    `- **false-positive rate:** ${report.summary.false_positive_rate_pct.toFixed(2)}%`
  );
  lines.push(
    `- median relevance drift: ${report.summary.median_relevance_drift ?? "n/a"}`
  );
  lines.push(
    `- median freight drift:   ${report.summary.median_freight_drift ?? "n/a"}`
  );
  lines.push("");

  lines.push("## Recalibration");
  lines.push("");
  lines.push(report.recalibration_recommendation);
  lines.push("");

  if (report.summary.false_positive_rate_pct > 5) {
    lines.push("> :warning: False-positive rate exceeds 5% target. See recalibration note above.");
    lines.push("");
  }

  lines.push("## Source URLs (for manual follow-up)");
  lines.push("");
  report.results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.classification}] ${r.url}`);
    if (r.rationale) lines.push(`   _${r.rationale}_`);
  });
  lines.push("");

  return lines.join("\n");
}

function fmt(n) {
  return n == null ? "—" : String(n);
}
function fmtSigned(n) {
  if (n == null) return "—";
  return n > 0 ? `+${n}` : String(n);
}

// ────────────────────────────────────────────────────────────────────────────

await main();
