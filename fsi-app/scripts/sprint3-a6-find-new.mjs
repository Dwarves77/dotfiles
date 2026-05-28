/**
 * sprint3-a6-find-new.mjs
 *
 * Sprint 3 A6.2 Sonnet find-new (operator-locked 2026-05-27).
 *
 * Walks 15 (region, dimension) cells — (Asia, UK, UAE) × (D2/D3/D4/D5/D6)
 * — and calls Sonnet 4.6 + web_search per cell to surface up to 5
 * sourced facts. Inserts into regional_data_facts. New source URLs land
 * in provisional_sources for operator review (EcoVadis precedent). The
 * region_dimension_coverage trigger from migration 109 auto-flips state
 * 'missing' → 'populated' on first fact insert.
 *
 * Operator caps:
 *   - Per-cell prompt asks for UP TO 5 facts; if fewer credible facts
 *     exist, accept what's there (no padding).
 *   - Hard cost ceiling: $10. Script stops + reports if exceeded.
 *
 * Cost accounting uses Anthropic's response.usage block (input + output
 * tokens) × Sonnet 4.6 token prices, plus an estimate for web_search
 * tool calls. Conservative — overestimates rather than under.
 *
 * Output:
 *   - Per-row inserts into regional_data_facts + provisional_sources
 *   - JSON log at docs/audits/sprint3-a6-find-new-2026-05-27.json
 *   - Console report: per-cell facts produced, cost used, sources
 *     resolved vs upserted-as-provisional
 *
 * Re-runnable. Per-cell prompt skipped if regional_data_facts already
 * has >= 5 rows for that cell.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");

const envText = readFileSync(resolve(APP_ROOT, ".env.local"), "utf8");
const env = (k) => envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing required env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Cells in scope ────────────────────────────────────────────────
const REGIONS = ["ASIA", "UK", "UAE"];
const DIMENSIONS = [
  { key: "regional_resources", label: "Regional resource availability", desc: "Materials, recyclables, and qualified suppliers for crating, packaging, and operational supply" },
  { key: "labor_markets", label: "Labor markets", desc: "Loaded-cost wages and workforce availability for warehouse, driver, and art-handler roles" },
  { key: "materials_sourcing", label: "Materials sourcing", desc: "Mills, certified suppliers, in-region vs import economics, certification status" },
  { key: "infrastructure", label: "Infrastructure capacity", desc: "Port dwell, air cargo capacity, rail terminals, shore power, electric truck charging" },
  { key: "operational_cost", label: "Operational cost data", desc: "Industrial electricity rates, diesel, SAF, port handling THC, drayage rates, regional cost baselines" },
];

const COST_CEILING_USD = 10.0;

// Anthropic Sonnet 4.6 pricing (per 1M tokens) per public docs
const INPUT_PER_M = 3.0;   // USD
const OUTPUT_PER_M = 15.0;
const WEB_SEARCH_PER_CALL = 0.01; // conservative estimate

// ── Pre-flight: load region_id map + skip-cell logic ──────────────
console.log("[a6.2] loading regions + existing fact counts …");
const { data: regionRows, error: regionErr } = await supabase
  .from("regions")
  .select("id, code")
  .in("code", REGIONS);
if (regionErr) {
  console.error("region load failed:", regionErr.message);
  process.exit(1);
}
const regionIdByCode = new Map(regionRows.map((r) => [r.code, r.id]));

const { data: existingFacts } = await supabase
  .from("regional_data_facts")
  .select("region_id, dimension")
  .in("region_id", Array.from(regionIdByCode.values()));
const factsByCell = new Map();
for (const f of existingFacts || []) {
  const key = `${f.region_id}|${f.dimension}`;
  factsByCell.set(key, (factsByCell.get(key) || 0) + 1);
}

// ── Per-cell prompt builder ───────────────────────────────────────
function buildPrompt(regionCode, dim) {
  return `You are researching regional operational data for Caro's Ledge, a freight forwarding intelligence platform.

Region: ${regionCode === "ASIA" ? "Asia (Singapore + Hong Kong + Japan + South Korea + Greater China)" : regionCode === "UK" ? "United Kingdom" : "United Arab Emirates (especially Dubai)"}
Dimension: ${dim.label} (${dim.key})

Scope: ${dim.desc}

Find UP TO 5 specific, sourced, current facts about ${regionCode === "ASIA" ? "Asia" : regionCode === "UK" ? "the UK" : "the UAE"} on this dimension that a high-value-cargo freight forwarder would care about (live events, fine art, luxury goods, film/TV, classic cars, humanitarian).

Each fact MUST:
- Be specific and quantitative where possible (e.g. "Singapore industrial electricity: S$0.272/kWh" not "Singapore has high electricity")
- Cite a verifiable, current source URL (regulator, official statistics, industry trade press, ports authority, energy regulator)
- Have a source date in the last 18 months when possible
- Include a trend indicator (up / down / flat) when applicable
- Include a status label when applicable (e.g. "Available", "Constrained", "Limited", "Tight pool", "Operational at N of M", "Restricted")

If FEWER than 5 credible facts exist, return what you find — do NOT pad. Skip any fact where you cannot verify the source URL is real and current.

Return ONLY a JSON object in this shape:
{
  "facts": [
    {
      "label": "<short metric name e.g. 'Singapore — industrial electricity'>",
      "value": "<the numeric or qualitative value e.g. 'S$0.272 / kWh' or 'Constrained' or 'Operational at 4 of 12 terminals'>",
      "status": "<optional status label or null>",
      "trend": "<up | down | flat | null>",
      "source_name": "<publisher name>",
      "source_url": "<full URL>",
      "source_date": "<YYYY-MM-DD or YYYY-MM>"
    }
  ]
}

No other text. No markdown fences.`;
}

// ── Sonnet call ───────────────────────────────────────────────────
async function callSonnet(prompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sonnet ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const usage = data.usage || {};
  const webSearchCount = (data.content || []).filter((b) => b.type === "tool_use" && b.name === "web_search").length;
  return { text, usage, webSearchCount };
}

function estimateCost(usage, webSearchCount) {
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const output = usage.output_tokens || 0;
  return (input / 1_000_000) * INPUT_PER_M + (output / 1_000_000) * OUTPUT_PER_M + webSearchCount * WEB_SEARCH_PER_CALL;
}

function parseFacts(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[0]);
    return Array.isArray(obj.facts) ? obj.facts : [];
  } catch {
    return [];
  }
}

// ── Source resolver: existing sources OR provisional ──────────────
function urlKey(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return (url.origin + url.pathname).toLowerCase().replace(/\/$/, "");
  } catch {
    return u.toLowerCase().replace(/\/$/, "");
  }
}

async function resolveSource(fact) {
  if (!fact.source_url) return { source_id: null, provisional: false };
  const key = urlKey(fact.source_url);
  const { data: matches } = await supabase
    .from("sources")
    .select("id, url")
    .ilike("url", `${key}%`)
    .limit(5);
  for (const m of matches || []) {
    if (urlKey(m.url) === key) return { source_id: m.id, provisional: false };
  }
  // No match → provisional upsert (EcoVadis precedent).
  const { error } = await supabase
    .from("provisional_sources")
    .upsert(
      {
        name: fact.source_name || fact.source_url,
        url: fact.source_url,
        description: `Surfaced by A6.2 Sonnet find-new for region+dimension cell (${fact._cell_region}, ${fact._cell_dimension}). Awaiting tier/category review.`,
        discovered_via: "a6_find_new",
        status: "pending_review",
      },
      { onConflict: "url" }
    );
  if (error) console.warn("  provisional upsert failed:", error.message);
  return { source_id: null, provisional: true };
}

// ── Main loop ─────────────────────────────────────────────────────
let totalCost = 0;
const cellLog = [];
let abortedAtCell = null;

outer: for (const regionCode of REGIONS) {
  for (const dim of DIMENSIONS) {
    const regionId = regionIdByCode.get(regionCode);
    const cellKey = `${regionId}|${dim.key}`;
    const existingCount = factsByCell.get(cellKey) || 0;
    if (existingCount >= 5) {
      console.log(`[a6.2] skip ${regionCode}/${dim.key} (already has ${existingCount} facts)`);
      cellLog.push({ region: regionCode, dimension: dim.key, skipped: true, existing: existingCount });
      continue;
    }
    if (totalCost >= COST_CEILING_USD) {
      console.warn(`[a6.2] cost ceiling $${COST_CEILING_USD} hit ($${totalCost.toFixed(3)}); aborting`);
      abortedAtCell = `${regionCode}/${dim.key}`;
      break outer;
    }

    console.log(`[a6.2] ${regionCode}/${dim.key} — calling Sonnet …`);
    const prompt = buildPrompt(regionCode, dim);
    let response;
    try {
      response = await callSonnet(prompt);
    } catch (e) {
      console.error(`  Sonnet error: ${e.message}`);
      cellLog.push({ region: regionCode, dimension: dim.key, error: e.message });
      continue;
    }
    const cost = estimateCost(response.usage, response.webSearchCount);
    totalCost += cost;
    console.log(`  usage: ${response.usage.input_tokens || 0} in / ${response.usage.output_tokens || 0} out / ${response.webSearchCount} web · cost ~$${cost.toFixed(3)} · running $${totalCost.toFixed(3)}`);

    const facts = parseFacts(response.text);
    console.log(`  parsed ${facts.length} facts`);
    if (facts.length === 0) {
      cellLog.push({ region: regionCode, dimension: dim.key, parsed: 0, cost });
      continue;
    }

    let inserted = 0, provisional = 0, sourceResolved = 0;
    for (const f of facts) {
      f._cell_region = regionCode;
      f._cell_dimension = dim.key;
      const { source_id, provisional: prov } = await resolveSource(f);
      if (source_id) sourceResolved++;
      if (prov) provisional++;
      const { error: insErr } = await supabase.from("regional_data_facts").insert({
        region_id: regionId,
        dimension: dim.key,
        fact_label: f.label || "",
        value: f.value || "",
        status: f.status || null,
        trend: ["up", "down", "flat"].includes(f.trend) ? f.trend : null,
        source_id,
        source_note: source_id ? null : `${f.source_name || ""} · ${f.source_url || ""} · ${f.source_date || ""}`.trim(),
      });
      if (insErr) {
        console.warn(`  insert failed (${f.label?.slice(0, 40)}): ${insErr.message}`);
      } else {
        inserted++;
      }
    }
    console.log(`  inserted ${inserted}/${facts.length} facts · ${sourceResolved} URL-matched · ${provisional} provisional`);
    cellLog.push({
      region: regionCode,
      dimension: dim.key,
      parsed: facts.length,
      inserted,
      source_resolved: sourceResolved,
      provisional,
      cost,
    });
  }
}

// ── Report ────────────────────────────────────────────────────────
console.log("\n[a6.2] === SUMMARY ===");
console.log(`Total Sonnet cost: ~$${totalCost.toFixed(3)} (ceiling $${COST_CEILING_USD})`);
if (abortedAtCell) console.log(`Aborted at: ${abortedAtCell}`);
console.log("\nPer-cell results:");
console.log(JSON.stringify(cellLog, null, 2));

const outPath = resolve(APP_ROOT, "docs/audits/sprint3-a6-find-new-2026-05-27.json");
writeFileSync(
  outPath,
  JSON.stringify({ run_date: new Date().toISOString(), total_cost_usd: totalCost, ceiling: COST_CEILING_USD, aborted_at: abortedAtCell, cells: cellLog }, null, 2)
);
console.log(`\n[a6.2] wrote ${outPath}`);
