/**
 * pr-a2-investigate.mjs — read-only investigation for PR-A2.
 *
 * Tier 1 US states batch (NY + WA + TX). Cloned from
 * pr-a1-investigate.mjs and adapted for the next three states by
 * Dietl/Rockit freight relevance.
 *
 * Captures per state (NY, WA, TX):
 *   1. Schema confirmation (jurisdictions / jurisdiction_iso shape;
 *      already known from PR-A1, re-sample to confirm).
 *   2. Existing source rows for state DEC + state legislature URLs.
 *   3. Items already tagged ["US-XX"] (post-PR-A1 baseline includes
 *      NYC LL97 retag for US-NY).
 *   4. Retag candidates: items mentioning state-specific content
 *      currently tagged ["US"] (or jurisdictions like ["us"]) but
 *      NOT yet sub-national tagged.
 *   5. source_id linkage state (which retag candidates lack source_id
 *      and thus need relinking after state source inserts).
 *   6. Cross-state legacy_id collision check.
 *
 * NO WRITES. Output is JSON to stdout AND
 * docs/pr-a2-investigation-2026-05-07.json.
 */

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

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

const STATES = [
  {
    code: "NY",
    iso: "US-NY",
    name: "New York",
    sourceUrlPatterns: [
      "%dec.ny.gov%",
      "%nysenate.gov%",
      "%assembly.state.ny.us%",
      "%nyserda.ny.gov%",
    ],
    contentPatterns: [
      "title.ilike.%New York%",
      "title.ilike.%NY DEC%",
      "title.ilike.%NYSERDA%",
      "summary.ilike.%New York State%",
    ],
    // Items already retagged in PR-A1 (skip from candidate scan)
    alreadyRetagged: [
      "nyc-local-law-97-building-carbon-emissions-caps",
    ],
  },
  {
    code: "WA",
    iso: "US-WA",
    name: "Washington",
    sourceUrlPatterns: [
      "%ecology.wa.gov%",
      "%leg.wa.gov%",
      "%wsdot.wa.gov%",
    ],
    contentPatterns: [
      "title.ilike.%Washington State%",
      "title.ilike.%WA Ecology%",
      "title.ilike.%Seattle%",
      "title.ilike.%Tacoma%",
      "title.ilike.%Puget Sound%",
      "summary.ilike.%Washington State%",
      "summary.ilike.%WA Ecology%",
    ],
    alreadyRetagged: [],
  },
  {
    code: "TX",
    iso: "US-TX",
    name: "Texas",
    sourceUrlPatterns: [
      "%tceq.texas.gov%",
      "%capitol.texas.gov%",
      "%puc.texas.gov%",
    ],
    contentPatterns: [
      "title.ilike.%Texas%",
      "title.ilike.%TCEQ%",
      "title.ilike.%Houston%",
      "title.ilike.%Galveston%",
      "title.ilike.%Gulf Coast%",
      "summary.ilike.%Texas%",
      "summary.ilike.%TCEQ%",
    ],
    alreadyRetagged: [],
  },
];

const report = {
  generatedAt: new Date().toISOString(),
  step1_schema: {},
  step2_per_state: {},
  step3_collision_check: {},
  step4_summary: {},
};

// ─── Step 1: Schema confirmation ───────────────────────────────────────
{
  const { data: jurisSample, error: e1 } = await supabase
    .from("intelligence_items")
    .select("jurisdictions, jurisdiction_iso")
    .limit(100);
  if (e1) {
    report.step1_schema.error = e1.message;
  } else {
    const allLegacy = new Set();
    const allIso = new Set();
    for (const row of jurisSample) {
      for (const j of row.jurisdictions ?? []) allLegacy.add(j);
      for (const j of row.jurisdiction_iso ?? []) allIso.add(j);
    }
    report.step1_schema = {
      legacy_jurisdictions_distinct_sample: Array.from(allLegacy).sort(),
      jurisdiction_iso_distinct_sample: Array.from(allIso).sort(),
      schema_unbounded: true,
      note:
        "Both columns TEXT[]; sub-national tagging belongs in jurisdiction_iso. Confirms PR-A1 schema baseline still holds.",
    };
  }
}

// ─── Step 2: Per-state investigation ───────────────────────────────────
for (const state of STATES) {
  const out = {
    code: state.code,
    iso: state.iso,
    name: state.name,
  };

  // 2a. Existing source rows
  {
    const orFilter = state.sourceUrlPatterns
      .map((p) => `url.ilike.${p}`)
      .join(",");
    const { data: existing, error } = await supabase
      .from("sources")
      .select(
        "id, name, url, tier, status, jurisdictions, jurisdiction_iso, admin_only"
      )
      .or(orFilter);
    if (error) {
      out.existing_sources_error = error.message;
    } else {
      out.existing_sources = existing ?? [];
      out.existing_sources_count = existing?.length ?? 0;
    }
  }

  // 2b. Items already tagged with state ISO
  {
    const { data: already, error } = await supabase
      .from("intelligence_items")
      .select("legacy_id, title, jurisdictions, jurisdiction_iso, source_id, priority")
      .contains("jurisdiction_iso", [state.iso]);
    if (error) {
      out.already_tagged_error = error.message;
    } else {
      out.already_tagged = (already ?? []).map((r) => ({
        legacy_id: r.legacy_id,
        title: r.title,
        jurisdictions: r.jurisdictions,
        jurisdiction_iso: r.jurisdiction_iso,
        source_id: r.source_id,
        priority: r.priority,
      }));
      out.already_tagged_count = out.already_tagged.length;
    }
  }

  // 2c. Retag candidates: state content currently tagged ["US"] only
  {
    const orFilter = state.contentPatterns.join(",");
    const { data: candidates, error } = await supabase
      .from("intelligence_items")
      .select(
        "legacy_id, title, summary, jurisdictions, jurisdiction_iso, source_id, priority, item_type, is_archived"
      )
      .or(orFilter)
      .eq("is_archived", false);
    if (error) {
      out.candidate_scan_error = error.message;
    } else {
      // Filter: must currently be tagged ["US"] (no sub-national) AND
      // not already in the alreadyRetagged list.
      const filtered = (candidates ?? [])
        .filter((r) => !state.alreadyRetagged.includes(r.legacy_id))
        .filter((r) => {
          const iso = Array.isArray(r.jurisdiction_iso) ? r.jurisdiction_iso : [];
          // Already sub-national? skip.
          if (iso.includes(state.iso)) return false;
          // Has sub-national from another state already? skip (cross-state).
          const hasOtherSub = iso.some((j) => j.startsWith("US-") && j !== state.iso);
          if (hasOtherSub) return false;
          return true;
        })
        .map((r) => ({
          legacy_id: r.legacy_id,
          title: r.title,
          summary_excerpt: (r.summary ?? "").slice(0, 200),
          jurisdictions: r.jurisdictions,
          jurisdiction_iso: r.jurisdiction_iso,
          source_id: r.source_id,
          priority: r.priority,
          item_type: r.item_type,
        }));
      out.retag_candidates = filtered;
      out.retag_candidate_count = filtered.length;
      out.halt_threshold_exceeded = filtered.length > 30;
      out.candidates_lacking_source_id = filtered.filter((r) => !r.source_id).length;
    }
  }

  report.step2_per_state[state.code] = out;
}

// ─── Step 3: Cross-state legacy_id collision check ─────────────────────
// Confirm no candidate has a legacy_id starting with multiple state
// prefixes that would conflict across NY/WA/TX retags.
{
  const allCandidates = [];
  for (const state of STATES) {
    const stateOut = report.step2_per_state[state.code];
    for (const c of stateOut.retag_candidates ?? []) {
      allCandidates.push({ legacy_id: c.legacy_id, state: state.code });
    }
  }
  const idCounts = {};
  for (const { legacy_id, state } of allCandidates) {
    if (!idCounts[legacy_id]) idCounts[legacy_id] = new Set();
    idCounts[legacy_id].add(state);
  }
  const collisions = Object.entries(idCounts)
    .filter(([, states]) => states.size > 1)
    .map(([id, states]) => ({ legacy_id: id, states: [...states] }));
  report.step3_collision_check = {
    total_candidates_across_states: allCandidates.length,
    collisions,
    collision_count: collisions.length,
  };
}

// ─── Step 4: Decision summary ──────────────────────────────────────────
{
  const summary = {
    halts_triggered: [],
    proceed_decisions: {},
    new_sources_to_insert: 0,
  };
  for (const state of STATES) {
    const stateOut = report.step2_per_state[state.code];
    if (stateOut.halt_threshold_exceeded) {
      summary.halts_triggered.push(
        `${state.code}: ${stateOut.retag_candidate_count} candidates (>30, split required)`
      );
    }
    summary.proceed_decisions[state.code] = {
      retag_count: stateOut.retag_candidate_count ?? 0,
      already_tagged_count: stateOut.already_tagged_count ?? 0,
      existing_sources_count: stateOut.existing_sources_count ?? 0,
      // Each state expects 2 new sources (state DEC + state legislature)
      // unless existing rows already cover them.
      new_sources_needed: Math.max(0, 2 - (stateOut.existing_sources_count ?? 0)),
    };
    summary.new_sources_to_insert += summary.proceed_decisions[state.code].new_sources_needed;
  }
  if (report.step3_collision_check.collision_count > 0) {
    summary.halts_triggered.push(
      `cross-state legacy_id collisions: ${report.step3_collision_check.collision_count}`
    );
  }
  if (summary.new_sources_to_insert > 6) {
    summary.halts_triggered.push(
      `new_sources_to_insert=${summary.new_sources_to_insert} > 6 (broader scope than dispatch)`
    );
  }
  summary.clear_to_proceed = summary.halts_triggered.length === 0;
  report.step4_summary = summary;
}

// ─── Output ────────────────────────────────────────────────────────────
const outPath = resolve("..", "docs", "pr-a2-investigation-2026-05-07.json");
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`\n[written] ${outPath}`);
