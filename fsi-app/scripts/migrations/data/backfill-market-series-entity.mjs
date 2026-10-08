#!/usr/bin/env node
// backfill-market-series-entity.mjs -- the DATA step that goes with migration 373 (lane L4-E, 2026-10-08;
// CLAUDE.md standing rule 3: schema DDL applies first, data migrations commit with their consumer code and run
// after merge). Migration 373 adds market_series.entity_id; producers stamp it on rows they write from now on
// (the registry entry's entity_id, handed to the producer as PRODUCER_ENTITY_ID). This script stamps the rows
// that already exist.
//
// THE MAP. A registry entry (scripts/producers/registry/<name>.json) that declares an entity_id owns the
// market_series rows of its namespace. The series namespace is NOT the entry name (entry
// "eu-weekly-oil-bulletin" writes series_key "eu-oil-bulletin:..."), so the join goes through the producer
// script both registries name: the registry entry's `script` equals series-registry.mjs's `producerScript`, and
// that row's `keyPrefix` is the series_key prefix. An entry with an entity_id whose script no series-registry
// row names is reported and stops the run (a mapping that cannot be resolved is not guessed).
//
// WHAT IT WRITES. entity_id on rows where it IS NULL and series_key starts with `<keyPrefix>:`. A row that
// already has an entity is never touched, whatever it holds (an administrator's or an earlier run's value is
// not overwritten). Idempotent: a second run finds nothing to do.
//
// DRY BY DEFAULT. `--apply` writes, through the guarded path (scripts/lib/db.mjs guardedUpdateByIds: cite,
// prior-value snapshot, read-back). Nothing in CI or any workflow runs this; it is dispatched by hand after the
// build layers are complete (operator ruling 2026-10-04: no data population until every build layer is done).
//
// WHAT AN APPLY ALSO DOES, STATED PLAINLY. market_series carries the outbox trigger, and setting entity_id is a
// material change to the row, so each updated row writes one propagation_events row (change_kind update, entity
// = the new entity). The dry report prints that count as `outbox_events_on_apply`. The drain and
// questions-on-change process them as they would any value change (one open question per item and surface at a
// time, MAX_ITEMS_PER_EVENT per event); run it with that load in mind.
//
// Usage (cwd fsi-app):  node scripts/migrations/data/backfill-market-series-entity.mjs [--apply]
// Exit 0 done, 1 unresolvable mapping, 2 no DB credentials (self-skip, never crash).

import { readAll, guardedUpdateByIds } from "../../lib/db.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { loadProducerRegistry } from "../../producers/registry/load-registry.mjs";
import { MARKET_SERIES_PRODUCERS } from "../../../src/lib/market/series-registry.mjs";

const CITE = {
  skill: "remediation-discipline",
  reason: "Lane L4-E (migration 373): stamp market_series.entity_id on existing rows from the producer registry entry that owns the series namespace, so their outbox rows reach the items linked to that entity.",
};

/**
 * Resolve every registry entry that declares an entity_id to its series_key prefix. PURE.
 * @param {ReadonlyArray<object>} registryEntries  loadProducerRegistry() output
 * @param {ReadonlyArray<{keyPrefix:string, producerScript?:string}>} seriesProducers  series-registry.mjs rows
 * @returns {{ mappings: Array<{entry:string, prefix:string, entity_id:string}>, unmapped: Array<{entry:string, reason:string}> }}
 */
export function buildMappings(registryEntries, seriesProducers) {
  const mappings = [];
  const unmapped = [];
  for (const e of registryEntries) {
    if (!e.entity_id || e.domain_table !== "market_series") continue;
    const hit = seriesProducers.filter((p) => p.producerScript === e.script);
    if (hit.length !== 1) {
      unmapped.push({ entry: e.name, reason: `${hit.length} series-registry rows name producerScript ${e.script} (expected exactly 1)` });
      continue;
    }
    mappings.push({ entry: e.name, prefix: hit[0].keyPrefix, entity_id: e.entity_id });
  }
  return { mappings, unmapped };
}

/**
 * Decide which rows get which entity. PURE.
 * @param {ReadonlyArray<{id:string, series_key:string, entity_id:string|null}>} rows
 * @param {ReadonlyArray<{entry:string, prefix:string, entity_id:string}>} mappings
 * @returns {{ updates: Array<{id:string, entity_id:string, entry:string}>, counts: Record<string, number>, perEntry: Record<string, number> }}
 */
export function planEntityBackfill(rows, mappings) {
  const updates = [];
  const perEntry = Object.fromEntries(mappings.map((m) => [m.entry, 0]));
  const counts = { rows_read: 0, already_set: 0, no_mapping: 0, to_update: 0 };
  for (const r of rows) {
    counts.rows_read += 1;
    const m = mappings.find((x) => String(r.series_key ?? "").startsWith(`${x.prefix}:`));
    if (!m) { counts.no_mapping += 1; continue; }
    if (r.entity_id) { counts.already_set += 1; continue; }
    updates.push({ id: r.id, entity_id: m.entity_id, entry: m.entry });
    perEntry[m.entry] += 1;
  }
  counts.to_update = updates.length;
  return { updates, counts, perEntry };
}

/**
 * @param {{apply?:boolean}} opts
 * @param {{ registry?: ReadonlyArray<object>, seriesProducers?: ReadonlyArray<object>,
 *           readRows?: () => Promise<Array<object>>,
 *           updateIds?: (ids:string[], entityId:string) => Promise<{updated:number}>,
 *           log?: (s:string) => void }} [deps]
 * @returns {Promise<{ok:boolean, code:number, counts?:object, perEntry?:object, outbox_events_on_apply?:number, applied?:number}>}
 */
export async function runBackfill(opts = {}, deps = {}) {
  const {
    registry = loadProducerRegistry(),
    seriesProducers = MARKET_SERIES_PRODUCERS,
    readRows = () => readAll("market_series", "id,series_key,entity_id", { orderBy: "id" }),
    updateIds = (ids, entityId) => guardedUpdateByIds("market_series", ids, { entity_id: entityId }, {
      cite: CITE, select: "id", chunk: 100, applyMatch: (qb) => qb.is("entity_id", null),
    }),
    log = (s) => console.log(s),
  } = deps;
  const apply = opts.apply === true;

  const { mappings, unmapped } = buildMappings(registry, seriesProducers);
  for (const u of unmapped) log(`[backfill-market-series-entity] UNMAPPED ${u.entry}: ${u.reason}`);
  if (unmapped.length) return { ok: false, code: 1 };
  log(`[backfill-market-series-entity] mode=${apply ? "APPLY" : "DRY-RUN (default)"} mappings=${mappings.map((m) => `${m.entry}:${m.prefix}->${m.entity_id}`).join(", ") || "(none)"}`);

  const { updates, counts, perEntry } = planEntityBackfill(await readRows(), mappings);
  log(`[backfill-market-series-entity] ${JSON.stringify(counts)} per_entry=${JSON.stringify(perEntry)} outbox_events_on_apply=${updates.length}`);

  let applied = 0;
  if (apply) {
    const byEntity = new Map();
    for (const u of updates) byEntity.set(u.entity_id, [...(byEntity.get(u.entity_id) ?? []), u.id]);
    for (const [entityId, ids] of byEntity) {
      const res = await updateIds(ids, entityId);
      applied += res.updated;
      log(`[backfill-market-series-entity] ${entityId}: ${res.updated} of ${ids.length} row(s) stamped`);
    }
  } else {
    log("DRY RUN: nothing written. Re-run with --apply to write.");
  }
  return { ok: true, code: 0, counts, perEntry, outbox_events_on_apply: updates.length, applied };
}

async function main() {
  loadLocalEnvFile();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("backfill-market-series-entity: no DB creds, cannot run here (exit 2).");
    process.exit(2);
  }
  const res = await runBackfill({ apply: process.argv.includes("--apply") });
  process.exit(res.code);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[backfill-market-series-entity] FATAL: ${e.message}`);
    process.exit(1);
  });
}
