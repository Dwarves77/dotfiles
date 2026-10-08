// eea-hdv-co2-producer.test.mjs -- lane S8-E1. Proves the producer: the fetch adapter (injected fetch), the apply gates,
// the source gate, the idempotent plan, a dry run that writes nothing, an apply through fake guarded writers, the
// registry entry and the licence header beside the fixture. No network, no database: every dependency is injected.
// Zero-emission rows in the apply tests come from a SYNTHETIC config and a SYNTHETIC csv built here, never from a
// claimed EEA value (the shipped config maps no zero-emission fuel; see eea-hdv-map.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCER_NAME, ENABLED, KILL_SWITCH_ENV, DATASET, decideApply, planOemUpsert, fetchHdvCsv, runProducer, NetworkError,
} from "./eea-hdv-co2-producer.mjs";
import { validateClassification, OEM_COLUMNS } from "./eea-hdv-map.mjs";
import { EEA_HDV_COLUMNS } from "./eea-hdv-csv.mjs";
import { loadProducerRegistry } from "../registry/load-registry.mjs";
import { ORIGIN_CLASSES } from "../../../src/lib/contracts/vocabularies.mjs";
import { DERIVATIONS } from "../../../src/lib/contracts/envelope.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI = resolve(HERE, "..", "..", "..");
const SAMPLE = readFileSync(join(HERE, "fixtures", "eea-hdv-sample.csv"));

const SOURCE_ID = "00000000-0000-4000-8000-0000000000e1";
const ENTITIES = [{ entity_id: "cl:organisation:00000000000000a1", canonical_name: "acme-trucks.example" }];
const SYNTH = validateClassification({
  zev_tech_rules: [{ when: { ms_fuel: "SYNTH-BATTERY" }, tech_category: "heavy_battery" }],
  stage_rules: [{ min_units: 1, stage: "pilot_demonstration" }, { min_units: 3, stage: "small_batch_fleet" }],
  manufacturer_aliases: { "Acme Trucks AG": "acme-trucks.example" },
});

function synthCsv(n = 4) {
  const base = { Match: "Match", UniqueData: "Yes", OEM_ManufacturerName: "Acme Trucks AG", OEM_ZeroEmissionVehicle: "Yes", OEM_HybridElectricHDV: "No", OEM_DualFuelVehicle: "No", MS_FuelType: "SYNTH-BATTERY", MS_Electric: "Yes", MS_RegistrationCountry: "DE", MS_RegistrationDateClean_YYYYMMDD: "20230101" };
  const rows = Array.from({ length: n }, () => EEA_HDV_COLUMNS.map((c) => base[c] ?? "").join(","));
  return [EEA_HDV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

function fakeDeps(over = {}) {
  const calls = { inserts: [], updates: [], summaries: [], sourceResolves: 0 };
  const deps = {
    readEntities: async () => ENTITIES,
    resolveSource: async ({ mode }) => {
      calls.sourceResolves += 1;
      return mode === "apply" ? { ok: true, source_id: SOURCE_ID, tier: 2 } : { ok: true, source_id: "preview:eea.europa.eu", tier: 2 };
    },
    sourceExists: async (id) => id === SOURCE_ID,
    readExisting: async () => [],
    guardedInsert: async (table, row, opts) => { calls.inserts.push({ table, row, opts }); return { inserted: 1, snapshot: "snap" }; },
    guardedUpdate: async (table, match, patch, opts) => { calls.updates.push({ table, patch, opts }); return { updated: 1 }; },
    writeSummary: (s) => { calls.summaries.push(s); },
    ...over,
  };
  return { deps, calls };
}

// ---- gates -------------------------------------------------------------------------------------------------------

test("the producer ships with its source-level ENABLED constant false and its own kill-switch name", () => {
  assert.equal(PRODUCER_NAME, "eea-hdv-co2");
  assert.equal(ENABLED, false);
  assert.equal(KILL_SWITCH_ENV, "OEM_PRODUCER_EEA_HDV_ENABLED");
});

test("decideApply: dry never writes; each of the four apply gates refuses by itself; all satisfied writes", () => {
  const ok = { apply: true, enabled: true, killSwitchOn: true, hasCreds: true, truncated: false };
  assert.equal(decideApply({ ...ok, apply: false }).canWrite, false);
  assert.match(decideApply({ ...ok, enabled: false }).reason, /ENABLED constant/);
  assert.match(decideApply({ ...ok, killSwitchOn: false }).reason, new RegExp(KILL_SWITCH_ENV));
  assert.match(decideApply({ ...ok, hasCreds: false }).reason, /DB creds/);
  assert.match(decideApply({ ...ok, truncated: true }).reason, /truncated|partial/i, "a byte-limited read is never applied");
  assert.deepEqual(decideApply(ok), { canWrite: true, reason: "all gates satisfied" });
});

// ---- fetch adapter -----------------------------------------------------------------------------------------------

function fakeResponse({ status = 200, body = [Buffer.from("a,b\r\n")], headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300, status, statusText: "x",
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    body: (async function* () { for (const c of body) yield c; })(),
  };
}

test("fetchHdvCsv: asks the dataset url, sends a Range header only when a byte limit is given, returns the chunks and Last-Modified", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return fakeResponse({ status: 206, headers: { "last-modified": "Mon, 28 Apr 2025 10:29:17 GMT" } }); };
  const limited = await fetchHdvCsv(fetchImpl, { maxBytes: 5000 });
  assert.equal(seen[0].url, DATASET.csv_url);
  assert.equal(seen[0].init.headers.range, "bytes=0-4999");
  assert.equal(limited.lastModified, "Mon, 28 Apr 2025 10:29:17 GMT");
  const chunks = [];
  for await (const c of limited.chunks) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), "a,b\r\n");
  await fetchHdvCsv(fetchImpl, {});
  assert.equal(seen[1].init.headers.range, undefined);
});

test("fetchHdvCsv: a non-2xx answer or a thrown fetch is a NetworkError naming the url", async () => {
  await assert.rejects(fetchHdvCsv(async () => fakeResponse({ status: 503 }), {}), (e) => e instanceof NetworkError && e.message.includes(DATASET.csv_url) && /503/.test(e.message));
  await assert.rejects(fetchHdvCsv(async () => { throw new Error("boom"); }, {}), (e) => e instanceof NetworkError && /boom/.test(e.message));
});

// ---- plan --------------------------------------------------------------------------------------------------------

const ROW = (o = {}) => ({
  manufacturer_id: "cl:organisation:00000000000000a1", tech_category: "heavy_battery", commercial_stage: "small_batch_fleet",
  target_year: null, energy_density_wh_kg: null, density_basis: null, c_rate_max: null, usable_kwh: null, announced_at: null,
  source_id: SOURCE_ID, origin_class: "official", derivation: "observed", confidence_admiralty: null, ...o,
});

test("planOemUpsert: creates a missing (manufacturer, technology, source) row, leaves an identical one, patches only the covered columns that differ", () => {
  const exist = (o) => ({ roadmap_id: "r1", ...ROW(), target_year: 2030, usable_kwh: 500, ...o });
  assert.deepEqual(planOemUpsert([], [ROW()]), { toCreate: [ROW()], toUpdate: [], unchanged: 0 });
  assert.deepEqual(planOemUpsert([exist()], [ROW()]), { toCreate: [], toUpdate: [], unchanged: 1 });
  const upd = planOemUpsert([exist({ commercial_stage: "pilot_demonstration" })], [ROW()]);
  assert.deepEqual(upd.toUpdate, [{ roadmap_id: "r1", patch: { commercial_stage: "small_batch_fleet" } }]);
  assert.ok(!("target_year" in upd.toUpdate[0].patch) && !("usable_kwh" in upd.toUpdate[0].patch), "a value another writer set in an uncovered column is never overwritten");
});

test("planOemUpsert: a row from another source for the same manufacturer and technology is neither matched nor touched", () => {
  const other = { roadmap_id: "r9", ...ROW({ source_id: "00000000-0000-4000-8000-0000000000ff", commercial_stage: "announced" }) };
  const plan = planOemUpsert([other], [ROW()]);
  assert.equal(plan.toCreate.length, 1);
  assert.deepEqual(plan.toUpdate, []);
});

// ---- runs --------------------------------------------------------------------------------------------------------

test("dry run on the real sample: writes nothing, never touches a writer, accounts for all 71 vehicles, reports the source tier", async () => {
  const { deps, calls } = fakeDeps({
    guardedInsert: async () => { throw new Error("dry run must not insert"); },
    guardedUpdate: async () => { throw new Error("dry run must not update"); },
  });
  const out = await runProducer({ mode: "dry", chunks: [SAMPLE], datasetDate: "2025-04-28", deps });
  assert.equal(out.exitCode, 0);
  assert.equal(out.mode, "dry");
  assert.equal(out.counts.vehicles_counted, 71);
  assert.equal(out.counts.rows_planned, 0);
  assert.equal(out.counts.written, 0);
  assert.deepEqual(out.residue.byReason, { conventional_powertrain: { groups: 1, units: 71 } });
  assert.equal(out.source.tier, 2);
  assert.equal(out.dataset.date, "2025-04-28");
  assert.equal(calls.inserts.length + calls.updates.length, 0);
  assert.equal(calls.summaries.length, 1, "the producers-family summary is written on a dry run too");
  assert.equal(calls.summaries[0].rows_changed, 0);
  assert.equal(calls.summaries[0].edges_authored, null);
});

test("apply with all gates open: one guarded insert per planned row, each with its cite, source registered through the rating path and read back", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, datasetDate: "2025-04-28", deps });
  assert.equal(out.exitCode, 0);
  assert.equal(out.counts.rows_planned, 1);
  assert.equal(out.counts.written, 1);
  assert.equal(calls.inserts.length, 1);
  const { table, row, opts } = calls.inserts[0];
  assert.equal(table, "oem_tech_roadmaps");
  assert.equal(row.commercial_stage, "small_batch_fleet", "4 units reach the 3-unit rule");
  assert.equal(row.source_id, SOURCE_ID);
  assert.match(opts.cite.skill, /s8e1|eea-hdv/);
  assert.match(opts.cite.reason, /CC BY 4\.0/);
  assert.match(opts.cite.reason, /2025-04-28/);
  assert.equal(calls.summaries[0].status, "ok");
  assert.equal(calls.summaries[0].rows_changed, 1);
});

test("every row an apply writes carries exactly the table's 13 insertable columns, a valid vocabulary and no estimated value", async () => {
  const { deps, calls } = fakeDeps();
  await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  const { row } = calls.inserts[0];
  assert.deepEqual(Object.keys(row).sort(), [...OEM_COLUMNS].sort());
  assert.ok(ORIGIN_CLASSES.includes(row.origin_class));
  assert.ok(DERIVATIONS.includes(row.derivation));
  assert.equal(row.origin_class, "official");
  assert.equal(row.derivation, "observed");
  assert.ok(["heavy_battery", "megawatt_charging", "hydrogen_fcell", "ammonia_engine", "methanol_dualfuel", "saf_refinery", "e_axle", "reefer_electrification"].includes(row.tech_category));
  assert.ok(["announced", "pilot_demonstration", "small_batch_fleet", "mass_series_production"].includes(row.commercial_stage));
  for (const c of ["target_year", "energy_density_wh_kg", "density_basis", "c_rate_max", "usable_kwh", "announced_at", "confidence_admiralty"]) assert.equal(row[c], null, c);
});

test("a second apply over unchanged data writes nothing (idempotent)", async () => {
  const { deps, calls } = fakeDeps({ readExisting: async () => [{ roadmap_id: "r1", manufacturer_id: "cl:organisation:00000000000000a1", tech_category: "heavy_battery", commercial_stage: "small_batch_fleet", source_id: SOURCE_ID, origin_class: "official", derivation: "observed", confidence_admiralty: null }] });
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.counts.written, 0);
  assert.equal(out.counts.unchanged, 1);
  assert.equal(calls.inserts.length + calls.updates.length, 0);
});

test("apply with a changed stage updates through the guarded writer with the patch only", async () => {
  const { deps, calls } = fakeDeps({ readExisting: async () => [{ roadmap_id: "r1", manufacturer_id: "cl:organisation:00000000000000a1", tech_category: "heavy_battery", commercial_stage: "announced", source_id: SOURCE_ID, origin_class: "official", derivation: "observed", confidence_admiralty: null }] });
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.counts.updated, 1);
  assert.deepEqual(calls.updates[0].patch, { commercial_stage: "small_batch_fleet" });
});

test("apply is refused (exit 1, nothing written) when ENABLED is false, which is the shipped state", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.exitCode, 1);
  assert.match(out.refusal, /ENABLED constant/);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.sourceResolves, 0, "no source is registered by a refused apply");
});

test("apply is refused when the read was byte-limited, even with every gate open", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(400)], maxBytes: 3000, classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.exitCode, 1);
  assert.match(out.refusal, /truncated|partial/i);
  assert.equal(calls.inserts.length, 0);
});

test("SOURCE GATE: apply refuses to write when the source row is absent after registration, naming the error", async () => {
  const { deps, calls } = fakeDeps({ sourceExists: async () => false });
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.exitCode, 1);
  assert.match(out.refusal, /source row .* absent/i);
  assert.match(out.refusal, new RegExp(SOURCE_ID));
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.summaries[0].status, "failed");
});

test("SOURCE GATE: a host the institution class table cannot rate is a refusal, not a guessed tier", async () => {
  const { deps, calls } = fakeDeps({ resolveSource: async () => ({ ok: false, reason: "host x is not classified" }) });
  const out = await runProducer({ mode: "apply", chunks: [synthCsv(4)], classification: SYNTH, enabled: true, killSwitchOn: true, hasCreds: true, deps });
  assert.equal(out.exitCode, 1);
  assert.match(out.refusal, /not classified/);
  assert.equal(calls.inserts.length, 0);
});

test("a body that is not the EEA extract (header missing columns) exits 2 with the missing names and writes nothing", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runProducer({ mode: "dry", chunks: ["<html>not csv</html>"], deps });
  assert.equal(out.exitCode, 2);
  assert.match(out.error, /OEM_ManufacturerName/);
  assert.equal(calls.inserts.length, 0);
});

// ---- registry, fixture header, wiring ----------------------------------------------------------------------------

test("registry entry: validated by the loader, dry capable, named-only (not in the all sweep), summary-wired, script on disk", () => {
  const entry = loadProducerRegistry().find((e) => e.name === "eea-hdv-co2");
  assert.ok(entry, "registry/eea-hdv-co2.json is loaded");
  assert.equal(entry.domain_table, "oem_tech_roadmaps");
  assert.equal(entry.dry_capable, true);
  assert.equal(entry.in_all, false, "the extract is about 4 GB; it runs when named, never in the producer=all sweep");
  assert.equal(entry.enabled_env, KILL_SWITCH_ENV);
  assert.equal(entry.source, "eea");
  assert.match(entry.licence, /CC BY 4\.0/);
  assert.match(readFileSync(resolve(FSI, entry.script), "utf8"), /["'][^"']*producer-summary\.mjs["']/, "the script imports producer-summary.mjs, as producer-summary-wiring.test.mjs requires of every registry script");
});

test("the fixture header beside the sample quotes the licence text, the fetch url and date, and matches the sample's size", () => {
  const h = JSON.parse(readFileSync(join(HERE, "fixtures", "eea-hdv-sample.header.json"), "utf8"));
  assert.equal(h.fetch_url, DATASET.csv_url);
  assert.match(h.fetched_at, /^2026-10-08T/);
  assert.match(h.licence_text, /^License CC-BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\)\. Copyright holder: Directorate-General for Climate Action \(DG-CLIMA\), European Environment Agency \(EEA\)\.$/);
  assert.equal(h.sample_bytes, SAMPLE.length);
  assert.ok(SAMPLE.length <= 200 * 1024, "the fixture is at most 200 KB");
  assert.equal(h.dataset_page, DATASET.page_url);
});
