#!/usr/bin/env node
// backfill-entities.mjs — populates the entity spine (migration 282) and the progressive re-keying
// columns/join table (migration 283) from data already live in the corpus. Lane DP-SPINE,
// system-completion train, 2026-09-02. See docs/decisions/ADR-024-decision-propagation.md for the
// progressive-re-keying decision this script executes, and F30-entity-spine.mjs for the ratchet that
// forbids text-keyed reference sites from regressing once this backfill lands.
//
// FOUR KINDS, EACH WITH ITS OWN READ AND ITS OWN REASON, AND ONE KIND NAMED SKIPPED:
//
//   1. JURISDICTION — distinct ISO codes from intelligence_items.jurisdiction_iso (TEXT[], migration
//      033) and regions.iso_codes (TEXT[], migration 106). One jurisdiction entity per distinct code; an
//      ISO3166_1/ISO3166_2-shaped code also gets a crosswalk identifier row (crosswalk.mjs's VALIDATORS
//      decide the scheme; a code shaped like neither, e.g. the free-text supranational codes GLOBAL/
//      IMO/ICAO this corpus also carries, gets an entity with NO crosswalk row — an entity does not
//      require an external identifier to exist, per spec §1.1's own text). Every occurrence becomes an
//      entity_refs row (role='jurisdiction') on the table it came from.
//
//   2. INSTRUMENT — distinct canonical_instrument_key values (migration 200/255; CELEX-shaped, the OJ
//      sequence suffix preserved). One instrument entity per distinct key, with a CELEX crosswalk row.
//      EVERY intelligence_items row sharing that key (live, quarantined, or archived — instrument
//      IDENTITY is a fact about the instrument, not about that row's current disposition) gets its
//      instrument_entity_id FK set. NOTE: migration 200/255's deriver converts an ELI-shaped source into
//      the SAME CELEX-shaped key format at derivation time, so canonical_instrument_key values are
//      always CELEX-shaped in this schema — there is no separate ELI-scheme identifier to register
//      alongside it (see ADR-024 for the full reasoning).
//
//   3. ORGANISATION — the registrable host of every sources.url (entity-id.mjs's hostFromUrl /
//      normalizeSeed('organisation', ...) — the SAME reduction: full URL and bare host mint the same
//      id). One organisation entity per distinct host, with a HOST crosswalk row. Every sources row
//      whose host resolves gets its organisation_entity_id FK set.
//
//   4. GLEIF LEI — NOT BUILT, and this is a finding, not an omission. `grep -rniE '\blei\b|gleif'
//      fsi-app/supabase/migrations/*.sql` (run at authoring time) finds exactly one hit:
//      258_emission_factors_and_licence_gate.sql's `data_sources` seed row for the LICENCE of the GLEIF
//      LEI *dataset* (redistribution='permitted', CC0) — a statement that we MAY embed LEI data, not a
//      column anywhere that stores one. No table in this schema carries an LEI value on an organisation
//      today, so there is nothing to read. When one lands (a future producer, or a `sources.lei` column),
//      this script's ORGANISATION section is the natural place to add an LEI crosswalk row beside the
//      HOST one — named here so the next lane does not have to re-discover the absence.
//
// IDEMPOTENT: `--kind` and `--limit` aside, re-running this script twice writes NOTHING the second time.
// entityId() is deterministic (same seed -> same id, no coordination needed), so "does this entity
// already exist" is a plain existence check against the entity_id the seed WOULD produce — this
// script never re-derives a random id and never re-inserts a row it already created. Reads existing
// entities/entity_identifiers/entity_refs ONCE up front and diffs against them (the write-edges.mjs /
// backfill-lineage-edges.mjs "read once, diff, write only the delta" idiom).
//
// GUARDED WRITE PATH (rule 015): every write routes through scripts/lib/db.mjs (guardedInsertMany /
// guardedUpdate) with a CITE naming this script. `--dry` is the DEFAULT (this script touches the whole
// corpus, not a scoped pre-verified subset — the same extra-caution default backfill-lineage-edges.mjs
// uses for the same reason); `--apply` is required to write.
//
// FLAGS:
//   --dry            (default) compute + report everything, write nothing
//   --apply          required to actually write
//   --kind <k>       restrict to one kind: jurisdiction | instrument | organisation (repeatable)
//   --limit N        cap the number of SOURCE ROWS read per data source (pilot runs; does not cap the
//                    number of distinct entities/identifiers/refs derived from those rows)
// Exit 0 done · 2 no DB creds (self-skip, never crash — the sibling-audit contract backfill-lineage-edges.mjs uses).

import { readAll, guardedInsertMany, guardedUpdate } from "../lib/db.mjs";
import { entityId, hostFromUrl } from "../../src/lib/entities/entity-id.mjs";
import { identifierRow, VALIDATORS } from "../../src/lib/entities/crosswalk.mjs";

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

/**
 * Plan jurisdiction entities + crosswalk identifiers for a set of distinct ISO codes.
 * `existingEntityIds` (Set<string>) and `existingIdentifierKeys` (Set<"entity_id|scheme|value">) let a
 * second run skip what a first run already created. Returns { entities, identifiers, byCode } where
 * byCode maps the normalized code to its (possibly pre-existing) entity_id, for planJurisdictionRefs().
 */
export function planJurisdictionEntities(codes, existingEntityIds = new Set(), existingIdentifierKeys = new Set()) {
  const entities = [];
  const identifiers = [];
  const byCode = new Map();
  for (const code of codes) {
    const id = entityId("jurisdiction", code);
    byCode.set(code, id);
    if (!existingEntityIds.has(id)) {
      entities.push({ entity_id: id, kind: "jurisdiction", canonical_name: code, status: "active" });
    }
    const scheme = VALIDATORS.ISO3166_1(code) ? "ISO3166_1" : VALIDATORS.ISO3166_2(code) ? "ISO3166_2" : null;
    if (scheme) {
      const key = `${id}|${scheme}|${code}`;
      if (!existingIdentifierKeys.has(key)) identifiers.push(identifierRow(id, scheme, code, ASSERTED_BY));
    }
    // else: a free-text supranational code (GLOBAL/IMO/ICAO-shaped) — entity only, no crosswalk row.
  }
  return { entities, identifiers, byCode };
}

/**
 * Plan entity_refs rows (role='jurisdiction') for every (row, code) occurrence in `rows`
 * ([{id, jurisdiction_iso}]) against `refTable` ('intelligence_items' | 'regions'). `byCode` is the map
 * planJurisdictionEntities() returned. `existingRefKeys` is a Set of "ref_table|ref_id|entity_id|role".
 */
export function planJurisdictionRefs(refTable, rows, byCode, existingRefKeys = new Set()) {
  const refs = [];
  for (const row of rows) {
    const codes = Array.isArray(row.jurisdiction_iso ?? row.iso_codes) ? (row.jurisdiction_iso ?? row.iso_codes) : [];
    for (const raw of codes) {
      const code = String(raw ?? "").trim().toUpperCase();
      if (!code) continue;
      const entity_id = byCode.get(code) ?? entityId("jurisdiction", code);
      const key = `${refTable}|${row.id}|${entity_id}|jurisdiction`;
      if (existingRefKeys.has(key)) continue;
      refs.push({ ref_table: refTable, ref_id: row.id, entity_id, role: "jurisdiction", asserted_by: ASSERTED_BY });
      existingRefKeys.add(key); // guard against the SAME code appearing twice in one row's array
    }
  }
  return refs;
}

/** Plan instrument entities + CELEX crosswalk identifiers for a set of distinct canonical_instrument_key
 *  values. Same existing-state/return shape as planJurisdictionEntities(). */
export function planInstrumentEntities(keys, existingEntityIds = new Set(), existingIdentifierKeys = new Set()) {
  const entities = [];
  const identifiers = [];
  const byKey = new Map();
  for (const raw of keys) {
    const key = String(raw ?? "").trim().toUpperCase();
    if (!key) continue;
    const id = entityId("instrument", key);
    byKey.set(key, id);
    if (!existingEntityIds.has(id)) {
      entities.push({ entity_id: id, kind: "instrument", canonical_name: key, status: "active" });
    }
    if (VALIDATORS.CELEX(key)) {
      const idKey = `${id}|CELEX|${key}`;
      if (!existingIdentifierKeys.has(idKey)) identifiers.push(identifierRow(id, "CELEX", key, ASSERTED_BY));
    }
  }
  return { entities, identifiers, byKey };
}

/** Plan instrument_entity_id updates for intelligence_items rows whose canonical_instrument_key is set
 *  and whose instrument_entity_id is not yet set. `items` is [{id, canonical_instrument_key}]. */
export function planInstrumentFkUpdates(items, byKey) {
  const updates = [];
  for (const it of items) {
    const key = String(it.canonical_instrument_key ?? "").trim().toUpperCase();
    if (!key) continue;
    const entity_id = byKey.get(key);
    if (entity_id) updates.push({ id: it.id, instrument_entity_id: entity_id });
  }
  return updates;
}

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

const ROOT_ENV_CANDIDATES = [".env.local"];
async function loadEnv() {
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  for (const f of ROOT_ENV_CANDIDATES) {
    try { process.loadEnvFile(resolve(ROOT, f)); } catch { /* CI: env injected */ }
  }
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
  const { entities, identifiers, byCode } = planJurisdictionEntities(allCodes, existingEntityIds, existingIdentifierKeys);

  const existingRefKeys = await existingRefKeySet();
  const itemRefs = planJurisdictionRefs("intelligence_items", items, byCode, existingRefKeys);
  const regionRefs = planJurisdictionRefs("regions", regions, byCode, existingRefKeys);
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
  const { entities, identifiers, byKey } = planInstrumentEntities(distinctKeys, existingEntityIds, existingIdentifierKeys);

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

// Only run when invoked directly (not when imported by the test file).
if (process.argv[1] && process.argv[1].endsWith("backfill-entities.mjs")) {
  main().catch((e) => {
    console.error(`[backfill-entities] FATAL: ${e.message}`);
    process.exit(1);
  });
}
