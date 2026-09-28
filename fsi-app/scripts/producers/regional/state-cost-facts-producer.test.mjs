import test from "node:test";
import assert from "node:assert/strict";
import {
  ENABLED,
  runStateCostFactsProducer,
  resolveRegionIds,
  authorJurisdictionEntitiesForStates,
  authorAutomateVsHireForStates,
  buildRunArtifact,
  FSI_ROOT,
  GOVERNING_FILES,
  HARNESS_FAMILY,
} from "./state-cost-facts-producer.mjs";
import { FIXTURE_CANDIDATES, fixtureFetchCapture } from "./fixtures/state-cost-facts-fixtures.mjs";
import { writeRunArtifact, hashHarnessVersion, readRunHistory } from "../../lib/run-artifact.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// F27 (producer-seam-proof) composition proof: state-cost-facts-producer.mjs's two first-party seams
// (src/lib/entities/entity-plan.mjs, src/lib/regional/state-cost-facts-envelope.mjs) MUST be exercised
// TOGETHER by one proof, see that gate's own header for the WO-17/2026-08-30 incident this closes for
// this producer (each seam proved in isolation, nothing proved the seam BETWEEN them). Imported directly
// here (not only transitively through state-cost-facts-producer.mjs) so F27's textual scan sees both.
import { buildStateCostFactRow, planUpsert as planStateCostUpsert } from "../../../src/lib/regional/state-cost-facts-envelope.mjs";
import { planJurisdictionEntities, planJurisdictionRefs } from "../../../src/lib/entities/entity-plan.mjs";
// The producer's two NEWER first-party seams (lane STATE-COST-DAG 2026-09-27), imported directly here too
// so F27's textual scan sees all four seams composed in one proof (see the composition test below, which
// now also exercises authorAutomateVsHireForStates end to end against these two real modules).
import { authorEdges } from "../../../src/lib/propagation/author-edges.mjs";
import { isHourlyWageUnit } from "../../../src/lib/operations/automate-vs-hire.mjs";

// ── R14 hold: the kill switch itself ─────────────────────────────────────────────────────────────────
test("ENABLED is false, R14 hold, no live rows from this lane", () => {
  assert.equal(ENABLED, false);
});

// ── fixture deps: no DB, no network, everything injected ────────────────────────────────────────────
function fakeReadAll(regionRows, existingStateCostRows) {
  return async (table) => {
    if (table === "regions") return regionRows;
    if (table === "state_cost_facts") return existingStateCostRows;
    throw new Error(`fakeReadAll: unexpected table ${table}`);
  };
}

function fakeDeps({ regionRows = [{ id: "region-us-id", code: "US" }], existingStateCostRows = [] } = {}) {
  const inserted = [];
  const updated = [];
  const entityWrites = [];
  let nextId = 1;
  return {
    readAllFn: fakeReadAll(regionRows, existingStateCostRows),
    guardedInsertFn: async (table, row) => {
      assert.equal(table, "state_cost_facts");
      const withId = { ...row, id: `row-${nextId++}` };
      inserted.push(withId);
      return { inserted: withId };
    },
    guardedUpdateFn: async (table, _match, patch) => {
      assert.equal(table, "state_cost_facts");
      updated.push(patch);
      return { updated: 1 };
    },
    registerSourceFn: async (source, { cite }) => {
      assert.ok(cite?.skill, "registerSourceFn must be called with a cite");
      return { source_id: `src:${source.url}`, created: true };
    },
    existingEntityIdSetFn: async () => new Set(),
    existingIdentifierKeySetFn: async () => new Set(),
    existingRefKeySetFn: async () => new Set(),
    guardedInsertManyFn: async (table, rows) => {
      entityWrites.push({ table, rows });
      return { inserted: rows.length };
    },
    _inspect: { inserted, updated, entityWrites },
  };
}

// ── the two required refusal proofs ──────────────────────────────────────────────────────────────────
test("dry run: an ungrounded figure (paraphrased span) is refused, never written", async () => {
  const deps = fakeDeps();
  const result = await runStateCostFactsProducer({
    candidates: [FIXTURE_CANDIDATES[3]], // US-NY, span not verbatim in its capture
    fetchCapture: fixtureFetchCapture,
    mode: "dry",
    deps,
  });
  assert.equal(result.metrics.refused_ungrounded, 1);
  assert.equal(result.metrics.to_insert, 0);
  assert.equal(result.perItem[0].outcome, "refused_ungrounded");
});

test("dry run: an unrated source (host not in the institution class table) is refused, never hand-typed a tier", async () => {
  const deps = fakeDeps();
  const result = await runStateCostFactsProducer({
    candidates: [FIXTURE_CANDIDATES[4]], // US-WA, up.codes -> classTierForHost returns null
    fetchCapture: fixtureFetchCapture,
    mode: "dry",
    deps,
  });
  assert.equal(result.metrics.refused_unrated_source, 1);
  assert.equal(result.metrics.to_insert, 0);
  assert.match(result.perItem[0].verdict, /not classified by the institution class table/);
});

// ── rows built correctly with source + rating ────────────────────────────────────────────────────────
test("apply mode: a grounded, rated candidate is written with source_id + origin_class, and the entity spine is authored", async () => {
  const deps = fakeDeps();
  const result = await runStateCostFactsProducer({
    candidates: [FIXTURE_CANDIDATES[0], FIXTURE_CANDIDATES[1]], // US-CA labor_markets, US-TX operational_cost
    fetchCapture: fixtureFetchCapture,
    mode: "apply",
    deps,
  });

  assert.equal(result.metrics.to_insert, 2);
  assert.equal(result.metrics.inserted, 2);
  assert.equal(deps._inspect.inserted.length, 2);

  const ca = deps._inspect.inserted.find((r) => r.state_code === "US-CA");
  assert.equal(ca.dimension, "labor_markets");
  assert.equal(ca.value, "16.00");
  assert.equal(ca.source_id, "src:https://www.dir.ca.gov/dlse/faq_minimumwage.htm");
  assert.equal(ca.origin_class, "official"); // dir.ca.gov is a T2 government host
  assert.equal(ca.region_id, "region-us-id");

  const tx = deps._inspect.inserted.find((r) => r.state_code === "US-TX");
  assert.equal(tx.dimension, "operational_cost");
  assert.equal(tx.origin_class, "official"); // tceq.texas.gov is a T2 government host

  // Downstream trigger: jurisdiction entity spine authored for both states this run wrote.
  assert.equal(result.metrics.written, true);
  assert.equal(result.metrics.planned_entities, 2); // US-CA, US-TX both new
  assert.ok(result.metrics.planned_refs >= 2);
  const entityRefWrite = deps._inspect.entityWrites.find((w) => w.table === "entity_refs");
  assert.ok(entityRefWrite, "entity_refs should have been written");
  assert.ok(entityRefWrite.rows.every((r) => r.ref_table === "state_cost_facts" && r.role === "jurisdiction"));
});

test("apply mode: re-running with an unchanged row writes nothing (idempotent upsert)", async () => {
  const existingRow = {
    id: "row-existing",
    state_code: "US-CA",
    dimension: "labor_markets",
    fact_label: "State minimum wage",
    value: "16.00",
    value_numeric: 16,
    unit: "USD/hour",
    trend: "up",
    source_id: "src:https://www.dir.ca.gov/dlse/faq_minimumwage.htm",
    statute_citation: "Cal. Labor Code section  1182.12",
    effective_date: "2026-01-01",
    origin_class: "official",
  };
  const deps = fakeDeps({ existingStateCostRows: [existingRow] });
  const result = await runStateCostFactsProducer({
    candidates: [FIXTURE_CANDIDATES[0]],
    fetchCapture: fixtureFetchCapture,
    mode: "apply",
    deps,
  });
  assert.equal(result.metrics.to_insert, 0);
  assert.equal(result.metrics.unchanged, 1);
  assert.equal(deps._inspect.inserted.length, 0);
  assert.equal(deps._inspect.updated.length, 0);
});

// ── region resolution: throws (never guesses) on a missing region code ──────────────────────────────
test("resolveRegionIds throws on a region code absent from the live regions table", async () => {
  await assert.rejects(
    () => resolveRegionIds(["ZZ"], async () => [{ id: "x", code: "US" }]),
    /region code\(s\) not found/,
  );
});

// ── entity-spine downstream trigger, isolated ────────────────────────────────────────────────────────
test("authorJurisdictionEntitiesForStates: dry mode previews without writing", async () => {
  const counts = await authorJurisdictionEntitiesForStates(
    [{ id: "row-1", state_code: "US-CA" }],
    "dry",
    {
      existingEntityIdSetFn: async () => new Set(),
      existingIdentifierKeySetFn: async () => new Set(),
      existingRefKeySetFn: async () => new Set(),
      planJurisdictionEntitiesFn: (codes) => ({
        entities: codes.map((c) => ({ entity_id: `cl:jurisdiction:${c}` })),
        identifiers: [],
        byCode: new Map(codes.map((c) => [c, `cl:jurisdiction:${c}`])),
      }),
      planJurisdictionRefsFn: () => [{ ref_table: "state_cost_facts", ref_id: "row-1", entity_id: "cl:jurisdiction:US-CA", role: "jurisdiction" }],
      guardedInsertManyFn: async () => { throw new Error("must not write in dry mode"); },
    },
  );
  assert.equal(counts.written, false);
  assert.equal(counts.planned_entities, 1);
  assert.equal(counts.planned_refs, 1);
});

// ── authorAutomateVsHireForStates (migration 332/333, lane STATE-COST-DAG 2026-09-27): dry mode is a
// TRUE preview (unlike the region-grain twin, which no-ops for dry), the real registered method runs
// against fixture rows, no DB is touched, and the caller gets back the computed preview value ─────────
test("authorAutomateVsHireForStates: dry mode PREVIEWS a real automate_vs_hire computation for a state with a complete wage+energy pair", async () => {
  const rows = [
    { id: "preview:US-CA|labor_markets|State minimum wage", state_code: "US-CA", dimension: "labor_markets", value_numeric: 16, unit: "USD/hour" },
    { id: "preview:US-CA|operational_cost|Industrial electricity rate", state_code: "US-CA", dimension: "operational_cost", value_numeric: 19.3, unit: "cents/kWh" },
  ];
  const byCode = new Map([["US-CA", "cl:jurisdiction:deadbeefcafefeed"]]);
  const result = await authorAutomateVsHireForStates(rows, "dry", byCode);
  assert.equal(result.pairs_found, 1);
  assert.equal(result.previewed, 1);
  assert.equal(result.authored, 0); // dry never authors for real
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].state_code, "US-CA");
  assert.equal(result.edges[0].entity, "cl:jurisdiction:deadbeefcafefeed");
  assert.equal(result.edges[0].ok, true);
  assert.equal(typeof result.edges[0].preview_value.value, "number", "the REAL registered method computed a real NPV, not a stub");
  assert.equal(result.edges[0].preview_value.unit, "USD");
});

test("authorAutomateVsHireForStates: an incomplete pair (only one dimension) is skipped, never partially authored", async () => {
  const rows = [
    { id: "preview:US-TX|operational_cost|x", state_code: "US-TX", dimension: "operational_cost", value_numeric: 8.4, unit: "cents/kWh" },
  ];
  const result = await authorAutomateVsHireForStates(rows, "dry", new Map());
  assert.equal(result.pairs_found, 0);
  assert.equal(result.skipped_incomplete, 1);
  assert.equal(result.edges.length, 0);
});

test("authorAutomateVsHireForStates: an annual (non-hourly) wage fact never resolves as the wage input (never divides by 2080)", async () => {
  const rows = [
    { id: "preview:US-CA|labor_markets|annual", state_code: "US-CA", dimension: "labor_markets", value_numeric: 33280, unit: "USD/year" },
    { id: "preview:US-CA|operational_cost|x", state_code: "US-CA", dimension: "operational_cost", value_numeric: 19.3, unit: "cents/kWh" },
  ];
  const result = await authorAutomateVsHireForStates(rows, "dry", new Map());
  assert.equal(result.pairs_found, 0, "an annual wage fact must not count as a resolvable hourly wage input");
  assert.equal(result.skipped_incomplete, 1);
});

test("authorAutomateVsHireForStates: apply mode routes through the injected authorEdgesFn (the real register_derived_value path), never the dry fakes", async () => {
  const rows = [
    { id: "row-wage-1", state_code: "US-CA", dimension: "labor_markets", value_numeric: 16, unit: "USD/hour" },
    { id: "row-energy-1", state_code: "US-CA", dimension: "operational_cost", value_numeric: 19.3, unit: "cents/kWh" },
  ];
  const byCode = new Map([["US-CA", "cl:jurisdiction:deadbeefcafefeed"]]);
  const calls = [];
  const fakeAuthorEdges = async (sb, figure) => {
    calls.push({ sb, figure });
    return { ok: true, action: "authored", valueId: "real-value-id-1" };
  };
  const result = await authorAutomateVsHireForStates(rows, "apply", byCode, { sb: "REAL_SB_MARKER", authorEdgesFn: fakeAuthorEdges });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sb, "REAL_SB_MARKER", "apply mode must pass the real sb through, never a preview fake");
  assert.equal(calls[0].figure.table, "state_cost_facts");
  assert.deepEqual(calls[0].figure.inputs, [
    { table: "state_cost_facts", pk: "row-wage-1" },
    { table: "state_cost_facts", pk: "row-energy-1" },
  ]);
  assert.equal(result.authored, 1);
  assert.equal(result.previewed, 0);
});

test("state-cost-facts-producer.mjs CLI run end to end (dry mode, real fixtures): California's wage+energy pair authors one PREVIEWED edge with a real computed NPV", async () => {
  const result = await runStateCostFactsProducer({
    candidates: FIXTURE_CANDIDATES,
    fetchCapture: fixtureFetchCapture,
    mode: "dry",
    deps: fakeDeps(),
  });
  assert.equal(result.metrics.dag_pairs_found, 1);
  assert.equal(result.metrics.dag_previewed, 1);
  assert.equal(result.metrics.dag_authored, 0);
  assert.equal(result.dagEdges.length, 1);
  assert.equal(result.dagEdges[0].state_code, "US-CA");
  assert.equal(typeof result.dagEdges[0].preview_value.value, "number");
});

// ── F27 composition proof: state-cost-facts-envelope.mjs's row output fed into entity-plan.mjs's
// jurisdiction planners, asserted against the LIVE state_cost_facts / entities schema constraints, not
// just each module's own output shape (the exact seam WO-17's 2026-08-30 incident shipped unproven) ────
test("composition: buildStateCostFactRow's output composes into planJurisdictionEntities/planJurisdictionRefs, both sides matching live schema constraints", () => {
  const candidate = {
    state_code: "US-CA",
    state_label: "California",
    dimension: "labor_markets", // one of the live state_cost_facts_dimension_check's 6 values
    fact_label: "State minimum wage",
    value: "16.00",
    unit: "USD/hour",
    trend: "up", // live state_cost_facts_trend_check: up|down|flat|null
    effective_date: "2026-01-01",
    statute_citation: "Cal. Labor Code section  1182.12",
  };
  const row = buildStateCostFactRow(candidate, { source_id: "src-1", tier: 2 }, "region-us-id");

  // Side A: the row itself satisfies the live state_cost_facts CHECK constraints (migration 152/267).
  const LIVE_DIMENSIONS = ["regulatory_feasibility", "regional_resources", "labor_markets", "materials_sourcing", "infrastructure", "operational_cost"];
  const LIVE_TRENDS = ["up", "down", "flat", null];
  assert.ok(LIVE_DIMENSIONS.includes(row.dimension), "row.dimension must satisfy state_cost_facts_dimension_check");
  assert.ok(LIVE_TRENDS.includes(row.trend), "row.trend must satisfy state_cost_facts_trend_check");
  assert.ok(["official", "verified", null].includes(row.origin_class), "row.origin_class must satisfy the 267 origin_class CHECK's allowed subset this producer emits");

  // Side B: the row's own natural key (state_code, dimension, fact_label) plans identically through
  // planStateCostUpsert (proves the envelope module's insert/update planner agrees with the row shape
  // buildStateCostFactRow just produced, the seam WITHIN state-cost-facts-envelope.mjs itself).
  const plan = planStateCostUpsert([], [row]);
  assert.deepEqual(plan.toInsert, [row]);

  // Side C: the SAME row composes into entity-plan.mjs's jurisdiction planners (the producer's actual
  // downstream call), entity_id format matches the live entity_id CHECK (`cl:jurisdiction:<16 hex>`),
  // and the ISO3166_2-shaped state_code gets a crosswalk identifier (never a free-text jurisdiction).
  const { entities, identifiers, byCode } = planJurisdictionEntities([row.state_code]);
  assert.equal(entities.length, 1);
  assert.match(entities[0].entity_id, /^cl:jurisdiction:[0-9a-f]{16}$/, "entity_id must match the live entities.entity_id CHECK (migration 282)");
  assert.equal(identifiers.length, 1);
  assert.equal(identifiers[0].scheme, "ISO3166_2", "US-CA must crosswalk as ISO3166_2, not a free-text supranational code");

  const refs = planJurisdictionRefs("state_cost_facts", [{ id: "row-composed-1", jurisdiction_iso: [row.state_code] }], byCode);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].ref_table, "state_cost_facts");
  assert.equal(refs[0].role, "jurisdiction");
  assert.equal(refs[0].entity_id, entities[0].entity_id, "the ref must point at the SAME entity the row's own state_code minted, proving the composed seam, not two independent computations");

  // Side D (lane STATE-COST-DAG 2026-09-27): the SAME row (an hourly wage fact, isHourlyWageUnit confirms
  // it) composes into author-edges.mjs's authorEdges, the fourth seam this producer imports, closing the
  // gap F27 itself measures (a seam proof that stops one import short of every seam it should cover).
  assert.equal(isHourlyWageUnit(row.unit), true, "the fixture wage row must be hourly for the DAG step to accept it, same gate automate-vs-hire.ts applies");
  const energyRow = { ...row, dimension: "operational_cost", unit: "cents/kWh" };
  function fakeChain() {
    const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, then: (resolve) => resolve({ data: [], error: null }) };
    return q;
  }
  const fakeSb = { from: () => fakeChain() };
  const edgeResult = authorEdges(
    fakeSb,
    {
      table: "state_cost_facts", // must be a member of migration 333's widened derivation_edges_from_table_allowed
      id: "wage-1",
      entity: entities[0].entity_id,
      method: { id: "automate_vs_hire", version: "1.0.0" },
      inputs: [
        { table: "state_cost_facts", pk: "wage-1" },
        { table: "state_cost_facts", pk: "energy-1" },
      ],
    },
    {
      resolveInputs: async (_sb, inputs) =>
        inputs.map((ref) => ({
          table: ref.table,
          pk: ref.pk,
          version: null,
          row: ref.pk === "wage-1" ? { dimension: row.dimension, value_numeric: row.value_numeric, unit: row.unit } : { dimension: energyRow.dimension, value_numeric: energyRow.value_numeric, unit: energyRow.unit },
        })),
      registerDerivedValue: async () => "composed-preview-value-id",
    },
  );
  return edgeResult.then((r) => {
    assert.equal(r.ok, true, "the composed row must resolve through the real registered automate_vs_hire method");
    assert.equal(r.action, "authored");
  });
});

// ── harness record: a real artifact lands on disk, non-empty full_trace_refs ─────────────────────────
test("harness record: writeRunArtifact lands a real artifact for a fixture run, full_trace_refs non-empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "state-cost-harness-"));
  try {
    const deps = fakeDeps();
    const result = await runStateCostFactsProducer({
      candidates: FIXTURE_CANDIDATES,
      fetchCapture: fixtureFetchCapture,
      mode: "dry",
      deps,
    });
    const artifact = buildRunArtifact({
      runId: "state-cost-run-001",
      harnessVersion: hashHarnessVersion(GOVERNING_FILES[HARNESS_FAMILY], FSI_ROOT),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      config: { mode: "dry" },
      inputsRef: ["scripts/producers/regional/fixtures/state-cost-facts-fixtures.mjs"],
      result,
      runError: null,
      fixturesPath: "scripts/producers/regional/fixtures/state-cost-facts-fixtures.mjs",
    });
    const path = writeRunArtifact(dir, artifact);
    assert.ok(path);
    const { runs, invalid } = readRunHistory(dir);
    assert.equal(invalid.length, 0);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].harness_family, "state-cost");
    assert.ok(runs[0].full_trace_refs.length > 0);
    // The 2 refusals (ungrounded NY, unrated WA) surface as defects, never silently dropped.
    assert.ok(runs[0].defects_found.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
