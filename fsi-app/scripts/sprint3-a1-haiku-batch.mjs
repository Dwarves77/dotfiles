/**
 * sprint3-a1-haiku-batch.mjs — Sprint 3 A1 classifier-quality batch.
 *
 * SAFETY PROPERTIES:
 *   - READ-ONLY against intelligence_items (no DB writes)
 *   - WRITES Haiku recommendations to JSON file ONLY
 *   - Operator spot-checks 10% before any DB apply (separate script)
 *
 * Targets 4 buckets (per Sprint 3 dispatch brief Section 8 + A1 prework):
 *   1. category IS NULL                                   (~409 rows)
 *   2. domain=1 AND category='research'                   (~28 rows)
 *   3. category NOT NULL AND NOT IN TOPICS (non-canonical)(~32 rows)
 *   4. specific misclassifications: Green Corridors / UNDP / EcoVadis (~7 rows)
 *
 * Cost ceiling per dispatch brief: $5. Estimated cost: $1.17.
 * Aborts if running cost crosses $5.
 *
 * Output: fsi-app/docs/audits/sprint3-classifier-quality-batch-2026-05-25.json
 *
 * Run: node scripts/sprint3-a1-haiku-batch.mjs [--concurrency=5]
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
);
const CONCURRENCY = args.concurrency ? Number(args.concurrency) : 5;
const COST_CEILING_USD = 5.0;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
  console.error("Missing one of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT_PATH = resolve(LOG_DIR, "sprint3-classifier-quality-batch-2026-05-25.json");

// Canonical TOPICS list (21 values) — mirrors src/lib/constants.ts.
const TOPICS = [
  "emissions", "fuels", "transport", "reporting", "packaging", "corridors",
  "customs", "trade", "sanctions", "origin",
  "dangerous-goods", "food-safety", "pharma", "security",
  "cabotage", "labor", "infrastructure", "digital", "insurance",
  "standards", "research",
];

const DOMAIN_LABELS = {
  1: "Regulations",
  2: "Energy & Tech",
  3: "Regional Ops",
  4: "Geopolitical",
  5: "Source Intel",
  6: "Facilities",
  7: "Research Pipeline",
};

const ITEM_TYPES = [
  "regulation", "directive", "standard", "guidance", "framework",
  "technology", "innovation", "tool",
  "regional_data",
  "market_signal", "initiative",
  "research_finding",
];

const CLASSIFICATION_SYSTEM_PROMPT = `You are classifying intelligence items for a freight sustainability intelligence platform. Output is a single JSON object — no prose, no markdown, no code fences.

Schema:

{
  "recommended_category": "<one of the TOPICS list below, or null>",
  "recommended_domain": <integer 1-7, or null to keep current>,
  "recommended_item_type": "<one of the item_type list below, or null to keep current>",
  "confidence": "<high | medium | low>",
  "rationale": "<one short sentence>"
}

TOPICS (21 canonical category values, choose exactly one or null):
- emissions: carbon pricing, ETS, GHG strategies, carbon border adjustments
- fuels: SAF mandates, alternative maritime fuels, hydrogen, ammonia
- transport: vehicle standards, fleet mandates, ZEV, transport infra
- reporting: disclosure, emissions accounting standards, ratings
- packaging: PPWR, circular economy, PFAS, sustainable packaging
- corridors: green shipping corridors, port sustainability, shore power, clean air zones
- customs: customs procedures, border control
- trade: trade policy, tariffs
- sanctions: sanctions, export controls
- origin: rules of origin
- dangerous-goods: hazmat, dangerous goods classification
- food-safety: food safety, cold chain integrity
- pharma: pharmaceutical, GDP
- security: cargo security, screening
- cabotage: cabotage, market access
- labor: labor, driver regulations
- infrastructure: port/airport regulations
- digital: digital and data compliance
- insurance: insurance, liability
- standards: industry standards (ISO, IATA)
- research: academic, think-tank, industry research, innovation trackers

DOMAINS (1-7, the surface routing axis):
1 Regulations — binding law, regulator guidance, official frameworks
2 Energy & Tech — technology innovation, tools, vendor offerings
3 Regional Ops — region-specific operational facts (electricity rates, labor markets, infrastructure)
4 Geopolitical — geopolitical signals, market signals
5 Source Intel — meta about sources (rare; reserved)
6 Facilities — facility-specific operational data
7 Research Pipeline — research findings, academic papers, think-tank pieces

ITEM_TYPES (the format routing axis):
regulation, directive, standard, guidance, framework → regulatory_fact_document format
technology, innovation, tool → technology_profile format
regional_data → operations_profile format
market_signal, initiative → market_signal_brief format
research_finding → research_summary format

Classification rules:
- For category: pick the SINGLE most central topic. If the item touches multiple, choose what the brief is PRIMARILY about. Never invent categories outside the 21-value list. Emit null only if the item genuinely doesn't fit any (rare).
- For domain: prefer to keep current unless current is clearly wrong (e.g., a research finding tagged domain=1 should be domain=7).
- For item_type: prefer to keep current unless current is clearly wrong.
- For confidence: "high" when title + summary clearly indicate the classification; "medium" when reasonable inference required; "low" when ambiguous.
- For rationale: one short factual sentence. No hedging, no caveats.

Examples of obvious recategorizations:
- "Green Corridors Initiative" (initiative, currently category='regulation') → category='corridors', item_type='initiative' (NOT a regulation, this is a multi-stakeholder initiative)
- "UNDP Environmental Finance" → likely category='reporting' or 'emissions', item_type='framework' or 'guidance' depending on substance; domain=2 or 7
- "EcoVadis Sustainability Rating" → category='reporting', item_type='standard' (a rating methodology), domain=1 or 2 depending on enforcement
- A research finding from MIT or academic source currently tagged domain=1 → domain=7, item_type='research_finding'`;

// Wraps Anthropic call. Returns { recommendation, usage } or null on parse failure.
async function classifyOne(row) {
  const userMsg = `Current state:
- ID: ${row.id}
- title: ${row.title}
- summary: ${row.summary ?? "(none)"}
- current category: ${row.category ?? "null"}
- current domain: ${row.domain} (${DOMAIN_LABELS[row.domain] ?? "unknown"})
- current item_type: ${row.item_type ?? "(none)"}

Classify per the schema. JSON only.`;

  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: CLASSIFICATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed;
  try {
    // Strip code fence if Haiku slipped one in.
    const m = text.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
  } catch (e) {
    return { error: `parse failed: ${e.message}`, raw: text.slice(0, 200), usage: resp.usage };
  }

  return { recommendation: parsed, usage: resp.usage };
}

// Haiku pricing 2026-05 calibration (matches Step 2 cost): per-call
// $0.0025 expected average. Input tokens $1/MTok, output $5/MTok.
function callCostUsd(usage) {
  if (!usage) return 0.0025;
  const inputUsd = (usage.input_tokens / 1_000_000) * 1.0;
  const outputUsd = (usage.output_tokens / 1_000_000) * 5.0;
  return inputUsd + outputUsd;
}

async function fetchTargetRows() {
  // Bucket 1: category IS NULL
  const { data: nullCat } = await supabase
    .from("intelligence_items")
    .select("id, title, summary, category, domain, item_type")
    .is("category", null);

  // Bucket 2: d=1 research
  const { data: d1Research } = await supabase
    .from("intelligence_items")
    .select("id, title, summary, category, domain, item_type")
    .eq("domain", 1)
    .eq("category", "research");

  // Bucket 3: non-canonical category
  const { data: nonCanon } = await supabase
    .from("intelligence_items")
    .select("id, title, summary, category, domain, item_type")
    .not("category", "is", null)
    .not("category", "in", `(${TOPICS.map((t) => `"${t}"`).join(",")})`);

  // Bucket 4: specific surfaced misclassifications
  const { data: specific } = await supabase
    .from("intelligence_items")
    .select("id, title, summary, category, domain, item_type")
    .or("title.ilike.%green corridors%,title.ilike.%UNDP%,title.ilike.%EcoVadis%");

  // Tag each row with its bucket so output is sortable for proportional sampling.
  const tagged = [];
  for (const r of nullCat ?? []) tagged.push({ ...r, _bucket: "ambiguous_null" });
  for (const r of d1Research ?? []) tagged.push({ ...r, _bucket: "d1_research" });
  for (const r of nonCanon ?? []) tagged.push({ ...r, _bucket: "non_canonical" });
  for (const r of specific ?? []) tagged.push({ ...r, _bucket: "specific_misclass" });

  // Deduplicate by id — a row might match multiple buckets (rare but
  // possible, e.g. a "Green Corridors" row also in null-category).
  const seen = new Set();
  const deduped = [];
  for (const r of tagged) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    deduped.push(r);
  }
  return deduped;
}

async function main() {
  console.log("[A1] fetching target rows...");
  const rows = await fetchTargetRows();
  console.log(`[A1] ${rows.length} unique rows to classify (target ~469)`);

  // Bucket breakdown.
  const bucketCounts = rows.reduce((acc, r) => {
    acc[r._bucket] = (acc[r._bucket] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[A1] buckets: ${JSON.stringify(bucketCounts)}`);

  const results = [];
  let totalCostUsd = 0;
  let processed = 0;

  // Concurrency pool — N in-flight Haiku calls.
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        const out = await classifyOne(row);
        const cost = callCostUsd(out?.usage);
        totalCostUsd += cost;
        results.push({
          id: row.id,
          title: row.title,
          bucket: row._bucket,
          current: { category: row.category, domain: row.domain, item_type: row.item_type },
          ...(out?.recommendation ? { recommendation: out.recommendation } : { error: out?.error, raw: out?.raw }),
        });
        processed++;
        if (processed % 25 === 0) {
          console.log(`[A1] processed ${processed}/${rows.length} (cost so far $${totalCostUsd.toFixed(4)})`);
        }
        if (totalCostUsd > COST_CEILING_USD) {
          console.error(`[A1] ABORT: cost ${totalCostUsd.toFixed(4)} exceeded ceiling $${COST_CEILING_USD}`);
          throw new Error("cost ceiling exceeded");
        }
      } catch (e) {
        results.push({ id: row.id, title: row.title, bucket: row._bucket, error: e.message });
        processed++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // Sort by bucket then id for stable output.
  results.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket.localeCompare(b.bucket);
    return a.id.localeCompare(b.id);
  });

  const output = {
    run_date: new Date().toISOString(),
    total_rows: rows.length,
    bucket_counts: bucketCounts,
    actual_cost_usd: Number(totalCostUsd.toFixed(4)),
    cost_ceiling_usd: COST_CEILING_USD,
    error_count: results.filter((r) => r.error).length,
    recommendations: results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`[A1] done. wrote ${OUT_PATH}`);
  console.log(`[A1] total cost: $${totalCostUsd.toFixed(4)} (ceiling $${COST_CEILING_USD})`);
  console.log(`[A1] errors: ${output.error_count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
