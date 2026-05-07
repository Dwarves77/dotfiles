// Tier 1 Wave A — EU 2 clean inserts
//
// Inserts two EU regulation rows into intelligence_items:
//   1. eu_clean_trucking_2024_1610 — EU 2024/1610 (HDV CO2 standards)
//   2. eu_ets_directive_2023_959   — EU 2023/959 (ETS Directive amendment)
//
// Pattern: mirrors fsi-app/supabase/seed/W4_4_insert_california_critical_items.mjs.
// Per Jason's auth: stub briefs are acceptable (W4_4 precedent). Real briefs
// queue as follow-up via admin UI /api/agent/run.
//
// Halts:
//   - If either legacy_id already present (premise wrong → surface, exit non-zero)
//   - If no EUR-Lex source row found (would block source_id linkage)
//   - On insert error
//
// Cross-reference scan:
//   After inserts succeed, scans existing intelligence_items.full_brief
//   for textual references to "2024/1610" / "Clean Trucking" / "HDV CO2"
//   and "2023/959" / "ETS Directive". Surfaces candidates only — does NOT
//   create item_cross_references rows.
//
// Usage (from fsi-app/):
//   node scripts/tier1-eu-2-clean-inserts-execute.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, ".."));
process.loadEnvFile(".env.local");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const LOG_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "tier1-eu-2-clean-inserts-execute-log.json"
);

// ─── items ─────────────────────────────────────────────────────────────────

const ITEMS = [
  {
    legacy_id: "eu_clean_trucking_2024_1610",
    title:
      "EU 2024/1610 — CO₂ emission performance standards for new heavy-duty vehicles",
    item_type: "regulation",
    domain: 1,
    priority: "HIGH",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url: "https://eur-lex.europa.eu/eli/reg/2024/1610/oj/eng",
    jurisdiction_iso: ["EU"],
    jurisdictions: ["eu"],
    transport_modes: ["road"],
    tags: [
      "hdv-co2",
      "heavy-duty-vehicles",
      "vehicle-emissions",
      "eu",
      "fleet-electrification",
    ],
    summary:
      "EU regulation amending CO₂ emission performance standards for new heavy-duty vehicles (trucks, buses, coaches and trailers). Sets stepped fleet-wide CO₂ reduction targets of 45% from 2030, 65% from 2035, and 90% from 2040 versus the 2019/2020 baseline, plus a zero-emission target for new urban buses by 2035.",
    why_matters:
      "Directly tightens the supply curve for new diesel HDVs sold in the EU after 2030. Forwarders contracting EU road capacity should expect carrier fleet-renewal economics to shift toward BEV/FCEV/HVO-eligible equipment, ZEV-only urban-bus depots, and OEM CO₂-debt premiums passed through in linehaul rates over the 2030–2040 window.",
    what_is_it:
      "Regulation (EU) 2024/1610 of the European Parliament and of the Council of 14 May 2024 amending Regulation (EU) 2019/1242 as regards strengthening the CO₂ emission performance standards for new heavy-duty vehicles and integrating reporting obligations. Published in the Official Journal of the EU.",
    full_brief: "",
    operational_impact:
      "Road procurement: expect higher TCO on diesel-only legacy fleets after 2030 as OEMs front-load ZEV mix to hit 45% target. Tender questions on carrier fleet-mix percentages, charging-depot readiness, and HVO/HDRD compatibility will become standard. Urban delivery in EU cities will be ZEV-bus-adjacent (depot infrastructure pulls forward freight ZEV charging too).",
    key_data: [
      "Fleet-wide CO₂ reduction targets (vs 2019/2020 baseline): 45% from 2030, 65% from 2035, 90% from 2040",
      "New urban buses: 100% zero-emission from 2035 (interim target 90% from 2030)",
      "Scope: trucks, buses, coaches, trailers; expanded vs Reg (EU) 2019/1242",
      "Penalty: excess emissions premium per g CO₂/tkm above target",
      "Reporting: integrated reporting obligations on manufacturers and Member States",
      "Review clause: 2027 review of feasibility, including small-volume manufacturer derogations",
    ],
    open_questions: [
      "Final OEM-by-OEM ZEV product roadmaps for tractor units (long-haul) versus regional rigid trucks",
      "Charging-corridor readiness on TEN-T core network by 2030 milestone",
      "Treatment of HVO/renewable-diesel substitution in compliance accounting",
    ],
    reasoning:
      "HIGH — binding fleet-wide CO₂ standards on new HDV sales reshape EU road procurement economics over the 2030–2040 window. Not CRITICAL because near-term (≤2026) operational impact is bounded; the bite is post-2030.",
    verticals: [],
  },
  {
    legacy_id: "eu_ets_directive_2023_959",
    title: "EU 2023/959 — Directive amending the EU Emissions Trading System",
    item_type: "directive",
    domain: 1,
    priority: "CRITICAL",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url: "https://eur-lex.europa.eu/eli/dir/2023/959/oj/eng",
    jurisdiction_iso: ["EU"],
    jurisdictions: ["eu"],
    transport_modes: ["ocean", "road", "air"],
    tags: [
      "eu-ets",
      "emissions-trading",
      "carbon-pricing",
      "eu",
      "maritime",
      "aviation",
    ],
    summary:
      "Directive (EU) 2023/959 amends Directive 2003/87/EC to (a) extend the EU ETS to maritime transport from 2024 with phased surrender (40%/70%/100% across 2024–2026), (b) tighten the cap and rebasing for stationary installations and aviation, (c) phase out free allocation to aviation by 2026, and (d) establish ETS2 for buildings, road transport and small industry from 2027.",
    why_matters:
      "Single most consequential EU climate instrument for forwarders. ETS surcharges on ocean carriers, full-auction aviation allowances, and the new ETS2 layer on road fuels combine to push carbon costs into every EU-touching freight lane. Customer-facing 'EU ETS included?' language must be accurate; double-billing or under-recovery in carrier ETS pass-through clauses is a live risk.",
    what_is_it:
      "Directive (EU) 2023/959 of the European Parliament and of the Council of 10 May 2023 amending Directive 2003/87/EC establishing a system for greenhouse gas emission allowance trading within the Union, and Decision (EU) 2015/1814. The legal foundation for EU ETS scope expansion to maritime, ETS2 (buildings + road transport from 2027), and aviation auction-only transition.",
    full_brief: "",
    operational_impact:
      "Ocean: ETS surcharge governance for EU-touching voyages, with phased 40%/70%/100% surrender ramp through 2026 plus N₂O/CH₄ scope addition in 2026. Air: aviation allowances move to 100% auctioning by 2026, accelerating SAF substitution economics. Road: ETS2 on transport fuels from 2027 will pass through to diesel/HVO pump prices on EU road lanes. Customs/Sales: standardised customer FAQs on EU carbon costs across all three modes.",
    key_data: [
      "Maritime ETS phase-in: 40% of 2024 emissions, 70% of 2025, 100% from 2026",
      "Maritime scope: CO₂ from 2024; CH₄ and N₂O added from 2026",
      "Aviation: free allocation phased out by 2026; 100% auctioning thereafter",
      "ETS2 (buildings, road transport, small industry): MRV from 2025, full operation from 2027",
      "Linear reduction factor: increased to drive faster cap reduction",
      "Market Stability Reserve: extended and reinforced",
    ],
    open_questions: [
      "Carrier-by-carrier ETS surcharge methodologies and how forwarder pass-through clauses index to EUA price",
      "ETS2 retail-level pass-through path on road diesel and the timing of carrier surcharge adjustments",
      "Treatment of non-EU port voyages (50% scope rule) under MRV reporting",
    ],
    reasoning:
      "CRITICAL — binding multi-modal carbon pricing instrument with active 2024–2027 phase-in across ocean, air and road. Defines the cost-pass-through environment for every EU-touching freight lane.",
    verticals: [],
  },
];

// ─── helpers ───────────────────────────────────────────────────────────────

async function findEurLexSource() {
  // Strategy: prefer the most-specific EUR-Lex source row in the registry.
  // EUR-Lex is the primary EU OJ host for both regulations. We accept any
  // row whose URL or name references eur-lex.europa.eu.
  const { data, error } = await supabase
    .from("sources")
    .select("id, name, url, tier")
    .or(
      "url.ilike.%eur-lex.europa.eu%,name.ilike.%EUR-Lex%,name.ilike.%Official Journal of the European Union%"
    );

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) return { source: null };

  // Pick the row whose url is most "eur-lex.europa.eu" canonical (shortest
  // path is usually the registry root). If multiple, prefer tier=1.
  const eurLexRows = data.filter(
    (s) => typeof s.url === "string" && s.url.toLowerCase().includes("eur-lex.europa.eu")
  );
  const candidates = eurLexRows.length > 0 ? eurLexRows : data;
  const tier1 = candidates.find((s) => s.tier === 1);
  if (tier1) return { source: tier1, all_candidates: candidates };
  return { source: candidates[0], all_candidates: candidates };
}

async function checkExisting(legacyId) {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id, title")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { existing: data };
}

async function scanCrossReferences(needles, excludeLegacyIds) {
  // Scan existing intelligence_items.full_brief + summary + why_matters
  // for the given needles. Return candidate matches with brief excerpts.
  const candidates = [];
  for (const needle of needles) {
    // ilike on full_brief is the most signal-rich field
    const { data, error } = await supabase
      .from("intelligence_items")
      .select("id, legacy_id, title, full_brief, summary, why_matters")
      .or(
        `full_brief.ilike.%${needle}%,summary.ilike.%${needle}%,why_matters.ilike.%${needle}%`
      );
    if (error) {
      candidates.push({ needle, error: error.message });
      continue;
    }
    for (const row of data || []) {
      if (excludeLegacyIds.includes(row.legacy_id)) continue;
      // Extract a short context excerpt around the first occurrence.
      const haystack = `${row.full_brief || ""}\n${row.summary || ""}\n${row.why_matters || ""}`;
      const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
      const excerpt =
        idx >= 0
          ? haystack
              .slice(Math.max(0, idx - 60), Math.min(haystack.length, idx + needle.length + 100))
              .replace(/\s+/g, " ")
              .trim()
          : "";
      candidates.push({
        needle,
        legacy_id: row.legacy_id,
        title: row.title,
        excerpt,
      });
    }
  }
  return candidates;
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("Tier 1 EU 2 clean inserts");
  console.log("─".repeat(60));

  const log = {
    generated_at: new Date().toISOString(),
    candidate_count: ITEMS.length,
    inserted: 0,
    halted: false,
    errors: 0,
    decisions: [],
    cross_reference_scan: {},
    follow_up_todos: [],
  };

  // Halt-check: legacy_id pre-existence (premise verification)
  for (const item of ITEMS) {
    const exists = await checkExisting(item.legacy_id);
    if (exists.error) {
      console.error(`  [err] ${item.legacy_id} lookup: ${exists.error}`);
      log.errors += 1;
      log.halted = true;
      log.halt_reason = `pre-check lookup failed for ${item.legacy_id}: ${exists.error}`;
      writeLog(log);
      process.exit(1);
    }
    if (exists.existing) {
      console.error(
        `  [HALT] ${item.legacy_id} already present (id=${exists.existing.id}). Premise wrong.`
      );
      log.halted = true;
      log.halt_reason = `legacy_id ${item.legacy_id} already exists at id=${exists.existing.id}`;
      writeLog(log);
      process.exit(1);
    }
    console.log(`  [pre-ok] ${item.legacy_id} not present, ok to insert`);
  }

  // Halt-check: EUR-Lex source row existence
  const sourceLookup = await findEurLexSource();
  if (sourceLookup.error) {
    console.error(`  [err] EUR-Lex source lookup: ${sourceLookup.error}`);
    log.errors += 1;
    log.halted = true;
    log.halt_reason = `EUR-Lex source lookup failed: ${sourceLookup.error}`;
    writeLog(log);
    process.exit(1);
  }
  if (!sourceLookup.source) {
    console.error("  [HALT] No EUR-Lex source row found in sources registry.");
    log.halted = true;
    log.halt_reason = "no EUR-Lex source row in registry — would block source_id linkage";
    writeLog(log);
    process.exit(1);
  }
  console.log(
    `  [src-ok] EUR-Lex source: id=${sourceLookup.source.id}  name="${sourceLookup.source.name}"  url="${sourceLookup.source.url}"  tier=${sourceLookup.source.tier ?? "?"}`
  );
  if (sourceLookup.all_candidates && sourceLookup.all_candidates.length > 1) {
    console.log(
      `  [src-info] ${sourceLookup.all_candidates.length} EUR-Lex-related rows present; selected the tier-1 (or first) row above`
    );
  }
  log.linked_source = {
    id: sourceLookup.source.id,
    name: sourceLookup.source.name,
    url: sourceLookup.source.url,
    tier: sourceLookup.source.tier ?? null,
    all_eurlex_candidates_count: (sourceLookup.all_candidates || []).length,
  };

  // Per-item insert + per-step verification
  for (const item of ITEMS) {
    const decision = { legacy_id: item.legacy_id, title: item.title };

    const insertPayload = {
      legacy_id: item.legacy_id,
      title: item.title,
      item_type: item.item_type,
      domain: item.domain,
      priority: item.priority,
      severity: item.severity,
      status: item.status,
      confidence: item.confidence,
      source_url: item.source_url,
      source_id: sourceLookup.source.id,
      jurisdiction_iso: item.jurisdiction_iso,
      jurisdictions: item.jurisdictions,
      transport_modes: item.transport_modes,
      tags: item.tags,
      summary: item.summary,
      why_matters: item.why_matters,
      what_is_it: item.what_is_it,
      full_brief: item.full_brief,
      operational_impact: item.operational_impact,
      key_data: item.key_data,
      open_questions: item.open_questions,
      reasoning: item.reasoning,
      verticals: item.verticals,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("intelligence_items")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertErr || !inserted?.id) {
      decision.outcome = "insert_failed";
      decision.error = insertErr?.message || "no id returned";
      log.errors += 1;
      log.decisions.push(decision);
      console.error(`  [insert-fail] ${item.legacy_id}: ${decision.error}`);
      continue;
    }

    // Per-step verification: read-back the inserted row and confirm
    // legacy_id + source_id + priority + jurisdiction + title are set.
    const { data: verify, error: verifyErr } = await supabase
      .from("intelligence_items")
      .select(
        "id, legacy_id, title, priority, item_type, domain, source_id, source_url, jurisdiction_iso, transport_modes"
      )
      .eq("id", inserted.id)
      .maybeSingle();

    if (verifyErr || !verify) {
      decision.outcome = "verify_failed";
      decision.new_id = inserted.id;
      decision.error = verifyErr?.message || "verify returned no row";
      log.errors += 1;
      log.decisions.push(decision);
      console.error(`  [verify-fail] ${item.legacy_id}: ${decision.error}`);
      continue;
    }

    if (
      verify.legacy_id !== item.legacy_id ||
      verify.priority !== item.priority ||
      verify.source_id !== sourceLookup.source.id ||
      verify.title !== item.title
    ) {
      decision.outcome = "verify_mismatch";
      decision.new_id = inserted.id;
      decision.read_back = verify;
      log.errors += 1;
      log.decisions.push(decision);
      console.error(`  [verify-mismatch] ${item.legacy_id}: read-back differs from payload`);
      continue;
    }

    decision.outcome = "inserted";
    decision.new_id = inserted.id;
    decision.linked_source_id = sourceLookup.source.id;
    decision.brief_status = "stub"; // hand-written summary/why_matters/key_data; full_brief left empty for agent regen
    log.inserted += 1;
    log.decisions.push(decision);

    log.follow_up_todos.push({
      action: "regenerate_via_admin_ui",
      reason:
        "Hand-written stub. Run /api/agent/run on this item via admin UI to write a polished agent brief into full_brief.",
      item_id: inserted.id,
      legacy_id: item.legacy_id,
      title: item.title,
      source_url: item.source_url,
    });

    console.log(
      `  [ok]   ${item.legacy_id} → ${inserted.id}  (priority=${verify.priority}, source_id=${verify.source_id})`
    );
  }

  // Cross-reference scan (post-insert, surface-only)
  const insertedLegacyIds = ITEMS.map((i) => i.legacy_id);
  console.log("─".repeat(60));
  console.log("Cross-reference scan (surface-only):");

  const trucking_candidates = await scanCrossReferences(
    ["2024/1610", "Clean Trucking", "HDV CO2", "HDV CO₂"],
    insertedLegacyIds
  );
  log.cross_reference_scan.eu_clean_trucking_2024_1610 = trucking_candidates;
  console.log(
    `  Clean Trucking (2024/1610) candidates: ${trucking_candidates.filter((c) => !c.error).length}`
  );
  for (const c of trucking_candidates) {
    if (c.error) {
      console.warn(`    [err needle="${c.needle}"]: ${c.error}`);
      continue;
    }
    console.log(`    - ${c.legacy_id} (matched "${c.needle}")`);
    if (c.excerpt) console.log(`        excerpt: ${c.excerpt.slice(0, 140)}`);
  }

  const ets_candidates = await scanCrossReferences(
    ["2023/959", "ETS Directive amendment", "ETS scope expansion"],
    insertedLegacyIds
  );
  log.cross_reference_scan.eu_ets_directive_2023_959 = ets_candidates;
  console.log(
    `  ETS Directive (2023/959) candidates: ${ets_candidates.filter((c) => !c.error).length}`
  );
  for (const c of ets_candidates) {
    if (c.error) {
      console.warn(`    [err needle="${c.needle}"]: ${c.error}`);
      continue;
    }
    console.log(`    - ${c.legacy_id} (matched "${c.needle}")`);
    if (c.excerpt) console.log(`        excerpt: ${c.excerpt.slice(0, 140)}`);
  }

  log.elapsed_ms = Date.now() - t0;
  writeLog(log);

  console.log("─".repeat(60));
  console.log(`Inserted:                        ${log.inserted}`);
  console.log(`Errors:                          ${log.errors}`);
  console.log(`Follow-up TODOs (regen):         ${log.follow_up_todos.length}`);
  console.log(`Elapsed:                         ${log.elapsed_ms} ms`);
  console.log(`Log:                             ${LOG_PATH}`);
  console.log("─".repeat(60));

  if (log.errors > 0) process.exit(1);
}

function writeLog(log) {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
