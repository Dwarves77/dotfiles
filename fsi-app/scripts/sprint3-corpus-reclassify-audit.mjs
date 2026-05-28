/**
 * sprint3-corpus-reclassify-audit.mjs — Sprint 3 CORPUS-RECLASSIFY-SOURCES.
 *
 * READ-ONLY investigation. Surfaces intelligence_items rows in domain=1
 * (Regulatory & Legislative) whose title shape suggests they are
 * source-portal aggregator pages rather than discrete regulations.
 *
 * Same shape as A1.5 EcoVadis precedent: rows that should live in the
 * `sources` table are surfacing in `intelligence_items` as regulations.
 *
 * Read-only. No UPDATE/DELETE/INSERT against production data.
 *
 * Output: docs/audits/sprint3-corpus-reclassify-audit-2026-05-27.json
 * (the script writes the JSON; the markdown audit doc is written separately)
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const LOG_DIR = resolve("docs", "audits");
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
const OUT = resolve(
  LOG_DIR,
  "sprint3-corpus-reclassify-audit-2026-05-27.json"
);

// ── Pattern definitions ───────────────────────────────────────────────
// Each pattern is JS RegExp + a stable label for reporting.
const PATTERNS = [
  { label: "homepage_or_portal", re: /\b(homepage|main portal|portal)\b/i },
  {
    label: "framework_or_overview",
    re: /\b(framework|overview|organizational overview)\b/i,
  },
  {
    label: "key_regulatory_updates",
    re: /\b(key regulatory updates|regulatory resources|regulatory updates)\b/i,
  },
  {
    label: "parliamentary_legislative_portal",
    re: /\b(parliamentary information|legislative portal|parliamentary portal|official homepage)\b/i,
  },
  {
    label: "current_notices",
    re: /\b(current (environmental )?notices|current notices)\b/i,
  },
  // Generic descriptor heuristic: title contains " – " or " — " or ": "
  // followed by a generic descriptor word (no specific instrument citation).
  {
    label: "org_then_generic_descriptor",
    re: /\b(?:[–—:-]\s*)(main portal|portal|homepage|overview|framework|resources|policy framework|fiscal session|supervisory framework|regulatory framework|guidance|current)/i,
  },
  // "—" + "Key/Main/Portal/Resources/Homepage" combo
  {
    label: "dash_key_dash_resources",
    re: /[–—-]\s*(key |main |portal|overview|homepage|resources|framework|guidance)/i,
  },
];

// Operator-named exemplars (used as a confirmed-positive control set
// — these MUST appear in the output if present in the corpus).
const OPERATOR_NAMED_EXAMPLES = [
  "Financial Conduct Authority – Main Portal and Regulatory Resources",
  "European Banking Authority – Key Regulatory Updates and Supervisory Framework",
  "Latvian Saeima Official Homepage – Parliamentary Information and Legislative Portal",
  "UK Department for Environment, Food & Rural Affairs: Organizational Overview and Policy Framework",
  "North Dakota Department of Environmental Quality – Portal and Current Environmental Notices",
  "SEMARNAT Challenge Validation Guidance",
  "Arkansas State Legislature 95th General Assembly – Fiscal Session 2026",
];

async function fetchAllDomain1() {
  // Paginate to be safe (Supabase default cap is 1000).
  const PAGE = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("intelligence_items")
      .select(
        "id, legacy_id, title, source_url, source_id, priority, item_type, domain, summary, is_archived, pipeline_stage, jurisdictions, topic_tags"
      )
      .eq("domain", 1)
      .eq("is_archived", false)
      .order("title", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function priorityDist(rows) {
  const out = {};
  for (const r of rows) {
    const k = r.priority ?? "(null)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function itemTypeDist(rows) {
  const out = {};
  for (const r of rows) {
    const k = r.item_type ?? "(null)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function domainDist(rows) {
  const out = {};
  for (const r of rows) {
    const k = r.domain ?? "(null)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function patternHits(rows) {
  // Returns: { byPattern: {label -> count}, matchedRows: [{row, hits: [labels]}] }
  const byPattern = {};
  for (const p of PATTERNS) byPattern[p.label] = 0;

  const matched = new Map(); // id → { row, hits: Set<string> }
  for (const r of rows) {
    const t = r.title ?? "";
    for (const p of PATTERNS) {
      if (p.re.test(t)) {
        byPattern[p.label] += 1;
        if (!matched.has(r.id)) {
          matched.set(r.id, { row: r, hits: new Set() });
        }
        matched.get(r.id).hits.add(p.label);
      }
    }
  }
  return {
    byPattern,
    matchedRows: Array.from(matched.values()).map((m) => ({
      row: m.row,
      hits: Array.from(m.hits),
    })),
  };
}

function spreadSample(rows, k) {
  // Stratified sample: take rows evenly across the sorted list.
  if (rows.length <= k) return rows.slice();
  const step = rows.length / k;
  const out = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.min(rows.length - 1, Math.floor(i * step));
    out.push(rows[idx]);
  }
  return out;
}

async function checkSourcesForOrg(orgNameSeed, sourceUrl) {
  // For 5 sampled rows we check the `sources` table to see if a row
  // already exists matching the URL or org name. This is the
  // duplicate signal.
  const hits = { byUrl: [], byName: [] };
  if (sourceUrl) {
    // Match exact URL OR URL containing the registered URL (or vice versa).
    const { data: byUrl } = await supabase
      .from("sources")
      .select("id, name, url, status, admin_only, base_tier, category")
      .or(`url.eq.${sourceUrl},url.ilike.%${sourceUrl.replace(/\/$/, "")}%`);
    if (byUrl && byUrl.length) hits.byUrl = byUrl;
  }
  if (orgNameSeed) {
    const seed = orgNameSeed.replace(/[%_]/g, " ").trim();
    if (seed.length >= 3) {
      const { data: byName } = await supabase
        .from("sources")
        .select("id, name, url, status, admin_only, base_tier, category")
        .ilike("name", `%${seed}%`)
        .limit(8);
      if (byName && byName.length) hits.byName = byName;
    }
  }
  return hits;
}

function orgNameSeedFromTitle(title) {
  if (!title) return null;
  // Split on em-dash, en-dash, hyphen, or colon; take the head.
  const head = title.split(/\s*[–—:-]\s*/)[0].trim();
  // Drop trailing parens.
  return head.replace(/\([^)]+\)\s*$/, "").trim();
}

async function main() {
  console.log("[corpus-reclassify] querying intelligence_items domain=1, !archived ...");
  const rows = await fetchAllDomain1();
  console.log(`[corpus-reclassify] loaded ${rows.length} rows`);

  // Distributions
  const pri = priorityDist(rows);
  const it = itemTypeDist(rows);
  const dom = domainDist(rows);

  // Pattern match
  const { byPattern, matchedRows } = patternHits(rows);

  // Per-priority breakdown of matched rows
  const matchedByPriority = priorityDist(matchedRows.map((m) => m.row));
  const matchedByDomain = domainDist(matchedRows.map((m) => m.row));
  const matchedByItemType = itemTypeDist(matchedRows.map((m) => m.row));

  // Sample 20 spread across the matched set, sorted by title
  matchedRows.sort((a, b) => (a.row.title ?? "").localeCompare(b.row.title ?? ""));
  const sampled = spreadSample(matchedRows, 20);

  // Cross-check: confirm the operator-named exemplars are in the corpus
  const operatorMatches = [];
  for (const name of OPERATOR_NAMED_EXAMPLES) {
    const hit = rows.find((r) => (r.title ?? "").toLowerCase() === name.toLowerCase());
    operatorMatches.push({
      operator_named: name,
      present_in_corpus: !!hit,
      matched_by_pattern: hit ? matchedRows.some((m) => m.row.id === hit.id) : false,
      row: hit
        ? {
            id: hit.id,
            legacy_id: hit.legacy_id,
            title: hit.title,
            priority: hit.priority,
            source_url: hit.source_url,
            source_id: hit.source_id,
          }
        : null,
    });
  }

  // Sources-table cross-check on 5 spread samples
  const fiveForSources = spreadSample(matchedRows, 5);
  const sourcesCrosscheck = [];
  for (const m of fiveForSources) {
    const seed = orgNameSeedFromTitle(m.row.title);
    console.log(`  cross-check ${m.row.id.slice(0, 8)}: seed="${seed}"`);
    const hits = await checkSourcesForOrg(seed, m.row.source_url);
    sourcesCrosscheck.push({
      item: {
        id: m.row.id,
        legacy_id: m.row.legacy_id,
        title: m.row.title,
        source_url: m.row.source_url,
        source_id: m.row.source_id,
        priority: m.row.priority,
        item_type: m.row.item_type,
      },
      seed,
      hits_by_url: hits.byUrl,
      hits_by_name: hits.byName,
      duplicate_signal:
        hits.byUrl.length > 0
          ? "URL_MATCH"
          : hits.byName.length > 0
            ? "NAME_MATCH"
            : "NO_MATCH",
    });
  }

  const output = {
    run_date: new Date().toISOString(),
    scope: {
      table: "intelligence_items",
      filters: { domain: 1, is_archived: false },
      total_rows: rows.length,
    },
    distributions: {
      priority: pri,
      item_type: it,
      domain: dom,
    },
    patterns: PATTERNS.map((p) => ({
      label: p.label,
      regex: p.re.source,
      flags: p.re.flags,
      hits: byPattern[p.label],
    })),
    pattern_hits_unique_rows: matchedRows.length,
    matched_distributions: {
      priority: matchedByPriority,
      domain: matchedByDomain,
      item_type: matchedByItemType,
    },
    operator_named_exemplar_check: operatorMatches,
    sampled_20: sampled.map((m) => ({
      id: m.row.id,
      legacy_id: m.row.legacy_id,
      title: m.row.title,
      source_url: m.row.source_url,
      source_id: m.row.source_id,
      priority: m.row.priority,
      item_type: m.row.item_type,
      hits: m.hits,
      summary_excerpt: (m.row.summary ?? "").slice(0, 100),
    })),
    sources_table_crosscheck: sourcesCrosscheck,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[corpus-reclassify] wrote ${OUT}`);
  console.log("\n--- SUMMARY ---");
  console.log(`domain=1 !archived rows: ${rows.length}`);
  console.log("priority dist:", pri);
  console.log("item_type dist:", it);
  console.log(`pattern-matched unique rows: ${matchedRows.length}`);
  console.log("  per-pattern:");
  for (const p of PATTERNS) console.log(`    ${p.label}: ${byPattern[p.label]}`);
  console.log("matched priority dist:", matchedByPriority);
  console.log("matched item_type dist:", matchedByItemType);
  console.log("\noperator-named exemplar presence:");
  for (const o of operatorMatches) {
    const flag = o.present_in_corpus ? (o.matched_by_pattern ? "[MATCH]" : "[present, pattern miss]") : "[ABSENT]";
    console.log(`  ${flag} ${o.operator_named}`);
  }
  console.log("\nsources-table cross-check signals:");
  for (const c of sourcesCrosscheck) {
    console.log(`  ${c.duplicate_signal.padEnd(11)} ${c.item.legacy_id ?? c.item.id.slice(0, 8)}  ${c.item.title?.slice(0, 70)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
