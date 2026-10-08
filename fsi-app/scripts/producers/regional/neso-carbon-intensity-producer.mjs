#!/usr/bin/env node
// neso-carbon-intensity-producer.mjs, lane S8-E5 (2026-10-08). GB grid carbon intensity from the NESO Carbon
// Intensity API into regional_data_facts, dimension `grid_intensity` (migration 378), envelope first.
//
// WHERE THIS LANDS AND WHY (coordinator ruling A, 2026-10-08). Spec 09 section 1.5 names auxiliary_energy_profiles,
// whose grid_intensity_source column only NAMES a source of gCO2/kWh. The VALUE is a regional fact:
// scripts/spec09/SOURCES.md already routes it through regional_data_facts (migration 106). auxiliary_energy_profiles
// is untouched. Region UK (regions.iso_codes holds GB); one current-state fact refreshed in place.
//
// Usage: node scripts/producers/regional/neso-carbon-intensity-producer.mjs [--input <file>] [--apply]
//   (no flag)   dry run: fetch (or read --input), parse, rate the source, plan the upsert, write nothing (DEFAULT)
//   --apply     execute the plan through the guarded write path (scripts/lib/db.mjs); refused unless ENABLED, the
//               kill switch REGIONAL_PRODUCER_NESO_CARBON_INTENSITY_ENABLED=1 and DB creds are all present
//
// DATASET (PROD-SRC register 1.5 row D, fetched 2026-10-08 by that lane and again by this one for the fixture):
//   GET https://api.carbonintensity.org.uk/intensity/stats/{from}/{to}/24, keyless (HTTP 200 with no key, this lane,
//   2026-10-08), JSON. Each element of `data` is one 24 hour block {from, to, intensity:{max, average, min, index}}.
//   Licence: CC BY 4.0 (register quote: page states "CC BY 4.0"; "API Terms of Use" on GitHub). Attribution ships in
//   data_sources.attribution (migration 378).
//
// CHOICES, stated:
//   * PERIOD. Daily blocks (the 24 hour stats block), not the half-hourly series: a daily figure is what an
//     auxiliary-load profile needs, and the API publishes it directly, so the value is the source's own number
//     (derivation observed), never an average this producer computed.
//   * WHAT IS CARRIED. `average` only. max, min and index are published but are not the fact; they are not stored.
//   * UNIT. gCO2/kWh, the unit the repo's own spec 04 section 7 names for this dataset family. The response body
//     itself carries no unit field; the label is not read from it.
//   * ONE ROW. regional_data_facts is current-state (UNIQUE region, dimension, fact_label). fact_label carries no
//     date, so the 14 daily periods in one payload reduce, via run-envelope-producer's latestPerNaturalKey, to the
//     newest period; reference_period names that day and as_at_date is the API's period end. History belongs to a
//     series table, not this one.
//   * AS_OF. The API's `to` (the period end), as a date. Only complete days are requested (see buildUrl).
//   * NOT CARRIED, NEVER ESTIMATED: n_observations (the response gives no sample size), currency, status, trend.
//   * BASIS NOT STATED BY THE SOURCE. The stats response does not say whether `average` is over forecast or actual
//     half-hour values. That is recorded here, not guessed; it is a property of the source's published number.
//
// SOURCE RATING (rule 18). The publisher is registered in `sources` through registerSource, rated by the ONE shared
// step (scripts/lib/rate-source-by-class.mjs): the institution class table plus the committed host verdict batches,
// a verdict outranking the residue name rule (host-authority.ts classTierForHostWithVerdicts), never hand-typed.
// host-verdicts-001.json classes carbonintensity.org.uk as gov (NESO is publicly owned), so the table answers tier 2;
// with no batch the residue ruling alone answers tier 7 (company). The fact row carries the registered source's id in
// regional_data_facts.source_id. Separately, regional_data_facts.source_key is an FK to data_sources; the producer
// REFUSES to write when that row is absent (migration 378 inserts it), naming the row.
//
// DOWNSTREAM (rule 17). regional_data_facts already carries the propagation outbox trigger (migration 284) and the
// coverage trigger (migration 109); entity linkage is by the region's refs (L4-E, migration 373). Nothing further
// is wired from this file.
//
// KILL SWITCH, default OFF. ENABLED is a reviewed-code-change gate (no population until every build layer is
// complete): a dry run always works, --apply is refused while it is false.
// (regional_data_facts is written by siblings in this directory under the same shape; it is not a registered shared table.)
import { readFileSync } from "node:fs";
import { toCandidateRows, latestPerNaturalKey } from "./run-envelope-producer.mjs";
import { planUpsert } from "../../../src/lib/regional/regional-facts-envelope.mjs";
import { makeResolveSource } from "../../lib/rate-source-by-class.mjs";
import { readAll, guardedInsert, guardedUpdate, registerSource } from "../../lib/db.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";

export const ENABLED = false;
export const PRODUCER_NAME = "neso-carbon-intensity";
export const KILL_SWITCH_ENV = "REGIONAL_PRODUCER_NESO_CARBON_INTENSITY_ENABLED";
export const SOURCE_KEY = "neso_carbon_intensity";
export const DIMENSION = "grid_intensity";
export const REGION_CODE = "UK";
export const UNIT = "gCO2/kWh";
export const FACT_LABEL = "GB grid carbon intensity, daily average (NESO Carbon Intensity API)";
export const SOURCE_URL = "https://carbonintensity.org.uk/";
export const SOURCE_NAME = "National Energy System Operator (NESO) Carbon Intensity API";
const METHOD_VERSION = "neso-carbon-intensity-stats-parser@1";
const API_BASE = "https://api.carbonintensity.org.uk";
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})Z$/;
const TABLE = "regional_data_facts";

const CITE = Object.freeze({
  skill: "environmental-policy-and-innovation",
  reason:
    "Lane S8-E5 (2026-10-08, coordinator ruling A): NESO Carbon Intensity API daily GB grid intensity into " +
    "regional_data_facts dimension grid_intensity, envelope first, source rated by the institution class table.",
});

/** The stats URL for the 14 complete days ending yesterday (UTC). Pure. */
export function buildUrl(now = new Date()) {
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return `${API_BASE}/intensity/stats/${iso(day0 - WINDOW_DAYS * DAY_MS)}T00:00Z/${iso(day0 - DAY_MS)}T23:59Z/24`;
}

/**
 * Decode a stats document into envelope observations (buildEnvelopeRow input), one per complete daily block.
 * A block that is not exactly midnight to midnight, has no numeric non-negative average, or repeats a period is
 * skipped with a warning, never repaired.
 * @param {object} doc parsed JSON
 * @returns {{observations: object[], warnings: string[]}}
 */
export function parseNesoStats(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.data)) {
    throw new Error("parseNesoStats: not a Carbon Intensity stats document (no data array)");
  }
  const observations = [];
  const warnings = [];
  const seen = new Set();
  for (const [i, e] of doc.data.entries()) {
    const f = STAMP_RE.exec(String(e?.from ?? ""));
    const t = STAMP_RE.exec(String(e?.to ?? ""));
    if (!f || !t) { warnings.push(`block ${i}: from/to are not YYYY-MM-DDTHH:MMZ stamps, skipped`); continue; }
    const aligned = f[2] === "00" && f[3] === "00" && Date.parse(e.to) - Date.parse(e.from) === DAY_MS;
    if (!aligned) { warnings.push(`block ${i}: ${e.from} to ${e.to} is not one midnight to midnight day, skipped`); continue; }
    const avg = e?.intensity?.average;
    if (typeof avg !== "number" || !Number.isFinite(avg) || avg < 0) {
      warnings.push(`block ${i}: ${e.from} has no numeric non-negative average (got ${JSON.stringify(avg)}), skipped`);
      continue;
    }
    if (seen.has(e.from)) { warnings.push(`block ${i}: duplicate period ${e.from}, first kept`); continue; }
    seen.add(e.from);
    observations.push({
      region_code: REGION_CODE,
      dimension: DIMENSION,
      fact_label: FACT_LABEL,
      value_numeric: avg,
      unit: UNIT,
      currency: null,
      derivation: "observed",
      origin_class: "official",
      source_key: SOURCE_KEY,
      source_ref: `carbonintensity.org.uk:/intensity/stats/${e.from}/${e.to}/24`,
      method_version: METHOD_VERSION,
      as_at_date: t[1],
      reference_period: f[1],
      n_observations: null,
    });
  }
  return { observations, warnings };
}

/** Pure gate for --apply. Order: ENABLED constant, then the runtime kill switch, then DB creds. */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply), parse and plan only, nothing written" };
  if (!enabled) {
    return { canWrite: false, reason: "REFUSING, the source-level ENABLED constant in neso-carbon-intensity-producer.mjs is false; arming this producer is a later, reviewed commit" };
  }
  if (!killSwitchOn) return { canWrite: false, reason: `REFUSING, kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  if (!hasCreds) return { canWrite: false, reason: "REFUSING, --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), none found" };
  return { canWrite: true, reason: "all gates satisfied" };
}

// The publisher is rated through the ONE shared rating step (scripts/lib/rate-source-by-class.mjs): the class table
// plus the committed host verdict batches, a verdict outranking the residue name rule (host-authority.ts
// classTierForHostWithVerdicts). Nothing here special-cases a verdict.
const resolveSource = makeResolveSource({ urlField: "url", nameField: "name", cite: CITE });

const ENVELOPE_SELECT =
  "id, region_id, dimension, fact_label, value, value_numeric, unit, currency, derivation, origin_class, " +
  "source_key, source_ref, n_observations, method_version, as_at_date, reference_period";

/**
 * The whole run with every dependency injected.
 * @param {{apply?: boolean, now?: Date, inputText?: string|null, enabled?: boolean, killSwitchOn?: boolean}} opts
 * @param {{fetchText?: Function, hasCreds?: boolean, readAllFn?: Function, registerSourceFn?: Function,
 *          guardedInsertFn?: Function, guardedUpdateFn?: Function}} deps
 */
export async function runNesoCarbonIntensity({ apply = false, now = new Date(), inputText = null, enabled = ENABLED, killSwitchOn = false } = {}, deps = {}) {
  const hasCreds = Boolean(deps.hasCreds);
  const decision = decideApply({ apply, enabled, killSwitchOn, hasCreds });
  const canWrite = decision.canWrite;
  const summary = {
    mode: apply ? "apply" : "dry", url: buildUrl(now), parsed: 0, warnings: [], candidates: 0, source: null,
    checks: {}, plan: { insert: 0, update: 0, unchanged: 0 }, applied: { inserted: 0, updated: 0 },
    reason: decision.reason, refused: null, exitCode: 0,
  };
  const refuse = (msg) => { summary.refused = msg; summary.exitCode = 1; return summary; };
  if (apply && !canWrite) return refuse(decision.reason);

  const text = inputText ?? (await deps.fetchText(summary.url));
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error(`neso-carbon-intensity: response is not JSON (${e.message}); first 120 chars: ${JSON.stringify(String(text).slice(0, 120))}`); }
  const { observations, warnings } = parseNesoStats(doc);
  summary.parsed = observations.length;
  summary.warnings = warnings;
  const candidates = latestPerNaturalKey(toCandidateRows(observations));
  summary.candidates = candidates.length;

  let regionId = null;
  let idToCode = new Map();
  if (hasCreds) {
    const sources = await deps.readAllFn("data_sources", "source_key", { match: (qb) => qb.eq("source_key", SOURCE_KEY) });
    summary.checks.data_source_registered = sources.some((s) => s.source_key === SOURCE_KEY);
    if (!summary.checks.data_source_registered && canWrite) {
      return refuse(`data_sources has no row for source_key ${SOURCE_KEY}: apply migration 378 first (regional_data_facts.source_key is a foreign key to it)`);
    }
    const regions = await deps.readAllFn("regions", "id, code");
    idToCode = new Map(regions.map((r) => [r.id, r.code]));
    regionId = regions.find((r) => r.code === REGION_CODE)?.id ?? null;
    summary.checks.region_found = regionId !== null;
    if (regionId === null && canWrite) return refuse(`region code ${REGION_CODE} not found in regions (a region id is never guessed)`);
  } else {
    summary.checks.skipped = "no DB creds: data_sources, regions and existing-row checks were not run";
  }

  const rated = await resolveSource({ url: SOURCE_URL, name: SOURCE_NAME }, { mode: canWrite ? "apply" : "dry", registerSourceFn: deps.registerSourceFn, hostVerdicts: deps.hostVerdicts });
  summary.source = rated.ok ? { ok: true, tier: rated.tier, source_id: rated.source_id } : { ok: false, reason: rated.reason };
  if (!rated.ok) return refuse(rated.reason);

  const existing = hasCreds
    ? (await deps.readAllFn(TABLE, ENVELOPE_SELECT, { match: (qb) => qb.eq("source_key", SOURCE_KEY) }))
        .map((r) => ({ ...r, region_code: idToCode.get(r.region_id) ?? null }))
    : [];
  const plan = planUpsert(existing, candidates);
  summary.plan = { insert: plan.toInsert.length, update: plan.toUpdate.length, unchanged: plan.unchanged };
  if (!canWrite) return summary;

  for (const row of plan.toInsert) {
    const { region_code: _code, ...rest } = row; // the table stores region_id; region_code is the caller-facing key
    await deps.guardedInsertFn("regional_data_facts", { ...rest, region_id: regionId, source_id: rated.source_id }, { cite: CITE });
    summary.applied.inserted += 1;
  }
  for (const { id, patch } of plan.toUpdate) {
    const res = await deps.guardedUpdateFn("regional_data_facts", (qb) => qb.eq("id", id), { ...patch, source_id: rated.source_id }, { cite: CITE });
    summary.applied.updated += res?.updated ?? 1;
  }
  return summary;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`neso-carbon-intensity: fetch failed ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function main() {
  loadLocalEnvFile();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const inputIdx = args.indexOf("--input");
  const inputText = inputIdx >= 0 ? readFileSync(args[inputIdx + 1], "utf8") : null;
  const hasCreds = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let s;
  try {
    s = await runNesoCarbonIntensity(
      { apply, inputText, enabled: ENABLED, killSwitchOn: process.env[KILL_SWITCH_ENV] === "1" },
      { fetchText, hasCreds, readAllFn: readAll, registerSourceFn: registerSource, guardedInsertFn: guardedInsert, guardedUpdateFn: guardedUpdate },
    );
  } catch (err) {
    console.error(`${PRODUCER_NAME}: ${err.message}`);
    writeProducerSummary({ producer: PRODUCER_NAME, status: "failed", rows_changed: 0, edges_authored: null, reason: err.message });
    process.exit(3);
  }
  const tag = apply ? "" : " (DRY RUN)";
  console.log(`${PRODUCER_NAME}: parsed ${s.parsed} period(s), ${s.warnings.length} warning(s)${tag}`);
  for (const w of s.warnings) console.warn(`[parse] ${w}`);
  if (s.refused) {
    console.error(`${PRODUCER_NAME}: ${s.refused} (exit 1).`);
    writeProducerSummary({ producer: PRODUCER_NAME, status: "failed", rows_changed: 0, edges_authored: null, reason: s.refused, counts: s });
    process.exit(1);
  }
  console.log(`${PRODUCER_NAME}: ${s.candidates} current-state candidate row(s) for ${REGION_CODE} / ${DIMENSION}`);
  console.log(`${PRODUCER_NAME}: source ${SOURCE_NAME} rated tier ${s.source.tier} by the institution class table (source_id ${s.source.source_id})`);
  for (const [k, v] of Object.entries(s.checks)) console.log(`${PRODUCER_NAME}: check ${k} = ${v}`);
  console.log(`${PRODUCER_NAME}: plan, insert ${s.plan.insert}, update ${s.plan.update}, unchanged ${s.plan.unchanged}${tag}`);
  if (!apply) console.log(`DRY RUN, nothing written (${s.reason}).`);
  else console.log(`done, ${s.applied.inserted} inserted, ${s.applied.updated} updated.`);
  writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: s.applied.inserted + s.applied.updated, edges_authored: null, counts: s });
}

if (isMainModule(import.meta.url)) await main();
