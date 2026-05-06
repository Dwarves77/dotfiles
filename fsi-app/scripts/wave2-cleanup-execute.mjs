/**
 * wave2-cleanup-execute.mjs — authorized writes for Wave 2 critical cleanups.
 *
 * Investigation results (docs/wave2-cleanup-investigation.json) cleared every
 * halt condition:
 *   - stale provisional_sources: 12 (matches expected)
 *   - true Dubai/UAE retag candidates: 2 (below 5 threshold)
 *   - battery brief root cause: NOT in agent system prompt — it's structured
 *     metadata (sources_used = []) on a 36k-char brief that DOES contain 29
 *     inline *Source: ...* citations and a 4-row sources table. Fixable as
 *     a data write: link source_id, populate sources_used.
 *   - 12 stale rows have NULL discovered_for_jurisdiction (matches expected)
 *
 * Per the dispatch's per-step verification contract (PR-A1 pattern), every
 * write below has its own read-back check. Failure halts; failure does not
 * silently roll forward.
 *
 * Steps:
 *   1. Re-run W2.F (verifyCandidate-equivalent, inlined) on each of the 12
 *      stale provisional rows. Update each row in-place: refresh
 *      recommended_tier from Haiku, mark reviewed_at NOW(), set status to
 *      'confirmed' if Haiku decision is H, otherwise 'needs_more_data' (M)
 *      or 'rejected' (L). Per-row verification.
 *   2. Backfill discovered_for_jurisdiction on those same 12 rows from URL
 *      domain → ISO mapping. Per-row verification.
 *   3. Retag the 2 TRUE-AE intelligence_items from ['GLOBAL'] to ['AE'] on
 *      jurisdiction_iso. Per-row verification.
 *   4. Battery brief citation linkage: link source_id to existing EUR-Lex
 *      source row, populate sources_used = [eurLexSourceId]. Verify
 *      counts move from src=0 to src>=1.
 *
 * Idempotent throughout. Safe to re-run.
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error("Missing one of NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const log = [];
function step(name, ok, detail) {
  const line = `[${ok ? "OK" : "FAIL"}] ${name} — ${detail}`;
  console.log(line);
  log.push({ name, ok, detail, at: new Date().toISOString() });
  if (!ok) {
    writeFileSync(
      resolve("..", "docs", "wave2-cleanup-execute-log.json"),
      JSON.stringify({ aborted_at: name, log }, null, 2),
      "utf8"
    );
    process.exit(1);
  }
}

// ─── Constants from investigation ──────────────────────────────────────
const STALE_AGE_DAYS = 30;
const STALE_CUTOFF = new Date(
  Date.now() - STALE_AGE_DAYS * 24 * 60 * 60 * 1000
).toISOString();

// True-Dubai/UAE retag list (verified TRUE-AE in investigation)
const DUBAI_UAE_LEGACY_IDS = [
  "g25", // DP World Sustainability — Dubai-domiciled state-linked operator
  "dubai-uae-regional-operations-profile", // explicitly UAE-scoped
];

// Battery item id (src=0 confirmed)
const BATTERY_ITEM_ID = "ac349a70-606d-4eb3-ac19-5a4a0facd07c";

// Domain → jurisdiction ISO mapping for backfill (matches the 12 stale URLs).
function jurisdictionFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".gov.sg")) return "SG";
    if (host.endsWith(".go.jp") || host.endsWith(".gov.jp")) return "JP";
    if (host.endsWith(".gov.cn") || host === "www.mee.gov.cn" || host === "mee.gov.cn") return "CN";
    if (host.endsWith(".gov.ae") || host.endsWith(".ae")) return "AE";
    if (host.endsWith(".go.kr") || host.endsWith(".gov.kr") || host.endsWith(".kr")) return "KR";
    if (host.endsWith(".epa.gov") || host === "www.epa.gov") return "US";
    if (host.endsWith(".gov") || host.endsWith(".gov.us")) return "US";
    if (host.endsWith(".europa.eu")) return "EU";
    return null;
  } catch {
    return null;
  }
}

// ─── Inlined W2.F verification (mirrors src/lib/sources/verification.ts) ─
const VERIFICATION_HAIKU_SYSTEM_PROMPT = `You are a source verification classifier for a freight-sustainability intelligence platform.

Given a candidate source URL and a content excerpt, return STRICT JSON:
{
  "ai_relevance_score": 0-100,
  "ai_freight_score": 0-100,
  "ai_trust_tier": "T1"|"T2"|"T3",
  "rationale": "<=150 char summary"
}

Scoring guidance:

ai_relevance_score — sustainability / climate / environmental / energy / transport regulatory content. Government regulators with mandates covering ANY of: emissions, air quality, water, waste, energy, climate, fuel, building codes, vehicle standards, public utilities, transport planning, customs, trade. Score 80-95 for canonical national-government sustainability/environment/energy ministries. Only score below 60 when the source is unambiguously off-topic.

ai_freight_score — does this jurisdiction's regulatory output operationally affect freight, cargo, shipping, transport, supply chain, or the operations that support them? National environment / energy / transport ministries score 60-90 even when not pure-freight agencies.

ai_trust_tier:
- T1: canonical primary regulatory publication (gazettes, official legislative archives, EUR-Lex, Federal Register)
- T2: canonical regulator (EPA, national ministries of environment/energy/transport, CARB, EMSA)
- T3: reputable secondary (industry associations, standards bodies, think tanks)

National environmental and energy ministries (METI, MEE China, MOCCAE UAE, MOEI UAE, MAS Singapore, MPA Singapore, ME Korea) are T2.

Output JSON only, no prose, no markdown, no code fences.`;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const CONTENT_TIMEOUT_MS = 12_000;
const CONTENT_MAX_CHARS = 6_000;
const HEAD_TIMEOUT_MS = 8_000;

const THRESHOLDS = {
  AI_RELEVANCE_H: 75,
  AI_RELEVANCE_M: 50,
  AI_FREIGHT_H: 55,
  AI_FREIGHT_M: 25,
};

async function checkReachability(url) {
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
        headers: { "User-Agent": "CarosLedge-Verifier/1.0" },
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
    if (status !== null && (status < 300 || status === 405)) {
      return { ok: true, finalStatus: status, finalUrl: current };
    }
    return { ok: false, finalStatus: status, finalUrl: current };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, finalStatus: null, finalUrl: null, error: e.message };
  }
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
        "User-Agent": "CarosLedge-Verifier/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return { fetched: false, httpStatus: resp.status };
    const html = await resp.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CONTENT_MAX_CHARS);
    return { fetched: true, text };
  } catch (e) {
    clearTimeout(timer);
    return { fetched: false, error: e.message };
  }
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
    if (!m) return { ok: false, error: "No JSON in model output" };
    const parsed = JSON.parse(m[0]);
    if (
      typeof parsed.ai_relevance_score !== "number" ||
      typeof parsed.ai_freight_score !== "number" ||
      typeof parsed.ai_trust_tier !== "string" ||
      !["T1", "T2", "T3"].includes(parsed.ai_trust_tier)
    ) {
      return { ok: false, error: "Malformed shape" };
    }
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
    return {
      ok: true,
      result: {
        ai_relevance_score: clamp(parsed.ai_relevance_score),
        ai_freight_score: clamp(parsed.ai_freight_score),
        ai_trust_tier: parsed.ai_trust_tier,
        rationale: String(parsed.rationale ?? "").slice(0, 200),
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function tierForResult(reachable, ai) {
  if (!reachable) return { tier: "L", reason: "reachability" };
  if (!ai) return { tier: "M", reason: "ai_call_failed" };
  if (ai.ai_relevance_score < THRESHOLDS.AI_RELEVANCE_M)
    return { tier: "L", reason: `ai_relevance_low(${ai.ai_relevance_score})` };
  if (ai.ai_freight_score < THRESHOLDS.AI_FREIGHT_M)
    return { tier: "L", reason: `ai_freight_low(${ai.ai_freight_score})` };
  if (
    ai.ai_relevance_score >= THRESHOLDS.AI_RELEVANCE_H &&
    ai.ai_freight_score >= THRESHOLDS.AI_FREIGHT_H
  ) {
    return { tier: "H", reason: `H_clear(rel=${ai.ai_relevance_score},frt=${ai.ai_freight_score})` };
  }
  return { tier: "M", reason: `M_default(rel=${ai.ai_relevance_score},frt=${ai.ai_freight_score})` };
}

// ─── STEP 1: Re-run W2.F on the 12 stale provisional rows ──────────────
console.log("\n=== STEP 1: Re-run W2.F on 12 stale provisional_sources ===\n");

const { data: staleRows, error: e1 } = await supabase
  .from("provisional_sources")
  .select("id, name, url, discovered_for_jurisdiction, recommended_tier, status, citation_count, citing_source_ids")
  .eq("status", "pending_review")
  .lt("created_at", STALE_CUTOFF)
  .order("created_at", { ascending: true });

if (e1) step("step1_fetch_stale", false, e1.message);
step(
  "step1_fetch_stale",
  staleRows && staleRows.length === 12,
  `fetched ${staleRows?.length} stale rows (expected 12)`
);

const reclassResults = [];
for (let i = 0; i < staleRows.length; i++) {
  const row = staleRows[i];
  const jurisdiction = jurisdictionFromUrl(row.url);
  console.log(`\n  [${i + 1}/12] ${row.name}`);
  console.log(`         url=${row.url}`);
  console.log(`         jurisdiction=${jurisdiction}`);

  // 1a. Reachability
  const reach = await checkReachability(row.url);
  console.log(`         reachable=${reach.ok} status=${reach.finalStatus}`);

  // 1b. Content fetch (only if reachable)
  let contentText = "";
  if (reach.ok) {
    const c = await fetchContent(reach.finalUrl ?? row.url);
    contentText = c.text ?? "";
    console.log(`         content_fetched=${c.fetched} length=${contentText.length}`);
  }

  // 1c. Haiku classification (only if we have content)
  let aiResult = null;
  let aiError = null;
  if (contentText.length > 200) {
    const cls = await classifyWithHaiku(
      { url: row.url, name: row.name, discoveredFor: jurisdiction },
      contentText
    );
    if (cls.ok) {
      aiResult = cls.result;
      console.log(
        `         haiku rel=${aiResult.ai_relevance_score} frt=${aiResult.ai_freight_score} tier=${aiResult.ai_trust_tier}`
      );
    } else {
      aiError = cls.error;
      console.log(`         haiku FAILED: ${cls.error}`);
    }
  }

  // 1d. Aggregate to W2.F tier
  const decision = tierForResult(reach.ok, aiResult);
  console.log(`         W2.F decision: ${decision.tier} (${decision.reason})`);

  // 1e. Update the row in-place with refreshed classification.
  const numericTier =
    aiResult?.ai_trust_tier === "T1" ? 1 :
    aiResult?.ai_trust_tier === "T2" ? 2 :
    aiResult?.ai_trust_tier === "T3" ? 4 : null;

  const newStatus =
    decision.tier === "H" ? "confirmed" :
    decision.tier === "L" ? "rejected" :
    "needs_more_data";

  const reviewerNote =
    `[Re-run by wave2-cleanup-execute ${new Date().toISOString().slice(0, 10)}] ` +
    `W2.F decision=${decision.tier} (${decision.reason}). ` +
    `ai_rel=${aiResult?.ai_relevance_score ?? "?"} ai_frt=${aiResult?.ai_freight_score ?? "?"} ai_tier=${aiResult?.ai_trust_tier ?? "?"}. ` +
    (aiError ? `ai_error=${aiError}. ` : "") +
    `rationale="${aiResult?.rationale ?? "n/a"}".`;

  const update = {
    recommended_tier: numericTier,
    status: newStatus,
    reviewer_notes: reviewerNote,
    reviewed_at: new Date().toISOString(),
    discovered_for_jurisdiction: jurisdiction,
  };

  const { error: updErr } = await supabase
    .from("provisional_sources")
    .update(update)
    .eq("id", row.id);

  if (updErr) {
    step(`step1_update_${row.id}`, false, updErr.message);
  }

  // Verify by reading back
  const { data: verify } = await supabase
    .from("provisional_sources")
    .select("status, recommended_tier, discovered_for_jurisdiction, reviewed_at")
    .eq("id", row.id)
    .maybeSingle();

  const verifyOk =
    verify?.status === newStatus &&
    verify?.recommended_tier === numericTier &&
    verify?.discovered_for_jurisdiction === jurisdiction &&
    !!verify?.reviewed_at;

  step(
    `step1_verify_${row.id.slice(0, 8)}`,
    verifyOk,
    `status=${verify?.status} tier=${verify?.recommended_tier} juris=${verify?.discovered_for_jurisdiction}`
  );

  reclassResults.push({
    id: row.id,
    url: row.url,
    name: row.name,
    discovered_for_jurisdiction: jurisdiction,
    decision: decision.tier,
    decision_reason: decision.reason,
    ai: aiResult,
    new_status: newStatus,
  });
}

// Step 1 final verification: zero stale pending_review rows after re-run.
{
  const { count: remainingStale } = await supabase
    .from("provisional_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .lt("created_at", STALE_CUTOFF);
  step(
    "step1_final_stale_count",
    remainingStale === 0,
    `${remainingStale} stale pending_review rows remain (expected 0)`
  );
}

// ─── STEP 2: Verify discovered_for_jurisdiction backfill on those 12 ───
console.log("\n=== STEP 2: Verify discovered_for_jurisdiction backfill ===\n");
{
  const ids = staleRows.map((r) => r.id);
  const { data: backfilledRows } = await supabase
    .from("provisional_sources")
    .select("id, url, discovered_for_jurisdiction")
    .in("id", ids);

  const nullCount = (backfilledRows ?? []).filter(
    (r) => r.discovered_for_jurisdiction === null
  ).length;

  step(
    "step2_backfill_verify",
    nullCount === 0,
    `${nullCount} of 12 still NULL on discovered_for_jurisdiction (expected 0)`
  );
  console.log("    Mappings applied:");
  for (const r of backfilledRows ?? []) {
    console.log(`      ${r.discovered_for_jurisdiction} ← ${r.url}`);
  }
}

// ─── STEP 3: Retag 2 TRUE-AE intelligence_items ────────────────────────
console.log("\n=== STEP 3: Retag Dubai/UAE intelligence_items ===\n");
{
  const { data: preRows } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .in("legacy_id", DUBAI_UAE_LEGACY_IDS);
  console.log("    Pre-update jurisdiction_iso:", JSON.stringify(preRows));

  const { error: e3, count } = await supabase
    .from("intelligence_items")
    .update({ jurisdiction_iso: ["AE"] }, { count: "exact" })
    .in("legacy_id", DUBAI_UAE_LEGACY_IDS);
  step("step3_dubai_uae_update", !e3, e3?.message ?? `${count} rows updated`);

  // Per-row verification
  const { data: postRows } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso, jurisdictions")
    .in("legacy_id", DUBAI_UAE_LEGACY_IDS);

  for (const r of postRows ?? []) {
    const ok =
      Array.isArray(r.jurisdiction_iso) &&
      r.jurisdiction_iso.length === 1 &&
      r.jurisdiction_iso[0] === "AE";
    step(
      `step3_verify_${r.legacy_id}`,
      ok,
      `jurisdiction_iso=${JSON.stringify(r.jurisdiction_iso)}`
    );
  }

  // Aggregate: zero remaining TRUE-AE under GLOBAL
  const { data: globalRows } = await supabase
    .from("intelligence_items")
    .select("legacy_id, title, jurisdiction_iso")
    .contains("jurisdiction_iso", ["GLOBAL"])
    .in("legacy_id", DUBAI_UAE_LEGACY_IDS);
  step(
    "step3_no_remaining_under_global",
    (globalRows ?? []).length === 0,
    `${globalRows?.length ?? 0} retag candidates still under GLOBAL (expected 0)`
  );
}

// ─── STEP 4: Battery brief citation linkage ────────────────────────────
console.log("\n=== STEP 4: Battery brief citation linkage ===\n");
{
  // Find the canonical EUR-Lex source row to link to. Prefer the one
  // matching the most-specific URL prefix; fall back to the generic
  // EUR-Lex root row.
  const { data: eurLexRows } = await supabase
    .from("sources")
    .select("id, name, url")
    .or("url.ilike.%eur-lex.europa.eu/eli/reg/2023/1542%,url.eq.https://eur-lex.europa.eu");

  // Battery Regulation 2023/1542 is not present as a specific source — we'll
  // create it as Tier 1 EUR-Lex ELI source for clean granularity. Idempotent.
  const SPECIFIC_URL = "https://eur-lex.europa.eu/eli/reg/2023/1542/oj";
  let batterySourceId = null;

  const { data: existingSpecific } = await supabase
    .from("sources")
    .select("id, tier")
    .ilike("url", "%eur-lex.europa.eu/eli/reg/2023/1542%")
    .maybeSingle();

  if (existingSpecific) {
    batterySourceId = existingSpecific.id;
    step(
      "step4_specific_source_already_exists",
      true,
      `id=${batterySourceId} tier=${existingSpecific.tier}`
    );
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("sources")
      .insert({
        name: "EUR-Lex / Regulation (EU) 2023/1542 — Batteries Regulation",
        url: SPECIFIC_URL,
        description:
          "Official ELI text of Regulation (EU) 2023/1542 of the European Parliament and of the Council of 12 July 2023 concerning batteries and waste batteries (the EU Battery Regulation). Tier 1 EUR-Lex primary publication. Affects freight forwarders moving battery-containing cargo (especially live events, film/TV, automotive verticals) into and within the EU through CE-marking, carbon footprint declaration, battery passport, and supply-chain due-diligence obligations.",
        tier: 1,
        tier_at_creation: 1,
        domains: [1],
        jurisdictions: [],
        jurisdiction_iso: ["EU"],
        intelligence_types: ["regulation"],
        access_method: "scrape",
        status: "active",
        admin_only: false,
        update_frequency: "monthly",
        notes:
          "Auto-linked by wave2-cleanup-execute on 2026-05-06 to remediate src=0 on intelligence_item ac349a70 (eu-battery-regulation-2023-1542). Brief contains 29 inline *Source: ...* citations and a 4-row sources table; the structured sources_used array was empty because no sources row matched the item's source_url. This row resolves the linkage.",
      })
      .select("id")
      .single();
    if (insErr) step("step4_insert_specific_source", false, insErr.message);
    batterySourceId = inserted.id;
    step("step4_insert_specific_source", true, `id=${batterySourceId}`);
  }

  // Link the intelligence_item to this source + populate sources_used.
  // sources_used is a TEXT[] (not UUID[]) per parse-output.ts contract — we
  // use the UUID string directly.
  const { error: updErr } = await supabase
    .from("intelligence_items")
    .update({
      source_id: batterySourceId,
      sources_used: [batterySourceId],
    })
    .eq("id", BATTERY_ITEM_ID);
  step("step4_battery_link_update", !updErr, updErr?.message ?? "linked");

  // Read back and verify
  const { data: post } = await supabase
    .from("intelligence_items")
    .select("id, source_id, sources_used")
    .eq("id", BATTERY_ITEM_ID)
    .maybeSingle();

  const ok =
    post?.source_id === batterySourceId &&
    Array.isArray(post?.sources_used) &&
    post.sources_used.length >= 1 &&
    post.sources_used.includes(batterySourceId);
  step(
    "step4_battery_verify",
    ok,
    `source_id=${post?.source_id} sources_used.length=${post?.sources_used?.length}`
  );
}

// ─── Final state snapshot ──────────────────────────────────────────────
console.log("\n=== FINAL STATE SNAPSHOT ===\n");
{
  const { count: stillStalePendingReview } = await supabase
    .from("provisional_sources")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .lt("created_at", STALE_CUTOFF);

  const ids = staleRows.map((r) => r.id);
  const { data: backfillCheck } = await supabase
    .from("provisional_sources")
    .select("id, discovered_for_jurisdiction")
    .in("id", ids);
  const nullJurisAfter = (backfillCheck ?? []).filter(
    (r) => r.discovered_for_jurisdiction === null
  ).length;

  const { data: dubai } = await supabase
    .from("intelligence_items")
    .select("legacy_id, jurisdiction_iso")
    .in("legacy_id", DUBAI_UAE_LEGACY_IDS);

  const { data: battery } = await supabase
    .from("intelligence_items")
    .select("source_id, sources_used")
    .eq("id", BATTERY_ITEM_ID)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        stale_pending_review_remaining: stillStalePendingReview,
        backfill_null_remaining: nullJurisAfter,
        dubai_uae_rows: dubai,
        battery_brief: {
          source_id: battery?.source_id,
          sources_used_count: battery?.sources_used?.length ?? 0,
        },
        reclass_summary: reclassResults.map((r) => ({
          name: r.name,
          decision: r.decision,
          new_status: r.new_status,
          juris: r.discovered_for_jurisdiction,
        })),
      },
      null,
      2
    )
  );
}

writeFileSync(
  resolve("..", "docs", "wave2-cleanup-execute-log.json"),
  JSON.stringify({ completed: true, log, reclass_results: reclassResults }, null, 2),
  "utf8"
);
console.log("\n✓ Wave 2 cleanups complete. Log: docs/wave2-cleanup-execute-log.json");
