/**
 * source-classification-step2-execute.mjs — Step 2 of source classification
 * remediation dispatch (2026-05-25). Provisional source AI recommendations.
 *
 * SAFETY PROPERTIES (read carefully):
 *
 *   - READS from provisional_sources WHERE recommended_classification IS NULL
 *   - WRITES only to provisional_sources.recommended_classification (JSONB cache)
 *   - DOES NOT touch the sources table
 *   - DOES NOT delete anything
 *   - Generates AI recommendations for human review at /admin → Provisional review
 *   - Each recommendation requires operator approval at the admin console
 *     before any live source is created (via separate /api/admin/sources/promote
 *     endpoint, not invoked here)
 *   - Idempotent: re-running skips rows that already have a recommendation
 *
 * Uses the same system prompt as /api/admin/sources/recommend-classification
 * (see fsi-app/src/app/api/admin/sources/recommend-classification/route.ts).
 *
 * Usage:
 *   node scripts/source-classification-step2-execute.mjs --limit=1   # sample one
 *   node scripts/source-classification-step2-execute.mjs              # full batch
 *   node scripts/source-classification-step2-execute.mjs --concurrency=5
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
);
const LIMIT = argMap.limit ? Number(argMap.limit) : null;
const CONCURRENCY = argMap.concurrency ? Number(argMap.concurrency) : 5;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error(
    "Missing one of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const LOG_DIR = resolve("..", "docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const LOG_PATH = resolve(LOG_DIR, "source-classification-step2-log.json");

// Mirrors the system prompt at src/app/api/admin/sources/recommend-classification/route.ts.
// Keep in sync if that file changes.
const CLASSIFICATION_SYSTEM_PROMPT = `You classify provisional intelligence sources for a freight sustainability intelligence platform. Your output is a single JSON object — no prose, no markdown, no code fences.

Schema and constraints (apply exactly):

tier (integer 1-7):
  1 = Official legal text (gazettes, Federal Register, EUR-Lex Official Journal)
  2 = Regulator guidance (EPA rule summaries, EU Commission FAQs, agency interpretive bulletins)
  3 = Intergovernmental organisation positions (IMO MEPC, ICAO, UNFCCC, World Bank, IEA)
  4 = Industry body interpretation, classification societies, standards bodies (FIATA, CLECAT, ICCT, DNV, ABS, GHG Protocol, ISO, GLEC, CDP, SBTi, IFRS/ISSB)
  5 = News reporting and trade press (Reuters, FreightWaves, Lloyd's List, JOC, Splash247, TradeWinds, GreenBiz)
  6 = Commercial regulatory intelligence (Thomson Reuters Reg Intel, law firm trackers)
  7 = Provisional or unverified

domains (array of integers 1-7, choose all that apply):
  1 = Regulatory and Legislative
  2 = Energy and Technology Innovation
  3 = Regional Operations Intelligence
  4 = Geopolitical and Market Signals
  5 = Source Intelligence (meta — for sources about other sources)
  6 = Warehouse and Facility Optimization
  7 = University and Research Pipeline

jurisdictions (array of strings, choose all that apply):
  eu | us | uk | latam | asia | hk | meaf | global

transport_modes (array of strings, choose all that apply):
  air | road | ocean | rail

topic_tags (array of strings, choose all that apply):
  emissions | fuels | transport | reporting | packaging | corridors | research

bias_tags (object with three keys: funding, methodology, stakeholder). Each key maps to an array of {tag, confidence} pairs where tag is from the per-dimension vocabulary below and confidence is a number 0.00-1.00 reflecting how sure you are this tag applies to this source. Emit zero or more tags per dimension; multi-value is expected (most sources carry multiple tags within at least one dimension). The three dimensions are orthogonal; a single source can carry any combination across them.

  Dimension 1 — funding (Funding / Institutional Affiliation):
    industry-funded | government-funded | foundation-funded | subscription-supported | academic-institutional | mixed-funded | funding-opaque

  Dimension 2 — methodology (Methodological Orientation):
    peer-reviewed | methodologically-transparent | analytical-synthesis | editorial-opinion | advocacy | factual-reporting | standards-defining

  Dimension 3 — stakeholder (Stakeholder Position):
    industry-incumbent | industry-challenger | regulator-aligned | environmental-advocate | independent-research | customer-perspective | labor-perspective | investor-perspective

Bias-tag confidence guidance: use >=0.80 when the source's bias is unambiguous from its institutional identity (e.g. ICCT is unambiguously foundation-funded and independent-research; EUR-Lex is unambiguously government-funded and regulator-aligned). Use 0.65-0.79 when the bias is likely but the source could plausibly be assigned differently. Use <0.65 when you are uncertain; emit the tag at low confidence rather than omitting if you have substantive evidence. The downstream pipeline auto-applies >=0.80 tags, surfaces 0.65-0.79 tags to operator review, and discards <0.65 tags.

Bias tags apply to external publisher sources only. Do not propose bias tags on user-generated content, on the platform's own internal records, or on sources whose institutional identity is unknown enough that all four +0.65 tags would be funding-opaque.

ICCT worked example (operator-supplied): funding [{tag: "foundation-funded", confidence: 0.90}], methodology [{tag: "methodologically-transparent", confidence: 0.85}, {tag: "analytical-synthesis", confidence: 0.85}], stakeholder [{tag: "independent-research", confidence: 0.85}, {tag: "environmental-advocate", confidence: 0.80}].

rationale (string, 1-2 sentences): explain the tier choice in plain language, citing the source's role and authority.

Analytical-press routing (additive guidance per platform-intent skill Section 3 + migration 086): trade journals, sustainability reporting outlets, and industry analyst commentary with named editorial provenance (Loadstar, FreightWaves, Edie, GreenBiz, Environmental Finance, Splash247, Supply Chain Digital, Reuters Sustainable Business and similar outlets) map to category='research' (Research surface, not Market Intel) with source_role='trade_press'. Use tier 5 for straight news reporting; tier 6 for analysis, opinion, or horizon-scanning commentary. Reuters trade-press analytical reporting is tier 5; outlets that lead with editorial analysis (Loadstar, FreightWaves Sustainability, Edie, GreenBiz, Environmental Finance, Splash247 Green, Supply Chain Digital, GreenBiz) are tier 6. Underlying source-row routing landed in migration 086 (sources.category='research', sources.source_role='trade_press', sources.tier per outlet).

Output JSON only. Example:
{"tier":4,"domains":[1,2],"jurisdictions":["global"],"transport_modes":["ocean"],"topic_tags":["emissions","fuels"],"bias_tags":{"funding":[{"tag":"foundation-funded","confidence":0.85}],"methodology":[{"tag":"standards-defining","confidence":0.90},{"tag":"methodologically-transparent","confidence":0.80}],"stakeholder":[{"tag":"independent-research","confidence":0.85}]},"rationale":"Classification society publishing regulatory interpretation; sits between primary regulator and industry analysis."}`;

const BIAS_TAG_VOCAB = {
  funding: ["industry-funded","government-funded","foundation-funded","subscription-supported","academic-institutional","mixed-funded","funding-opaque"],
  methodology: ["peer-reviewed","methodologically-transparent","analytical-synthesis","editorial-opinion","advocacy","factual-reporting","standards-defining"],
  stakeholder: ["industry-incumbent","industry-challenger","regulator-aligned","environmental-advocate","independent-research","customer-perspective","labor-perspective","investor-perspective"],
};

function validateBiasTags(value) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  for (const dim of ["funding", "methodology", "stakeholder"]) {
    const arr = value[dim];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return false;
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) return false;
      if (typeof entry.tag !== "string" || !BIAS_TAG_VOCAB[dim].includes(entry.tag)) return false;
      if (typeof entry.confidence !== "number" || entry.confidence < 0 || entry.confidence > 1) return false;
    }
  }
  for (const k of Object.keys(value)) {
    if (!["funding", "methodology", "stakeholder"].includes(k)) return false;
  }
  return true;
}

function validateRecommendation(rec) {
  return (
    typeof rec.tier === "number" &&
    rec.tier >= 1 && rec.tier <= 7 &&
    Array.isArray(rec.domains) &&
    Array.isArray(rec.jurisdictions) &&
    Array.isArray(rec.transport_modes) &&
    Array.isArray(rec.topic_tags) &&
    typeof rec.rationale === "string" &&
    validateBiasTags(rec.bias_tags)
  );
}

async function classifyOne(row) {
  const userMessage = `Classify this provisional source.

Name: ${row.name}
URL: ${row.url}
Description: ${row.description || "(none)"}

Output the JSON object only.`;

  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON object in model output");
  const rec = JSON.parse(m[0]);
  rec.model = "claude-haiku-4-5-20251001";
  rec.computed_at = new Date().toISOString();
  if (!validateRecommendation(rec)) {
    throw new Error("Malformed recommendation shape: " + JSON.stringify(rec).slice(0, 500));
  }

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;
  // Haiku 4.5 pricing: $1/MTok input, $5/MTok output
  const costUsd = (inputTokens * 1) / 1_000_000 + (outputTokens * 5) / 1_000_000;

  return { rec, inputTokens, outputTokens, costUsd };
}

async function main() {
  console.log(`Step 2 runner: source classification Haiku batch`);
  console.log(`  Limit: ${LIMIT ?? "no limit (full batch)"}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(``);

  let query = supabase
    .from("provisional_sources")
    .select("id, name, url, description")
    .is("recommended_classification", null)
    .order("id");
  if (LIMIT) query = query.limit(LIMIT);
  const { data: rows, error: loadErr } = await query;
  if (loadErr) {
    console.error(`Load error: ${loadErr.message}`);
    process.exit(1);
  }
  if (!rows || rows.length === 0) {
    console.log(`Nothing to classify. Done.`);
    return;
  }

  console.log(`Loaded ${rows.length} uncached provisional sources.`);
  console.log(``);

  const log = [];
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let ok = 0;
  let failed = 0;

  // Simple worker-pool pattern
  const queue = [...rows];
  const workers = Array.from({ length: CONCURRENCY }, async (_, wi) => {
    while (true) {
      const row = queue.shift();
      if (!row) break;
      try {
        const { rec, inputTokens, outputTokens, costUsd } = await classifyOne(row);
        const { error: cacheErr } = await supabase
          .from("provisional_sources")
          .update({ recommended_classification: rec })
          .eq("id", row.id);
        if (cacheErr) throw new Error(`cache write: ${cacheErr.message}`);

        totalCost += costUsd;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        ok++;
        const remaining = queue.length;
        console.log(
          `[OK ${ok}/${rows.length}] tier=${rec.tier} cost=$${costUsd.toFixed(4)} cumulative=$${totalCost.toFixed(4)} remaining=${remaining} — ${row.name.slice(0, 70)}`
        );
        log.push({ id: row.id, name: row.name, tier: rec.tier, costUsd, ok: true });
      } catch (e) {
        failed++;
        console.warn(`[FAIL ${failed}] ${row.name.slice(0, 70)}: ${e.message}`);
        log.push({ id: row.id, name: row.name, ok: false, error: e.message });
      }
    }
  });

  await Promise.all(workers);

  const summary = {
    total: rows.length,
    ok,
    failed,
    totalCostUsd: totalCost,
    totalInputTokens,
    totalOutputTokens,
    avgCostPerCall: ok > 0 ? totalCost / ok : 0,
    completedAt: new Date().toISOString(),
  };

  writeFileSync(LOG_PATH, JSON.stringify({ summary, log }, null, 2), "utf8");

  console.log(``);
  console.log(`=== Summary ===`);
  console.log(`  Processed: ${ok} ok, ${failed} failed`);
  console.log(`  Total cost: $${totalCost.toFixed(4)}`);
  console.log(`  Avg per call: $${summary.avgCostPerCall.toFixed(4)}`);
  console.log(`  Tokens: ${totalInputTokens} input + ${totalOutputTokens} output`);
  console.log(`  Log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
