#!/usr/bin/env node
// seed-derived-values.mjs: the initial closure for the carbon-intensity method (docs/specs/08-flywheel-design.md
// section 2.2 Part 2: a value has to exist ONCE, from some caller, before drain.ts's recompute pass (which
// only ever SUPERSEDES an existing row) has anything to work from). Lane DP-SURF, system-completion train,
// 2026-09-02. The second seed path this script once carried (a wage-versus-automation derived value per
// region) was retired by ADR-043 (operator ruling 2026-10-03); regional wage and energy facts stay as
// sourced evidence and are no longer combined into a verdict.
//
// ONE SEED PATH: carbon_intensity_tkm@1.0.0, one derived_values row per EMBEDDABLE emission_factors row (the
// source_licence.mjs gate: mayEmbedAsSeed(source_key)) that carbon-intensity.mjs can actually compute from
// (quantity_basis in SUPPORTED_BASES; today just "tonne_km", every other basis REFUSES with a named reason,
// counted, never guessed). entity_id is NULL (emission_factors.corridor_id is free text, not an entity spine
// kind; migration 284's own header note on why the outbox itself carries no entity_id for this table
// either). Written via registerDerivedValue (register-derivation.ts): derived_values ONLY, no paired
// estimated_values row (carbon-intensity is neither statutory nor an estimate; see
// methods/carbon-intensity.ts's header).
//
// --dry counts everything this run WOULD write and writes nothing (no registerDerivedValue call).
// --apply performs the writes. Exactly one of --dry/--apply is required.
//
// PLAIN reads before any write: this script never mutates emission_factors, a read-only source table; its only
// destination is derived_values through the RPC, same "sources are read-only inputs" posture drain.ts holds.
//
// Usage:
//   node scripts/propagation/seed-derived-values.mjs --dry
//   node scripts/propagation/seed-derived-values.mjs --apply
// Exit 0 done · 1 bad args · 2 no DB creds (cannot run here) · 3 one or more writes failed (apply only).

import { parseArgs as nodeParseArgs } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerDerivedValue } from "../../src/lib/propagation/register-derivation.ts";
import { carbonIntensity } from "../../src/lib/market/carbon-intensity.mjs";
import { lifecycleFromFactorOriginClass, confidenceFromPedigree } from "../../src/lib/propagation/methods/carbon-intensity.ts";
import { mayEmbedAsSeed } from "../../src/lib/contracts/source-licence.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";


const CARBON_METHOD_ID = "carbon_intensity_tkm";
const CARBON_METHOD_VERSION = "1.0.0";

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

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) await main();

async function main() {
  loadLocalEnvFile();

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

  const summary = { mode: parsed.mode, carbonIntensity: carbon };
  console.log(JSON.stringify(summary, null, 2));

  const anyFailed = parsed.mode === "apply" && carbon.failed > 0;
  process.exit(anyFailed ? 3 : 0);
}
