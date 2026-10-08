#!/usr/bin/env node
// ukpn-capacity-heatmap-producer.mjs -- the grid_connection_queues producer (lane S8-E6, 2026-10-08, spec 09
// section 1.6, producer registry entry scripts/producers/registry/ukpn-capacity-heatmap.json).
//
// DATASET. UK Power Networks "Long Term Development Statement (LTDS) Capacity Heatmap", dataset id
// ukpn-capacity-heatmap on https://ukpowernetworks.opendatasoft.com. Licence "CC BY 4.0" (catalogue metadata
// metas.default.license, and each release file's own `rights` URL). Published twice a year (update_frequency
// ANNUAL_2), one JSON release file per licence area (LPN, EPN, SPN). Per primary substation the file states
// demandFirmCapacity and demandAvailableCapacity in MW, a demandConstraint GREEN/AMBER/RED and its limiting
// factor. It states NO queue duration in months. See fixtures/ukpn-capacity-heatmap-sample.header.md for the
// fetch evidence.
//
// WHY THE ATTACHMENTS, NOT THE RECORDS API. The register (PROD-SRC 1.6) recorded this dataset as "API: yes". The
// records endpoint answers an anonymous request with HTTP 403 ForbiddenAccess (the metadata says data_visible
// false: "please register and login"). The release files are the dataset's public attachments, listed in the
// anonymous catalogue metadata, so the adapter reads the metadata, selects the heatmap JSON attachments, and
// fetches only URLs on the same host the metadata came from.
//
// COLUMNS COVERED (migration 379 adds the substation columns): jurisdiction_id (GB, the entity builder's id),
// dso_name (publisher and licence area as the file states them), substation_ref (mRID), substation_name,
// demand_firm_mw, demand_available_mw, demand_constraint, demand_constraint_limiting_factor, as_of (the file's
// own `issued` date), obs_status 'L', source_id (the registered source), origin_class, derivation.
// COLUMNS LEFT NULL, NEVER ESTIMATED: queue_months_p50, queue_months_p90 (no free dataset states them; the row's
// obs_status is L, Missing not covered: no source exists for queue months, so the gate reads UNKNOWN, never CLEAR), capacity_band_mw (the publisher states no band),
// confidence_admiralty (the register states no rating).
//
// ENVELOPE (spec 00 section 2). Each MW figure is built through makeEnvelope (src/lib/contracts/envelope.mjs):
// value, unit MW, derivation observed, origin_class official, obs_status A, as_of triple from the file's
// `issued`, expected_refresh biannual, provenance naming the source and licence. origin_class official is a
// judgment: the publisher is a licensed network operator, not a public body, and the figures are its own
// disclosure under Ofgem's Form of LTDS, primary and unmodified (vocabularies.mjs ORIGIN_CLASS official:
// "Primary source, unmodified"). It is ORIGIN_CLASS below, one constant.
//
// SOURCE (rule 18). The publisher is a row in `sources`, registered through db.mjs registerSource with its tier
// from the institution class table (classTierForHost over host and name), never hand typed. --apply REFUSES when
// that row is absent (SourceNotRegisteredError, exit 1); --register-source --apply registers it through the same
// path; a dry run reports the tier it would register at.
//
// GATES, same three as ecb-fx-producer.mjs: (1) ENABLED below, (2) --apply plus the runtime kill switch
// OPERATIONS_PRODUCER_UKPN_HEATMAP_ENABLED=1 plus DB credentials, (3) the source row and the jurisdiction entity
// exist (checked at apply). A dry run (the default) fetches, parses, maps, plans and reports counts, writes
// nothing, needs no credentials. The workflow that runs it carries the chained dry guard (rule 16).
//
// FLYWHEEL (rule 17). The write is a plain insert/update on grid_connection_queues; migration 379 attaches the
// outbox trigger (entity = jurisdiction_id), so every written row reaches the drain with the GB entity.
//
// ADMIN OVERRIDE. The table has no override column. An update only refreshes the dataset's own figures on a row
// with the same (dso_name, substation_ref, as_of) key and never touches queue_months, capacity_band_mw or
// obs_status, so a value another writer or an admin set there is not overwritten.
//
// Usage:
//   node scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs                  # dry run, live fetch
//   node scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs --meta m.json --file lpn.json   # dry, local
//   node scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs --apply           # write (all gates)
//   node scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs --register-source --apply
// Exit 0 done (including a dry run) / 1 refused (a gate, the source or the entity) / 2 bad input or licence /
// 3 network failure.

import { readFileSync } from "node:fs";
import { isMainModule } from "../../lib/is-main.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { hostOf, institutionKey } from "../../lib/institution-key.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { entityId } from "../../../src/lib/entities/entity-id.mjs";
import { makeEnvelope } from "../../../src/lib/contracts/envelope.mjs";
import { classTierForHost } from "../../../src/lib/sources/host-authority.ts";

export const PRODUCER_NAME = "ukpn-capacity-heatmap";
export const TABLE = "grid_connection_queues";

// Gate 1: the reviewed-code-change switch (ADR-023). Gate 2 (the runtime kill switch) defaults off.
const ENABLED = true;
export const KILL_SWITCH_ENV = "OPERATIONS_PRODUCER_UKPN_HEATMAP_ENABLED";

export const DATASET_ID = "ukpn-capacity-heatmap";
export const PORTAL_HOST = "ukpowernetworks.opendatasoft.com";
export const METADATA_URL = `https://${PORTAL_HOST}/api/explore/v2.1/catalog/datasets/${DATASET_ID}`;
export const SOURCE_URL = `https://${PORTAL_HOST}/explore/dataset/${DATASET_ID}/`;
export const SOURCE_NAME = "UK Power Networks, Long Term Development Statement Capacity Heatmap";
export const LICENCE = "CC BY 4.0";
export const LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";
export const ORIGIN_CLASS = "official";
export const DERIVATION = "observed";
/** The GB jurisdiction entity, minted by the one builder every spine id comes from (never hand assembled). */
export const GB_JURISDICTION_ID = entityId("jurisdiction", "GB");
export const UNIT = "MW";
/** Months are not stated by this dataset, and no free source states them: SDMX L (Missing, not covered). M (reason
 *  unknown) is for a covered source that omits a value, which does not arise here (coordinator ruling, 2026-10-08). */
export const OBS_STATUS_NO_MONTHS = "L";
export const CONSTRAINTS = Object.freeze(["GREEN", "AMBER", "RED"]);
/** The fields an update may refresh. Never months, band or obs_status (see ADMIN OVERRIDE above). */
export const REFRESHABLE = Object.freeze([
  "substation_name", "demand_firm_mw", "demand_available_mw", "demand_constraint",
  "demand_constraint_limiting_factor", "source_id", "origin_class", "derivation",
]);

const ATTACHMENT_TITLE_RE = /^LTDS_Heatmap_[A-Z]{3}_.*\.json$/i;
const ISO_DAY_RE = /^(\d{4}-\d{2}-\d{2})(T|$)/;

export class NetworkError extends Error {}
export class InputError extends Error {}
export class SourceNotRegisteredError extends Error {}

export const CITE = Object.freeze({
  skill: "spec09-grid-queue-producer (lane S8-E6)",
  reason:
    "UK Power Networks LTDS Capacity Heatmap (CC BY 4.0) upserts per-substation demand headroom and constraint " +
    "evidence into grid_connection_queues, keyed (dso_name, substation_ref, as_of); queue months stay NULL.",
});

// ---------------------------------------------------------------------------------------------------------
// Fetch adapter (injected fetch)
// ---------------------------------------------------------------------------------------------------------

async function getJson(fetchFn, url) {
  let res;
  try {
    res = await fetchFn(url, { headers: { accept: "application/json" } });
  } catch (err) {
    throw new NetworkError(`${PRODUCER_NAME}: fetch threw (${err.message}) for ${url}`);
  }
  if (!res.ok) throw new NetworkError(`${PRODUCER_NAME}: fetch failed ${res.status} for ${url}`);
  try {
    return JSON.parse(await res.text());
  } catch (err) {
    throw new NetworkError(`${PRODUCER_NAME}: ${url} is not JSON (${err.message})`);
  }
}

/** The heatmap release attachments listed in the catalogue metadata, on the metadata's own host only. */
export function selectAttachments(meta) {
  const list = Array.isArray(meta?.attachments) ? meta.attachments : [];
  return list.filter(
    (a) =>
      a && a.mimetype === "application/json" && ATTACHMENT_TITLE_RE.test(String(a.title ?? "")) &&
      hostOf(String(a.url ?? "")) === PORTAL_HOST && String(a.url).startsWith("https://"),
  );
}

/** Licence gate on the catalogue metadata: refuse when the dataset is no longer stated as CC BY 4.0. */
export function checkMetadata(meta) {
  const d = meta?.metas?.default;
  if (!d || typeof d !== "object") throw new InputError("catalogue metadata has no metas.default");
  if (meta.dataset_id !== DATASET_ID) throw new InputError(`metadata dataset_id is ${JSON.stringify(meta.dataset_id)}, expected ${DATASET_ID}`);
  if (d.license !== LICENCE) throw new InputError(`dataset licence is ${JSON.stringify(d.license)}, expected ${LICENCE}: refusing to use the data`);
  const files = selectAttachments(meta);
  if (files.length === 0) throw new InputError("no heatmap JSON attachment listed in the catalogue metadata");
  return { licence: d.license, publisher: d.publisher ?? null, files };
}

/** Live fetch: metadata, then each heatmap attachment. Any failure is fatal (a missing area is never silent). */
export async function fetchDataset(fetchFn = fetch) {
  const meta = await getJson(fetchFn, METADATA_URL);
  const { files } = checkMetadata(meta);
  const out = [];
  for (const a of files) out.push({ title: a.title, url: a.url, json: await getJson(fetchFn, a.url) });
  return { meta, files: out };
}

// ---------------------------------------------------------------------------------------------------------
// Parser and mapper (pure)
// ---------------------------------------------------------------------------------------------------------

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Map one release file to grid_connection_queues rows. Pure: no clock, no fs, no network. A structural
 * problem in the file (identity, licence, issue date, publisher, area) throws InputError; a bad substation is
 * skipped with a warning (never coerced, never defaulted).
 *
 * @param {object} file parsed release JSON
 * @param {{ sourceId?: string|null }} [ctx] sourceId is null in a dry run (resolved at apply)
 * @returns {{ rows: object[], warnings: string[], envelopes: Map<string, object>, dso_name: string, as_of: string }}
 */
export function mapHeatmapFile(file, { sourceId = null } = {}) {
  if (!file || typeof file !== "object" || Array.isArray(file)) throw new InputError("release file is not a JSON object");
  if (file.identifier !== DATASET_ID) throw new InputError(`release file identifier is ${JSON.stringify(file.identifier)}, expected ${DATASET_ID}`);
  if (file.rights !== LICENCE_URL) throw new InputError(`release file rights is ${JSON.stringify(file.rights)}, expected ${LICENCE_URL}: refusing`);
  if (!isText(file.publisher) || !isText(file.coverage)) throw new InputError("release file states no publisher or coverage (licence area)");
  const issued = ISO_DAY_RE.exec(String(file.issued ?? ""));
  if (!issued) throw new InputError(`release file issued date is ${JSON.stringify(file.issued)}, expected an ISO date (the clock is never read)`);
  if (!Array.isArray(file.Substations)) throw new InputError("release file has no Substations array");

  const asOf = issued[1];
  const dsoName = `${file.publisher.trim()}, ${file.coverage.trim()}`;
  const warnings = [];
  const rows = [];
  const envelopes = new Map();
  const seen = new Set();

  for (const s of file.Substations) {
    const ref = s?.mRID;
    if (!isText(ref) || !isText(s?.name)) { warnings.push(`substation without mRID and name skipped: ${JSON.stringify(ref ?? null)}`); continue; }
    if (seen.has(ref)) { warnings.push(`duplicate mRID ${ref} (${s.name}): first kept, later one ignored`); continue; }
    if (!isNum(s.demandFirmCapacity) || s.demandFirmCapacity < 0) { warnings.push(`${s.name} (${ref}): demandFirmCapacity ${JSON.stringify(s.demandFirmCapacity)} is not a non-negative number, skipped`); continue; }
    if (!isNum(s.demandAvailableCapacity)) { warnings.push(`${s.name} (${ref}): demandAvailableCapacity ${JSON.stringify(s.demandAvailableCapacity)} is not a number, skipped`); continue; }
    if (!CONSTRAINTS.includes(s.demandConstraint)) { warnings.push(`${s.name} (${ref}): demandConstraint ${JSON.stringify(s.demandConstraint)} is not one of ${CONSTRAINTS.join("/")}, skipped`); continue; }
    seen.add(ref);

    const envelopeFor = (value) =>
      makeEnvelope({
        value, unit: UNIT, derivation: DERIVATION, origin_class: ORIGIN_CLASS, obs_status: "A",
        as_of: { event_date: asOf, source_published_at: asOf }, expected_refresh: "biannual",
        provenance: { source: SOURCE_NAME, url: SOURCE_URL, licence: LICENCE, substation_ref: ref },
      });
    envelopes.set(`${ref}:demand_firm_mw`, envelopeFor(s.demandFirmCapacity));
    envelopes.set(`${ref}:demand_available_mw`, envelopeFor(s.demandAvailableCapacity));

    rows.push({
      jurisdiction_id: GB_JURISDICTION_ID,
      dso_name: dsoName,
      capacity_band_mw: null,
      queue_months_p50: null,
      queue_months_p90: null,
      as_of: asOf,
      obs_status: OBS_STATUS_NO_MONTHS,
      substation_ref: ref,
      substation_name: s.name.trim(),
      demand_firm_mw: s.demandFirmCapacity,
      demand_available_mw: s.demandAvailableCapacity,
      demand_constraint: s.demandConstraint,
      demand_constraint_limiting_factor: isText(s.demandConstraintLimitingFactor) ? s.demandConstraintLimitingFactor.trim() : null,
      source_id: sourceId,
      origin_class: ORIGIN_CLASS,
      derivation: DERIVATION,
      confidence_admiralty: null,
    });
  }
  return { rows, warnings, envelopes, dso_name: dsoName, as_of: asOf };
}

const sameValue = (a, b) => (a == null && b == null) || (a != null && b != null && (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b));
export const rowKey = (r) => `${r.dso_name}\u0000${r.substation_ref}\u0000${r.as_of}`;

/**
 * Idempotent upsert plan against the existing rows (each read with queue_id plus the key and refreshable fields).
 * Create what is new, patch only the refreshable fields that differ, leave the rest. Pure.
 */
export function planUpsert(existing, incoming) {
  const byKey = new Map((existing ?? []).map((r) => [rowKey(r), r]));
  const toCreate = [];
  const toUpdate = [];
  let unchanged = 0;
  for (const row of incoming) {
    const have = byKey.get(rowKey(row));
    if (!have) { toCreate.push(row); continue; }
    const patch = {};
    for (const f of REFRESHABLE) if (!sameValue(have[f], row[f])) patch[f] = row[f] ?? null;
    if (Object.keys(patch).length === 0) unchanged += 1;
    else toUpdate.push({ queue_id: have.queue_id, patch });
  }
  return { toCreate, toUpdate, unchanged };
}

// ---------------------------------------------------------------------------------------------------------
// Gates and source
// ---------------------------------------------------------------------------------------------------------

/** Pure gating decision (the ecb-fx shape). */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply): fetch, map, plan only, nothing written" };
  if (!enabled) return { canWrite: false, reason: "REFUSING: the ENABLED constant in ukpn-capacity-heatmap-producer.mjs is false" };
  if (!killSwitchOn) return { canWrite: false, reason: `REFUSING: kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  if (!hasCreds) return { canWrite: false, reason: "REFUSING: --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), none found" };
  return { canWrite: true, reason: "all gates satisfied" };
}

/** The tier the institution class table gives the publisher, or null (never a default, never hand typed). */
export function publisherTier() {
  return classTierForHost(hostOf(SOURCE_URL), SOURCE_NAME);
}

/**
 * The registered `sources` row for the publisher: found by registry identity (institutionKey), must be active.
 * Throws SourceNotRegisteredError when absent: the producer never writes a figure whose source is not rated.
 */
export async function resolveSource(deps) {
  const rows = await deps.readAll("sources", "id,url,status,base_tier");
  const key = institutionKey(SOURCE_URL);
  const hit = rows.find((s) => institutionKey(s.url) === key);
  if (!hit) {
    throw new SourceNotRegisteredError(
      `no sources row for ${key} (${SOURCE_NAME}). Register it through the registry first: ` +
        "node scripts/producers/operations/ukpn-capacity-heatmap-producer.mjs --register-source --apply",
    );
  }
  if (hit.status !== "active") throw new SourceNotRegisteredError(`sources row ${hit.id} for ${key} is ${hit.status}, not active`);
  return { source_id: hit.id, tier: hit.base_tier ?? null };
}

/** Register the publisher through db.mjs registerSource at the class table's tier. Refuses when unclassified. */
export async function registerPublisher(deps) {
  const tier = publisherTier();
  if (tier == null) return { refused: true, reason: `host ${hostOf(SOURCE_URL)} does not classify in the institution class table (worklisted, never guessed)` };
  const reg = await deps.registerSource({ url: SOURCE_URL, name: SOURCE_NAME, base_tier: tier }, { cite: CITE });
  return { refused: false, source_id: reg.source_id, created: reg.created, tier };
}

// ---------------------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const a = argv.slice(2);
  const files = [];
  let meta = null;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === "--file") files.push(a[i + 1]);
    if (a[i] === "--meta") meta = a[i + 1];
  }
  return { apply: a.includes("--apply"), registerSource: a.includes("--register-source"), metaPath: meta, filePaths: files };
}

async function realDeps() {
  const db = await import("../../lib/db.mjs");
  return { readAll: db.readAll, guardedInsertMany: db.guardedInsertMany, guardedUpdate: db.guardedUpdate, registerSource: db.registerSource };
}

/**
 * The whole run, dependency injected. @returns {Promise<{exitCode:number, summary:object}>}
 * @param {{argv?:string[], env?:object, fetchFn?:Function, readText?:Function, deps?:object, log?:Function, warn?:Function}} [io]
 */
export async function run({ argv = process.argv, env = process.env, fetchFn = fetch, readText = (p) => readFileSync(p, "utf8"), deps = null, log = console.log, warn = console.warn } = {}) {
  const { apply, registerSource, metaPath, filePaths } = parseArgs(argv);
  const summary = { producer: PRODUCER_NAME, mode: apply ? "apply" : "dry", files: 0, parsed: 0, skipped: 0, created: 0, updated: 0, unchanged: 0, tier: null, source: null };

  // 1. Input
  let dataset;
  try {
    if (metaPath || filePaths.length) {
      if (!metaPath || filePaths.length === 0) throw new InputError("--meta and at least one --file go together");
      const meta = JSON.parse(readText(metaPath));
      checkMetadata(meta);
      dataset = { meta, files: filePaths.map((p) => ({ title: p, url: p, json: JSON.parse(readText(p)) })) };
    } else {
      dataset = await fetchDataset(fetchFn);
    }
  } catch (err) {
    if (err instanceof NetworkError) { warn(err.message); return { exitCode: 3, summary }; }
    if (err instanceof InputError || err instanceof SyntaxError) { warn(`${PRODUCER_NAME}: ${err.message} (exit 2)`); return { exitCode: 2, summary }; }
    throw err;
  }

  // 2. Gates, then (apply only) the source and the entity
  const decision = decideApply({
    apply, enabled: ENABLED, killSwitchOn: env[KILL_SWITCH_ENV] === "1",
    hasCreds: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
  });
  if (apply && !decision.canWrite) { warn(`${PRODUCER_NAME}: ${decision.reason} (exit 1)`); return { exitCode: 1, summary }; }

  const tier = publisherTier();
  summary.tier = tier;
  const d = decision.canWrite ? (deps ?? (await realDeps())) : null;
  let sourceId = null;
  try {
    if (decision.canWrite) {
      if (registerSource) {
        const reg = await registerPublisher(d);
        if (reg.refused) { warn(`${PRODUCER_NAME}: ${reg.reason} (exit 1)`); return { exitCode: 1, summary }; }
        log(`${PRODUCER_NAME}: source ${reg.created ? "registered" : "already registered"} at tier ${reg.tier} (${reg.source_id})`);
      }
      const src = await resolveSource(d);
      sourceId = src.source_id;
      summary.source = src.source_id;
      summary.tier = src.tier ?? tier;
      const ent = await d.readAll("entities", "entity_id", { match: (q) => q.eq("entity_id", GB_JURISDICTION_ID) });
      if (!ent.length) throw new SourceNotRegisteredError(`jurisdiction entity ${GB_JURISDICTION_ID} (GB) is not in entities; the spine is seeded elsewhere, this producer never mints one`);
    } else if (registerSource) {
      log(`${PRODUCER_NAME}: DRY: --register-source would register ${SOURCE_URL} at tier ${tier ?? "UNCLASSIFIED (would refuse)"}`);
    }
  } catch (err) {
    if (err instanceof SourceNotRegisteredError) { warn(`${PRODUCER_NAME}: REFUSING: ${err.message} (exit 1)`); return { exitCode: 1, summary }; }
    throw err;
  }

  // 3. Parse and map
  const rows = [];
  const keys = new Set();
  try {
    for (const f of dataset.files) {
      const m = mapHeatmapFile(f.json, { sourceId });
      for (const w of m.warnings) warn(`[parse] ${f.title}: ${w}`);
      summary.files += 1;
      summary.skipped += m.warnings.length;
      for (const r of m.rows) {
        // The unique key (dso_name, substation_ref, as_of) must hold across files too: first kept.
        if (keys.has(rowKey(r))) { warn(`[parse] ${f.title}: duplicate key ${r.dso_name} | ${r.substation_ref}, ignored`); summary.skipped += 1; continue; }
        keys.add(rowKey(r));
        rows.push(r);
      }
    }
  } catch (err) {
    if (err instanceof InputError) { warn(`${PRODUCER_NAME}: ${err.message} (exit 2)`); return { exitCode: 2, summary }; }
    throw err;
  }
  summary.parsed = rows.length;
  log(`${PRODUCER_NAME}: ${summary.files} file(s), ${rows.length} substation row(s), ${summary.skipped} warning(s)${apply ? "" : " (DRY RUN)"}`);

  // 4. Plan
  const existing = decision.canWrite
    ? await d.readAll(TABLE, `queue_id,dso_name,substation_ref,as_of,${REFRESHABLE.join(",")}`, { match: (q) => q.not("substation_ref", "is", null) })
    : [];
  const plan = planUpsert(existing, rows);
  summary.unchanged = plan.unchanged;
  log(`${PRODUCER_NAME}: plan: ${plan.toCreate.length} to create, ${plan.toUpdate.length} to update, ${plan.unchanged} unchanged`);

  if (!decision.canWrite) {
    for (const r of plan.toCreate.slice(0, 3)) log(`  would create  ${r.dso_name} | ${r.substation_name} | available ${r.demand_available_mw} MW | ${r.demand_constraint} | as of ${r.as_of}`);
    log(`DRY RUN: nothing written (${decision.reason}).`);
    return { exitCode: 0, summary };
  }

  // 5. Write through the guarded path, then record the run for the producers family
  try {
    if (plan.toCreate.length) {
      const res = await d.guardedInsertMany(TABLE, plan.toCreate, { cite: CITE, select: "queue_id" });
      summary.created = res.inserted;
    }
    for (const u of plan.toUpdate) {
      await d.guardedUpdate(TABLE, (qb) => qb.eq("queue_id", u.queue_id), u.patch, { cite: CITE });
      summary.updated += 1;
    }
  } catch (err) {
    writeProducerSummary({ producer: PRODUCER_NAME, status: "failed", rows_changed: summary.created + summary.updated, edges_authored: null, reason: err.message, counts: summary });
    throw err;
  }
  log(`${PRODUCER_NAME}: done: ${summary.created} created, ${summary.updated} updated (${rows.length} parsed)`);
  writeProducerSummary({ producer: PRODUCER_NAME, status: "ok", rows_changed: summary.created + summary.updated, edges_authored: null, counts: summary });
  return { exitCode: 0, summary };
}

if (isMainModule(import.meta.url)) {
  loadLocalEnvFile();
  run().then(({ exitCode }) => process.exit(exitCode)).catch((err) => { console.error(err); process.exit(1); });
}
