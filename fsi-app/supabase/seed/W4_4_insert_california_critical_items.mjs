// W4.4 — Insert SB 253, SB 261, AB 1305, Advanced Clean Fleets
//
// Manually insert four critical California regulations as new
// `intelligence_items`, regardless of whether they were in the W1.B orphan
// set or already exist. The intent is signal recovery: these four laws
// dominate Scope 1/2/3 reporting expectations for any US shipper doing
// business in California, and they affect every freight mode (road,
// ocean drayage, air, rail) via supplier emissions reporting.
//
// Items
// ─────
//   1. SB 253  — Climate Corporate Data Accountability Act
//                (CA Health & Safety Code §38532; SB 253 of 2023, ch. 382)
//   2. SB 261  — Climate-Related Financial Risk Act
//                (CA Health & Safety Code §38533; SB 261 of 2023, ch. 383)
//   3. AB 1305 — Voluntary Carbon Market Disclosures Act
//                (CA Health & Safety Code §44475–44475.2; AB 1305 of 2023, ch. 743)
//   4. CARB Advanced Clean Fleets — Cal. Code Regs. tit. 13 §§ 2015–2015.6
//
// Source linkage
// ──────────────
// We try, in order, to attach `source_id` to a real `sources` row whose URL
// is on `arb.ca.gov` (for Advanced Clean Fleets) or on
// `leginfo.legislature.ca.gov` (for the three statutes). If no matching
// source exists yet, `source_id` is left NULL and the integrity_flag
// system (mig 035) will surface the gap. The script continues — gap
// handling is not a blocker.
//
// Idempotency
// ───────────
// `legacy_id` is UNIQUE on intelligence_items. Each item gets a stable
// legacy_id (`w4_ca_sb253`, `w4_ca_sb261`, `w4_ca_ab1305`,
// `w4_ca_acf`). Re-running the script after a successful first run
// SKIPS rows where the legacy_id already exists.
//
// What the script does NOT do
// ───────────────────────────
// - It does NOT call /api/agent/run (admin auth is required and unavailable
//   from a CLI script). Instead it logs a TODO recommending each new item
//   id be regenerated via the admin UI. The brief stub written here is
//   factual and source-cited but is not the polished agent output.
// - It does NOT touch sources, provisional_sources, source_verifications,
//   or any W3-region table.
//
// Usage (from fsi-app/):
//   node supabase/seed/W4_4_insert_california_critical_items.mjs

import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

// ─── paths + env ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, "..", ".."));
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
  "..",
  "docs",
  "W4-4-california-critical-log.json"
);

// ─── canonical leginfo / arb URLs for each item ────────────────────────────
// leginfo URLs follow the pattern:
//   https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=<session>0<houseBill>
// We use the readable bill summary URL (faces/billTextClient + faces/billNavClient).
//
// Advanced Clean Fleets is a CARB regulation, not a statute, so we link to
// arb.ca.gov directly.

const ITEMS = [
  {
    legacy_id: "w4_ca_sb253",
    title: "California SB 253 — Climate Corporate Data Accountability Act",
    item_type: "regulation",
    domain: 1, // Carbon pricing & climate disclosure
    priority: "CRITICAL",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url:
      "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB253",
    jurisdiction_iso: ["US-CA"],
    jurisdictions: ["us"],
    transport_modes: ["road", "ocean", "air", "rail"],
    tags: ["scope-3", "ghg-reporting", "california", "sec-disclosure"],
    summary:
      "Requires US public AND private companies with >$1B in annual revenue doing business in California to publicly disclose their Scope 1, 2, and 3 GHG emissions, with assurance, on an annual basis.",
    why_matters:
      "Pulls every large California-active shipper into Scope 3 reporting — and Scope 3 includes upstream and downstream transportation. Forwarders supplying these companies will face structured emissions data requests aligned to ISO 14083 / GLEC, regardless of whether the forwarder itself is in scope.",
    what_is_it:
      "California Health & Safety Code §38532 (added by SB 253, 2023 ch. 382). Directs CARB to adopt implementing regulations and a reporting platform. Scope 1+2 disclosures begin in 2026 (covering FY 2025); Scope 3 disclosures phase in starting 2027 (covering FY 2026).",
    full_brief: "",
    operational_impact:
      "Shipper customers will issue carbon-data requests to forwarders covering shipment-level emissions for road, ocean, air, and rail legs. Tender packages will require ISO 14083 / GLEC-aligned data and assurance-ready audit trails. Forwarders that cannot provide carrier-attributed shipment emissions will lose preferred-supplier eligibility.",
    key_data: [
      "Threshold: $1B in total annual revenue, doing business in California",
      "Scope 1+2 disclosure: starting 2026 (FY 2025 data)",
      "Scope 3 disclosure: starting 2027 (FY 2026 data)",
      "Assurance required: limited assurance for Scope 1+2; reasonable assurance phasing in",
      "Implementing agency: California Air Resources Board (CARB)",
    ],
    open_questions: [
      "Will CARB final implementing regs align reporting boundaries with ISO 14083?",
      "How will forwarder-provided shipment-level emissions be treated for Scope 3 Category 4 / Category 9?",
    ],
    reasoning:
      "Pulled into Caro's Ledge as CRITICAL because it is the single largest Scope 3 reporting trigger affecting US-CA freight in 2026.",
    verticals: [],
  },
  {
    legacy_id: "w4_ca_sb261",
    title: "California SB 261 — Climate-Related Financial Risk Act",
    item_type: "regulation",
    domain: 1,
    priority: "CRITICAL",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url:
      "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240SB261",
    jurisdiction_iso: ["US-CA"],
    jurisdictions: ["us"],
    transport_modes: ["road", "ocean", "air", "rail"],
    tags: ["climate-risk", "tcfd", "california", "biennial-disclosure"],
    summary:
      "Requires US companies with >$500M in annual revenue doing business in California to publish biennial climate-related financial risk reports aligned with TCFD (now ISSB IFRS S2) frameworks, beginning January 1, 2026.",
    why_matters:
      "Lowers the disclosure-trigger threshold below SB 253's $1B mark, capturing a wider band of mid-sized shippers and BCO customers. Brings physical and transition climate risk into the standard tender package — forwarders should expect questions about port-disruption exposure, fleet electrification readiness, and SAF availability.",
    what_is_it:
      "California Health & Safety Code §38533 (added by SB 261, 2023 ch. 383). Modeled on the TCFD recommendations and now interoperable with ISSB IFRS S2 climate disclosure standard. Reports must be public and posted to the company's website.",
    full_brief: "",
    operational_impact:
      "Customer due-diligence requests will broaden to include forwarder climate transition plans, scenario analysis, and physical-risk maps for major lanes. Forwarders should align internal climate scenario work to ISSB / IFRS S2 to make customer reporting reusable across SB 261, CSRD, and SEC climate-rule successors.",
    key_data: [
      "Threshold: $500M in total annual revenue, doing business in California",
      "First report due: on or before January 1, 2026",
      "Cadence: biennial",
      "Framework: TCFD-aligned (interoperable with ISSB IFRS S2)",
      "Implementing agency: California Air Resources Board (CARB)",
    ],
    open_questions: [
      "Will CARB issue a model template, or accept any TCFD-aligned report?",
      "Treatment of subsidiaries: parent-level disclosure or per-entity?",
    ],
    reasoning:
      "CRITICAL because the $500M threshold sweeps in many mid-cap shippers that do not yet have published climate-risk disclosure, generating immediate forwarder data-pull-through.",
    verticals: [],
  },
  {
    legacy_id: "w4_ca_ab1305",
    title: "California AB 1305 — Voluntary Carbon Market Disclosures Act",
    item_type: "regulation",
    domain: 1,
    priority: "CRITICAL",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url:
      "https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB1305",
    jurisdiction_iso: ["US-CA"],
    jurisdictions: ["us"],
    transport_modes: ["road", "ocean", "air", "rail"],
    tags: [
      "voluntary-carbon-market",
      "net-zero-claims",
      "greenwashing",
      "california",
    ],
    summary:
      "Requires entities operating in California that purchase or use voluntary carbon offsets, OR that make net-zero / carbon-neutral / significant-emissions-reduction claims, to publicly disclose detailed information about the offsets and the basis for the claim.",
    why_matters:
      "Directly hits any forwarder marketing 'carbon-neutral shipping', 'net-zero ocean lane', or similar product. Disclosures must include the offset project, registry, vintage, third-party verification, and the reasoning behind any net-zero claim. False or misleading claims create attorney-fee-shifting liability.",
    what_is_it:
      "California Health & Safety Code §§44475–44475.2 (added by AB 1305, 2023 ch. 743). Creates an affirmative disclosure obligation tied to the entity's website, refreshed annually, separate from any underlying registry's disclosure rules.",
    full_brief: "",
    operational_impact:
      "Audit any 'carbon-neutral' or 'net-zero' marketing copy used in CA-touching tenders or invoices. If the forwarder retires offsets on behalf of a customer, both parties may carry disclosure obligations. Where claims rely on book-and-claim SAF, confirm registry disclosures meet the §44475.1 information-content tests.",
    key_data: [
      "Trigger: making offset purchases OR net-zero / carbon-neutral / significant-reduction claims in California",
      "Disclosure location: on the entity's website",
      "Disclosure refresh: annual",
      "Required content: project name, registry, project type, vintage, verification body, retirement details",
      "Effective: January 1, 2024 (with enforcement discretion through early 2024)",
    ],
    open_questions: [
      "Treatment of book-and-claim SAF retirements made through carrier marketing programs",
      "Liability allocation between forwarder and shipper when 'carbon-neutral' is claimed jointly",
    ],
    reasoning:
      "CRITICAL because it is the first US sub-national disclosure law that bites carbon-neutral freight marketing directly. Affects every forwarder that prices a 'green' product into a CA-touching lane.",
    verticals: [],
  },
  {
    legacy_id: "w4_ca_acf",
    title: "California Advanced Clean Fleets Rule (CARB)",
    item_type: "regulation",
    domain: 2, // Vehicle / fuel mandates
    priority: "CRITICAL",
    severity: null,
    status: "in_force",
    confidence: "confirmed",
    source_url:
      "https://ww2.arb.ca.gov/our-work/programs/advanced-clean-fleets",
    jurisdiction_iso: ["US-CA"],
    jurisdictions: ["us"],
    transport_modes: ["road"],
    tags: [
      "zero-emission-vehicles",
      "drayage",
      "high-priority-fleets",
      "california",
      "carb",
    ],
    summary:
      "Requires high-priority fleets, federal-government fleets, drayage trucks, last-mile delivery operators, and state/local public agency fleets in California to transition to zero-emission vehicles on a phased schedule beginning in 2024.",
    why_matters:
      "ACF is the most aggressive subnational fleet-electrification rule in the world. It hits drayage, regional linehaul, and last-mile direct. Forwarders contracting CA drayage capacity face capacity-tightening, surcharge changes, and equipment redeployment in 2024–2030. Out-of-state fleets registered in the CARB drayage truck registry are equally subject.",
    what_is_it:
      "California Code of Regulations, Title 13 §§2015–2015.6 (CARB). Adopted April 2023, in force 2024. Combines (a) a phased 100%-ZEV purchase mandate for high-priority fleets, (b) an end-by-2035 100%-ZEV requirement for new drayage truck registrations, (c) state/local government fleet purchase mandates, and (d) reporting obligations.",
    full_brief: "",
    operational_impact:
      "Drayage capacity in San Pedro Bay (LA/Long Beach) and Oakland will tighten as legacy diesel trucks are aged out. Expect new ZEV surcharges, charging-window scheduling constraints, and shifts in turn-time economics. Forwarders should map their CA drayage carrier base to the CARB drayage truck registry and request each carrier's ACF compliance plan.",
    key_data: [
      "High-priority fleet definition: ≥50 trucks OR ≥$50M annual revenue OR ≥1,000 vehicles total",
      "Drayage trucks: all newly registered drayage trucks must be ZEV starting 2024; legacy diesel drayage trucks must exit by end of 2035",
      "State/local government fleets: 50% ZEV purchase from 2024, 100% from 2027",
      "Federal fleets and out-of-state high-priority fleets registering trucks for use in CA: in scope",
      "Implementing agency: California Air Resources Board (CARB)",
    ],
    open_questions: [
      "Status of ongoing federal preemption / waiver challenges affecting enforcement",
      "Charging-infrastructure readiness for high-volume drayage corridors (San Pedro, Oakland)",
    ],
    reasoning:
      "CRITICAL — most aggressive freight-fleet electrification rule globally; directly tightens drayage capacity at the largest US container gateway.",
    verticals: [],
  },
];

// ─── helpers ───────────────────────────────────────────────────────────────

async function findSourceForItem(item) {
  // Order:
  //   - For ACF: prefer arb.ca.gov source
  //   - For statutes: prefer leginfo.legislature.ca.gov source
  //   - Tolerate variations ("California Air Resources Board (CARB)",
  //     "leginfo", "California Legislature", etc.)
  const isAcf = item.legacy_id === "w4_ca_acf";
  const orFilter = isAcf
    ? "url.ilike.%arb.ca.gov%,name.ilike.%CARB%,name.ilike.%California Air Resources%"
    : "url.ilike.%leginfo.legislature.ca.gov%,url.ilike.%leginfo.ca.gov%,name.ilike.%California Legislative Information%,name.ilike.%leginfo%";

  const { data, error } = await supabase
    .from("sources")
    .select("id, name, url")
    .or(orFilter);

  if (error) {
    return { error: error.message };
  }
  if (!data || data.length === 0) return { source: null };
  // Prefer the row whose URL most closely matches the expected host.
  const expectHost = isAcf ? "arb.ca.gov" : "leginfo.legislature.ca.gov";
  const preferred = data.find(
    (s) => typeof s.url === "string" && s.url.toLowerCase().includes(expectHost)
  );
  return { source: preferred || data[0] };
}

async function checkExisting(legacyId) {
  const { data, error } = await supabase
    .from("intelligence_items")
    .select("id, legacy_id")
    .eq("legacy_id", legacyId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { existing: data };
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log("W4.4 — Insert California critical items");
  console.log("─".repeat(60));

  const log = {
    generated_at: new Date().toISOString(),
    candidate_count: ITEMS.length,
    inserted: 0,
    skipped_already_present: 0,
    inserted_with_null_source: 0,
    errors: 0,
    decisions: [],
    follow_up_todos: [],
  };

  for (const item of ITEMS) {
    const decision = { legacy_id: item.legacy_id, title: item.title };

    const exists = await checkExisting(item.legacy_id);
    if (exists.error) {
      decision.outcome = "lookup_error";
      decision.error = exists.error;
      log.errors += 1;
      log.decisions.push(decision);
      console.warn(`  [err] ${item.legacy_id} lookup: ${exists.error}`);
      continue;
    }
    if (exists.existing) {
      decision.outcome = "skip_already_present";
      decision.existing_id = exists.existing.id;
      log.skipped_already_present += 1;
      log.decisions.push(decision);
      console.log(`  [skip] ${item.legacy_id} already present → ${exists.existing.id}`);
      continue;
    }

    const lookup = await findSourceForItem(item);
    if (lookup.error) {
      decision.source_lookup_error = lookup.error;
    }
    const source = lookup.source ?? null;
    if (source) {
      decision.linked_source_id = source.id;
      decision.linked_source_name = source.name;
    } else {
      decision.linked_source_id = null;
      decision.note =
        "No matching `sources` row yet — source_id left NULL. Integrity flag system (mig 035) will flag this row for review.";
    }

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
      source_id: source?.id ?? null,
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
      console.warn(`  [insert-fail] ${item.legacy_id}: ${decision.error}`);
      continue;
    }

    decision.outcome = "inserted";
    decision.new_id = inserted.id;
    log.inserted += 1;
    if (!source) log.inserted_with_null_source += 1;
    log.decisions.push(decision);

    // Follow-up: queue an agent regeneration via /api/agent/run with admin
    // auth to replace the stub with a polished agent brief. We can't call
    // the API from here (admin auth required); instead emit a TODO.
    log.follow_up_todos.push({
      action: "regenerate_via_admin_ui",
      reason:
        "W4.4 inserted a hand-written stub. Run /api/agent/run on this item via the admin UI to regenerate the polished brief.",
      item_id: inserted.id,
      legacy_id: item.legacy_id,
      title: item.title,
      source_url: item.source_url,
    });

    console.log(
      `  [ok]   ${item.legacy_id} → ${inserted.id}  (source_id=${source?.id ?? "NULL"})`
    );
  }

  log.elapsed_ms = Date.now() - t0;

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf8");

  console.log("─".repeat(60));
  console.log(`Inserted:                        ${log.inserted}`);
  console.log(`  …with NULL source_id:          ${log.inserted_with_null_source}`);
  console.log(`Skipped (already present):       ${log.skipped_already_present}`);
  console.log(`Errors:                          ${log.errors}`);
  console.log(`Follow-up TODOs (regen):         ${log.follow_up_todos.length}`);
  console.log(`Elapsed:                         ${log.elapsed_ms} ms`);
  console.log(`Log:                             ${LOG_PATH}`);
  console.log("─".repeat(60));
  if (log.follow_up_todos.length > 0) {
    console.log("\nNEXT: regenerate each new item via /api/agent/run in the admin UI:");
    for (const t of log.follow_up_todos) {
      console.log(`  - item_id=${t.item_id}  ${t.title}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
