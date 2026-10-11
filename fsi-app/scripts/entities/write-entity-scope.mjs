#!/usr/bin/env node

import { entityId } from "../../src/lib/entities/entity-id.mjs";
import { planJurisdictionEntities } from "./backfill-entities.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

export const RELATION_CORRIDOR_JURISDICTION = "touches_jurisdiction";
export const ATTRIBUTED_BY = "rule:corridor-jurisdiction-unlocode-v1";

export const CITE = Object.freeze({
  skill: "entity-scope-writer",
  reason:
    "Lane CORRIDORS-STATUTORY (2026-09-05): the entity_scope writer (docs/specs/08-flywheel-design.md " +
    "§1.2), first relation built — corridor entities scoped to their origin/destination jurisdiction " +
    "entities, derived deterministically from the UN/LOCODE-prefix-is-ISO-3166-1 convention already " +
    "required of every corridor seed (ADR-024 §4).",
});

// Mirrors seed-corridors.mjs's own convention regex (the shape corridorSeed() itself produces), so this
// module can never accept a canonical_name seed-corridors.mjs would not have written.
const CORRIDOR_NAME_RE = /^([A-Z]{2}[A-Z2-9]{3})-([A-Z]{2}[A-Z2-9]{3}):([a-z_]+)$/;

/** Parse a corridor entity's canonical_name ("ORIGIN-DEST:mode") back into its parts. Pure. Returns
 *  {origin, dest, mode} or null on anything that does not match seed-corridors.mjs's own convention —
 *  never guesses at a malformed or foreign-shaped canonical_name. */
export function parseCorridorCanonicalName(name) {
  const m = String(name ?? "").match(CORRIDOR_NAME_RE);
  if (!m) return null;
  const [, origin, dest, mode] = m;
  return { origin, dest, mode };
}

/**
 * Derive the (corridor entity, jurisdiction ISO code) pairs every live corridor entity implies, plus the
 * distinct ISO code list `planJurisdictionEntities()` needs. Pure.
 * `corridors` is [{entity_id, canonical_name}] (a live `entities WHERE kind='corridor'` read).
 * Returns { isoCodes, pairs, skipped } — `pairs` is [{corridorEntityId, iso}], deduped per
 * (corridor, iso) so a corridor whose origin and dest share a country (e.g. two US ports) yields ONE
 * pair, not two identical ones. `skipped` names every corridor row this function could not parse, with a
 * reason, so a dry run's report is honest about what it read versus what it used.
 */
export function deriveCorridorJurisdictionCodes(corridors) {
  const isoSet = new Set();
  const pairKeys = new Set();
  const pairs = [];
  const skipped = [];
  for (const c of corridors ?? []) {
    const parsed = parseCorridorCanonicalName(c?.canonical_name);
    if (!parsed) {
      skipped.push({ entity_id: c?.entity_id, canonical_name: c?.canonical_name, reason: "canonical_name does not match seed-corridors.mjs's ORIGIN-DEST:mode convention" });
      continue;
    }
    for (const locode of [parsed.origin, parsed.dest]) {
      const iso = locode.slice(0, 2); // UN/ECE Rec 16 §I.4.b — see file header.
      isoSet.add(iso);
      const key = `${c.entity_id}|${iso}`;
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      pairs.push({ corridorEntityId: c.entity_id, iso });
    }
  }
  return { isoCodes: [...isoSet].sort(), pairs, skipped };
}

/**
 * Plan `entity_scope` rows for the derived (corridor, jurisdiction) pairs. Pure.
 * `byCode` is the Map<isoCode, jurisdictionEntityId> `planJurisdictionEntities()` returns.
 * `existingScopeKeys` is a Set<"subject_id|scope_id|relation"> from a live `entity_scope` read.
 * Returns { rows, skipped } — `rows` is ready for `guardedInsertMany("entity_scope", rows, ...)`.
 */
export function planCorridorJurisdictionScope(pairs, byCode, existingScopeKeys = new Set()) {
  const rows = [];
  const skipped = [];
  for (const { corridorEntityId, iso } of pairs ?? []) {
    const scope_id = byCode.get(iso) ?? entityId("jurisdiction", iso);
    const key = `${corridorEntityId}|${scope_id}|${RELATION_CORRIDOR_JURISDICTION}`;
    if (existingScopeKeys.has(key)) {
      skipped.push({ corridorEntityId, scope_id, reason: "already scoped" });
      continue;
    }
    existingScopeKeys.add(key); // guard against the same pair appearing twice in one derived list
    rows.push({
      subject_id: corridorEntityId,
      scope_id,
      relation: RELATION_CORRIDOR_JURISDICTION,
      confidence: 1.0,
      attributed_to: ATTRIBUTED_BY,
    });
  }
  return { rows, skipped };
}

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{ readAll: Function, guardedInsertMany: Function }} deps
 */
export async function main({ mode = "dry" } = {}, deps = {}) {
  const apply = mode === "apply";
  const { readAll: readAllFn, guardedInsertMany: insertFn } = deps;
  console.log(`[write-entity-scope] mode = ${apply ? "APPLY" : "DRY-RUN (default)"}`);

  const corridors = await readAllFn("entities", "entity_id,canonical_name", {
    match: (q) => q.eq("kind", "corridor"),
    orderBy: "entity_id",
  });
  const { isoCodes, pairs, skipped: parseSkipped } = deriveCorridorJurisdictionCodes(corridors);

  const [existingJurisdictionRows, existingIdentifierRows, existingScopeRows] = await Promise.all([
    readAllFn("entities", "entity_id", { match: (q) => q.eq("kind", "jurisdiction"), orderBy: "entity_id" }),
    readAllFn("entity_identifiers", "entity_id,scheme,value", { orderBy: "entity_id" }),
    readAllFn("entity_scope", "subject_id,scope_id,relation", { orderBy: "subject_id" }),
  ]);
  const existingEntityIds = new Set(existingJurisdictionRows.map((r) => r.entity_id));
  const existingIdentifierKeys = new Set(existingIdentifierRows.map((r) => `${r.entity_id}|${r.scheme}|${r.value}`));
  const existingScopeKeys = new Set(existingScopeRows.map((r) => `${r.subject_id}|${r.scope_id}|${r.relation}`));

  const { entities: jurisdictionEntities, identifiers: jurisdictionIdentifiers, byCode } =
    planJurisdictionEntities(isoCodes, existingEntityIds, existingIdentifierKeys);
  const { rows: scopeRows, skipped: scopeSkipped } = planCorridorJurisdictionScope(pairs, byCode, existingScopeKeys);

  console.log(
    `[write-entity-scope] corridors read: ${corridors.length}; parse-skipped: ${parseSkipped.length}; ` +
    `distinct jurisdiction codes: ${isoCodes.length} (new jurisdiction entities: ${jurisdictionEntities.length}); ` +
    `entity_scope rows to write: ${scopeRows.length} (already-scoped: ${scopeSkipped.length})`,
  );
  for (const s of parseSkipped) {
    console.error(`[write-entity-scope] SKIPPED corridor ${s.entity_id} (${JSON.stringify(s.canonical_name)}): ${s.reason}`);
  }

  if (apply) {
    if (jurisdictionEntities.length) await insertFn("entities", jurisdictionEntities, { cite: CITE, select: "entity_id" });
    if (jurisdictionIdentifiers.length) await insertFn("entity_identifiers", jurisdictionIdentifiers, { cite: CITE, select: "entity_id" });
    if (scopeRows.length) await insertFn("entity_scope", scopeRows, { cite: CITE, select: "subject_id" });
    console.log(`[write-entity-scope] applied: ${jurisdictionEntities.length} jurisdiction entit${jurisdictionEntities.length === 1 ? "y" : "ies"}, ${scopeRows.length} entity_scope row(s).`);
  } else {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
  }

  return {
    mode: apply ? "apply" : "dry-run",
    corridorsRead: corridors.length,
    parseSkipped: parseSkipped.length,
    jurisdictionCodes: isoCodes.length,
    jurisdictionEntitiesCreated: jurisdictionEntities.length,
    scopeRowsPlanned: scopeRows.length,
    scopeRowsWritten: apply ? scopeRows.length : 0,
    scopeAlreadyExisting: scopeSkipped.length,
  };
}

function loadEnv() {
  loadLocalEnvFile();
}

if (isMainModule(import.meta.url)) {
  (async () => {
    await loadEnv();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[write-entity-scope] no DB creds — cannot run here (exit 2).");
      process.exit(2);
    }
    const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
    const apply = process.argv.slice(2).includes("--apply");
    try {
      await main({ mode: apply ? "apply" : "dry" }, { readAll, guardedInsertMany });
      process.exit(0);
    } catch (e) {
      console.error("[write-entity-scope] FATAL:", e);
      process.exit(1);
    }
  })();
}
