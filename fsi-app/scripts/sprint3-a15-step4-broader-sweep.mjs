/**
 * sprint3-a15-step4-broader-sweep.mjs — A1.5 Step 4.
 *
 * Broader commercial-vendor sweep with expanded patterns per
 * operator A1.5 Verdict 4. READ-ONLY. Surfaces candidates for
 * operator review.
 *
 * Surface results, operator reviews each match against the
 * paid-SaaS-marketing vs. legitimate-source distinction per
 * Verdict 3 precedent.
 *
 * Output: docs/audits/sprint3-a15-step4-broader-sweep-2026-05-25.json
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
const OUT = resolve(LOG_DIR, "sprint3-a15-step4-broader-sweep-2026-05-25.json");

// Operator-authored expanded vendor patterns (Verdict 4).
// Pattern lists organized for clarity in the output JSON.
const NAME_PATTERNS = [
  "sphera",
  "workiva",
  "watershed",
  "persefoni",
  "greenly",
  "isometrix",
  "isos labs",
  "diligent",
  "schneider sustainability",
  "schneider electric sustainability",
  "enablon",
  "anthesis",
  "wood mackenzie esg",
  // Step 1-3 already covered: ecovadis. Including here as control
  // so the sweep shows them as already-paused.
  "ecovadis",
];

// "sweep" is too common a word to safely match name standalone (would
// hit "AI sweep", "data sweep", etc). Match it ONLY in description
// context where it appears as a vendor name.
const NAME_OR_DESCRIPTION_VENDOR_NAMES = [
  "Sweep ESG",
  "Sweep carbon",
];

// ERM is a common acronym — match strict word boundaries in name.
const NAME_EXACT_PATTERNS = ["ERM"];

const DESCRIPTION_COMMERCIAL_SIGNALS = [
  "paid platform",
  "subscription required",
  "saas",
  "request a demo",
  "book a call",
  "request a quote",
  "contact sales",
];

async function searchByNameIlike(pattern) {
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, category, base_tier, status, admin_only, processing_paused, description, notes")
    .ilike("name", `%${pattern}%`);
  return data ?? [];
}

async function searchByDescriptionIlike(pattern) {
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, category, base_tier, status, admin_only, processing_paused, description, notes")
    .ilike("description", `%${pattern}%`);
  return data ?? [];
}

async function searchByNameExact(pattern) {
  // Match name = pattern OR name contains " <pattern> " (word boundary) OR
  // name starts with "<pattern> " OR ends with " <pattern>".
  const { data } = await supabase
    .from("sources")
    .select("id, name, url, category, base_tier, status, admin_only, processing_paused, description, notes")
    .or(`name.eq.${pattern},name.ilike.${pattern} %,name.ilike.% ${pattern},name.ilike.% ${pattern} %`);
  return data ?? [];
}

async function main() {
  console.log("[A1.5/Step4] running broader commercial-vendor sweep...");

  const matches = new Map(); // sourceId → { source, matched_via: [] }

  function addMatch(source, viaCategory, viaValue) {
    if (!matches.has(source.id)) {
      matches.set(source.id, { source, matched_via: [] });
    }
    matches.get(source.id).matched_via.push({ category: viaCategory, value: viaValue });
  }

  // Name ILIKE patterns
  for (const pat of NAME_PATTERNS) {
    const rows = await searchByNameIlike(pat);
    for (const r of rows) addMatch(r, "name_ilike", pat);
  }
  // Description vendor-name patterns
  for (const pat of NAME_OR_DESCRIPTION_VENDOR_NAMES) {
    const rows = await searchByDescriptionIlike(pat);
    for (const r of rows) addMatch(r, "description_vendor_name", pat);
    const nameHits = await searchByNameIlike(pat);
    for (const r of nameHits) addMatch(r, "name_vendor_name", pat);
  }
  // Name exact-ish patterns
  for (const pat of NAME_EXACT_PATTERNS) {
    const rows = await searchByNameExact(pat);
    for (const r of rows) addMatch(r, "name_exact", pat);
  }
  // Description commercial signals
  for (const pat of DESCRIPTION_COMMERCIAL_SIGNALS) {
    const rows = await searchByDescriptionIlike(pat);
    for (const r of rows) addMatch(r, "description_commercial_signal", pat);
  }

  // Enrich with item counts.
  const sourceIds = Array.from(matches.keys());
  const itemsBySource = new Map();
  if (sourceIds.length > 0) {
    const { data: items } = await supabase
      .from("intelligence_items")
      .select("id, title, source_id, category, domain, item_type, is_archived, pipeline_stage")
      .in("source_id", sourceIds);
    for (const it of items ?? []) {
      const arr = itemsBySource.get(it.source_id) ?? [];
      arr.push({
        id: it.id,
        title: it.title,
        category: it.category,
        domain: it.domain,
        item_type: it.item_type,
        is_archived: it.is_archived,
        pipeline_stage: it.pipeline_stage,
      });
      itemsBySource.set(it.source_id, arr);
    }
  }

  const enriched = Array.from(matches.values()).map(({ source, matched_via }) => ({
    id: source.id,
    name: source.name,
    url: source.url,
    category: source.category,
    base_tier: source.base_tier,
    status: source.status,
    admin_only: source.admin_only,
    processing_paused: source.processing_paused,
    matched_via,
    intelligence_item_count: (itemsBySource.get(source.id) ?? []).length,
    intelligence_items: itemsBySource.get(source.id) ?? [],
    description_snippet: source.description ? source.description.slice(0, 280) : null,
    notes_snippet: source.notes ? source.notes.slice(0, 280) : null,
  }));

  // Split already-paused (Step 1-3 controls) from new candidates.
  const alreadyPaused = enriched.filter((s) => s.processing_paused === true);
  const newCandidates = enriched.filter((s) => s.processing_paused !== true);

  // Sort new candidates by item count desc (blast radius).
  newCandidates.sort((a, b) => b.intelligence_item_count - a.intelligence_item_count);

  const output = {
    run_date: new Date().toISOString(),
    patterns: {
      name_ilike: NAME_PATTERNS,
      name_or_description_vendor_names: NAME_OR_DESCRIPTION_VENDOR_NAMES,
      name_exact: NAME_EXACT_PATTERNS,
      description_commercial_signals: DESCRIPTION_COMMERCIAL_SIGNALS,
    },
    summary: {
      total_matches: enriched.length,
      new_candidates: newCandidates.length,
      already_paused_from_step3: alreadyPaused.length,
      total_items_attributed: enriched.reduce((s, x) => s + x.intelligence_item_count, 0),
      new_candidate_items: newCandidates.reduce((s, x) => s + x.intelligence_item_count, 0),
    },
    new_candidates: newCandidates,
    already_paused_from_step3: alreadyPaused.map((s) => ({ id: s.id, name: s.name, url: s.url, items: s.intelligence_item_count })),
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`[A1.5/Step4] wrote ${OUT}`);
  console.log(`[A1.5/Step4] new candidates: ${newCandidates.length} sources, ${output.summary.new_candidate_items} items attributed`);
  console.log(`[A1.5/Step4] already-paused (Step 3): ${alreadyPaused.length} sources`);
  if (newCandidates.length > 0) {
    console.log("\nNew candidates (ordered by item count, blast radius first):");
    for (const s of newCandidates) {
      const via = s.matched_via.map((m) => `${m.category}:${m.value}`).join(" + ");
      console.log(`  [${s.id.slice(0, 8)}] T${s.base_tier ?? "?"} cat=${s.category ?? "null"} items=${s.intelligence_item_count}  ${s.name}`);
      console.log(`           matched_via: ${via}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
