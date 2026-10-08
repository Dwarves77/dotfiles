// ukpn-capacity-heatmap-producer.test.mjs -- lane S8-E6. Fixtures only: the real UK Power Networks release file
// and catalogue metadata saved in ./fixtures (see the header file there). No network, no database: fetch and the
// db deps are injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapHeatmapFile, planUpsert, decideApply, checkMetadata, selectAttachments, fetchDataset, run, resolveSource,
  KILL_SWITCH_ENV, METADATA_URL, GB_JURISDICTION_ID, REFRESHABLE, rowKey, NetworkError, InputError, SourceNotRegisteredError,
  SOURCE_URL, PORTAL_HOST, ORIGIN_CLASS,
} from "./ukpn-capacity-heatmap-producer.mjs";
import { validateEnvelope } from "../../../src/lib/contracts/envelope.mjs";
import { entityId } from "../../../src/lib/entities/entity-id.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { buildSchema, columnLists } from "../../../supabase/migrations/_lib/fixture-inserts.mjs";
import { loadProducerRegistry, buildCommands } from "../registry/load-registry.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "fixtures");
const FILE = JSON.parse(readFileSync(join(FX, "ukpn-capacity-heatmap-sample.json"), "utf8"));
const META = JSON.parse(readFileSync(join(FX, "ukpn-capacity-heatmap-metadata-sample.json"), "utf8"));
const SRC_ID = "11111111-2222-3333-4444-555555555555";
const clone = (o) => JSON.parse(JSON.stringify(o));

// Columns the table has after migration 297 + 379 that a mapped row may name.
const ALL_COLUMNS = [
  "jurisdiction_id", "dso_name", "capacity_band_mw", "queue_months_p50", "queue_months_p90", "as_of", "obs_status",
  "substation_ref", "substation_name", "demand_firm_mw", "demand_available_mw", "demand_constraint",
  "demand_constraint_limiting_factor", "source_id", "origin_class", "derivation", "confidence_admiralty",
];

// ---- parser and mapper on the real file ----------------------------------------------------------------

test("the real LPN release file maps to one row per substation, with no warning", () => {
  const m = mapHeatmapFile(FILE, { sourceId: SRC_ID });
  assert.equal(FILE.Substations.length, 128);
  assert.equal(m.rows.length, 128);
  assert.deepEqual(m.warnings, []);
  assert.equal(m.as_of, "2026-05-29");
  assert.equal(m.dso_name, "UK Power Networks, London Power Network");
  const by = (c) => m.rows.filter((r) => r.demand_constraint === c).length;
  assert.deepEqual([by("GREEN"), by("AMBER"), by("RED")], [126, 1, 1]);
});

test("mapper: every covered column carries the file's own value; a deficit stays negative", () => {
  const m = mapHeatmapFile(FILE, { sourceId: SRC_ID });
  const a = m.rows.find((r) => r.substation_name === "Aberdeen Pl A 11kV");
  assert.equal(a.substation_ref, "3676c386-4dae-5539-b99f-0f5072bf057c");
  assert.equal(a.demand_firm_mw, 57);
  assert.equal(a.demand_available_mw, 13);
  assert.equal(a.demand_constraint, "GREEN");
  assert.equal(a.demand_constraint_limiting_factor, "Thermal");
  assert.equal(a.jurisdiction_id, GB_JURISDICTION_ID);
  assert.equal(a.source_id, SRC_ID);
  assert.equal(a.origin_class, ORIGIN_CLASS);
  assert.equal(a.derivation, "observed");
  const bow = m.rows.find((r) => r.substation_name === "Bow 11kV");
  assert.equal(bow.demand_available_mw, -3.1);
  assert.equal(bow.demand_constraint, "RED");
});

test("mapper: every uncovered column is NULL (months, band, rating), obs_status is L (not covered), and no column outside the table is named", () => {
  for (const r of mapHeatmapFile(FILE, { sourceId: SRC_ID }).rows) {
    assert.equal(r.queue_months_p50, null);
    assert.equal(r.queue_months_p90, null);
    assert.equal(r.capacity_band_mw, null);
    assert.equal(r.confidence_admiralty, null);
    assert.equal(r.obs_status, "L");
    for (const k of Object.keys(r)) assert.ok(ALL_COLUMNS.includes(k), `unknown column ${k}`);
    assert.equal(Object.keys(r).length, ALL_COLUMNS.length, "every column is stated explicitly, NULL where uncovered");
  }
});

test("envelope completeness: each MW figure has a valid envelope with unit, derivation, origin_class, as_of triple and source", () => {
  const m = mapHeatmapFile(FILE, { sourceId: SRC_ID });
  assert.equal(m.envelopes.size, 256);
  for (const env of m.envelopes.values()) {
    assert.deepEqual(validateEnvelope(env), []);
    assert.equal(env.unit, "MW");
    assert.equal(env.derivation, "observed");
    assert.equal(env.origin_class, "official");
    assert.equal(env.as_of.event_date, "2026-05-29");
    assert.equal(env.as_of.source_published_at, "2026-05-29");
    assert.equal(env.expected_refresh, "biannual");
    assert.equal(env.provenance.licence, "CC BY 4.0");
    assert.match(env.provenance.url, /ukpowernetworks\.opendatasoft\.com/);
  }
});

test("as_of comes from the file's own issued date, never the clock", () => {
  const f = clone(FILE);
  f.issued = "2024-01-31T00:00:00Z";
  assert.equal(mapHeatmapFile(f).rows[0].as_of, "2024-01-31");
  delete f.issued;
  assert.throws(() => mapHeatmapFile(f), InputError);
});

test("mapper refuses a file whose licence URL, identifier or publisher changed", () => {
  for (const [k, v] of [["rights", "https://example.org/proprietary"], ["identifier", "other-dataset"], ["publisher", ""], ["coverage", null]]) {
    const f = clone(FILE);
    f[k] = v;
    assert.throws(() => mapHeatmapFile(f), InputError, k);
  }
  assert.throws(() => mapHeatmapFile({ ...clone(FILE), Substations: "x" }), InputError);
});

test("mapper skips a bad substation with a warning, never coercing it", () => {
  const f = clone(FILE);
  f.Substations[0].demandConstraint = "PURPLE";
  f.Substations[1].demandAvailableCapacity = "13";
  f.Substations[2].demandFirmCapacity = -1;
  f.Substations[3].mRID = f.Substations[4].mRID;
  f.Substations[5].name = "";
  const m = mapHeatmapFile(f);
  assert.equal(m.rows.length, 128 - 5);
  assert.equal(m.warnings.length, 5);
});

// ---- catalogue metadata, attachments, fetch ------------------------------------------------------------

test("checkMetadata passes the real metadata and refuses a licence change", () => {
  const ok = checkMetadata(META);
  assert.equal(ok.licence, "CC BY 4.0");
  assert.equal(ok.files.length, 3);
  const m = clone(META);
  m.metas.default.license = "All rights reserved";
  assert.throws(() => checkMetadata(m), InputError);
  const w = clone(META);
  w.dataset_id = "something-else";
  assert.throws(() => checkMetadata(w), InputError);
});

test("selectAttachments takes the three heatmap JSON files only, and only on the portal host", () => {
  const titles = selectAttachments(META).map((a) => a.title);
  assert.deepEqual(titles.sort(), ["LTDS_Heatmap_EPN_2026_01_JSON_2026_05_29_v1.0.json", "LTDS_Heatmap_LPN_2026_01_JSON_2026_05_29_v1.0.json", "LTDS_Heatmap_SPN_2026_01_JSON_2026_05_29_v1.0.json"]);
  const m = clone(META);
  m.attachments.push({ id: "x", title: "LTDS_Heatmap_XXX_evil.json", mimetype: "application/json", url: "https://evil.example.com/a.json" });
  m.attachments.push({ id: "y", title: "LTDS_Heatmap_YYY_plain.json", mimetype: "application/json", url: `http://${PORTAL_HOST}/a.json` });
  assert.equal(selectAttachments(m).length, 3);
});

function stubFetch({ failOn = null } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (failOn && url.includes(failOn)) return { ok: false, status: 403, text: async () => "{}" };
    if (url === METADATA_URL) return { ok: true, status: 200, text: async () => JSON.stringify(META) };
    // EPN and SPN: only the LPN file is real; these two are test-local variants that differ in the licence area
    // (coverage) so their keys are distinct. Never saved as fixtures.
    const area = url.includes("_epn_") ? "Eastern Power Network" : url.includes("_spn_") ? "South Eastern Power Network" : null;
    const body = area ? { ...FILE, coverage: area } : FILE;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

test("fetchDataset reads the metadata then each attachment, and never the records endpoint", async () => {
  const f = stubFetch();
  const ds = await fetchDataset(f);
  assert.equal(ds.files.length, 3);
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls[0], METADATA_URL);
  assert.ok(f.calls.every((u) => !u.includes("/records")));
});

test("fetchDataset: any failed area is fatal (a missing area is never silent)", async () => {
  await assert.rejects(() => fetchDataset(stubFetch({ failOn: "_epn_" })), NetworkError);
  await assert.rejects(() => fetchDataset(async () => { throw new Error("boom"); }), NetworkError);
});

// ---- plan ----------------------------------------------------------------------------------------------

test("planUpsert: create new, patch only what differs, leave identical rows and everything else alone", () => {
  const rows = mapHeatmapFile(FILE, { sourceId: SRC_ID }).rows.slice(0, 3);
  const existing = [
    { queue_id: "q1", ...rows[0] },
    { queue_id: "q2", ...rows[1], demand_available_mw: 99, queue_months_p50: 12 },
  ];
  const p = planUpsert(existing, rows);
  assert.equal(p.unchanged, 1);
  assert.equal(p.toCreate.length, 1);
  assert.equal(p.toCreate[0].substation_ref, rows[2].substation_ref);
  assert.equal(p.toUpdate.length, 1);
  assert.deepEqual(p.toUpdate[0], { queue_id: "q2", patch: { demand_available_mw: rows[1].demand_available_mw } });
  for (const u of p.toUpdate) for (const k of Object.keys(u.patch)) assert.ok(REFRESHABLE.includes(k));
  for (const k of ["queue_months_p50", "queue_months_p90", "capacity_band_mw", "obs_status"]) assert.ok(!REFRESHABLE.includes(k), k);
  assert.equal(rowKey(rows[0]), rowKey({ ...rows[0] }));
});

// ---- gates and run -------------------------------------------------------------------------------------

test("decideApply: dry, disabled, no kill switch, no creds, all armed", () => {
  const base = { apply: true, enabled: true, killSwitchOn: true, hasCreds: true };
  assert.equal(decideApply({ ...base, apply: false }).canWrite, false);
  assert.match(decideApply({ ...base, enabled: false }).reason, /ENABLED/);
  assert.match(decideApply({ ...base, killSwitchOn: false }).reason, new RegExp(KILL_SWITCH_ENV));
  assert.match(decideApply({ ...base, hasCreds: false }).reason, /creds/);
  assert.equal(decideApply(base).canWrite, true);
});

function fakeDeps({ sources = [{ id: SRC_ID, url: SOURCE_URL, status: "active", base_tier: 7 }], entities = [{ entity_id: GB_JURISDICTION_ID }], rows = [] } = {}) {
  const log = { inserted: [], updated: [], registered: [], reads: [] };
  return {
    log,
    readAll: async (table) => { log.reads.push(table); return { sources, entities, grid_connection_queues: rows }[table] ?? []; },
    guardedInsertMany: async (table, batch, opts) => { assert.equal(table, "grid_connection_queues"); assert.ok(opts.cite.skill && opts.cite.reason); log.inserted.push(...batch); return { inserted: batch.length }; },
    guardedUpdate: async (table, _match, patch, opts) => { assert.ok(opts.cite.skill); log.updated.push(patch); return { updated: 1 }; },
    registerSource: async (src, opts) => { assert.ok(opts.cite.skill); log.registered.push(src); return { source_id: SRC_ID, created: true }; },
  };
}
const ARMED = { [KILL_SWITCH_ENV]: "1", NEXT_PUBLIC_SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" };
const quiet = { log: () => {}, warn: () => {} };
const trapDeps = new Proxy({}, { get: () => () => { throw new Error("a dry run must not touch the database"); } });

test("dry run: fetches, maps, plans, reports counts, touches no database", async () => {
  const lines = [];
  const out = await run({ argv: ["node", "x"], env: {}, fetchFn: stubFetch(), deps: trapDeps, log: (l) => lines.push(l), warn: () => {} });
  assert.equal(out.exitCode, 0);
  assert.equal(out.summary.mode, "dry");
  assert.equal(out.summary.parsed, 384);
  assert.equal(out.summary.created, 0);
  assert.ok(lines.some((l) => /plan: 384 to create, 0 to update/.test(l)));
  assert.ok(lines.some((l) => /nothing written/.test(l)));
  assert.equal(out.summary.tier, 7);
});

test("dry run from local files (--meta, --file) works with no fetch", async () => {
  const out = await run({
    argv: ["node", "x", "--meta", "m", "--file", "f"], env: {}, fetchFn: () => { throw new Error("no network"); }, deps: trapDeps,
    readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet,
  });
  assert.equal(out.exitCode, 0);
  assert.equal(out.summary.parsed, 128);
});

test("input failures: licence changed exits 2, network failure exits 3, a lone --meta exits 2", async () => {
  const m = clone(META);
  m.metas.default.license = "Proprietary";
  const f = async (u) => ({ ok: true, status: 200, text: async () => JSON.stringify(u === METADATA_URL ? m : FILE) });
  assert.equal((await run({ argv: ["node", "x"], env: {}, fetchFn: f, deps: trapDeps, ...quiet })).exitCode, 2);
  assert.equal((await run({ argv: ["node", "x"], env: {}, fetchFn: async () => ({ ok: false, status: 500, text: async () => "" }), deps: trapDeps, ...quiet })).exitCode, 3);
  assert.equal((await run({ argv: ["node", "x", "--meta", "m"], env: {}, fetchFn: stubFetch(), deps: trapDeps, ...quiet })).exitCode, 2);
});

test("apply refused while a gate is off: no kill switch, no credentials", async () => {
  const d = fakeDeps();
  const a = await run({ argv: ["node", "x", "--apply"], env: { NEXT_PUBLIC_SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "k" }, fetchFn: stubFetch(), deps: d, ...quiet });
  const b = await run({ argv: ["node", "x", "--apply"], env: { [KILL_SWITCH_ENV]: "1" }, fetchFn: stubFetch(), deps: d, ...quiet });
  assert.equal(a.exitCode, 1);
  assert.equal(b.exitCode, 1);
  assert.deepEqual(d.log.reads, []);
});

test("apply refuses when the source row is absent, and says how to register it; nothing is written", async () => {
  const d = fakeDeps({ sources: [] });
  const warns = [];
  const out = await run({ argv: ["node", "x", "--apply"], env: ARMED, fetchFn: stubFetch(), deps: d, log: () => {}, warn: (w) => warns.push(w) });
  assert.equal(out.exitCode, 1);
  assert.ok(warns.some((w) => /no sources row for ukpowernetworks\.opendatasoft\.com/.test(w) && /--register-source/.test(w)));
  assert.deepEqual(d.log.inserted, []);
  await assert.rejects(() => resolveSource(fakeDeps({ sources: [{ id: SRC_ID, url: SOURCE_URL, status: "suspended" }] })), SourceNotRegisteredError);
});

test("apply refuses when the GB jurisdiction entity is not in the spine; nothing is written", async () => {
  const d = fakeDeps({ entities: [] });
  const out = await run({ argv: ["node", "x", "--apply"], env: ARMED, fetchFn: stubFetch(), deps: d, ...quiet });
  assert.equal(out.exitCode, 1);
  assert.deepEqual(d.log.inserted, []);
});

test("apply with every gate armed writes through the guarded path, each row carrying the registered source; a second run is a no-op", async () => {
  const d = fakeDeps();
  const out = await run({ argv: ["node", "x", "--apply"], env: ARMED, fetchFn: stubFetch(), deps: d, ...quiet });
  assert.equal(out.exitCode, 0);
  assert.equal(d.log.inserted.length, 384);
  assert.ok(d.log.inserted.every((r) => r.source_id === SRC_ID && r.origin_class === "official" && r.obs_status === "L"));
  // second run against what the first wrote: nothing to create or update
  const stored = d.log.inserted.map((r, i) => ({ queue_id: `q${i}`, ...r }));
  const d2 = fakeDeps({ rows: stored });
  const again = await run({ argv: ["node", "x", "--apply"], env: ARMED, fetchFn: stubFetch(), deps: d2, ...quiet });
  assert.equal(again.exitCode, 0);
  assert.equal(d2.log.inserted.length, 0);
  assert.equal(d2.log.updated.length, 0);
  assert.equal(again.summary.unchanged, 384);
});

test("apply refreshes a changed figure with a patch of the refreshable fields only", async () => {
  const first = fakeDeps();
  await run({ argv: ["node", "x", "--apply", "--meta", "m", "--file", "f"], env: ARMED, deps: first, readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet });
  const stored = first.log.inserted.map((r, i) => ({ queue_id: `q${i}`, ...r }));
  stored[0] = { ...stored[0], demand_available_mw: 1, queue_months_p50: 7 };
  const d = fakeDeps({ rows: stored });
  const out = await run({ argv: ["node", "x", "--apply", "--meta", "m", "--file", "f"], env: ARMED, deps: d, readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet });
  assert.equal(out.summary.updated, 1);
  assert.deepEqual(Object.keys(d.log.updated[0]), ["demand_available_mw"]);
});

test("--register-source --apply registers the publisher through registerSource at the class table's tier, then writes", async () => {
  const d = fakeDeps({ sources: [] });
  d.registerSource = async (src, opts) => { assert.ok(opts.cite.skill); d.log.registered.push(src); d.readAll = ((orig) => async (t) => (t === "sources" ? [{ id: SRC_ID, url: src.url, status: "active", base_tier: src.base_tier }] : orig(t)))(d.readAll); return { source_id: SRC_ID, created: true }; };
  const out = await run({ argv: ["node", "x", "--apply", "--register-source", "--meta", "m", "--file", "f"], env: ARMED, deps: d, readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet });
  assert.equal(out.exitCode, 0);
  assert.deepEqual(d.log.registered.map((s) => [s.url, s.base_tier]), [[SOURCE_URL, 7]]);
  assert.equal(d.log.inserted.length, 128);
});

test("a successful apply leaves a producer summary for the producers family; a failed write leaves a failed one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ukpn-summary-"));
  const prev = process.env.PRODUCER_SUMMARY_DIR;
  process.env.PRODUCER_SUMMARY_DIR = dir;
  try {
    const d = fakeDeps();
    await run({ argv: ["node", "x", "--apply", "--meta", "m", "--file", "f"], env: ARMED, deps: d, readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet });
    assert.deepEqual(readdirSync(dir), ["ukpn-capacity-heatmap.json"]);
    const ok = JSON.parse(readFileSync(join(dir, "ukpn-capacity-heatmap.json"), "utf8"));
    assert.equal(ok.status, "ok");
    assert.equal(ok.rows_changed, 128);
    const bad = fakeDeps();
    bad.guardedInsertMany = async () => { throw new Error("insert exploded"); };
    await assert.rejects(() => run({ argv: ["node", "x", "--apply", "--meta", "m", "--file", "f"], env: ARMED, deps: bad, readText: (p) => JSON.stringify(p === "m" ? META : FILE), ...quiet }), /insert exploded/);
    assert.equal(JSON.parse(readFileSync(join(dir, "ukpn-capacity-heatmap.json"), "utf8")).status, "failed");
  } finally {
    if (prev === undefined) delete process.env.PRODUCER_SUMMARY_DIR; else process.env.PRODUCER_SUMMARY_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- registry ------------------------------------------------------------------------------------------

test("registry entry validates, feeds grid_connection_queues, is dry by default and sets the producer's kill switch", () => {
  const entry = loadProducerRegistry().find((e) => e.name === "ukpn-capacity-heatmap");
  assert.ok(entry, "registry entry exists");
  assert.equal(entry.domain_table, "grid_connection_queues");
  assert.equal(entry.dry_capable, true);
  assert.equal(entry.in_all, false, "name-only: an all-sweep apply must not fail on this entry before its source row is registered; flip with the run-registered tests when armed");
  assert.equal(entry.enabled_env, KILL_SWITCH_ENV);
  assert.match(entry.licence, /CC BY 4\.0/);
  const dry = buildCommands(entry, { mode: "dry" });
  assert.deepEqual(dry.map((c) => c.args.includes("--apply")), [false]);
  assert.ok(buildCommands(entry, { mode: "apply" })[0].args.includes("--apply"));
  assert.equal(buildCommands(entry, { mode: "apply" })[0].env[KILL_SWITCH_ENV], "1");
});

test("the producer script carries no dash glyph or section sign (rule 022) and no home path (rule 012)", () => {
  const text = readFileSync(join(HERE, "ukpn-capacity-heatmap-producer.mjs"), "utf8");
  assert.ok(!/[\u2013\u2014\u00a7]/.test(text));
  assert.ok(!/(Users[\\/]|\/home\/)/.test(text));
});

test("a duplicate key across two files is ignored with a warning, so the unique key cannot be violated by one run", async () => {
  const warns = [];
  const out = await run({
    argv: ["node", "x", "--meta", "m", "--file", "f", "--file", "g"], env: {}, deps: trapDeps,
    readText: (p) => JSON.stringify(p === "m" ? META : FILE), log: () => {}, warn: (w) => warns.push(w),
  });
  assert.equal(out.summary.parsed, 128);
  assert.equal(warns.filter((w) => /duplicate key/.test(w)).length, 128);
});

test("obs_status L (Missing, not covered) is in the shared vocabulary, and M is not used where no covered source omits a value", async () => {
  const { OBS_STATUS } = await import("../../../src/lib/contracts/vocabularies.mjs");
  const { OBS_STATUS_NO_MONTHS } = await import("./ukpn-capacity-heatmap-producer.mjs");
  assert.equal(OBS_STATUS_NO_MONTHS, "L");
  assert.equal(OBS_STATUS.L.label, "Missing, not covered");
  assert.equal(OBS_STATUS.L.isPresent, false);
  assert.ok(mapHeatmapFile(FILE).rows.every((r) => r.obs_status !== "M"));
});

// ---- composition proof (fitness function F27): the whole chain, real modules, no stubs between them ---------------
// Real parser input (the committed fixture files read from disk by run() itself), the real mapper and planner, the real
// writeProducerSummary writing into a temp dir, the real entityId for GB, and the rows the guarded insert receives
// checked against the table as migrations 297 and 379 define it. Only the database is a fake (it records its inserts).

const MIG_DIR = join(HERE, "..", "..", "..", "supabase", "migrations");

function listFromSql(sql, column) {
  const code = sql.split("\n").map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); }).join("\n");
  const m = new RegExp(`(?<!\\w)${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(code);
  return m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]) : null;
}

test("COMPOSITION: fixture files -> parser -> mapper -> planner -> guarded insert -> producer summary on disk, rows insertable under migration 379", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ukpn-composition-"));
  const prev = process.env.PRODUCER_SUMMARY_DIR;
  process.env.PRODUCER_SUMMARY_DIR = dir;
  try {
    const d = fakeDeps();
    const out = await run({
      argv: ["node", "x", "--apply", "--meta", join(FX, "ukpn-capacity-heatmap-metadata-sample.json"), "--file", join(FX, "ukpn-capacity-heatmap-sample.json")],
      env: ARMED, deps: d, ...quiet, // readText defaults to the real fs
    });
    assert.equal(out.exitCode, 0);
    assert.equal(d.log.inserted.length, 128);

    // the real entityId for GB, the one the spine is minted with
    const gb = entityId("jurisdiction", "GB");
    assert.equal(GB_JURISDICTION_ID, gb);
    assert.ok(d.log.inserted.every((r) => r.jurisdiction_id === gb));

    // the summary on disk is what the real writeProducerSummary writes for this run
    assert.deepEqual(readdirSync(dir), ["ukpn-capacity-heatmap.json"]);
    const onDisk = JSON.parse(readFileSync(join(dir, "ukpn-capacity-heatmap.json"), "utf8"));
    assert.equal(onDisk.producer, "ukpn-capacity-heatmap");
    assert.equal(onDisk.status, "ok");
    assert.equal(onDisk.rows_changed, 128);
    assert.equal(onDisk.edges_authored, null);
    assert.equal(onDisk.counts.created, 128);
    const ref = mkdtempSync(join(tmpdir(), "ukpn-composition-ref-"));
    process.env.PRODUCER_SUMMARY_DIR = ref;
    const refPath = writeProducerSummary({ producer: "ukpn-capacity-heatmap", status: "ok", rows_changed: 128, edges_authored: null, counts: onDisk.counts });
    const expected = JSON.parse(readFileSync(refPath, "utf8"));
    for (const k of ["written_at"]) { delete expected[k]; delete onDisk[k]; }
    assert.deepEqual(onDisk, expected);
    rmSync(ref, { recursive: true, force: true });

    // every inserted row is insertable under migration 297 + 379 (rebuilt from the tree, 379 included)
    const t = buildSchema(MIG_DIR, { before: 380 }).tables.get("grid_connection_queues");
    const sql379 = readFileSync(join(MIG_DIR, "379_grid_connection_queues_substation_evidence.sql"), "utf8");
    const rag = listFromSql(sql379, "demand_constraint");
    const origins = listFromSql(sql379, "origin_class");
    const derivations = listFromSql(sql379, "derivation");
    const obs = columnLists(buildSchema(MIG_DIR, { before: 380 }), "grid_connection_queues", "obs_status")[0].values;
    for (const r of d.log.inserted) {
      for (const k of Object.keys(r)) assert.ok(t.columns.has(k), `${k} is a column of grid_connection_queues`);
      for (const col of t.columns.values()) {
        if (col.notNull && !col.hasDefault) assert.ok(r[col.name] != null, `${col.name} is NOT NULL with no default and is written`);
      }
      assert.ok(rag.includes(r.demand_constraint));
      assert.ok(origins.includes(r.origin_class));
      assert.ok(derivations.includes(r.derivation));
      assert.ok(obs.has(r.obs_status));
      assert.ok(r.capacity_band_mw != null || r.substation_ref != null, "379 CHECK: a band or a substation");
      assert.ok(r.demand_firm_mw >= 0, "379 CHECK: firm capacity is not negative");
      assert.ok(r.source_id && r.origin_class && r.derivation, "379 CHECK: a demand figure carries its envelope");
    }
    const keys = new Set(d.log.inserted.map((r) => `${r.dso_name}|${r.substation_ref}|${r.as_of}`));
    assert.equal(keys.size, d.log.inserted.length, "379 UNIQUE (dso_name, substation_ref, as_of) holds across the batch");
    // the envelopes the mapper built for the same rows are valid
    for (const env of mapHeatmapFile(FILE, { sourceId: SRC_ID }).envelopes.values()) assert.deepEqual(validateEnvelope(env), []);
  } finally {
    if (prev === undefined) delete process.env.PRODUCER_SUMMARY_DIR; else process.env.PRODUCER_SUMMARY_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
