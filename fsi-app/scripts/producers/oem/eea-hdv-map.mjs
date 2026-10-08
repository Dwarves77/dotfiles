// eea-hdv-map.mjs -- from aggregated EEA HDV groups to oem_tech_roadmaps rows (lane S8-E1, 2026-10-08).
// Pure: no fs apart from reading the one config file, no network, no clock, no database.
//
// THE TABLE. oem_tech_roadmaps (migration 296, spec 09 section 1.1) has 13 insertable columns. This dataset is a
// vehicle registry extract; it can evidence three of them and the envelope, and nothing else:
//   manufacturer_id    the manufacturer, resolved to an EXISTING organisation entity (never minted)
//   tech_category      from the powertrain flags and fuel columns, through the rules in eea-hdv-classification.json
//   commercial_stage   from the number of registered vehicles, through the stage rules in the same file
//   source_id, origin_class ('official': a public body), derivation ('observed': a registered count), and
//   confidence_admiralty, left NULL: the PROD-SRC register carries no rating note for this dataset, and spec 09's
//   "typically B2/C2" describes vendor claims, which a registration count is not (rule 2: no invented rating).
// UNCOVERED, left NULL and never estimated (spec 09 section 5 item 3): target_year, energy_density_wh_kg,
// density_basis, c_rate_max, usable_kwh, announced_at. The extract holds no pack data, no target and no announcement
// date; announced_at is NOT NULL in migration 296 and is made nullable by migration 380 for exactly this reason.
//
// WHAT THE SHIPPED CONFIG DOES NOT CONTAIN, AND WHY. The committed real sample proves only conventional rows (one
// manufacturer, zero-emission flag "No", fuel "Diesel CI" / "Diesel"). The values the extract uses for a
// zero-emission vehicle's fuel columns, the unit counts that separate the four commercial stages, and the entity
// names the manufacturer strings map to are not in the sample, so none is written down: eea-hdv-classification.json
// ships with empty rules, every zero-emission group is reported as residue "zero_emission_unmapped", every
// manufacturer that would need an alias is listed by name in the residue, and the file validates strictly (closed
// category and stage sets, closed `when` keys) so a ruling lands as data in one place. Residue is recorded with its
// reason and blocks nothing; it is the work list.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEntityByName } from "../../spec09/lib/rows-file.mjs";

export class ClassificationError extends Error {}

/** The 13 insertable columns of public.oem_tech_roadmaps (migration 296), in the table's order. */
export const OEM_COLUMNS = Object.freeze([
  "manufacturer_id", "tech_category", "commercial_stage", "target_year", "energy_density_wh_kg", "density_basis",
  "c_rate_max", "usable_kwh", "announced_at", "source_id", "origin_class", "derivation", "confidence_admiralty",
]);
/** Columns this producer fills (confidence_admiralty is an envelope column filled with NULL, see the header). */
export const COVERED_COLUMNS = Object.freeze(["manufacturer_id", "tech_category", "commercial_stage", "source_id", "origin_class", "derivation", "confidence_admiralty"]);
/** Columns the dataset cannot evidence: always NULL. */
export const UNCOVERED_COLUMNS = Object.freeze(["target_year", "energy_density_wh_kg", "density_basis", "c_rate_max", "usable_kwh", "announced_at"]);

/** The closed sets of the migration 296 CHECK constraints (a test reads the migration and holds these equal to it). */
export const TECH_CATEGORIES = Object.freeze([
  "heavy_battery", "megawatt_charging", "hydrogen_fcell", "ammonia_engine", "methanol_dualfuel", "saf_refinery", "e_axle", "reefer_electrification",
]);
export const COMMERCIAL_STAGES = Object.freeze(["announced", "pilot_demonstration", "small_batch_fleet", "mass_series_production"]);

/** The group fields a zero-emission rule may match on. */
const WHEN_KEYS = Object.freeze(["ms_fuel", "engine_fuel", "ms_electric"]);
const CONFIG_KEYS = Object.freeze(["notes", "zev_tech_rules", "stage_rules", "manufacturer_aliases"]);

export const CLASSIFICATION_PATH = join(dirname(fileURLToPath(import.meta.url)), "eea-hdv-classification.json");

function bad(msg) { throw new ClassificationError(`eea-hdv-classification: ${msg}`); }

/** Validate and normalise a classification config. Throws ClassificationError naming the first problem. */
export function validateClassification(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) bad("the config must be a JSON object");
  for (const k of Object.keys(obj)) if (!CONFIG_KEYS.includes(k)) bad(`unknown key "${k}"`);

  const zev = obj.zev_tech_rules ?? [];
  if (!Array.isArray(zev)) bad("zev_tech_rules must be an array");
  const zevRules = zev.map((r, i) => {
    if (r === null || typeof r !== "object" || Array.isArray(r)) bad(`zev_tech_rules[${i}] must be an object`);
    if (!TECH_CATEGORIES.includes(r.tech_category)) bad(`zev_tech_rules[${i}].tech_category "${r.tech_category}" is not one of ${TECH_CATEGORIES.join(", ")}`);
    const when = r.when;
    if (when === null || typeof when !== "object" || Array.isArray(when)) bad(`zev_tech_rules[${i}].when must be an object`);
    const keys = Object.keys(when);
    if (keys.length === 0) bad(`zev_tech_rules[${i}].when needs at least one key`);
    for (const k of keys) {
      if (!WHEN_KEYS.includes(k)) bad(`zev_tech_rules[${i}] when key "${k}" is not one of ${WHEN_KEYS.join(", ")}`);
      if (typeof when[k] !== "string") bad(`zev_tech_rules[${i}].when.${k} must be a string`);
    }
    return Object.freeze({ when: Object.freeze({ ...when }), tech_category: r.tech_category });
  });

  const stage = obj.stage_rules ?? [];
  if (!Array.isArray(stage)) bad("stage_rules must be an array");
  const seen = new Set();
  const stageRules = stage.map((r, i) => {
    if (r === null || typeof r !== "object" || Array.isArray(r)) bad(`stage_rules[${i}] must be an object`);
    if (!Number.isInteger(r.min_units) || r.min_units < 1) bad(`stage_rules[${i}].min_units must be an integer of at least 1`);
    if (!COMMERCIAL_STAGES.includes(r.stage)) bad(`stage_rules[${i}].stage "${r.stage}" is not one of ${COMMERCIAL_STAGES.join(", ")}`);
    if (seen.has(r.min_units)) bad(`duplicate min_units ${r.min_units} in stage_rules`);
    seen.add(r.min_units);
    return Object.freeze({ min_units: r.min_units, stage: r.stage });
  }).sort((a, b) => b.min_units - a.min_units);

  const aliases = obj.manufacturer_aliases ?? {};
  if (aliases === null || typeof aliases !== "object" || Array.isArray(aliases)) bad("manufacturer_aliases must be an object");
  for (const [name, canonical] of Object.entries(aliases)) {
    if (typeof canonical !== "string" || canonical.trim() === "") bad(`manufacturer alias "${name}" must map to a non-empty entity canonical_name`);
  }

  return Object.freeze({
    zev_tech_rules: Object.freeze(zevRules),
    stage_rules: Object.freeze(stageRules),
    manufacturer_aliases: Object.freeze({ ...aliases }),
  });
}

/** Load the config file (default: the one beside this module) and validate it. */
export function loadClassification(path = CLASSIFICATION_PATH) {
  return validateClassification(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Name the technology of one aggregated group, or say why it has none.
 * @returns {{ tech_category: string } | { residue: string }}
 */
export function classifyGroup(group, cfg) {
  if (group.zev === "Yes") {
    for (const rule of cfg.zev_tech_rules) {
      if (Object.entries(rule.when).every(([k, v]) => group[k] === v)) return { tech_category: rule.tech_category };
    }
    return { residue: "zero_emission_unmapped" };
  }
  if (group.zev !== "No") return { residue: "zero_emission_flag_unreadable" };
  if (group.hybrid === "Yes") return { residue: "hybrid_powertrain" };
  if (group.dual_fuel === "Yes") return { residue: "dual_fuel_powertrain" };
  return { residue: "conventional_powertrain" };
}

/** The stage for a number of registered vehicles: the rule with the highest min_units not above it, else null. */
export function stageFor(units, cfg) {
  const hit = cfg.stage_rules.find((r) => units >= r.min_units);
  return hit ? hit.stage : null;
}

function addResidue(residue, reason, units) {
  const r = (residue.byReason[reason] ??= { groups: 0, units: 0 });
  r.groups += 1;
  r.units += units;
}

/**
 * @param {object[]} groups  aggregateHdvCsv(...).groups
 * @param {{ cfg: object, entities: Array<{entity_id: string, canonical_name: string}>, sourceId: string }} ctx
 *   entities: the live entities(kind='organisation') rows; a manufacturer with none is residue, never minted
 * @returns {{ rows: object[], evidence: object[], residue: { byReason: Record<string,{groups:number,units:number}>, unresolvedManufacturers: Array<{manufacturer: string, units: number}> } }}
 */
export function mapGroupsToRows(groups, { cfg, entities, sourceId }) {
  const residue = { byReason: {}, unresolvedManufacturers: [] };
  const unresolved = new Map();
  const merged = new Map();

  for (const g of groups) {
    const cls = classifyGroup(g, cfg);
    if (cls.residue) { addResidue(residue, cls.residue, g.units); continue; }

    const canonical = cfg.manufacturer_aliases[g.manufacturer] ?? g.manufacturer;
    const manufacturerId = resolveEntityByName(entities, canonical);
    if (!manufacturerId) {
      addResidue(residue, "manufacturer_not_in_spine", g.units);
      unresolved.set(g.manufacturer, (unresolved.get(g.manufacturer) ?? 0) + g.units);
      continue;
    }

    const key = `${manufacturerId}|${cls.tech_category}`;
    const m = merged.get(key) ?? { manufacturerId, tech: cls.tech_category, units: 0, groups: 0, first: null, last: null, countries: new Set() };
    m.units += g.units;
    m.groups += 1;
    if (g.first_registration && (m.first === null || g.first_registration < m.first)) m.first = g.first_registration;
    if (g.last_registration && (m.last === null || g.last_registration > m.last)) m.last = g.last_registration;
    for (const c of g.countries) m.countries.add(c);
    merged.set(key, m);
  }

  const rows = [];
  const evidence = [];
  for (const m of [...merged.values()].sort((a, b) => a.manufacturerId.localeCompare(b.manufacturerId) || a.tech.localeCompare(b.tech))) {
    const stage = stageFor(m.units, cfg);
    if (stage === null) {
      const r = (residue.byReason.no_stage_rule ??= { groups: 0, units: 0 });
      r.groups += m.groups;
      r.units += m.units;
      continue;
    }
    rows.push({
      manufacturer_id: m.manufacturerId,
      tech_category: m.tech,
      commercial_stage: stage,
      target_year: null,
      energy_density_wh_kg: null,
      density_basis: null,
      c_rate_max: null,
      usable_kwh: null,
      announced_at: null,
      source_id: sourceId,
      origin_class: "official",
      derivation: "observed",
      confidence_admiralty: null,
    });
    evidence.push({ units: m.units, first_registration: m.first, last_registration: m.last, countries: [...m.countries].sort() });
  }

  residue.unresolvedManufacturers = [...unresolved.entries()].map(([manufacturer, units]) => ({ manufacturer, units })).sort((a, b) => b.units - a.units || a.manufacturer.localeCompare(b.manufacturer));
  return { rows, evidence, residue };
}
