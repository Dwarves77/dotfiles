// neso-carbon-intensity-producer.test.mjs, lane S8-E5 (2026-10-08). Proof for the NESO Carbon Intensity producer
// (spec 09 section 1.5 via coordinator ruling A: GB grid carbon intensity is a regional_data_facts fact, dimension
// grid_intensity, migration 378). Also the F27 composition proof: it imports every first-party seam the producer
// composes (the shared envelope module, run-envelope-producer's two pure exports, producer-summary) and runs them
// together on the committed REAL fixture (a 14-day sample fetched from the API on 2026-10-08).
//
// $0, no network, no database: every dependency is injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  ENABLED, PRODUCER_NAME, SOURCE_KEY, DIMENSION, REGION_CODE, FACT_LABEL, UNIT, SOURCE_URL, SOURCE_NAME, KILL_SWITCH_ENV,
  buildUrl, parseNesoStats, decideApply, runNesoCarbonIntensity,
} from "./neso-carbon-intensity-producer.mjs";
// F27 seams, imported so the composition is proven in this one file.
import { toCandidateRows, latestPerNaturalKey } from "./run-envelope-producer.mjs";
import { planUpsert } from "../../../src/lib/regional/regional-facts-envelope.mjs";
import { writeProducerSummary } from "../lib/producer-summary.mjs";
import { loadProducerRegistry } from "../registry/load-registry.mjs";
import { classTierForHost, verdictPlacementForHost, HOST_CLASS_TIER } from "../../../src/lib/sources/host-authority.ts";
import { loadHostVerdicts } from "../../maintenance/host-verdicts/load-host-verdicts.mjs";
import { hostOf } from "../../../src/lib/sources/institution.ts";
import { ORIGIN_CLASSES } from "../../../src/lib/contracts/vocabularies.mjs";
import { DERIVATIONS } from "../../../src/lib/contracts/envelope.mjs";
import { withoutCredentials } from "../../lib/env-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FSI_ROOT = resolve(HERE, "..", "..", "..");
const FIXTURE_PATH = join(HERE, "fixtures", "neso-carbon-intensity-sample.json");
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf8");
const FIXTURE = JSON.parse(FIXTURE_TEXT);
const HEADER = readFileSync(join(HERE, "fixtures", "neso-carbon-intensity-sample.header.md"), "utf8");
const FETCHED_ON = new Date("2026-10-08T13:10:15Z");

// ── the kill switch and the constants ───────────────────────────────────────────────────────────────
test("ENABLED is false: the producer is dry-only until a reviewed commit arms it (build mode, no population)", () => {
  assert.equal(ENABLED, false);
});

test("constants: one dimension fact for the UK region, unit and source key as migration 378 registers them", () => {
  assert.equal(PRODUCER_NAME, "neso-carbon-intensity");
  assert.equal(DIMENSION, "grid_intensity");
  assert.equal(REGION_CODE, "UK");
  assert.equal(SOURCE_KEY, "neso_carbon_intensity");
  assert.equal(UNIT, "gCO2/kWh");
  assert.match(KILL_SWITCH_ENV, /^[A-Z][A-Z0-9_]*$/);
  const sql = readFileSync(join(FSI_ROOT, "supabase", "migrations", "378_grid_intensity_dimension.sql"), "utf8");
  assert.ok(sql.includes(`'${SOURCE_KEY}'`), "migration 378 registers the source key");
  assert.ok(sql.includes(`'${DIMENSION}'`), "migration 378 admits the dimension");
});

// ── the fetch window ──────────────────────────────────────────────────────────────────────────────
test("buildUrl: complete days only (14 days ending yesterday 23:59Z), and it equals the URL the committed fixture was fetched with", () => {
  const url = buildUrl(FETCHED_ON);
  assert.equal(url, "https://api.carbonintensity.org.uk/intensity/stats/2026-09-24T00:00Z/2026-10-07T23:59Z/24");
  assert.ok(HEADER.includes(url), "the fixture header quotes the fetch URL");
  assert.ok(HEADER.includes("2026-10-08"), "the fixture header quotes the fetch date");
  assert.match(HEADER, /CC BY 4\.0/);
});

// ── the parser, against the real fixture ──────────────────────────────────────────────────────────
test("parseNesoStats: the real fixture yields one observation per published daily period (14), nothing dropped", () => {
  assert.equal(FIXTURE.data.length, 14);
  const { observations, warnings } = parseNesoStats(FIXTURE);
  assert.deepEqual(warnings, []);
  assert.equal(observations.length, 14);
  const first = observations[0];
  assert.equal(first.value_numeric, 132);
  assert.equal(first.reference_period, "2026-09-24");
  assert.equal(first.as_at_date, "2026-09-25", "as_of is the API's period end");
  assert.equal(first.source_ref, "carbonintensity.org.uk:/intensity/stats/2026-09-24T00:00Z/2026-09-25T00:00Z/24");
  const last = observations[13];
  assert.equal(last.value_numeric, 142);
  assert.equal(last.reference_period, "2026-10-07");
  assert.equal(last.as_at_date, "2026-10-08");
});

test("every observation carries the full number envelope: unit, observed, official, source, as_of, period, method", () => {
  const { observations } = parseNesoStats(FIXTURE);
  for (const o of observations) {
    assert.equal(o.region_code, "UK");
    assert.equal(o.dimension, "grid_intensity");
    assert.equal(o.fact_label, FACT_LABEL);
    assert.equal(o.unit, "gCO2/kWh");
    assert.equal(o.derivation, "observed");
    assert.ok(DERIVATIONS.includes(o.derivation));
    assert.equal(o.origin_class, "official");
    assert.ok(ORIGIN_CLASSES.includes(o.origin_class));
    assert.equal(o.source_key, SOURCE_KEY);
    assert.ok(Number.isFinite(o.value_numeric) && o.value_numeric >= 0);
    assert.match(o.as_at_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(o.reference_period, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(o.as_at_date > o.reference_period, "the period end is after the period start");
    assert.match(o.method_version, /^neso-carbon-intensity-stats-parser@\d+$/);
    assert.equal(o.n_observations, null, "the response carries no sample size; never estimated");
    assert.equal(o.currency, null, "not a monetary figure");
  }
});

test("parseNesoStats refuses what it cannot state: a non-daily window, a null or negative average, a duplicate period, a malformed document", () => {
  const entry = (from, to, average) => ({ from, to, intensity: { max: 9, average, min: 1, index: "low" } });
  const good = entry("2026-09-24T00:00Z", "2026-09-25T00:00Z", 100);
  const r = parseNesoStats({
    data: [
      good,
      entry("2026-09-25T00:00Z", "2026-09-25T12:00Z", 100), // 12 h block, not a day
      entry("2026-09-26T06:00Z", "2026-09-27T06:00Z", 100), // 24 h but not aligned to midnight
      entry("2026-09-27T00:00Z", "2026-09-28T00:00Z", null), // no average published
      entry("2026-09-28T00:00Z", "2026-09-29T00:00Z", -4), // impossible
      entry("2026-09-29T00:00Z", "2026-09-30T00:00Z", "88"), // a string, not a number
      entry("2026-09-24T00:00Z", "2026-09-25T00:00Z", 999), // duplicate period, first wins
      { from: "yesterday", to: "today", intensity: { average: 5 } },
    ],
  });
  assert.equal(r.observations.length, 1);
  assert.equal(r.observations[0].value_numeric, 100);
  assert.equal(r.warnings.length, 7);
  assert.throws(() => parseNesoStats({}), /not a Carbon Intensity stats document/);
  assert.throws(() => parseNesoStats(null), /not a Carbon Intensity stats document/);
  assert.throws(() => parseNesoStats({ data: "x" }), /not a Carbon Intensity stats document/);
});

// ── the seam: observations -> candidate rows -> the live table's constraints ──────────────────────
test("composition: observations -> toCandidateRows -> latestPerNaturalKey -> exactly ONE current-state row (the newest period)", () => {
  const { observations } = parseNesoStats(FIXTURE);
  const candidates = toCandidateRows(observations);
  assert.equal(candidates.length, 14);
  const latest = latestPerNaturalKey(candidates);
  assert.equal(latest.length, 1, "fact_label carries no date, so the 14 periods collapse: regional_data_facts is current-state, not a series");
  assert.equal(latest[0].reference_period, "2026-10-07");
  assert.equal(latest[0].value_numeric, 142);
  assert.equal(latest[0].as_at_date, "2026-10-08");
});

test("every candidate row satisfies regional_data_facts: NOT NULL value text, dimension in the 378 list, envelope columns set, uncovered columns absent", () => {
  const sql = readFileSync(join(FSI_ROOT, "supabase", "migrations", "378_grid_intensity_dimension.sql"), "utf8");
  const list = /ADD CONSTRAINT regional_data_facts_dimension_check\s+CHECK \(dimension IN \(([^)]*)\)\)/.exec(sql)[1];
  const allowed = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const rows = latestPerNaturalKey(toCandidateRows(parseNesoStats(FIXTURE).observations));
  for (const r of rows) {
    assert.equal(typeof r.value, "string");
    assert.equal(r.value, "142 gCO2/kWh");
    assert.ok(allowed.includes(r.dimension));
    assert.ok(r.fact_label.length > 0 && r.region_code === "UK");
    for (const k of ["value_numeric", "unit", "derivation", "origin_class", "source_key", "source_ref", "method_version", "as_at_date", "reference_period"]) {
      assert.ok(r[k] !== null && r[k] !== undefined && r[k] !== "", `${k} is set`);
    }
    // columns the dataset does not supply are not set (status, trend are not in the envelope row at all)
    assert.equal("status" in r, false);
    assert.equal("trend" in r, false);
    assert.equal(r.n_observations, null);
    assert.equal(r.currency, null);
  }
});

test("idempotent: planning the same candidates against rows already written yields an empty plan; a changed value yields an update", () => {
  const candidates = latestPerNaturalKey(toCandidateRows(parseNesoStats(FIXTURE).observations));
  const existing = candidates.map((c, i) => ({ ...c, id: `row-${i}` }));
  const same = planUpsert(existing, candidates);
  assert.deepEqual([same.toInsert.length, same.toUpdate.length, same.unchanged], [0, 0, 1]);
  const changed = planUpsert(existing.map((e) => ({ ...e, value_numeric: 1, value: "1 gCO2/kWh" })), candidates);
  assert.equal(changed.toUpdate.length, 1);
});

// ── the gate ──────────────────────────────────────────────────────────────────────────────────────
test("decideApply: dry never writes; apply needs ENABLED, then the kill switch, then creds, in that order", () => {
  assert.equal(decideApply({ apply: false, enabled: true, killSwitchOn: true, hasCreds: true }).canWrite, false);
  assert.match(decideApply({ apply: true, enabled: false, killSwitchOn: true, hasCreds: true }).reason, /ENABLED constant/);
  assert.match(decideApply({ apply: true, enabled: true, killSwitchOn: false, hasCreds: true }).reason, new RegExp(KILL_SWITCH_ENV));
  assert.match(decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: false }).reason, /DB creds/);
  assert.equal(decideApply({ apply: true, enabled: true, killSwitchOn: true, hasCreds: true }).canWrite, true);
});

// ── the run, through an injected fake db ──────────────────────────────────────────────────────────
function fakeDeps({ dataSources = [{ source_key: SOURCE_KEY }], regions = [{ id: "uk-id", code: "UK" }], existing = [], registered = [] } = {}) {
  const calls = { inserted: [], updated: [], registered, reads: [] };
  return {
    calls,
    fetchText: async () => FIXTURE_TEXT,
    hasCreds: true,
    readAllFn: async (table) => {
      calls.reads.push(table);
      if (table === "data_sources") return dataSources;
      if (table === "regions") return regions;
      if (table === "regional_data_facts") return existing;
      throw new Error(`unexpected read of ${table}`);
    },
    registerSourceFn: async (source, { cite }) => {
      assert.ok(cite?.skill && cite?.reason, "registerSource is always cited");
      calls.registered.push(source);
      return { source_id: "src-neso-1", created: true };
    },
    guardedInsertFn: async (table, row, { cite }) => {
      assert.equal(table, "regional_data_facts");
      assert.ok(cite?.skill && cite?.reason, "every write is cited");
      calls.inserted.push(row);
      return { inserted: true };
    },
    guardedUpdateFn: async (table, _match, patch, { cite }) => {
      assert.equal(table, "regional_data_facts");
      assert.ok(cite?.skill && cite?.reason);
      calls.updated.push(patch);
      return { updated: 1 };
    },
  };
}

test("the source is rated by the class table plus the committed host verdict batch (never hand-typed): the dry preview tier is the table's gov tier, and the figure is not refused", async () => {
  const deps = fakeDeps();
  const s = await runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, deps);
  const host = hostOf(SOURCE_URL);
  const committed = loadHostVerdicts();
  assert.equal(committed.verdicts.get(host)?.class, "gov", "host-verdicts-001.json classes the host gov");
  assert.deepEqual(committed.rejected, [], "the committed batches load without a rejected entry");
  assert.equal(s.source.ok, true);
  assert.equal(s.source.tier, HOST_CLASS_TIER.gov, "the tier is read from the class table for the verdict's class");
  assert.equal(s.source.tier, verdictPlacementForHost(host, committed.verdicts).tier);
  assert.equal(classTierForHost(host, null), null, "no curated host-only rule places it, so the verdict is what answers");
  assert.equal(classTierForHost(host, SOURCE_NAME), 7, "the residue catch-all would answer 7 for a named host, which is why the verdict is consulted before it");
  assert.equal(s.source.source_id, `preview:${host}`);
});

test("without the verdict batch the built-in rules alone answer tier 7 (the class table's answer before the batch applies)", async () => {
  const host = hostOf(SOURCE_URL);
  const s = await runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, { ...fakeDeps(), hostVerdicts: new Map() });
  assert.equal(s.source.tier, classTierForHost(host, SOURCE_NAME));
  assert.equal(s.source.tier, 7);
});

test("DRY RUN writes nothing and reports counts; the source is not registered and no row is inserted", async () => {
  const deps = fakeDeps();
  const s = await runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, deps);
  assert.equal(s.mode, "dry");
  assert.equal(s.refused, null);
  assert.deepEqual([s.parsed, s.warnings.length, s.candidates], [14, 0, 1]);
  assert.deepEqual(s.plan, { insert: 1, update: 0, unchanged: 0 });
  assert.deepEqual([s.applied.inserted, s.applied.updated], [0, 0]);
  assert.deepEqual([deps.calls.inserted.length, deps.calls.updated.length, deps.calls.registered.length], [0, 0, 0]);
  assert.equal(s.exitCode, 0);
});

test("DRY RUN with no db credentials still parses and previews, and says which checks it skipped", async () => {
  const deps = { ...fakeDeps(), hasCreds: false, readAllFn: async () => { throw new Error("must not read"); } };
  const s = await runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, deps);
  assert.equal(s.exitCode, 0);
  assert.deepEqual([s.parsed, s.candidates], [14, 1]);
  assert.equal(s.checks.skipped, "no DB creds: data_sources, regions and existing-row checks were not run");
});

test("APPLY (every gate open, through the fake db): registers the source, writes ONE fact stamped with region_id and the rated source_id", async () => {
  const deps = fakeDeps();
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, deps);
  assert.equal(s.refused, null);
  assert.equal(deps.calls.registered.length, 1);
  assert.equal(deps.calls.registered[0].url, SOURCE_URL);
  assert.equal(deps.calls.registered[0].base_tier, s.source.tier);
  assert.equal(deps.calls.inserted.length, 1);
  const row = deps.calls.inserted[0];
  assert.equal(row.region_id, "uk-id");
  assert.equal("region_code" in row, false, "the table stores region_id, not the caller-facing code");
  assert.equal(row.source_id, "src-neso-1", "the fact carries the rated source (rule 18)");
  assert.equal(row.source_key, SOURCE_KEY);
  assert.equal(row.dimension, "grid_intensity");
  assert.equal(row.value, "142 gCO2/kWh");
  assert.equal(row.as_at_date, "2026-10-08");
  assert.deepEqual([s.applied.inserted, s.applied.updated], [1, 0]);
});

test("APPLY twice: the second run over the rows the first wrote plans nothing and writes nothing (idempotent)", async () => {
  const first = fakeDeps();
  await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, first);
  const written = first.calls.inserted.map((r, i) => ({ ...r, id: `row-${i}` }));
  const second = fakeDeps({ existing: written });
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, second);
  assert.deepEqual(s.plan, { insert: 0, update: 0, unchanged: 1 });
  assert.deepEqual([second.calls.inserted.length, second.calls.updated.length], [0, 0]);
});

test("APPLY with a changed upstream value updates the existing row, and the patch keeps the rated source_id", async () => {
  const stale = fakeDeps();
  await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, stale);
  const existing = stale.calls.inserted.map((r, i) => ({ ...r, id: `row-${i}`, value_numeric: 7, value: "7 gCO2/kWh" }));
  const deps = fakeDeps({ existing });
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, deps);
  assert.deepEqual(s.plan, { insert: 0, update: 1, unchanged: 0 });
  assert.equal(deps.calls.updated[0].value_numeric, 142);
  assert.equal(deps.calls.updated[0].source_id, "src-neso-1");
});

test("REFUSES to write when the data_sources row is absent: names the missing row and migration 378, and registers nothing", async () => {
  const deps = fakeDeps({ dataSources: [] });
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, deps);
  assert.match(s.refused, /data_sources has no row for source_key neso_carbon_intensity/);
  assert.match(s.refused, /migration 378/);
  assert.equal(s.exitCode, 1);
  assert.deepEqual([deps.calls.inserted.length, deps.calls.registered.length], [0, 0], "no side effect before the refusal");
});

test("REFUSES when the UK region row is absent (a region code is never guessed into a uuid)", async () => {
  const deps = fakeDeps({ regions: [{ id: "eu-id", code: "EU" }] });
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, enabled: true, killSwitchOn: true }, deps);
  assert.match(s.refused, /region code UK not found in regions/);
  assert.equal(s.exitCode, 1);
  assert.equal(deps.calls.inserted.length, 0);
});

test("REFUSES apply while ENABLED is false or the kill switch is off, before any read or registration", async () => {
  for (const gates of [{ enabled: false, killSwitchOn: true }, { enabled: true, killSwitchOn: false }]) {
    const deps = fakeDeps();
    const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, ...gates }, deps);
    assert.ok(s.refused);
    assert.equal(s.exitCode, 1);
    assert.deepEqual([deps.calls.reads.length, deps.calls.registered.length, deps.calls.inserted.length], [0, 0, 0]);
  }
  // the shipped default: the module constant is false, so a bare apply with the switch on is still refused
  const deps = fakeDeps();
  const s = await runNesoCarbonIntensity({ apply: true, now: FETCHED_ON, killSwitchOn: true }, deps);
  assert.match(s.refused, /ENABLED constant/);
});

test("an HTTP failure or an unrecognisable body stops the run with a named error and no write", async () => {
  const bad = { ...fakeDeps(), fetchText: async () => { throw new Error("fetch failed 503 Service Unavailable"); } };
  await assert.rejects(runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, bad), /503/);
  const junk = { ...fakeDeps(), fetchText: async () => "<html>maintenance</html>" };
  await assert.rejects(runNesoCarbonIntensity({ apply: false, now: FETCHED_ON }, junk));
});

// ── the registry entry ────────────────────────────────────────────────────────────────────────────
test("registry entry: validated by load-registry, dry_capable, feeds regional_data_facts, kill switch matches the producer", () => {
  const entry = loadProducerRegistry().find((e) => e.name === "neso-carbon-intensity");
  assert.ok(entry, "registry/neso-carbon-intensity.json is present and valid");
  assert.equal(entry.script, "scripts/producers/regional/neso-carbon-intensity-producer.mjs");
  assert.equal(entry.domain_table, "regional_data_facts");
  assert.equal(entry.source, SOURCE_KEY);
  assert.match(entry.licence, /CC BY 4\.0/);
  assert.equal(entry.dry_capable, true);
  assert.equal(entry.enabled_env, KILL_SWITCH_ENV);
  assert.equal(entry.in_all, false, "an apply sweep must not be broken by a producer whose apply is refused until it is armed");
});

test("the producer imports producer-summary (the registry wiring test holds every entry to this)", () => {
  assert.equal(typeof writeProducerSummary, "function");
  assert.match(readFileSync(join(HERE, "neso-carbon-intensity-producer.mjs"), "utf8"), /producer-summary\.mjs/);
});

// ── the CLI, dry, on the fixture ──────────────────────────────────────────────────────────────────
test("CLI: a dry run on --input prints the plan and exits 0 with no credentials; --apply is refused (exit 1) while ENABLED is false", () => {
  const env = withoutCredentials();
  const dry = spawnSync(process.execPath, [join(HERE, "neso-carbon-intensity-producer.mjs"), "--input", FIXTURE_PATH], { encoding: "utf8", env });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /parsed 14 period\(s\)/);
  assert.match(dry.stdout, /DRY RUN/);
  const apply = spawnSync(process.execPath, [join(HERE, "neso-carbon-intensity-producer.mjs"), "--input", FIXTURE_PATH, "--apply"], { encoding: "utf8", env: { ...env, [KILL_SWITCH_ENV]: "1" } });
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /ENABLED constant/);
});

test("the producer rates through the shared step only: it imports no host-authority, institution or verdict-loader module of its own", () => {
  const full = readFileSync(join(HERE, "neso-carbon-intensity-producer.mjs"), "utf8");
  const src = full.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10));
  assert.match(src, /rate-source-by-class\.mjs/);
  for (const forbidden of ["host-authority", "load-host-verdicts", "verdictPlacementForHost", "classTierForHost("]) {
    assert.equal(src.includes(forbidden), false, `no private verdict logic: ${forbidden}`);
  }
});
