#!/usr/bin/env node
// seed-derived-values.mjs — the initial closure for the two methods this lane registers (docs/specs/
// 08-flywheel-design.md §2.2 Part 2: a value has to exist ONCE, from some caller, before drain.ts's
// recompute pass (which only ever SUPERSEDES an existing row) has anything to work from). Lane DP-SURF,
// system-completion train, 2026-09-02.
//
// TWO SEED PATHS, mirroring the two methods methods/index.ts registers:
//
//   1. carbon_intensity_tkm@1.0.0 — one derived_values row per EMBEDDABLE emission_factors row (the
//      source_licence.mjs gate: mayEmbedAsSeed(source_key)) that carbon-intensity.mjs can actually compute
//      from (quantity_basis in SUPPORTED_BASES; today just "tonne_km" — every other basis REFUSES with a
//      named reason, counted, never guessed). entity_id is NULL (emission_factors.corridor_id is free
//      text, not an entity spine kind — migration 284's own header note on why the outbox itself carries
//      no entity_id for this table either; this seed does not invent entity minting outside its write
//      set). Written via registerDerivedValue (register-derivation.ts) — derived_values ONLY, no paired
//      estimated_values row (carbon-intensity is neither statutory nor an estimate; see
//      methods/carbon-intensity.ts's header).
//
//   2. automate_vs_hire@1.0.0 — one derived_values row (NPV, the propagated headline metric) PLUS one
//      paired estimated_values row (point/low/high on NPV, distribution jsonb carrying payback/break-even
//      — see methods/automate-vs-hire.ts's header for why the range triple is split across two tables this
//      way) per REGION that has BOTH an HOURLY-unit labor_markets fact AND an operational_cost fact with a
//      populated value_numeric (migration 267's envelope column — NULL means "not yet re-keyed through the
//      envelope," not zero; see isHourlyWageUnit's own header, 2026-09-02 coordinator follow-up, for why
//      "hourly-unit" and not merely "present" — a region with only an ANNUAL labor_markets fact counts
//      regionsWithBothFacts but is skippedNoHourlyWage, never created). `entity_id` is a required FK on
//      both tables (migration 286, amended 2026-09-02 — no longer the PK, see that migration's header) and
//      a region has no entity spine row of its own (regions were never in DP-SPINE's progressive re-keying
//      scope — migration 284's header, same note as above), so a matched region's jurisdiction entity is
//      resolved through `entity_refs` (ref_table='regions', role='jurisdiction') and MINTED on demand when
//      absent — `entityId('jurisdiction', iso)` + entities/entity_identifiers/entity_refs rows through the
//      SAME guarded db path (scripts/lib/db.mjs guardedInsertMany) and the SAME shape
//      scripts/entities/backfill-entities.mjs writes (its own exported
//      planJurisdictionEntities/planJurisdictionRefs, reused directly — see resolveEntityId in main()
//      below). --dry never mints (a read-only, deterministic PREVIEW of the id that WOULD be minted, so
//      wouldCreate/skippedNoEntity still count honestly without writing); only --apply mints for real. A
//      region with an empty iso_codes array still cannot resolve an entity (nothing to mint FROM) and is
//      still counted skippedNoEntity. AS OF THIS COMMIT, BLS OEWS (labor_markets, both an annual AND an
//      hourly median-wage fact as of the SAME-DAY coordinator follow-up fixing the wage-unit mismatch) is
//      US-only and Eurostat nrg_pc_205/lc_lci_lev (operational_cost / labor_markets) are EU-only (see
//      scripts/producers/regional/*-producer.mjs) — DISJOINT region sets for BLS-vs-Eurostat, but the SAME
//      follow-up's task 3 (eurostat-lc-lci-lev-producer.mjs) gives the 'EU' region BOTH an hourly
//      labor_markets fact (Eurostat, already hourly-unit — EUR/hour) and an operational_cost fact
//      (nrg_pc_205) once that producer's --apply lands data — see this lane's final report for the
//      resulting expected count by formula.
//
// --dry counts everything this run WOULD write and writes nothing (no registerDerivedValue call, no
// estimated_values upsert). --apply performs the writes. Exactly one of --dry/--apply is required.
//
// PLAIN reads before any write: this script never mutates emission_factors/regional_data_facts/regions —
// read-only source tables, write-only destination tables (derived_values via the RPC, estimated_values
// directly) — same "sources are read-only inputs" posture drain.ts itself holds.
//
// Usage:
//   node scripts/propagation/seed-derived-values.mjs --dry
//   node scripts/propagation/seed-derived-values.mjs --apply
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here) · 3 one or more writes failed (apply only).

import { parseArgs as nodeParseArgs } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerDerivedValue } from "../../src/lib/propagation/register-derivation.ts";
import { carbonIntensity } from "../../src/lib/market/carbon-intensity.mjs";
import { lifecycleFromFactorOriginClass, confidenceFromPedigree } from "../../src/lib/propagation/methods/carbon-intensity.ts";
import { automateVsHire, DEFAULT_SCENARIO, isHourlyWageUnit } from "../../src/lib/operations/automate-vs-hire.mjs";
import { mayEmbedAsSeed } from "../../src/lib/contracts/source-licence.mjs";
import { entityId } from "../../src/lib/entities/entity-id.mjs";
import { planJurisdictionEntities, planJurisdictionRefs, distinctNormalized } from "../entities/backfill-entities.mjs";
import { guardedInsertMany } from "../lib/db.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

const CARBON_METHOD_ID = "carbon_intensity_tkm";
const CARBON_METHOD_VERSION = "1.0.0";
const AUTOMATE_METHOD_ID = "automate_vs_hire";
const AUTOMATE_METHOD_VERSION = "1.0.0";
// migration 286's 2026-09-02 amendment: estimated_values is unique on (entity_id, model_id, model_version,
// scenario_key), not on entity_id alone. This seed always writes the single ordinary scenario.
const SCENARIO_KEY = "default";

// Cite for entity-minting writes this script performs when a region has no jurisdiction entity yet
// (guardedInsertMany, scripts/lib/db.mjs rule-015 guarded path) — see resolveEntityId in main() below.
const SEED_ENTITY_CITE = {
  skill: "remediation-discipline",
  reason:
    "Lane DP-SURF (system-completion train, 2026-09-02, coordinator follow-up task 2): mint a jurisdiction " +
    "entity + entity_refs row for a region encountered by seed-derived-values.mjs's automate_vs_hire seed " +
    "path, the SAME shape scripts/entities/backfill-entities.mjs writes (entityId('jurisdiction', iso) + " +
    "entity_refs role='jurisdiction', via its own exported planJurisdictionEntities/planJurisdictionRefs) — " +
    "regions were never in DP-SPINE's original progressive-re-keying scope, so estimated_values.entity_id / " +
    "derived_values.entity_id had no FK target for any region until this on-demand mint.",
};

function usage() {
  return "Usage: node scripts/propagation/seed-derived-values.mjs --dry | --apply";
}

/** Pure CLI arg parse/validate — exactly one of --dry/--apply. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({
      args: Array.isArray(argv) ? argv : [],
      options: { dry: { type: "boolean", default: false }, apply: { type: "boolean", default: false } },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (values.dry === values.apply) {
    return { ok: false, error: "exactly one of --dry or --apply is required." };
  }
  return { ok: true, mode: values.apply ? "apply" : "dry" };
}

/**
 * The read-only client surface this script needs — `.from(table).select(cols)` returning `{data,error}`,
 * PLUS a direct `.upsert()` for estimated_values (there is no register_estimated_value RPC — migration 286
 * ships no such function, unlike derived_values' register_derived_value; a plain upsert on a
 * NOT-NULL-PK-keyed table is the documented, transaction-safe write here: one row, one statement, no
 * multi-table fan-out the way derived_values+derivation_edges needed one). Kept narrow so a hand-rolled
 * fake satisfies it, matching every other client interface in this family (DrainClient, NoticesClient).
 */

/**
 * Seed carbon_intensity_tkm derived_values rows from every embeddable, computable emission_factors row.
 * PURE PLANNING + (in apply mode) real writes — the planning half (what would be written, and why not for
 * the rest) is always computed and returned, so --dry and --apply share one code path with a single
 * branch at the actual write call.
 * @param {object} sb
 * @param {"dry"|"apply"} mode
 * @param {() => string} nowIso
 */
export async function seedCarbonIntensity(sb, mode, nowIso = () => new Date().toISOString()) {
  const { data, error } = await sb
    .from("emission_factors")
    .select("factor_id,quantity_basis,ttw_co2e,wtw_co2e,wtt_co2e,source_key,origin_class,pedigree");
  if (error) {
    return { total: 0, licenceBlocked: 0, refused: 0, wouldCreate: 0, created: 0, failed: 0, errors: [`read failed: ${error.message}`] };
  }
  const rows = Array.isArray(data) ? data : [];
  const result = { total: rows.length, licenceBlocked: 0, refused: 0, wouldCreate: 0, created: 0, failed: 0, errors: [] };

  for (const factor of rows) {
    if (!mayEmbedAsSeed(factor.source_key)) {
      result.licenceBlocked += 1;
      continue;
    }
    const r = carbonIntensity(factor);
    if (!r.ok) {
      result.refused += 1;
      continue;
    }
    result.wouldCreate += 1;
    if (mode !== "apply") continue;
    try {
      await registerDerivedValue(sb, {
        entityId: null,
        methodId: CARBON_METHOD_ID,
        methodVersion: CARBON_METHOD_VERSION,
        value: r.valueGPerUnit,
        unit: r.unit,
        derivation: "calculated",
        originClass: "derived",
        lifecycle: lifecycleFromFactorOriginClass(factor.origin_class),
        admissibility: "calculation_ok",
        confidence: confidenceFromPedigree(factor.pedigree),
        assertedAt: nowIso(),
        halfLifeDays: null,
        inputs: [{ table: "emission_factors", pk: factor.factor_id }],
        computedBy: `${CARBON_METHOD_ID}@${CARBON_METHOD_VERSION}:seed-derived-values`,
      });
      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(`emission_factors ${factor.factor_id}: ${err.message}`);
    }
  }
  return result;
}

/**
 * Seed automate_vs_hire derived_values (NPV) + estimated_values (the full range) for every region with
 * both an HOURLY-unit labor_markets fact and an operational_cost fact carrying a populated value_numeric.
 * A region that carries a labor_markets fact but only an ANNUAL one (bls-oews-producer.mjs's own annual
 * median wage row) still counts toward regionsWithBothFacts (any labor_markets presence, by design — that
 * counter answers "does this region have wage AND energy data at all", not "usable for THIS calculation")
 * but is counted skippedNoHourlyWage, not created — see the 2026-09-02 coordinator follow-up
 * ("BLS OEWS wage fact is hourly (H_MEAN), matching what automate-vs-hire reads") and isHourlyWageUnit's
 * own header for why. See file header for the entity-id gap (skippedNoEntity).
 * @param {object} sb
 * @param {"dry"|"apply"} mode
 * @param {(regionId: string) => Promise<string|null>} resolveEntityId — resolves a region's jurisdiction
 *   entity_id, or null if none can be resolved (e.g. the region has no iso_codes to mint from). Injected
 *   so this function stays testable without a real entity spine query; the production caller below (see
 *   main()) resolves through `entity_refs` (ref_table='regions', role='jurisdiction') and MINTS on demand
 *   when absent (apply mode only — dry mode previews the id without writing; see file header).
 * @param {() => string} nowIso
 */
export async function seedAutomateVsHire(sb, mode, resolveEntityId, nowIso = () => new Date().toISOString()) {
  const { data, error } = await sb
    .from("regional_data_facts")
    .select("id,region_id,dimension,value_numeric,unit,last_updated")
    .in("dimension", ["labor_markets", "operational_cost"]);
  if (error) {
    return { regionsWithBothFacts: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, wouldCreate: 0, created: 0, failed: 0, errors: [] };
  }
  const rows = (Array.isArray(data) ? data : []).filter((r) => typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric));

  const byRegion = new Map();
  for (const r of rows) {
    if (!byRegion.has(r.region_id)) byRegion.set(r.region_id, { labor_markets: [], operational_cost: [] });
    byRegion.get(r.region_id)[r.dimension].push(r);
  }

  const mostRecent = (list) => list.slice().sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))[0];

  const result = { regionsWithBothFacts: 0, skippedNoHourlyWage: 0, skippedNoEntity: 0, wouldCreate: 0, created: 0, failed: 0, errors: [] };

  for (const [regionId, byDim] of byRegion) {
    if (byDim.labor_markets.length === 0 || byDim.operational_cost.length === 0) continue;
    result.regionsWithBothFacts += 1;

    // labourCostPerHour (automate-vs-hire.mjs's own doc line: "Point wage (USD/hour)") may only ever be
    // fed from an HOURLY-unit labor_markets fact — bls-oews-producer.mjs writes an annual (USD/year) fact
    // alongside its hourly one (2026-09-02 coordinator follow-up: "BLS OEWS wage fact is hourly (H_MEAN),
    // matching what automate-vs-hire reads"), and a region whose ONLY labor_markets fact is annual must be
    // skipped, named, rather than silently feeding an annual dollar figure in as if it were hourly (or
    // dividing it by 2080 to manufacture one — see isHourlyWageUnit's own header). This mirrors the same
    // rule src/lib/propagation/methods/automate-vs-hire.ts now enforces on the drain's recompute path — see
    // that file's findHourlyWageFact for the identical predicate.
    const hourlyWageRows = byDim.labor_markets.filter((r) => isHourlyWageUnit(r.unit));
    if (hourlyWageRows.length === 0) {
      result.skippedNoHourlyWage += 1;
      continue;
    }

    const wage = mostRecent(hourlyWageRows);
    const energy = mostRecent(byDim.operational_cost);

    // NOTE: named resolvedEntityId, not entityId — this module also imports the entityId() minting
    // function from entity-id.mjs (used inside main()'s resolveEntityId below); a same-named local would
    // merely shadow it here (no bug — this function never calls entityId() itself), but the distinct name
    // keeps the two unambiguous at a glance.
    const resolvedEntityId = await resolveEntityId(regionId);
    if (!resolvedEntityId) {
      result.skippedNoEntity += 1;
      continue;
    }

    result.wouldCreate += 1;
    if (mode !== "apply") continue;

    const scenario = automateVsHire({ ...DEFAULT_SCENARIO, labourCostPerHour: wage.value_numeric, energyPricePerKwh: energy.value_numeric });
    const inputs = [
      { table: "regional_data_facts", pk: wage.id },
      { table: "regional_data_facts", pk: energy.id },
    ];
    try {
      await registerDerivedValue(sb, {
        entityId: resolvedEntityId,
        methodId: AUTOMATE_METHOD_ID,
        methodVersion: AUTOMATE_METHOD_VERSION,
        value: scenario.npv.point,
        valueLow: scenario.npv.low,
        valueHigh: scenario.npv.high,
        unit: "USD",
        currency: "USD",
        derivation: "modelled",
        originClass: "modelled",
        lifecycle: "emerging",
        admissibility: "analysis_ok",
        confidence: 0.6,
        assertedAt: nowIso(),
        halfLifeDays: 365,
        inputs,
        computedBy: `${AUTOMATE_METHOD_ID}@${AUTOMATE_METHOD_VERSION}:seed-derived-values`,
      });

      // estimated_values: the paired range row ADR-024 requires ("break-even wage gets equal billing" —
      // never derivable from the derived_values row's NPV-only point/low/high alone). point/low/high here
      // mirror the derived_values row's own NPV triple (estimate_brackets_point/estimate_range_ordered
      // CHECKs both require it); payback/break-even ride in `distribution`, the documented use of that
      // jsonb column this lane's write set commits to (methods/automate-vs-hire.ts's header).
      const { error: upsertErr } = await sb.from("estimated_values").upsert(
        {
          entity_id: resolvedEntityId,
          scenario_key: SCENARIO_KEY,
          model_id: AUTOMATE_METHOD_ID,
          model_version: AUTOMATE_METHOD_VERSION,
          point: scenario.npv.point,
          low: scenario.npv.low,
          high: scenario.npv.high,
          distribution: {
            npv: scenario.npv,
            paybackYears: scenario.paybackYears,
            breakEvenWagePerHour: scenario.breakEvenWagePerHour,
            refusal: scenario.refusal,
          },
          pedigree: { reliability: 2, completeness: 3, temporal_correlation: 2, geographical_correlation: 2, technological_correlation: 3 },
        },
        // migration 286's 2026-09-02 amendment: entity_id is no longer estimated_values' PK — the
        // unique constraint (and therefore the upsert conflict target) is
        // estimated_values_entity_model_scenario_uniq (entity_id, model_id, model_version, scenario_key).
        { onConflict: "entity_id,model_id,model_version,scenario_key" }
      );
      if (upsertErr) throw new Error(`estimated_values upsert failed: ${upsertErr.message}`);

      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push(`region ${regionId}: ${err.message}`);
    }
  }
  return result;
}

/**
 * Resolve a region's jurisdiction entity_id (2026-09-02 coordinator follow-up task 2), through
 * `entity_refs` (ref_table='regions', role='jurisdiction' — migration 283's already-legal ref_table
 * value), MINTING ON DEMAND when absent — regions were never in DP-SPINE's original progressive-re-keying
 * scope, so no row here has ever had an entity. Mint uses the SAME shape scripts/entities/
 * backfill-entities.mjs writes: its own exported `planJurisdictionEntities`/`planJurisdictionRefs`, reused
 * directly (both are exported; see that file), never a hand-rolled reimplementation — writes go through
 * `insertMany` (defaults to scripts/lib/db.mjs's real `guardedInsertMany`, the rule-015 guarded path;
 * injectable so a test can capture calls against a fake instead of needing real DB creds).
 *
 * A region can carry MULTIPLE iso_codes (a multi-country grouping) — planJurisdictionRefs mints one
 * entity_refs row per code (parity with what backfill-entities.mjs would eventually write for the same
 * region, so the two producers can never disagree about which entities a region's iso_codes resolve to);
 * this resolver picks the alphabetically-first code's entity as THE region's entity_id for the
 * single-valued estimated_values/derived_values entity_id column — deterministic, and stable across runs
 * (entityId() is itself deterministic, so re-resolving the same region always returns the same pick).
 *
 * DRY MODE NEVER WRITES: when no entity_refs row exists yet, `mode !== "apply"` returns the candidate id
 * `entityId('jurisdiction', firstSortedCode)` would mint (a pure preview — the same value apply mode would
 * end up minting) WITHOUT inserting anything, so seedAutomateVsHire's wouldCreate/skippedNoEntity counts
 * stay honest under --dry without violating "dry writes nothing" (file header).
 * @param {object} sb
 * @param {string} regionId
 * @param {"dry"|"apply"} mode
 * @param {{insertMany?: typeof guardedInsertMany, cite?: {skill:string,reason:string}}} [deps]
 * @returns {Promise<string|null>}
 */
export async function resolveRegionEntityId(sb, regionId, mode, deps = {}) {
  const insertMany = deps.insertMany ?? guardedInsertMany;
  const cite = deps.cite ?? SEED_ENTITY_CITE;

  const { data: existingRefs, error: refErr } = await sb
    .from("entity_refs")
    .select("entity_id")
    .eq("ref_table", "regions")
    .eq("ref_id", regionId)
    .eq("role", "jurisdiction")
    .order("entity_id", { ascending: true })
    .limit(1);
  if (refErr) return null;
  if (Array.isArray(existingRefs) && existingRefs.length > 0) return existingRefs[0].entity_id;

  const { data: region } = await sb.from("regions").select("iso_codes").eq("id", regionId).maybeSingle();
  const codes = distinctNormalized(Array.isArray(region?.iso_codes) ? region.iso_codes : []);
  if (codes.length === 0) return null; // nothing to mint a jurisdiction entity FROM

  const sortedCodes = codes.slice().sort();
  const previewEntityId = entityId("jurisdiction", sortedCodes[0]);
  if (mode !== "apply") return previewEntityId; // dry: preview only, no writes (see doc comment)

  const candidateIds = codes.map((c) => entityId("jurisdiction", c));
  const { data: alreadyEntities } = await sb.from("entities").select("entity_id").in("entity_id", candidateIds);
  const existingEntityIds = new Set((alreadyEntities || []).map((r) => r.entity_id));
  const { data: existingIdentRows } = await sb
    .from("entity_identifiers")
    .select("entity_id,scheme,value")
    .in("entity_id", candidateIds);
  const existingIdentifierKeys = new Set((existingIdentRows || []).map((r) => `${r.entity_id}|${r.scheme}|${r.value}`));

  const { entities, identifiers, byCode } = planJurisdictionEntities(codes, existingEntityIds, existingIdentifierKeys);
  const refs = planJurisdictionRefs("regions", [{ id: regionId, iso_codes: codes }], byCode);

  if (entities.length) await insertMany("entities", entities, { cite });
  if (identifiers.length) await insertMany("entity_identifiers", identifiers, { cite });
  if (refs.length) await insertMany("entity_refs", refs, { cite });

  return byCode.get(sortedCodes[0]) ?? previewEntityId;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  try { process.loadEnvFile(resolve(FSI_ROOT, ".env.local")); } catch { /* CI: env injected */ }

  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`seed-derived-values: ${parsed.error}\n${usage()}`);
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("seed-derived-values: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const carbon = await seedCarbonIntensity(sb, parsed.mode);
  const automate = await seedAutomateVsHire(sb, parsed.mode, (regionId) => resolveRegionEntityId(sb, regionId, parsed.mode));

  const summary = { mode: parsed.mode, carbonIntensity: carbon, automateVsHire: automate };
  console.log(JSON.stringify(summary, null, 2));

  const anyFailed = parsed.mode === "apply" && (carbon.failed > 0 || automate.failed > 0);
  process.exit(anyFailed ? 3 : 0);
}
