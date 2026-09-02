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
//      way) per REGION that has BOTH a labor_markets fact AND an operational_cost fact with a populated
//      value_numeric (migration 267's envelope column — NULL means "not yet re-keyed through the
//      envelope," not zero). `estimated_values.entity_id` is a NOT-NULL PRIMARY KEY (migration 286) — a
//      region has no entity spine row today (regions were never in DP-SPINE's progressive re-keying scope
//      — migration 284's header, same note as above), so a matched region is counted
//      (`skippedNoEntity`) rather than written when no entity_id resolves; this lane's write set does not
//      include entity minting/backfill (that is DP-SPINE's scripts/entities/backfill-entities.mjs), so
//      seeding this path further is deliberately left to whichever lane wires a region into the entity
//      spine. AS OF THIS COMMIT, BLS OEWS (labor_markets) is US-only and Eurostat nrg_pc_205
//      (operational_cost) is EU-country-only (see scripts/producers/regional/*-producer.mjs) — DISJOINT
//      region sets, so the honest expected count for this path today is 0 regardless of the entity gap;
//      the code path is exercised end-to-end by seed-derived-values.test.mjs's fakes, not left dead.
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
import { automateVsHire, DEFAULT_SCENARIO } from "../../src/lib/operations/automate-vs-hire.mjs";
import { mayEmbedAsSeed } from "../../src/lib/contracts/source-licence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..");

const CARBON_METHOD_ID = "carbon_intensity_tkm";
const CARBON_METHOD_VERSION = "1.0.0";
const AUTOMATE_METHOD_ID = "automate_vs_hire";
const AUTOMATE_METHOD_VERSION = "1.0.0";

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
 * both a labor_markets and an operational_cost fact carrying a populated value_numeric. See file header
 * for SUPPORTED_BASES-shaped honesty about today's expected count (0 — disjoint US/EU coverage) and the
 * entity-id gap (skippedNoEntity).
 * @param {object} sb
 * @param {"dry"|"apply"} mode
 * @param {(regionId: string) => Promise<string|null>} resolveEntityId — looks up an existing entity_id
 *   for a region, or null if none exists. Injected so this function stays testable without a real entity
 *   spine query; the production caller below wires it to a real `.from("entity_identifiers")`-shaped read
 *   (a region's entity, if one has been minted elsewhere, is found by scheme/value crosswalk — this
 *   script MINTS NOTHING, per the file header's write-set boundary).
 * @param {() => string} nowIso
 */
export async function seedAutomateVsHire(sb, mode, resolveEntityId, nowIso = () => new Date().toISOString()) {
  const { data, error } = await sb
    .from("regional_data_facts")
    .select("id,region_id,dimension,value_numeric,unit,last_updated")
    .in("dimension", ["labor_markets", "operational_cost"]);
  if (error) {
    return { regionsWithBothFacts: 0, skippedNoEntity: 0, wouldCreate: 0, created: 0, failed: 0, errors: [] };
  }
  const rows = (Array.isArray(data) ? data : []).filter((r) => typeof r.value_numeric === "number" && Number.isFinite(r.value_numeric));

  const byRegion = new Map();
  for (const r of rows) {
    if (!byRegion.has(r.region_id)) byRegion.set(r.region_id, { labor_markets: [], operational_cost: [] });
    byRegion.get(r.region_id)[r.dimension].push(r);
  }

  const mostRecent = (list) => list.slice().sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))[0];

  const result = { regionsWithBothFacts: 0, skippedNoEntity: 0, wouldCreate: 0, created: 0, failed: 0, errors: [] };

  for (const [regionId, byDim] of byRegion) {
    if (byDim.labor_markets.length === 0 || byDim.operational_cost.length === 0) continue;
    result.regionsWithBothFacts += 1;

    const wage = mostRecent(byDim.labor_markets);
    const energy = mostRecent(byDim.operational_cost);

    const entityId = await resolveEntityId(regionId);
    if (!entityId) {
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
        entityId,
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
          entity_id: entityId,
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
        { onConflict: "entity_id" }
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

  // Production entity resolver: a region's entity_id, IF one already exists in the spine, found via
  // entity_identifiers' UNLOCODE/ISO3166 crosswalk against regions.code — never minted here (see file
  // header). Falls back to null (skippedNoEntity) on any read failure, same fail-soft posture the rest of
  // this script uses for a query that cannot complete.
  async function resolveEntityId(regionId) {
    const { data: region } = await sb.from("regions").select("code").eq("id", regionId).maybeSingle();
    if (!region?.code) return null;
    const { data: idRow } = await sb
      .from("entity_identifiers")
      .select("entity_id")
      .in("scheme", ["ISO3166_1", "ISO3166_2", "UNLOCODE"])
      .eq("value", region.code)
      .maybeSingle();
    return idRow?.entity_id ?? null;
  }

  const carbon = await seedCarbonIntensity(sb, parsed.mode);
  const automate = await seedAutomateVsHire(sb, parsed.mode, resolveEntityId);

  const summary = { mode: parsed.mode, carbonIntensity: carbon, automateVsHire: automate };
  console.log(JSON.stringify(summary, null, 2));

  const anyFailed = parsed.mode === "apply" && (carbon.failed > 0 || automate.failed > 0);
  process.exit(anyFailed ? 3 : 0);
}
