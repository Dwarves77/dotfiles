#!/usr/bin/env node

import { readAll, guardedInsertMany, guardedUpdate } from "../lib/db.mjs";
import { entityId, hostFromUrl } from "../../src/lib/entities/entity-id.mjs";
import { identifierRow } from "../../src/lib/entities/crosswalk.mjs";
// The jurisdiction/instrument planners MOVED to src/lib/entities/entity-plan.mjs (lane W9 part 1, task
// 1.1, 2026-09-11) so mint-item.ts's rule-16(e) writer (link-item-entities.mjs) and this backfill share
// ONE planner instead of two hand-copied implementations. Re-exported here, verbatim names, so every
// existing importer of this module (this file's own test, main() below) is unchanged.
export { planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates } from "../../src/lib/entities/entity-plan.mjs";
import { planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates } from "../../src/lib/entities/entity-plan.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";

const ASSERTED_BY = "scripts/entities/backfill-entities.mjs";
const CITE = {
  skill: "remediation-discipline",
  reason: "Lane DP-SPINE: populate the entity spine (migration 282/283) from jurisdiction_iso, canonical_instrument_key, and sources.url already live in the corpus — the spec 08 §1 build this ADR-024 backfill executes.",
};

// ── pure planning functions (no DB — unit-tested directly in backfill-entities.test.mjs) ──────────────

/** Distinct, trimmed, uppercased values from a list of raw strings — shared by the jurisdiction (ISO
 *  code) and instrument (canonical_instrument_key) planners, since both want the same normalization:
 *  drop blanks, dedupe, uppercase, sort for stable output ordering. */
export function distinctNormalized(rawValues) {
  const seen = new Set();
  for (const raw of rawValues) {
    const v = String(raw ?? "").trim();
    if (v) seen.add(v.toUpperCase());
  }
  return [...seen].sort();
}

// planJurisdictionEntities, planJurisdictionRefs, planInstrumentEntities, planInstrumentFkUpdates MOVED
// to src/lib/entities/entity-plan.mjs (see the re-export + import at the top of this file); this is
// where they used to live (spec section 1.1/section 1.2, migration 282/283); read that module's own header for why.

/** Plan organisation entities + HOST crosswalk identifiers for a set of source URLs. Same shape as the
 *  jurisdiction/instrument planners; `byHost` maps the registrable host to its entity_id. */
export function planOrganisationEntities(urls, existingEntityIds = new Set(), existingIdentifierKeys = new Set()) {
  const entities = [];
  const identifiers = [];
  const byHost = new Map();
  for (const url of urls) {
    const host = hostFromUrl(url);
    if (!host || byHost.has(host)) continue;
    const id = entityId("organisation", host);
    byHost.set(host, id);
    if (!existingEntityIds.has(id)) {
      entities.push({ entity_id: id, kind: "organisation", canonical_name: host, status: "active" });
    }
    const idKey = `${id}|HOST|${host}`;
    if (!existingIdentifierKeys.has(idKey)) identifiers.push(identifierRow(id, "HOST", host, ASSERTED_BY));
  }
  return { entities, identifiers, byHost };
}

/** Plan organisation_entity_id updates for sources rows. `sources` is [{id, url}]. */
export function planOrganisationFkUpdates(sources, byHost) {
  const updates = [];
  for (const s of sources) {
    const host = hostFromUrl(s.url);
    if (!host) continue;
    const entity_id = byHost.get(host);
    if (entity_id) updates.push({ id: s.id, organisation_entity_id: entity_id });
  }
  return updates;
}

// ── orchestration (DB reads/writes) ─────────────────────────────────────────────────────────────────

function loadEnv() {
  loadLocalEnvFile();
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const kinds = new Set();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kind" && argv[i + 1]) kinds.add(argv[i + 1]);
  }
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx !== -1 && argv[limitIdx + 1] ? Number(argv[limitIdx + 1]) : null;
  return { apply, dry: !apply, kinds: kinds.size ? kinds : new Set(["jurisdiction", "instrument", "organisation"]), limit };
}

function capRows(rows, limit) {
  return limit ? rows.slice(0, limit) : rows;
}

export async function existingEntityIdSet() {
  const rows = await readAll("entities", "entity_id", { orderBy: "entity_id" }); // PK is entity_id, not id (found by propagation-drain run 33627113501)
  return new Set(rows.map((r) => r.entity_id));
}
export async function existingIdentifierKeySet() {
  const rows = await readAll("entity_identifiers", "entity_id,scheme,value", { orderBy: "entity_id" });
  return new Set(rows.map((r) => `${r.entity_id}|${r.scheme}|${r.value}`));
}
export async function existingRefKeySet() {
  const rows = await readAll("entity_refs", "ref_table,ref_id,entity_id,role", { orderBy: "entity_id" });
  return new Set(rows.map((r) => `${r.ref_table}|${r.ref_id}|${r.entity_id}|${r.role}`));
}

export async function runJurisdiction({ apply, limit }, existingEntityIds, existingIdentifierKeys) {
  const items = capRows(await readAll("intelligence_items", "id,jurisdiction_iso"), limit);
  const regions = capRows(await readAll("regions", "id,iso_codes"), limit);

  const allCodes = distinctNormalized([
    ...items.flatMap((r) => r.jurisdiction_iso || []),
    ...regions.flatMap((r) => r.iso_codes || []),
  ]);
  const { entities, identifiers, byCode } = planJurisdictionEntities(allCodes, existingEntityIds, existingIdentifierKeys, ASSERTED_BY);

  const existingRefKeys = await existingRefKeySet();
  const itemRefs = planJurisdictionRefs("intelligence_items", items, byCode, existingRefKeys, ASSERTED_BY);
  const regionRefs = planJurisdictionRefs("regions", regions, byCode, existingRefKeys, ASSERTED_BY);
  const refs = [...itemRefs, ...regionRefs];

  console.log(`[jurisdiction] distinct codes: ${allCodes.length}; would_create entities: ${entities.length}; existing entities: ${allCodes.length - entities.length}; identifiers to add: ${identifiers.length}; refs to add: ${refs.length} (items ${itemRefs.length} + regions ${regionRefs.length})`);

  if (apply) {
    if (entities.length) await guardedInsertMany("entities", entities, { cite: CITE, select: "entity_id" });
    if (identifiers.length) await guardedInsertMany("entity_identifiers", identifiers, { cite: CITE, select: "entity_id" });
    if (refs.length) await guardedInsertMany("entity_refs", refs, { cite: CITE, select: "entity_id" });
  }
  return { created: entities.length, existing: allCodes.length - entities.length, identifiers: identifiers.length, refs: refs.length };
}

export async function runInstrument({ apply, limit }, existingEntityIds, existingIdentifierKeys) {
  const items = capRows(
    await readAll("intelligence_items", "id,canonical_instrument_key,instrument_entity_id", {
      match: (q) => q.not("canonical_instrument_key", "is", null),
    }),
    limit,
  );
  const distinctKeys = distinctNormalized(items.map((r) => r.canonical_instrument_key));
  const { entities, identifiers, byKey } = planInstrumentEntities(distinctKeys, existingEntityIds, existingIdentifierKeys, ASSERTED_BY);

  const needsFk = items.filter((r) => !r.instrument_entity_id);
  const updates = planInstrumentFkUpdates(needsFk, byKey);

  console.log(`[instrument] distinct canonical_instrument_key values: ${distinctKeys.length}; would_create entities: ${entities.length}; existing entities: ${distinctKeys.length - entities.length}; identifiers to add: ${identifiers.length}; FK updates: ${updates.length} (of ${items.length} keyed rows, ${items.length - needsFk.length} already linked)`);

  if (apply) {
    if (entities.length) await guardedInsertMany("entities", entities, { cite: CITE, select: "entity_id" });
    if (identifiers.length) await guardedInsertMany("entity_identifiers", identifiers, { cite: CITE, select: "entity_id" });
    let ok = 0, fail = 0;
    for (const u of updates) {
      try {
        await guardedUpdate("intelligence_items", (qb) => qb.eq("id", u.id), { instrument_entity_id: u.instrument_entity_id }, { cite: CITE, select: "id" });
        ok++;
      } catch (e) {
        fail++;
        console.error(`[instrument] FK update FAILED for item ${u.id}: ${e.message}`);
      }
    }
    console.log(`[instrument] FK updates applied: ${ok}${fail ? ` (${fail} FAILURES — see above)` : ""}`);
  }
  return { created: entities.length, existing: distinctKeys.length - entities.length, identifiers: identifiers.length, refs: updates.length };
}

export async function runOrganisation({ apply, limit }, existingEntityIds, existingIdentifierKeys) {
  const sources = capRows(await readAll("sources", "id,url,organisation_entity_id"), limit);
  const { entities, identifiers, byHost } = planOrganisationEntities(sources.map((s) => s.url), existingEntityIds, existingIdentifierKeys);

  const needsFk = sources.filter((s) => !s.organisation_entity_id);
  const updates = planOrganisationFkUpdates(needsFk, byHost);

  console.log(`[organisation] distinct hosts: ${byHost.size}; would_create entities: ${entities.length}; existing entities: ${byHost.size - entities.length}; identifiers to add: ${identifiers.length}; FK updates: ${updates.length} (of ${sources.length} sources, ${sources.length - needsFk.length} already linked)`);
  console.log(`[organisation] GLEIF LEI: SKIPPED — no table in this schema carries an LEI value on an organisation (grep confirmed; see this file's header).`);

  if (apply) {
    if (entities.length) await guardedInsertMany("entities", entities, { cite: CITE, select: "entity_id" });
    if (identifiers.length) await guardedInsertMany("entity_identifiers", identifiers, { cite: CITE, select: "entity_id" });
    let ok = 0, fail = 0;
    for (const u of updates) {
      try {
        await guardedUpdate("sources", (qb) => qb.eq("id", u.id), { organisation_entity_id: u.organisation_entity_id }, { cite: CITE, select: "id" });
        ok++;
      } catch (e) {
        fail++;
        console.error(`[organisation] FK update FAILED for source ${u.id}: ${e.message}`);
      }
    }
    console.log(`[organisation] FK updates applied: ${ok}${fail ? ` (${fail} FAILURES — see above)` : ""}`);
  }
  return { created: entities.length, existing: byHost.size - entities.length, identifiers: identifiers.length, refs: updates.length };
}

async function main() {
  await loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("backfill-entities: no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }

  const opts = parseArgs(process.argv.slice(2));
  console.log(`[backfill-entities] mode = ${opts.dry ? "DRY-RUN (default)" : "APPLY"}; kinds = ${[...opts.kinds].join(",")}${opts.limit ? `; limit = ${opts.limit}` : ""}`);

  const existingEntityIds = await existingEntityIdSet();
  const existingIdentifierKeys = await existingIdentifierKeySet();
  console.log(`[backfill-entities] PRIOR STATE: ${existingEntityIds.size} entities, ${existingIdentifierKeys.size} identifiers.`);

  const results = {};
  if (opts.kinds.has("jurisdiction")) results.jurisdiction = await runJurisdiction(opts, existingEntityIds, existingIdentifierKeys);
  if (opts.kinds.has("instrument")) results.instrument = await runInstrument(opts, existingEntityIds, existingIdentifierKeys);
  if (opts.kinds.has("organisation")) results.organisation = await runOrganisation(opts, existingEntityIds, existingIdentifierKeys);

  console.log(`\n[backfill-entities] summary: ${JSON.stringify(results)}`);
  if (opts.dry) console.log("\nDRY RUN — nothing written. Re-run with --apply to write.");
  process.exit(0);
}

// Only run when invoked directly (not when imported by the test file). F67 (lane R20, 2026-10-01):
// standardized on isMainModule from scripts/lib/is-main.mjs, replacing the filename-suffix check this
// file used before (that idiom works but is fragile: any other file ending in the same suffix would
// also match it; isMainModule compares the actual resolved path).
if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[backfill-entities] FATAL: ${e.message}`);
    process.exit(1);
  });
}
