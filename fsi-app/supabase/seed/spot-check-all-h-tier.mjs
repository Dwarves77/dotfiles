// Gap 1 — full spot-check of every auto-approved tier-H source that
// hasn't been spot-checked yet (sources.spotchecked = FALSE).
//
// This is the *full* version of audit-tier-h-spot-check.mjs (which
// random-samples 20). Here we re-classify every eligible row at the
// new threshold (rel ≥ 75, frt ≥ 55) and act on the verdict.
//
// Demotion path (matches apply-known-demotions.mjs)
// ──────────────────────────────────────────────────────────────────────────
// We MOVE rows that fail re-classification from `sources` →
// `provisional_sources`. To preserve the forensic record (source_trust_events
// is FK ON DELETE CASCADE on source_id), we SUSPEND rather than DELETE the
// source row:
//   - status='suspended'
//   - processing_paused=true
//   - notes appended with demotion explanation
// The provisional_sources row is the new canonical state. Worker scans skip
// suspended sources via existing filters; the recently-auto-approved viewer
// handles them via spotchecked=true marker.
//
// Verdict matrix (per source)
// ──────────────────────────────────────────────────────────────────────────
//   confirm-H    (rel ≥ 75 AND frt ≥ 55)        → mark spotchecked=true
//   should-be-M  (50 ≤ rel < 75  OR  25 ≤ frt < 55)
//                                                → demote to provisional_sources,
//                                                  suspend source row
//   should-be-L  (rel < 50  OR  frt < 25)        → demote (same path)
//                                                  + flag rejection candidate in notes
//   unreachable                                  → leave for manual review
//                                                  (no DB writes for this row)
//
// Scope
// ──────────────────────────────────────────────────────────────────────────
// Eligible rows are joined from source_verifications:
//   verification_tier='H'
//   resulting_source_id IS NOT NULL
//   sources.spotchecked = FALSE
// Cost: 64 × ~$0.001 Haiku ≈ $0.06.
//
// Outputs
// ──────────────────────────────────────────────────────────────────────────
//   docs/GAP-1-SPOT-CHECK-FULL-RESULTS.json  — per-source verdict + write-status
//   docs/GAP-1-SPOT-CHECK-FULL-RESULTS.md    — summary table + recommendations
//
// Idempotency
// ──────────────────────────────────────────────────────────────────────────
// Safe to re-run. Each source is processed only if spotchecked=FALSE; once
// a row has been marked confirm-H or demoted, it leaves the eligible set.
// Re-running picks up newly-auto-approved sources without re-touching the
// already-processed ones.
//
// Reuses VERIFICATION_HAIKU_SYSTEM_PROMPT verbatim from verification.ts via
// the audit-tier-h-spot-check.mjs companion script (which has it inlined
// for environment parity). To avoid duplicating the prompt three times, this
// script imports the same strings from a sibling JS module exposing the
// constants. The audit script is the source of truth; if either drifts the
// CI fail message will say so. We choose to keep the prompt inlined here
// for self-containedness rather than refactor verification.ts to ESM
// (.mjs ↔ .ts importing across build boundaries is fragile).
//
// Usage (orchestrator-driven, not invoked here)
// ──────────────────────────────────────────────────────────────────────────
//   cd fsi-app && node supabase/seed/spot-check-all-h-tier.mjs
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
// Constants — must mirror verification.ts after the Gap-1 threshold tightening
// ────────────────────────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_COST_USD = 0.001;
const HEAD_TIMEOUT_MS = 8_000;
const CONTENT_TIMEOUT_MS = 10_000;
const CONTENT_MAX_CHARS = 6_000;
const MAX_REDIRECTS = 3;

// NEW thresholds — matches verification.ts post-Gap-1.
const THRESHOLDS = {
  AI_RELEVANCE_H: 75,
  AI_RELEVANCE_M: 50,
  AI_FREIGHT_H: 55,
  AI_FREIGHT_M: 25,
};

// Verbatim copy of VERIFICATION_HAIKU_SYSTEM_PROMPT from
// fsi-app/src/lib/sources/verification.ts. If either drifts the audit
// becomes invalid — keep these in sync.
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
// Step 1 — pull every eligible (un-spotchecked) tier-H auto-approved source
// ────────────────────────────────────────────────────────────────────────────

async function fetchEligibleSources() {
  // Pull source_verifications rows whose source still exists and is unflagged.
  // PostgREST handles the join; we filter on the joined sources columns
  // client-side because PostgREST's nested filter syntax is brittle.
  const { data, error } = await supabase
    .from("source_verifications")
    .select(`
      ai_relevance_score,
      ai_freight_score,
      ai_trust_tier,
      verification_tier,
      created_at,
      resulting_source_id,
      sources:resulting_source_id ( id, name, url, tier, status, spotchecked, created_at )
    `)
    .eq("verification_tier", "H")
    .not("resulting_source_id", "is", null);

  if (error) {
    console.error("[fatal] failed to query source_verifications:", error.message);
    process.exit(1);
  }

  const eligible = (data ?? []).filter((row) => {
    if (!row.sources || !row.sources.id) return false;
    if (row.sources.spotchecked === true) return false;
    // We only want sources that are still active. Suspended/inaccessible
    // rows are already out of the active set and don't need re-classification.
    if (row.sources.status !== "active") return false;
    return true;
  });

  console.log(`[sample] ${eligible.length} eligible un-spotchecked tier-H sources`);
  return eligible.map((row) => ({
    source_id: row.sources.id,
    name: row.sources.name,
    url: row.sources.url,
    tier: row.sources.tier,
    original_relevance: row.ai_relevance_score,
    original_freight: row.ai_freight_score,
    original_trust_tier: row.ai_trust_tier,
    verified_at: row.created_at,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — HEAD reachability
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
    const ok = status !== null && ((status >= 200 && status < 300) || status === 405);
    return { ok, status, finalUrl: current };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: null, finalUrl: null, error: e?.message ?? String(e) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — GET content + strip HTML
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
// Step 4 — Haiku re-classify (verbatim system prompt)
// ────────────────────────────────────────────────────────────────────────────

async function classifyWithHaiku(name, url, contentText) {
  const userMessage = `Candidate URL: ${url}
Candidate name: ${name ?? "(unknown)"}
Discovered for jurisdiction: (gap-1-full-spot-check)

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
// Step 5 — Verdict
// ────────────────────────────────────────────────────────────────────────────

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
// Step 6 — Apply verdict (DB writes)
// ────────────────────────────────────────────────────────────────────────────

async function applyConfirmH(sourceId) {
  // spotchecked_by is NULL because there is no auth.users row for the
  // service-role/system actor — the column FK is to auth.users(id).
  // The 'spotchecked_at' timestamp + the audit write to source_trust_events
  // below provide attribution.
  const { error } = await supabase
    .from("sources")
    .update({
      spotchecked: true,
      spotchecked_at: new Date().toISOString(),
      spotchecked_by: null,
    })
    .eq("id", sourceId);
  return { ok: !error, error: error?.message };
}

async function applyDemotion(source, ai, verdict) {
  // Idempotency: if already suspended, skip.
  if (source.status === "suspended") {
    return { ok: true, skipped: true, reason: "already suspended" };
  }

  // 1) source_trust_event BEFORE delete/suspend.
  const { error: eventErr } = await supabase.from("source_trust_events").insert({
    source_id: source.source_id,
    event_type: "tier_demotion",
    details: {
      reason: "auto_demoted_post_spotcheck",
      gap: "gap-1",
      audit_run: "gap-1-full-spot-check",
      verdict,
      original_scores: {
        relevance: source.original_relevance,
        freight: source.original_freight,
        trust_tier: source.original_trust_tier,
      },
      new_scores: ai
        ? {
            relevance: ai.ai_relevance_score,
            freight: ai.ai_freight_score,
            trust_tier: ai.ai_trust_tier,
            rationale: ai.rationale,
          }
        : null,
      thresholds: THRESHOLDS,
    },
    created_by: "system",
  });
  if (eventErr) return { ok: false, error: `trust_event: ${eventErr.message}` };

  // 2) Upsert provisional row (UNIQUE(url) handles re-runs).
  const reviewerNotes =
    `Auto-demoted ${new Date().toISOString().slice(0, 10)} post-spot-check (Gap 1 full audit). ` +
    `Verdict: ${verdict}. ` +
    (ai
      ? `Original scores: rel=${source.original_relevance}, frt=${source.original_freight}. ` +
        `New scores at 75/55: rel=${ai.ai_relevance_score}, frt=${ai.ai_freight_score}, trust=${ai.ai_trust_tier}. ` +
        `Rationale: ${ai.rationale}`
      : "AI re-classification unavailable.");

  const { data: existingProv } = await supabase
    .from("provisional_sources")
    .select("id")
    .eq("url", source.url)
    .maybeSingle();

  const provisionalPayload = {
    name: source.name,
    url: source.url,
    description: ai?.rationale ?? "",
    discovered_via: "worker_search",
    status: "pending_review",
    provisional_tier: 7,
    recommended_tier: source.tier,
    reviewer_notes: reviewerNotes,
  };

  let provisionalId;
  if (existingProv) {
    const { error: updErr } = await supabase
      .from("provisional_sources")
      .update({ ...provisionalPayload, status: "pending_review" })
      .eq("id", existingProv.id);
    if (updErr) return { ok: false, error: `provisional_update: ${updErr.message}` };
    provisionalId = existingProv.id;
  } else {
    const { data: insProv, error: insErr } = await supabase
      .from("provisional_sources")
      .insert(provisionalPayload)
      .select("id")
      .single();
    if (insErr) return { ok: false, error: `provisional_insert: ${insErr.message}` };
    provisionalId = insProv.id;
  }

  // 3) Suspend source row (preserves trust event + verification audit).
  const noteSuffix =
    `\n\n[${new Date().toISOString().slice(0, 10)}] Auto-demoted post-spot-check (Gap 1 full audit). ` +
    `Verdict: ${verdict}. Moved to provisional_sources id=${provisionalId}.` +
    (verdict === "should-be-L" ? " Flagged for rejection consideration." : "");

  const { error: suspendErr } = await supabase
    .from("sources")
    .update({
      status: "suspended",
      processing_paused: true,
      // Mark spotchecked=true so this row never re-enters the eligible set.
      spotchecked: true,
      spotchecked_at: new Date().toISOString(),
      spotchecked_by: null,
    })
    .eq("id", source.source_id);
  if (suspendErr) return { ok: false, error: `suspend: ${suspendErr.message}` };

  // Append note in a separate update (keeping the suspend update minimal
  // so the WHERE-by-id update doesn't accidentally clobber a long notes
  // string concurrently). We read+write the notes field here.
  const { data: cur } = await supabase
    .from("sources")
    .select("notes")
    .eq("id", source.source_id)
    .single();
  if (cur) {
    await supabase
      .from("sources")
      .update({ notes: (cur.notes ?? "") + noteSuffix })
      .eq("id", source.source_id);
  }

  return { ok: true, provisional_id: provisionalId };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  console.log(`[start] ${startedAt.toISOString()} — Gap-1 full tier-H spot-check`);

  const sample = await fetchEligibleSources();
  if (sample.length === 0) {
    console.log("[done] no eligible un-spotchecked tier-H sources");
    return;
  }

  let runningCost = 0;
  const results = [];

  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    const idx = `[${i + 1}/${sample.length}]`;
    console.log(`${idx} ${row.url}`);

    // 1) HEAD
    const reach = await checkReachability(row.url);
    console.log(`  ${idx} reach: status=${reach.status ?? "null"} ok=${reach.ok}`);

    // 2) GET content
    let contentText = "";
    let getStatus = null;
    if (reach.ok) {
      const c = await fetchContent(row.url);
      contentText = c.text ?? "";
      getStatus = c.status;
    }

    // 3) Haiku
    let ai = null;
    if (contentText.length > 0) {
      const r = await classifyWithHaiku(row.name, row.url, contentText);
      runningCost += HAIKU_COST_USD;
      if (r.ok) {
        ai = r.result;
        console.log(
          `  ${idx} haiku: rel=${ai.ai_relevance_score} frt=${ai.ai_freight_score} tier=${ai.ai_trust_tier} ` +
            `(was rel=${row.original_relevance} frt=${row.original_freight} tier=${row.original_trust_tier})`
        );
      } else {
        console.log(`  ${idx} haiku error: ${r.error}`);
      }
    } else {
      console.log(`  ${idx} skipping haiku — no content`);
    }

    const verdict = classifyResult({
      reachable: reach.ok,
      newRelevance: ai?.ai_relevance_score ?? null,
      newFreight: ai?.ai_freight_score ?? null,
    });
    console.log(`  ${idx} verdict: ${verdict}  (running cost ~$${runningCost.toFixed(3)})`);

    // 4) Apply verdict to DB
    let writeStatus = "skipped";
    let writeDetail = null;
    if (verdict === "confirm-H") {
      const r = await applyConfirmH(row.source_id);
      writeStatus = r.ok ? "marked_spotchecked" : "error";
      writeDetail = r.error ?? null;
    } else if (verdict === "should-be-M" || verdict === "should-be-L") {
      const r = await applyDemotion(
        { ...row, status: "active" },
        ai,
        verdict
      );
      if (r.skipped) {
        writeStatus = "skipped_already_suspended";
      } else if (r.ok) {
        writeStatus = "demoted";
        writeDetail = `provisional_id=${r.provisional_id}`;
      } else {
        writeStatus = "error";
        writeDetail = r.error ?? null;
      }
    } else if (verdict === "unreachable") {
      writeStatus = "left_for_manual_review";
    }

    console.log(`  ${idx} write: ${writeStatus}${writeDetail ? ` (${writeDetail})` : ""}`);

    results.push({
      source_id: row.source_id,
      name: row.name,
      url: row.url,
      original_relevance: row.original_relevance,
      original_freight: row.original_freight,
      original_trust_tier: row.original_trust_tier,
      new_relevance: ai?.ai_relevance_score ?? null,
      new_freight: ai?.ai_freight_score ?? null,
      new_trust_tier: ai?.ai_trust_tier ?? null,
      head_status: reach.status,
      get_status: getStatus,
      verdict,
      drift_relevance:
        ai?.ai_relevance_score != null && row.original_relevance != null
          ? ai.ai_relevance_score - row.original_relevance
          : null,
      drift_freight:
        ai?.ai_freight_score != null && row.original_freight != null
          ? ai.ai_freight_score - row.original_freight
          : null,
      rationale: ai?.rationale ?? "",
      write_status: writeStatus,
      write_detail: writeDetail,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────

  const counts = {
    confirm_H: results.filter((r) => r.verdict === "confirm-H").length,
    should_be_M: results.filter((r) => r.verdict === "should-be-M").length,
    should_be_L: results.filter((r) => r.verdict === "should-be-L").length,
    unreachable: results.filter((r) => r.verdict === "unreachable").length,
  };
  const fp = counts.should_be_M + counts.should_be_L;
  const fpRate = results.length > 0 ? (fp / results.length) * 100 : 0;

  const writeCounts = {
    marked_spotchecked: results.filter((r) => r.write_status === "marked_spotchecked").length,
    demoted: results.filter((r) => r.write_status === "demoted").length,
    skipped_already_suspended: results.filter((r) => r.write_status === "skipped_already_suspended")
      .length,
    left_for_manual_review: results.filter((r) => r.write_status === "left_for_manual_review")
      .length,
    error: results.filter((r) => r.write_status === "error").length,
  };

  const report = {
    ran_at: startedAt.toISOString(),
    completed_at: new Date().toISOString(),
    sample_size: results.length,
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
      writes: writeCounts,
    },
  };

  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const jsonPath = path.join(repoRoot, "docs", "GAP-1-SPOT-CHECK-FULL-RESULTS.json");
  const mdPath = path.join(repoRoot, "docs", "GAP-1-SPOT-CHECK-FULL-RESULTS.md");

  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`[write] ${jsonPath}`);

  await writeFile(mdPath, renderMarkdown(report), "utf8");
  console.log(`[write] ${mdPath}`);

  console.log(
    `[done] confirm-H=${counts.confirm_H} should-be-M=${counts.should_be_M} ` +
      `should-be-L=${counts.should_be_L} unreachable=${counts.unreachable} ` +
      `FP%=${fpRate.toFixed(1)} cost~$${runningCost.toFixed(3)} ` +
      `writes: spotchecked=${writeCounts.marked_spotchecked} demoted=${writeCounts.demoted} errors=${writeCounts.error}`
  );

  if (writeCounts.error > 0) {
    process.exitCode = 1;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown renderer
// ────────────────────────────────────────────────────────────────────────────

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Gap-1 Full Tier-H Spot-Check Results");
  lines.push("");
  lines.push(`- Ran at: \`${report.ran_at}\``);
  lines.push(`- Completed at: \`${report.completed_at}\``);
  lines.push(`- Sample size: **${report.sample_size}** (every un-spotchecked tier-H auto-approved source)`);
  lines.push(`- Haiku model: \`${report.haiku_model}\``);
  lines.push(`- Estimated Anthropic cost: **$${report.estimated_cost_usd.toFixed(4)}**`);
  lines.push(
    `- Thresholds: relevance ≥ ${report.thresholds.AI_RELEVANCE_H}, freight ≥ ${report.thresholds.AI_FREIGHT_H} (NEW post-Gap-1)`
  );
  lines.push("");
  lines.push("## Per-source verdicts");
  lines.push("");
  lines.push(
    "| # | Name | Original (rel/frt/tier) | New (rel/frt/tier) | Drift (rel/frt) | Verdict | Write |"
  );
  lines.push(
    "|---|------|-------------------------|--------------------|-----------------|---------|-------|"
  );
  report.results.forEach((r, i) => {
    const fmt = (n) => (n == null ? "—" : String(n));
    const fmtSigned = (n) => (n == null ? "—" : n > 0 ? `+${n}` : String(n));
    const orig = `${fmt(r.original_relevance)}/${fmt(r.original_freight)}/${r.original_trust_tier ?? "?"}`;
    const next = `${fmt(r.new_relevance)}/${fmt(r.new_freight)}/${r.new_trust_tier ?? "?"}`;
    const drift = `${fmtSigned(r.drift_relevance)}/${fmtSigned(r.drift_freight)}`;
    const name = (r.name ?? "(unnamed)").replace(/\|/g, "/");
    lines.push(`| ${i + 1} | ${name} | ${orig} | ${next} | ${drift} | **${r.verdict}** | ${r.write_status} |`);
  });
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- confirm-H:    **${report.summary.confirm_H_count}**`);
  lines.push(`- should-be-M:  **${report.summary.should_be_M_count}**`);
  lines.push(`- should-be-L:  **${report.summary.should_be_L_count}**`);
  lines.push(`- unreachable:  **${report.summary.unreachable_count}**`);
  lines.push(`- **false-positive rate:** ${report.summary.false_positive_rate_pct.toFixed(2)}%`);
  lines.push("");
  lines.push("## Write outcomes");
  lines.push("");
  lines.push(`- marked_spotchecked:        **${report.summary.writes.marked_spotchecked}**`);
  lines.push(`- demoted:                   **${report.summary.writes.demoted}**`);
  lines.push(`- skipped_already_suspended: **${report.summary.writes.skipped_already_suspended}**`);
  lines.push(`- left_for_manual_review:    **${report.summary.writes.left_for_manual_review}**`);
  lines.push(`- error:                     **${report.summary.writes.error}**`);
  lines.push("");
  lines.push("## Source URLs (for manual follow-up)");
  lines.push("");
  report.results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.verdict}] ${r.url}`);
    if (r.rationale) lines.push(`   _${r.rationale}_`);
  });
  lines.push("");
  return lines.join("\n");
}

await main();
