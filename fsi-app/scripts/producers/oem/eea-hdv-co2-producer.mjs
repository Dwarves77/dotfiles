#!/usr/bin/env node
// eea-hdv-co2-producer.mjs -- the registered producer for spec 09 section 1.1, oem_tech_roadmaps (lane S8-E1,
// 2026-10-08). Reads the EEA heavy-duty vehicle CO2 monitoring extract and writes manufacturer, technology and
// commercial-stage EVIDENCE rows; every column the dataset cannot evidence stays NULL (eea-hdv-map.mjs says which and why).
//
// DATASET [CONFIRMED by fetch 2026-10-08, see fixtures/eea-hdv-sample.header.json]. EEA "CO2 emissions from
// heavy-duty vehicles", vehicle extract HDV_CO2Emission_VehicleExtract_24042025.csv, about 4 GB, Last-Modified
// 2025-04-28, page "Published 29 Apr 2025". Licence text on the EEA catalogue record: "License CC-BY 4.0
// (https://creativecommons.org/licenses/by/4.0/). Copyright holder: Directorate-General for Climate Action (DG-CLIMA),
// European Environment Agency (EEA)." The dataset is annual; the registry entry runs it when named, never in the
// producer=all sweep, because one read streams the whole file.
//
// SOURCE. The publisher is the EEA (host eea.europa.eu). Its tier is NOT typed here: rateSourceByInstitutionClass
// (scripts/lib/rate-source-by-class.mjs, the rule 18 step every producer shares) rates the host through the
// institution class table (classTierForHost) and registers it through db.mjs registerSource (idempotent by host, so
// the EEA row the registry already holds is reused). The producer then READS THE ROW BACK and refuses to write if it
// is absent. The licence register key is "eea" (src/lib/contracts/source-licence.mjs, redistribution permitted).
//
// GATES, ALL REQUIRED TO WRITE (same contract as ecb-fx-producer.mjs): (1) the ENABLED constant below, false at
// authorship, flipped only by a reviewed code change; (2) --apply plus OEM_PRODUCER_EEA_HDV_ENABLED=1; (3) DB
// credentials; (4) a complete read: a byte-limited read is never applied. A dry run (the default) always parses,
// maps and plans and writes nothing. Dry with no --input fetches only the first DRY_SAMPLE_BYTES.
//
// DOWNSTREAM (rule 17). Every insert and update on oem_tech_roadmaps writes an outbox row through the trigger of
// migration 380 (keyed to manufacturer_id), which is what lets the change reach the signposts and items watching
// that manufacturer. The run's outcome is recorded in the producers-family summary on every path.
//
// Usage (cwd fsi-app):
//   node scripts/producers/oem/eea-hdv-co2-producer.mjs                       # dry, first 8 MiB of the live file
//   node scripts/producers/oem/eea-hdv-co2-producer.mjs --input file.csv      # dry, local file
//   node scripts/producers/oem/eea-hdv-co2-producer.mjs --apply               # write (needs all four gates)
//   options: --entities-file f.json  [{entity_id, canonical_name}] for a dry run with no database
//            --max-bytes N  --dataset-date YYYY-MM-DD  --classification file.json
// Exit 0 done (a clean dry run included) | 1 refused | 2 bad input | 3 network failure.

import { createReadStream, readFileSync } from "node:fs";
import { rateSourceByInstitutionClass } from "../../lib/rate-source-by-class.mjs";
import { isMainModule } from "../../lib/is-main.mjs";
import { loadLocalEnvFile } from "../../lib/env-file.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { aggregateHdvCsv, EeaHdvFormatError } from "./eea-hdv-csv.mjs";
import { loadClassification, mapGroupsToRows, COVERED_COLUMNS } from "./eea-hdv-map.mjs";

export const PRODUCER_NAME = "eea-hdv-co2";
export const TABLE = "oem_tech_roadmaps";
export const KILL_SWITCH_ENV = "OEM_PRODUCER_EEA_HDV_ENABLED";

// Gate 1: the reviewed-code-change switch. Shipped false; arming this producer is a later, reviewed commit
// (operator ruling 2026-10-04: no data population until every build layer is complete).
export const ENABLED = false;

export const DATASET = Object.freeze({
  csv_url: "https://discomap.eea.europa.eu/App/CO2HDV/HDV_CO2Emission_VehicleExtract_24042025.csv",
  page_url: "https://www.eea.europa.eu/en/datahub/datahubitem-view/c52f7b51-c1cf-43e5-9a66-3eea19f6385a",
  source_name: "European Environment Agency: CO2 emissions from heavy-duty vehicles",
  licence_key: "eea",
  licence: "CC BY 4.0",
});

/** A dry run without --input reads only this many bytes of the live file (a Range request). */
export const DRY_SAMPLE_BYTES = 8 * 1024 * 1024;

export class NetworkError extends Error {}

/**
 * The fetch adapter. `fetchImpl` is injected (the global fetch in the CLI, a fake in tests). With maxBytes a Range
 * header asks for the first maxBytes only. Returns the body as an async iterable of chunks plus Last-Modified.
 */
export async function fetchHdvCsv(fetchImpl, { maxBytes } = {}) {
  const headers = { accept: "text/csv, application/octet-stream" };
  if (maxBytes) headers.range = `bytes=0-${maxBytes - 1}`;
  let res;
  try {
    res = await fetchImpl(DATASET.csv_url, { headers });
  } catch (err) {
    throw new NetworkError(`eea-hdv-co2: fetch threw (${err.message}) for ${DATASET.csv_url}`);
  }
  if (!res.ok) throw new NetworkError(`eea-hdv-co2: fetch failed ${res.status} ${res.statusText ?? ""} for ${DATASET.csv_url}`.replace(/\s+/g, " "));
  return { chunks: res.body, lastModified: res.headers.get("last-modified"), status: res.status };
}

/** Pure gating decision, no I/O. */
export function decideApply({ apply, enabled, killSwitchOn, hasCreds, truncated }) {
  if (!apply) return { canWrite: false, reason: "dry run (no --apply): parse, map and plan only, nothing written" };
  if (!enabled) return { canWrite: false, reason: "REFUSING: the source-level ENABLED constant in eea-hdv-co2-producer.mjs is false; arming it is a later, reviewed commit" };
  if (!killSwitchOn) return { canWrite: false, reason: `REFUSING: kill switch ${KILL_SWITCH_ENV} is OFF (set it to "1" to arm this producer)` };
  if (!hasCreds) return { canWrite: false, reason: "REFUSING: --apply requires DB creds (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY), none found" };
  if (truncated) return { canWrite: false, reason: "REFUSING: the read was byte-limited, so the counts are partial; apply needs the complete file" };
  return { canWrite: true, reason: "all gates satisfied" };
}

const keyOf = (r) => `${r.manufacturer_id}|${r.tech_category}|${r.source_id}`;
/** The columns an existing row is compared on and patched in: the covered ones except the key. */
const PATCH_COLUMNS = Object.freeze(COVERED_COLUMNS.filter((c) => !["manufacturer_id", "tech_category", "source_id"].includes(c)));

/**
 * Plan the writes. A row is identified by (manufacturer, technology, source): rows of any other source are never
 * matched or touched, and a patch carries only covered columns that differ, so a value another writer set in an
 * uncovered column (target_year, usable_kwh, ...) is never overwritten.
 */
export function planOemUpsert(existing, candidates) {
  const byKey = new Map(existing.map((e) => [keyOf(e), e]));
  const plan = { toCreate: [], toUpdate: [], unchanged: 0 };
  for (const c of candidates) {
    const e = byKey.get(keyOf(c));
    if (!e) { plan.toCreate.push(c); continue; }
    const patch = {};
    for (const col of PATCH_COLUMNS) if ((e[col] ?? null) !== (c[col] ?? null)) patch[col] = c[col];
    if (Object.keys(patch).length) plan.toUpdate.push({ roadmap_id: e.roadmap_id, patch });
    else plan.unchanged += 1;
  }
  return plan;
}

const EXISTING_COLUMNS = ["roadmap_id", "manufacturer_id", "tech_category", "source_id", ...PATCH_COLUMNS].join(", ");

function buildCite({ datasetDate, vehicles }) {
  return {
    skill: "s8e1-oem-roadmap-eea-hdv-co2",
    reason:
      `Lane S8-E1 (2026-10-08): oem_tech_roadmaps evidence rows from the EEA heavy-duty vehicle CO2 monitoring extract ` +
      `(${DATASET.csv_url}), licence ${DATASET.licence} (EEA catalogue record), dataset date ${datasetDate ?? "unstated"}, ` +
      `${vehicles} registered vehicles counted. Columns the dataset does not evidence stay NULL.`,
  };
}

/**
 * One run. Everything external arrives through `deps`:
 *   readEntities()                 -> [{entity_id, canonical_name}] organisation entities
 *   resolveSource({ mode })        -> {ok, source_id, tier} | {ok:false, reason}  (rating path; registers on apply)
 *   sourceExists(id)               -> boolean (the read-back that backs the source gate)
 *   readExisting(sourceId)         -> existing oem_tech_roadmaps rows of that source
 *   guardedInsert / guardedUpdate  -> the db.mjs guarded writers
 *   writeSummary(summary)          -> producers-family summary (no-op outside the workflow)
 */
export async function runProducer({
  mode = "dry", chunks, maxBytes, classification, enabled = ENABLED, killSwitchOn = false, hasCreds = false, datasetDate = null, deps,
}) {
  const apply = mode === "apply";
  const out = {
    producer: PRODUCER_NAME, mode, exitCode: 0, dataset: { url: DATASET.csv_url, date: datasetDate, licence: DATASET.licence },
    counts: {}, residue: { byReason: {}, unresolvedManufacturers: [] }, source: null, refusal: null, error: null,
  };
  const finish = (status, rowsChanged, reason = null) => {
    deps.writeSummary({ producer: PRODUCER_NAME, status, rows_changed: rowsChanged, edges_authored: null, reason, counts: { ...out.counts, residue: out.residue.byReason, mode } });
    return out;
  };

  let agg;
  try {
    agg = await aggregateHdvCsv(chunks, { maxBytes });
  } catch (err) {
    if (!(err instanceof EeaHdvFormatError)) throw err;
    out.exitCode = 2;
    out.error = err.message;
    return finish("failed", 0, err.message);
  }
  out.counts = {
    records: agg.totals.records, vehicles_counted: agg.totals.counted,
    vehicles_excluded: Object.values(agg.totals.excluded).reduce((a, b) => a + b, 0), excluded: agg.totals.excluded,
    malformed: agg.totals.malformed, truncated: agg.truncated, groups: agg.groups.length,
  };

  const decision = decideApply({ apply, enabled, killSwitchOn, hasCreds, truncated: agg.truncated });
  if (apply && !decision.canWrite) {
    out.exitCode = 1;
    out.refusal = decision.reason;
    return finish("failed", 0, decision.reason);
  }

  const src = await deps.resolveSource({ mode: decision.canWrite ? "apply" : "dry" });
  if (!src.ok) {
    out.exitCode = apply ? 1 : 0;
    out.refusal = `source not rated: ${src.reason}`;
    out.source = { ok: false, reason: src.reason };
    return finish(apply ? "failed" : "ok", 0, apply ? out.refusal : null);
  }
  out.source = { ok: true, source_id: src.source_id, tier: src.tier };
  if (decision.canWrite && !(await deps.sourceExists(src.source_id))) {
    out.exitCode = 1;
    out.refusal = `REFUSING: the source row ${src.source_id} is absent from sources after registration, so no row can cite it`;
    return finish("failed", 0, out.refusal);
  }

  const cfg = classification ?? loadClassification();
  const entities = await deps.readEntities();
  const { rows, residue } = mapGroupsToRows(agg.groups, { cfg, entities, sourceId: src.source_id });
  out.residue = residue;

  const existing = decision.canWrite ? await deps.readExisting(src.source_id) : [];
  const plan = planOemUpsert(existing, rows);
  out.counts.rows_planned = rows.length;
  out.counts.to_create = plan.toCreate.length;
  out.counts.to_update = plan.toUpdate.length;
  out.counts.unchanged = plan.unchanged;
  out.counts.created = 0;
  out.counts.updated = 0;
  out.counts.written = 0;

  if (decision.canWrite) {
    const cite = buildCite({ datasetDate, vehicles: agg.totals.counted });
    for (const row of plan.toCreate) {
      await deps.guardedInsert(TABLE, row, { cite });
      out.counts.created += 1;
    }
    for (const u of plan.toUpdate) {
      await deps.guardedUpdate(TABLE, (qb) => qb.eq("roadmap_id", u.roadmap_id), u.patch, { cite });
      out.counts.updated += 1;
    }
    out.counts.written = out.counts.created + out.counts.updated;
  }
  return finish("ok", out.counts.written);
}

// ---- CLI --------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  return {
    apply: argv.includes("--apply"), input: get("--input"), entitiesFile: get("--entities-file"),
    maxBytes: get("--max-bytes") ? Number(get("--max-bytes")) : null, datasetDate: get("--dataset-date"), classification: get("--classification"),
  };
}

function datasetDateOf(lastModified) {
  const d = lastModified ? new Date(lastModified) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

async function main(argv) {
  loadLocalEnvFile();
  const args = parseArgs(argv);
  const hasCreds = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const mode = args.apply ? "apply" : "dry";

  let chunks;
  let datasetDate = args.datasetDate;
  let maxBytes = args.maxBytes;
  if (args.input) {
    chunks = createReadStream(args.input);
  } else {
    if (!args.apply && !maxBytes) maxBytes = DRY_SAMPLE_BYTES;
    try {
      const f = await fetchHdvCsv(fetch, { maxBytes: args.apply ? null : maxBytes });
      chunks = f.chunks;
      datasetDate ??= datasetDateOf(f.lastModified);
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      console.error(`${err.message} (exit 3).`);
      return 3;
    }
  }

  const db = hasCreds ? await import("../../lib/db.mjs") : null;
  const cite = { skill: "s8e1-oem-roadmap-eea-hdv-co2", reason: "Lane S8-E1: register the EEA as the cited source of the HDV CO2 extract through the institution class table." };
  const deps = {
    readEntities: async () => {
      if (args.entitiesFile) return JSON.parse(readFileSync(args.entitiesFile, "utf8"));
      if (!db) return [];
      return db.readAll("entities", "entity_id, canonical_name", { match: (q) => q.eq("kind", "organisation"), orderBy: "entity_id" });
    },
    resolveSource: ({ mode: m }) =>
      rateSourceByInstitutionClass({ url: DATASET.page_url, name: DATASET.source_name }, { mode: m, registerSourceFn: db?.registerSource, cite }),
    sourceExists: async (id) => (await db.readAll("sources", "id", { match: (q) => q.eq("id", id), orderBy: "id" })).length > 0,
    readExisting: (sourceId) => db.readAll(TABLE, EXISTING_COLUMNS, { match: (q) => q.eq("source_id", sourceId), orderBy: "roadmap_id" }),
    guardedInsert: (...a) => db.guardedInsert(...a),
    guardedUpdate: (...a) => db.guardedUpdate(...a),
    writeSummary: writeProducerSummary,
  };

  const out = await runProducer({
    mode, chunks, maxBytes, datasetDate, deps, hasCreds, killSwitchOn: process.env[KILL_SWITCH_ENV] === "1",
    classification: args.classification ? loadClassification(args.classification) : undefined,
  });

  console.log(`${PRODUCER_NAME}: ${out.counts.vehicles_counted ?? 0} vehicle(s) counted of ${out.counts.records ?? 0} record(s), ${out.counts.groups ?? 0} group(s)${out.counts.truncated ? " (byte-limited read)" : ""}${mode === "dry" ? " (DRY RUN)" : ""}`);
  if (out.source) console.log(`${PRODUCER_NAME}: source ${out.source.ok ? `${out.source.source_id} at tier ${out.source.tier}` : `NOT RATED: ${out.source.reason}`}`);
  console.log(`${PRODUCER_NAME}: rows planned ${out.counts.rows_planned ?? 0}, created ${out.counts.created ?? 0}, updated ${out.counts.updated ?? 0}, unchanged ${out.counts.unchanged ?? 0}, written ${out.counts.written ?? 0}`);
  for (const [reason, r] of Object.entries(out.residue.byReason)) console.log(`${PRODUCER_NAME}: residue ${reason}: ${r.groups} group(s), ${r.units} vehicle(s)`);
  for (const m of out.residue.unresolvedManufacturers.slice(0, 20)) console.log(`${PRODUCER_NAME}: manufacturer not in spine: ${m.manufacturer} (${m.units} vehicle(s))`);
  if (out.error) console.error(`${PRODUCER_NAME}: ${out.error} (exit 2).`);
  if (out.refusal) console.error(`${PRODUCER_NAME}: ${out.refusal} (exit 1).`);
  if (mode === "dry" && !out.exitCode) console.log(`${PRODUCER_NAME}: DRY RUN, nothing written.`);
  return out.exitCode;
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err); process.exit(1); });
}
