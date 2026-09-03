// Run: node --test scripts/entities/seed-corridors.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entityId, corridorSeed } from "../../src/lib/entities/entity-id.mjs";
import {
  CITE,
  ADR_EXAMPLE_CORRIDORS,
  parseCorridorConvention,
  deriveCorridorCandidatesFromMarketSeries,
  deriveCorridorCandidatesFromRegionalFacts,
  deriveCorridorCandidatesFromItemJurisdictions,
  resolveCorridorCandidates,
  planCorridorEntities,
  main,
} from "./seed-corridors.mjs";

// ── parseCorridorConvention ─────────────────────────────────────────────────────────────────────────

test("parseCorridorConvention: recognises the corridor:<ORIGIN>-<DEST>:<mode> shape, case-insensitive on the codes", () => {
  assert.deepEqual(parseCorridorConvention("corridor:cnsha-nlrtm:ocean"), { origin: "CNSHA", dest: "NLRTM", mode: "ocean" });
  assert.deepEqual(parseCorridorConvention("corridor:USLAX-NLRTM:ocean"), { origin: "USLAX", dest: "NLRTM", mode: "ocean" });
});

test("parseCorridorConvention: null on anything else, including every LIVE series/registry key shape today", () => {
  assert.equal(parseCorridorConvention(null), null);
  assert.equal(parseCorridorConvention(""), null);
  assert.equal(parseCorridorConvention("eu-oil-bulletin:automotive-diesel"), null);
  assert.equal(parseCorridorConvention("ecb-fx:eur-usd"), null);
  assert.equal(parseCorridorConvention("eia-v2:wti-crude-rwtc"), null);
  assert.equal(parseCorridorConvention("eex-eua:eua-primary"), null);
  assert.equal(parseCorridorConvention("Average wage"), null);
  assert.equal(parseCorridorConvention("Energy price index"), null);
});

// ── the three read-and-derive sources ───────────────────────────────────────────────────────────────

test("deriveCorridorCandidatesFromMarketSeries: [] against every live producer keyPrefix (eu-oil-bulletin, eex-eua, ecb-fx, eia-v2)", () => {
  const rows = [
    { series_key: "eu-oil-bulletin:automotive-diesel" },
    { series_key: "eu-oil-bulletin:heating-gasoil" },
    { series_key: "ecb-fx:eur-usd" },
    { series_key: "ecb-fx:eur-gbp" },
    { series_key: "eia-v2:wti-crude-rwtc" },
    { series_key: "eex-eua:eua-primary" },
  ];
  assert.deepEqual(deriveCorridorCandidatesFromMarketSeries(rows), []);
});

test("deriveCorridorCandidatesFromMarketSeries: picks up a future corridor-namespaced series_key, proving the mechanism works", () => {
  const rows = [{ series_key: "eu-oil-bulletin:automotive-diesel" }, { series_key: "corridor:cnsha-nlrtm:ocean" }];
  assert.deepEqual(deriveCorridorCandidatesFromMarketSeries(rows), [
    { origin: "CNSHA", dest: "NLRTM", mode: "ocean", source: "market_series:corridor:cnsha-nlrtm:ocean" },
  ]);
});

test("deriveCorridorCandidatesFromRegionalFacts: [] against the 6 real Operations dimensions' typical fact_label shapes", () => {
  const rows = [
    { fact_label: "Median hourly wage" },
    { fact_label: "Industrial electricity price" },
    { fact_label: "Port congestion index" },
    { fact_label: "Corporate tax rate" },
  ];
  assert.deepEqual(deriveCorridorCandidatesFromRegionalFacts(rows), []);
});

test("deriveCorridorCandidatesFromRegionalFacts: picks up a future corridor-namespaced fact_label", () => {
  const rows = [{ fact_label: "corridor:USLAX-NLRTM:ocean" }];
  assert.deepEqual(deriveCorridorCandidatesFromRegionalFacts(rows), [
    { origin: "USLAX", dest: "NLRTM", mode: "ocean", source: "regional_data_facts:corridor:USLAX-NLRTM:ocean" },
  ]);
});

test("deriveCorridorCandidatesFromItemJurisdictions: ALWAYS [], never pairs a multi-country array into a fabricated corridor", () => {
  const items = [
    { id: "i1", jurisdiction_iso: ["US"] },
    { id: "i2", jurisdiction_iso: ["CN", "IR", "SG", "US"] },
    { id: "i3", jurisdiction_iso: [] },
    { id: "i4", jurisdiction_iso: ["GLOBAL"] },
  ];
  assert.deepEqual(deriveCorridorCandidatesFromItemJurisdictions(items), []);
});

// ── resolveCorridorCandidates: the fallback ─────────────────────────────────────────────────────────

test("resolveCorridorCandidates: falls back to ADR_EXAMPLE_CORRIDORS when nothing live names a corridor pair (today's true state)", () => {
  const r = resolveCorridorCandidates({
    marketSeries: [{ series_key: "eu-oil-bulletin:automotive-diesel" }, { series_key: "ecb-fx:eur-usd" }],
    regionalFacts: [{ fact_label: "Median hourly wage" }],
    items: [{ id: "i1", jurisdiction_iso: ["CN", "US"] }],
  });
  assert.equal(r.usingFallback, true);
  assert.deepEqual(r.candidates.map((c) => [c.origin, c.dest, c.mode]), [["CNSHA", "NLRTM", "ocean"]]);
  assert.deepEqual(r.checked, { marketSeries: 2, regionalFacts: 1, items: 1 });
});

test("resolveCorridorCandidates: prefers live-derived candidates over the fallback, and de-dupes the same corridor seen from two sources", () => {
  const r = resolveCorridorCandidates({
    marketSeries: [{ series_key: "corridor:cnsha-nlrtm:ocean" }],
    regionalFacts: [{ fact_label: "corridor:cnsha-nlrtm:ocean" }],
    items: [],
  });
  assert.equal(r.usingFallback, false);
  assert.equal(r.candidates.length, 1);
  assert.deepEqual([r.candidates[0].origin, r.candidates[0].dest, r.candidates[0].mode], ["CNSHA", "NLRTM", "ocean"]);
});

// ── planCorridorEntities ────────────────────────────────────────────────────────────────────────────

test("planCorridorEntities: mints deterministic ids matching entityId('corridor', corridorSeed(...)) directly, skips existing", () => {
  const candidates = [{ origin: "CNSHA", dest: "NLRTM", mode: "ocean" }];
  const expectedSeed = corridorSeed(candidates[0]);
  const expectedId = entityId("corridor", expectedSeed);

  const { entities, planned, skipped } = planCorridorEntities(candidates, new Set());
  assert.equal(skipped.length, 0);
  assert.deepEqual(entities, [{ entity_id: expectedId, kind: "corridor", canonical_name: expectedSeed, status: "active" }]);
  assert.equal(planned[0].alreadyExists, false);

  const second = planCorridorEntities(candidates, new Set([expectedId]));
  assert.deepEqual(second.entities, []);
  assert.equal(second.planned[0].alreadyExists, true);
});

test("planCorridorEntities: a malformed candidate is skipped with a reason, never crashes the batch", () => {
  const candidates = [{ origin: "CNSHA", dest: "NLRTM", mode: "ocean" }, { origin: "", dest: "NLRTM", mode: "ocean" }, { origin: "USLAX", dest: "NLRTM", mode: "teleport" }];
  const { entities, skipped } = planCorridorEntities(candidates, new Set());
  assert.equal(entities.length, 1);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.every((s) => typeof s.reason === "string" && s.reason.length > 0));
});

test("ADR_EXAMPLE_CORRIDORS: exactly the ADR-024 §4 / migration 258 worked example, and it is a well-formed candidate", () => {
  assert.equal(ADR_EXAMPLE_CORRIDORS.length, 1);
  const c = ADR_EXAMPLE_CORRIDORS[0];
  assert.deepEqual([c.origin, c.dest, c.mode], ["CNSHA", "NLRTM", "ocean"]);
  assert.doesNotThrow(() => entityId("corridor", corridorSeed(c)));
});

// ── main(): deps-injected orchestration ─────────────────────────────────────────────────────────────

function deps(calls, { marketSeries = [], regionalFacts = [], items = [], existingCorridors = [] } = {}) {
  return {
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table]);
      if (table === "market_series") return marketSeries;
      if (table === "regional_data_facts") return regionalFacts;
      if (table === "intelligence_items") return items;
      if (table === "entities") return existingCorridors;
      throw new Error(`unexpected readAll(${table})`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      calls.push(["guardedInsertMany", table, rows, opts]);
      return { inserted: rows.length };
    },
  };
}

test("main dry-run: no live corridor data -> falls back to the ADR example, plans one entity, writes nothing", async () => {
  const calls = [];
  const r = await main({ apply: false }, deps(calls));
  assert.equal(r.mode, "dry-run");
  assert.equal(r.usingFallback, true);
  assert.equal(r.candidateCount, 1);
  assert.equal(r.created, 1);
  assert.equal(r.skipped, 0);
  assert.ok(!calls.some((c) => c[0] === "guardedInsertMany"));
});

test("main apply: writes the planned entity through guardedInsertMany with the CITE, reads entities filtered to kind=corridor", async () => {
  const calls = [];
  const r = await main({ apply: true }, deps(calls));
  assert.equal(r.created, 1);
  const w = calls.find((c) => c[0] === "guardedInsertMany");
  assert.equal(w[1], "entities");
  assert.equal(w[2].length, 1);
  assert.equal(w[2][0].kind, "corridor");
  assert.equal(w[3].cite, CITE);

  const entitiesRead = calls.find((c) => c[0] === "readAll" && c[1] === "entities");
  assert.ok(entitiesRead);
});

test("main: an already-seeded corridor is idempotent — second apply creates nothing", async () => {
  const expectedSeed = corridorSeed(ADR_EXAMPLE_CORRIDORS[0]);
  const expectedId = entityId("corridor", expectedSeed);
  const calls = [];
  const r = await main({ apply: true }, deps(calls, { existingCorridors: [{ entity_id: expectedId }] }));
  assert.equal(r.created, 0);
  assert.equal(r.existing, 1);
  assert.ok(!calls.some((c) => c[0] === "guardedInsertMany"));
});

test("main: live-derived candidates (e.g. a future corridor-namespaced market_series row) take priority over the fallback", async () => {
  const calls = [];
  const r = await main({ apply: false }, deps(calls, { marketSeries: [{ series_key: "corridor:uslax-nlrtm:ocean" }] }));
  assert.equal(r.usingFallback, false);
  assert.equal(r.candidateCount, 1);
  assert.deepEqual([r.planned[0].candidate.origin, r.planned[0].candidate.dest], ["USLAX", "NLRTM"]);
});
