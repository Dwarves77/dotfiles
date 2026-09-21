// statutory-rows.ts, the ONE pure home for statutory-rows-file logic (lane M7a FIX, 2026-09-21).
//
// WHY THIS FILE EXISTS. `POST /api/admin/statutory-rows` traced at 252.76 MB uncompressed, over Vercel's
// 250 MB function-size limit. MEASURED CAUSE (not hypothesis): the route's logic.mjs imported parseRow/
// writeOneRow from `scripts/propagation/write-statutory.mjs`, which imports `scripts/lib/db.mjs` for
// `guardedInsert`/`readAll`. db.mjs's own guarded-write path computes its snapshot directory from
// `import.meta.url` (`snapDir()` -> `resolve(dirname(...), "..", "_snapshots")`) and writes run-artifact
// JSON there on every write (`appendFileSync`). Because that path is STATICALLY resolvable at build time
// (it does not depend on any runtime argument), Next's output-file tracer (@vercel/nft) walked it and
// pulled the ENTIRE `fsi-app/scripts/_snapshots/` directory, hundreds of MB of historical population-run
// JSON artifacts, into this one route's traced function, even though the route never calls guardedInsert
// with a real snapshot in the request path that matters. Importing ANYTHING from db.mjs drags in the
// WHOLE FILE's static fs surface for nft's analysis, not just the one export used.
//
// THE FIX. This module contains every PURE function the route (and the CLI scripts) actually need: rows-
// file validation, row parsing, and the single-row write/mint logic, none of which do file I/O of their
// own. It imports NOTHING from `scripts/lib/db.mjs` or `scripts/lib/env-file.mjs`, no node:fs, no
// node:path, no process.cwd(), no dynamic path building anywhere in this file. `writeOneRow` and
// `resolveOrMintEntity` take an injected Supabase client (`sb`) and, by default, issue a PLAIN insert
// through it (no snapshot side effect), the caller (the CLI script, which legitimately wants the
// snapshot/cite discipline for a real `--apply` run) can still inject `scripts/lib/db.mjs`'s
// `guardedInsert`/`readAll` as `deps.insertFn`/`deps.readAllFn`, exactly as before. The calling
// CONVENTION (`insertFn(table, row, opts)`, `readAllFn(table, columns, opts)`) is unchanged, so every
// existing test that already injects fakes for these deps keeps passing unmodified.
//
// `scripts/propagation/write-statutory.mjs` and `scripts/propagation/validate-statutory-rows-file.mjs`
// now IMPORT from this module and add only their CLI concerns (args, file reading, env loading, client
// creation, guarded/fs-backed defaults for a real apply run). Neither script re-implements row parsing,
// row validation, or the write itself, this file is the one place either.

import { entityId } from "../entities/entity-id.mjs";
import { computeStatutory, FUELEU_STATUTE_CITATION, FUELEU_FORMULA_VERSION } from "../statutory/types.ts";
import { FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE } from "../statutory/fueleu-annex-iv.mjs";
import { admissibleFor } from "./admissible-for.ts";
import { classTierForHost } from "../sources/host-authority.ts";
import { hostFromUrl } from "../entities/host-from-url.mjs";

// ── Constants (Article 4(2), verified live against EUR-Lex CELEX:32023R1805, see write-statutory.mjs's
// original header for the full verification note) ──────────────────────────────────────────────────────

export const FORMULA_ID = "fueleu_annex_iv_penalty";
export const DEFAULT_OBLIGATION_SEED = "fueleu-maritime-annex-iv-penalty";
export const FUELEU_REFERENCE_GCO2E_PER_MJ = 91.16;
export const SUPPORTED_TARGET_YEARS = Object.freeze({
  2025: FUELEU_REFERENCE_GCO2E_PER_MJ * (1 - 0.02), // 89.3368, commonly cited rounded as 89.34
});
export const ARTICLE_4_2_CITATION =
  "Regulation (EU) 2023/1805, Article 4(2) (reference value 91.16 gCO2eq/MJ, reduced 2% from 1 January " +
  "2025) and recital 23 (2020 fleet-average baseline, Regulation (EU) 2015/757 MRV data). Verified against " +
  "EUR-Lex CELEX:32023R1805 on 2026-09-04 (lane DAG-AUTHOR, WebFetch).";

// ── Rows-file validation (the production-apply gate; moved from validate-statutory-rows-file.mjs) ───────

const PLACEHOLDER_MARKERS = /\b(FIXTURE|SYNTHETIC|PLACEHOLDER|TODO|TBD|EXAMPLE ONLY)\b/i;
const REQUIRED_SOURCE_FIELDS = ["url", "article", "quote", "verified_at"];
const REQUIRED_INPUT_KEYS = ["ghgIntensityActual", "energyUsedMJ", "consecutiveDeficitYears"];

/** Validate one StatutoryInput's `source` block. Returns a list of violation strings (empty = passes). */
export function validateSourceBlock(source: any, where: string): string[] {
  const violations: string[] = [];
  if (!source || typeof source !== "object") {
    violations.push(`${where}: missing a \`source\` block ({url, article, quote, verified_at}), refused, not guessed (rule 18).`);
    return violations;
  }
  for (const field of REQUIRED_SOURCE_FIELDS) {
    if (typeof source[field] !== "string" || !source[field].trim()) {
      violations.push(`${where}.source.${field} is required and must be a non-empty string.`);
    }
  }
  if (typeof source.url === "string" && source.url.trim()) {
    // hostFromUrl (the entity spine's ONE host normalizer, F30 url_host_derivation) returns "" for
    // anything it can't parse, rather than throwing. An empty host here means the URL was invalid.
    const host = hostFromUrl(source.url);
    if (!host) {
      violations.push(`${where}.source.url is not a valid absolute URL: "${source.url}"`);
    }
    if (host) {
      const tier = classTierForHost(host);
      if (tier == null) {
        violations.push(
          `${where}.source.url's host "${host}" does not resolve to a codified class in ` +
          `src/lib/sources/host-authority.ts (classTierForHost), an ambiguous host is worklisted, ` +
          `never guessed a tier (SC-13). A real EU statutory source should resolve to eur-lex.europa.eu ` +
          `(T1) or a europa.eu/gov host (T2, e.g. EMSA's mrv.emsa.europa.eu).`
        );
      }
    }
  }
  return violations;
}

/** Validate one rows-file row (already write-statutory.mjs parseRow()-shaped or raw). Returns violations. */
export function validateRow(row: any, index: number): string[] {
  const violations: string[] = [];
  const shipKey = String(row?.shipKey ?? `row[${index}]`);
  if (PLACEHOLDER_MARKERS.test(shipKey)) {
    violations.push(`row[${index}] (${shipKey}): shipKey itself carries a placeholder marker, not a real ship key.`);
  }
  for (const key of REQUIRED_INPUT_KEYS) {
    const input = row?.[key];
    const where = `row[${index}] (${shipKey}).${key}`;
    if (!input || typeof input !== "object") {
      violations.push(`${where}: missing.`);
      continue;
    }
    if (typeof input.citation === "string" && PLACEHOLDER_MARKERS.test(input.citation)) {
      violations.push(`${where}.citation carries a placeholder marker ("${input.citation.slice(0, 80)}..."), a real filing's citation names the real source, never a fixture disclaimer.`);
    }
    violations.push(...validateSourceBlock(input.source, where));
  }
  return violations;
}

/** Validate a whole loaded rows-file object ({_file_status?, rows: [...]}). Returns violations. */
export function validateRowsFile(parsed: any): string[] {
  const violations: string[] = [];
  if (typeof parsed?._file_status === "string" && PLACEHOLDER_MARKERS.test(parsed._file_status)) {
    violations.push(`_file_status carries a placeholder marker, this file self-identifies as non-production ("${parsed._file_status.slice(0, 120)}...").`);
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows) || !rows.length) {
    violations.push("no rows[] array (or empty), refusing to validate an empty file as apply-ready.");
    return violations;
  }
  rows.forEach((row: any, i: number) => violations.push(...validateRow(row, i)));
  return violations;
}

// ── Row parsing + single-row write (moved from write-statutory.mjs) ──────────────────────────────────────

function requireFields(row: any, fields: string[], where: string) {
  const missing = fields.filter((f) => row?.[f] === undefined || row?.[f] === null);
  if (missing.length) throw new Error(`${where}: missing required field(s): ${missing.join(", ")}`);
}

/** Build a types.ts `Value`-shaped object from a rows-file input block, for admissibleFor() to check ,
 *  the ONLY reason this shape exists: admissibleFor() takes a `Value`, and a reader-asserted number with
 *  no backing `derived_values` row still needs one to be gated the same way a computed one would be. */
function toValueShape(input: any, { methodId }: { methodId: string }) {
  return {
    valueId: null,
    entityId: null,
    methodId,
    methodVersion: "n/a",
    value: input.value,
    valueLow: null,
    valueHigh: null,
    unit: input.unit ?? null,
    currency: null,
    derivation: input.derivation,
    originClass: input.originClass,
    lifecycle: input.lifecycle,
    admissibility: input.admissibility,
    baseConfidence: input.baseConfidence,
    assertedAt: input.asOf.eventDate,
    halfLifeDays: input.halfLifeDays ?? null,
    inputs: [],
    supersedes: null,
    computedAt: input.asOf.eventDate,
    computedBy: "rows-file",
    obsStatus: input.obsStatus ?? null,
  };
}

/** Plain, fs-free insert used as the DEFAULT for resolveOrMintEntity/writeOneRow below, a caller that
 *  wants the guarded/snapshot/cite discipline (a real `--apply` CLI run) injects
 *  `scripts/lib/db.mjs`'s `guardedInsert` via `deps.insertFn` instead. Same calling convention
 *  (`table, row, opts`) as guardedInsert, so swapping the default in or out never changes call sites. */
function plainInsert(sb: any) {
  return async (table: string, row: any, opts: { select?: string } = {}) => {
    const res = await sb.from(table).insert(row).select(opts.select ?? "*").single();
    if (res.error) throw new Error(`statutory-rows plainInsert(${table}) failed: ${res.error.message}`);
    return { inserted: res.data };
  };
}

/** Plain, fs-free full-table read used as the DEFAULT readAllFn below, a caller that wants the paginated/
 *  retried `scripts/lib/db.mjs` readAll (needed once the row set can exceed ~1000) injects it explicitly. */
async function plainReadAll(sb: any, table: string, columns: string, match: (qb: any) => any) {
  const q = match(sb.from(table).select(columns));
  const res = await q;
  if (res.error) throw new Error(`statutory-rows plainReadAll(${table}) failed: ${res.error.message}`);
  return res.data || [];
}

/** Resolve (or, in apply mode, mint) an entity id for (kind, seed). Mirrors resolveRegionEntityId's
 *  mint-on-demand posture but generalized to any kind. --dry never mints, a pure preview of the id apply
 *  WOULD mint. */
export async function resolveOrMintEntity(
  sb: any,
  { kind, seed, canonicalName }: { kind: string; seed: string; canonicalName?: string },
  mode: "dry" | "apply",
  deps: { insertFn?: (table: string, row: any, opts?: any) => Promise<any> } = {}
): Promise<string> {
  const insertFn = deps.insertFn ?? plainInsert(sb);
  const id = entityId(kind, seed);
  const { data, error } = await sb.from("entities").select("entity_id").eq("entity_id", id).maybeSingle();
  if (error) throw new Error(`resolveOrMintEntity: entities read failed: ${error.message}`);
  if (data) return id;
  if (mode !== "apply") return id; // dry: preview only, no write
  await insertFn("entities", { entity_id: id, kind, canonical_name: canonicalName ?? seed }, { select: "entity_id" });
  return id;
}

/** Validate + normalize one rows-file row into everything writeOneRow needs, throwing (never guessing) on
 *  a structural problem. PURE. */
export function parseRow(row: any, index: number) {
  requireFields(row, ["shipKey", "targetYear", "ghgIntensityActual", "energyUsedMJ", "consecutiveDeficitYears"], `write-statutory: row[${index}]`);
  if (!Object.prototype.hasOwnProperty.call(SUPPORTED_TARGET_YEARS, String(row.targetYear))) {
    throw new Error(
      `write-statutory: row[${index}] (ship ${row.shipKey}) targetYear=${row.targetYear} is not implemented, ` +
      `only ${Object.keys(SUPPORTED_TARGET_YEARS).join(", ")} confirmed against EUR-Lex this session (see file header). Refused, not guessed.`
    );
  }
  for (const key of ["ghgIntensityActual", "energyUsedMJ", "consecutiveDeficitYears"]) {
    const v = row[key];
    requireFields(v, ["value", "unit", "citation", "asOf", "derivation", "originClass", "lifecycle", "admissibility", "baseConfidence"], `write-statutory: row[${index}].${key}`);
    requireFields(v.asOf, ["eventDate"], `write-statutory: row[${index}].${key}.asOf`);
  }
  return {
    shipKey: String(row.shipKey),
    scenarioKey: row.scenarioKey ? String(row.scenarioKey) : "default",
    obligationSeed: row.obligationSeed ? String(row.obligationSeed) : DEFAULT_OBLIGATION_SEED,
    targetYear: row.targetYear,
    ghgIntensityActual: row.ghgIntensityActual,
    energyUsedMJ: row.energyUsedMJ,
    consecutiveDeficitYears: row.consecutiveDeficitYears,
  };
}

/**
 * Write ONE statutory_computations row for one parsed rows-file entry. Never throws for a business-level
 * refusal (unadmissible input, already-computed, purity-trigger rejection), every outcome is returned by
 * name; only a structural/DB error not anticipated by any of those paths propagates.
 */
export async function writeOneRow(
  sb: any,
  parsed: ReturnType<typeof parseRow>,
  mode: "dry" | "apply",
  deps: {
    now?: () => Date;
    insertFn?: (table: string, row: any, opts?: any) => Promise<any>;
    resolveEntityFn?: typeof resolveOrMintEntity;
    readAllFn?: (table: string, columns: string, opts?: any) => Promise<any[]>;
  } = {}
): Promise<any> {
  const now = (deps.now ?? (() => new Date()))();
  const insertFn = deps.insertFn ?? plainInsert(sb);
  const resolveEntityFn = deps.resolveEntityFn ?? resolveOrMintEntity;
  const readAllFn = deps.readAllFn ?? ((table: string, columns: string, opts: any = {}) => plainReadAll(sb, table, columns, opts.match ?? ((q: any) => q)));

  const targetValue = toValueShape(
    { value: (SUPPORTED_TARGET_YEARS as any)[String(parsed.targetYear)], unit: "gCO2eq/MJ", derivation: "statutory_fixed", originClass: "official", lifecycle: "verified", admissibility: "filing_ok", baseConfidence: 1, halfLifeDays: null, asOf: { eventDate: "2023-09-22" } },
    { methodId: FORMULA_ID }
  );
  const actualValue = toValueShape(parsed.ghgIntensityActual, { methodId: FORMULA_ID });
  const energyValue = toValueShape(parsed.energyUsedMJ, { methodId: FORMULA_ID });
  const yearsValue = toValueShape(parsed.consecutiveDeficitYears, { methodId: FORMULA_ID });

  for (const [label, v] of [["ghgIntensityTarget", targetValue], ["ghgIntensityActual", actualValue], ["energyUsedMJ", energyValue], ["consecutiveDeficitYears", yearsValue]] as const) {
    const verdict = admissibleFor(v as any, "filing", now);
    if (!verdict.ok) return { action: "refused-inadmissible", field: label, reason: (verdict as any).reason, shipKey: parsed.shipKey };
  }

  const result = computeStatutory(FORMULA_ID, {
    ghgIntensityTarget: { derivation: "statutory_fixed" as any, value: targetValue.value, unit: targetValue.unit, citation: ARTICLE_4_2_CITATION, asOf: { eventDate: "2023-09-22" } },
    ghgIntensityActual: { derivation: parsed.ghgIntensityActual.derivation, value: parsed.ghgIntensityActual.value, unit: parsed.ghgIntensityActual.unit, citation: parsed.ghgIntensityActual.citation, asOf: parsed.ghgIntensityActual.asOf },
    energyUsed: { derivation: parsed.energyUsedMJ.derivation, value: parsed.energyUsedMJ.value, unit: parsed.energyUsedMJ.unit, citation: parsed.energyUsedMJ.citation, asOf: parsed.energyUsedMJ.asOf },
    consecutiveYears: { derivation: parsed.consecutiveDeficitYears.derivation, value: parsed.consecutiveDeficitYears.value, unit: parsed.consecutiveDeficitYears.unit, citation: parsed.consecutiveDeficitYears.citation, asOf: parsed.consecutiveDeficitYears.asOf },
  } as any);

  const entity_id = await resolveEntityFn(sb, { kind: "asset", seed: parsed.shipKey, canonicalName: parsed.shipKey }, mode, { insertFn });
  const obligation_id = await resolveEntityFn(sb, { kind: "obligation", seed: parsed.obligationSeed, canonicalName: "FuelEU Maritime Annex IV penalty obligation" }, mode, { insertFn });

  const existing = await readAllFn("statutory_computations", "computation_id", {
    match: (qb: any) => qb.eq("entity_id", entity_id).eq("formula_id", FORMULA_ID).eq("formula_version", FUELEU_FORMULA_VERSION).eq("scenario_key", parsed.scenarioKey),
    orderBy: "computation_id",
  });
  if (existing.length) return { action: "skipped-already-computed", shipKey: parsed.shipKey, computationId: existing[0].computation_id };

  if (mode !== "apply") return { action: "would-write", shipKey: parsed.shipKey, entity_id, obligation_id, resultEur: result.result };

  const row = {
    entity_id,
    scenario_key: parsed.scenarioKey,
    obligation_id,
    formula_id: FORMULA_ID,
    formula_version: FUELEU_FORMULA_VERSION,
    statute_citation: FUELEU_STATUTE_CITATION,
    unit_price: FUELEU_UNIT_PRICE_EUR_PER_T_VLSFOE,
    unit_price_unit: "EUR/t_VLSFOe",
    inputs: [
      { table: "reported:ghg_intensity_target", pk: parsed.shipKey, version: ARTICLE_4_2_CITATION },
      { table: "reported:ghg_intensity_actual", pk: parsed.shipKey, version: parsed.ghgIntensityActual.citation },
      { table: "reported:energy_used_mj", pk: parsed.shipKey, version: parsed.energyUsedMJ.citation },
      { table: "reported:consecutive_deficit_years", pk: parsed.shipKey, version: parsed.consecutiveDeficitYears.citation },
    ],
    result: result.result,
    result_unit: result.resultUnit,
  };
  try {
    const res = await insertFn("statutory_computations", row, { select: "computation_id" });
    return { action: "written", shipKey: parsed.shipKey, computationId: res.inserted.computation_id, resultEur: result.result };
  } catch (e: any) {
    return { action: "errored", shipKey: parsed.shipKey, reason: e.message };
  }
}
