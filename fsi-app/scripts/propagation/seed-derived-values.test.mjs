// seed-derived-values.test.mjs — proves the two seed paths' planning/counting logic and the write shape
// each sends, against hand-rolled fake clients (no real database — same posture as drain.test.mjs /
// register-derivation.test.mjs / superseded-notices.test.mjs). NOT wired into .discipline/run-test-suite.sh
// (scripts/propagation/ is not one of its covered globs today, and this lane's write set does not include
// that file) — a documented, known gap, not an oversight; see the lane's final report. Still runnable
// directly: `node --test scripts/propagation/seed-derived-values.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, seedCarbonIntensity, seedAutomateVsHire, resolveRegionEntityId } from "./seed-derived-values.mjs";
import { entityId } from "../../src/lib/entities/entity-id.mjs";

function fakeClient(tables, { rpcHandler, upsertHandler } = {}) {
  return {
    calls: [],
    from(table) {
      const rows = tables[table] || [];
      const builder = {
        _filters: [],
        select() { return this; },
        eq(col, value) { this._filters.push((r) => r[col] === value); return this; },
        in(col, values) { this._filters.push((r) => values.includes(r[col])); return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => {
          const matched = rows.filter((r) => builder._filters.every((f) => f(r)));
          return { data: matched[0] ?? null, error: null };
        },
        upsert: async (payload, opts) => {
          this.calls.push({ table, payload, opts });
          return upsertHandler ? upsertHandler(table, payload) : { data: payload, error: null };
        },
        then(onfulfilled) {
          const data = rows.filter((r) => this._filters.every((f) => f(r)));
          return Promise.resolve(onfulfilled({ data, error: null }));
        },
      };
      return builder;
    },
    rpc(fn, args) {
      this.calls.push({ fn, args });
      return Promise.resolve(rpcHandler ? rpcHandler(fn, args) : { data: "11111111-1111-1111-1111-111111111111", error: null });
    },
  };
}

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --dry alone selects dry mode", () => {
  assert.deepEqual(parseArgs(["--dry"]), { ok: true, mode: "dry" });
});
test("parseArgs: --apply alone selects apply mode", () => {
  assert.deepEqual(parseArgs(["--apply"]), { ok: true, mode: "apply" });
});
test("parseArgs RED: neither flag is an error", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
});
test("parseArgs RED: both flags together is an error", () => {
  const r = parseArgs(["--dry", "--apply"]);
  assert.equal(r.ok, false);
});

// ── seedCarbonIntensity ──────────────────────────────────────────────────────────────────────────────

const EMBEDDABLE_FACTOR = {
  factor_id: "f-1", quantity_basis: "tonne_km", ttw_co2e: 0.062, wtw_co2e: 0.074, wtt_co2e: 0.012,
  source_key: "desnz_ghg_factors", origin_class: "official", pedigree: 2,
};
const UNSUPPORTED_BASIS_FACTOR = { ...EMBEDDABLE_FACTOR, factor_id: "f-2", quantity_basis: "teu_km" };
const NON_EMBEDDABLE_FACTOR = { ...EMBEDDABLE_FACTOR, factor_id: "f-3", source_key: "iea" }; // IEA: redistribution prohibited

test("seedCarbonIntensity dry: counts wouldCreate for an embeddable, supported-basis factor, writes nothing", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.total, 1);
  assert.equal(r.wouldCreate, 1);
  assert.equal(r.created, 0);
  assert.equal(sb.calls.length, 0, "dry mode issues no rpc calls");
});

test("seedCarbonIntensity: an unsupported quantity_basis is counted as refused, not created", async () => {
  const sb = fakeClient({ emission_factors: [UNSUPPORTED_BASIS_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.refused, 1);
  assert.equal(r.wouldCreate, 0);
});

test("seedCarbonIntensity: a non-embeddable source is counted as licenceBlocked, never even evaluated", async () => {
  const sb = fakeClient({ emission_factors: [NON_EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.licenceBlocked, 1);
  assert.equal(r.wouldCreate, 0);
  assert.equal(r.refused, 0);
});

test("seedCarbonIntensity apply: calls registerDerivedValue's RPC once per created row, with the right method id/version", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] });
  const r = await seedCarbonIntensity(sb, "apply", () => "2026-09-02T00:00:00.000Z");
  assert.equal(r.created, 1);
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].fn, "register_derived_value");
  assert.equal(sb.calls[0].args.p_method_id, "carbon_intensity_tkm");
  assert.equal(sb.calls[0].args.p_method_version, "1.0.0");
  assert.equal(sb.calls[0].args.p_entity_id, null);
  assert.equal(sb.calls[0].args.p_value, 62); // 0.062 kg/tonne-km -> 62 g/tonne-km
});

test("seedCarbonIntensity apply: a failed RPC call is counted as failed with the reason, not thrown", async () => {
  const sb = fakeClient({ emission_factors: [EMBEDDABLE_FACTOR] }, { rpcHandler: () => ({ data: null, error: { message: "boom" } }) });
  const r = await seedCarbonIntensity(sb, "apply");
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /boom/);
});

test("seedCarbonIntensity: a read error yields a zeroed, error-carrying result rather than throwing", async () => {
  const sb = { from: () => ({ select() { return this; }, then(f) { return Promise.resolve(f({ data: null, error: { message: "db down" } })); } }) };
  const r = await seedCarbonIntensity(sb, "dry");
  assert.equal(r.total, 0);
  assert.match(r.errors[0], /db down/);
});

// ── seedAutomateVsHire ───────────────────────────────────────────────────────────────────────────────

const WAGE = { id: "wage-1", region_id: "r-us", dimension: "labor_markets", value_numeric: 28.5, unit: "USD/hour", last_updated: "2026-06-01T00:00:00Z" };
const ENERGY = { id: "energy-1", region_id: "r-us", dimension: "operational_cost", value_numeric: 0.18, unit: "USD/kWh", last_updated: "2026-06-01T00:00:00Z" };
const WAGE_ONLY_REGION = { id: "wage-2", region_id: "r-de", dimension: "labor_markets", value_numeric: 30, unit: "EUR/hour", last_updated: "2026-06-01T00:00:00Z" };

test("seedAutomateVsHire: a region with only one dimension present never counts as regionsWithBothFacts", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE_ONLY_REGION] });
  const r = await seedAutomateVsHire(sb, "dry", async () => "cl:jurisdiction:0000000000000001");
  assert.equal(r.regionsWithBothFacts, 0);
  assert.equal(r.wouldCreate, 0);
});

test("seedAutomateVsHire dry: a region with both dimensions and a resolvable entity counts wouldCreate, writes nothing", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE, ENERGY] });
  const r = await seedAutomateVsHire(sb, "dry", async () => "cl:jurisdiction:0000000000000001");
  assert.equal(r.regionsWithBothFacts, 1);
  assert.equal(r.wouldCreate, 1);
  assert.equal(r.created, 0);
  assert.equal(sb.calls.length, 0);
});

test("seedAutomateVsHire: a region with both dimensions but no resolvable entity_id is skippedNoEntity, not created", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE, ENERGY] });
  const r = await seedAutomateVsHire(sb, "dry", async () => null);
  assert.equal(r.regionsWithBothFacts, 1);
  assert.equal(r.skippedNoEntity, 1);
  assert.equal(r.wouldCreate, 0);
});

test("seedAutomateVsHire apply: writes a derived_values RPC row AND an estimated_values upsert with the range triple", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE, ENERGY] });
  const r = await seedAutomateVsHire(sb, "apply", async () => "cl:jurisdiction:0000000000000001", () => "2026-09-02T00:00:00.000Z");
  assert.equal(r.created, 1);

  const rpcCall = sb.calls.find((c) => c.fn === "register_derived_value");
  assert.ok(rpcCall);
  assert.equal(rpcCall.args.p_method_id, "automate_vs_hire");
  assert.equal(rpcCall.args.p_entity_id, "cl:jurisdiction:0000000000000001");
  assert.equal(rpcCall.args.p_inputs.length, 2);

  const upsertCall = sb.calls.find((c) => c.table === "estimated_values");
  assert.ok(upsertCall);
  assert.equal(upsertCall.payload.entity_id, "cl:jurisdiction:0000000000000001");
  assert.equal(upsertCall.payload.model_id, "automate_vs_hire");
  assert.ok(upsertCall.payload.low <= upsertCall.payload.point && upsertCall.payload.point <= upsertCall.payload.high);
  assert.ok("paybackYears" in upsertCall.payload.distribution);
  assert.ok("breakEvenWagePerHour" in upsertCall.payload.distribution);
});

test("seedAutomateVsHire apply: the estimated_values upsert carries scenario_key='default' and conflicts on the entity/model/scenario unique constraint (migration 286's 2026-09-02 amendment — entity_id alone is no longer unique)", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE, ENERGY] });
  await seedAutomateVsHire(sb, "apply", async () => "cl:jurisdiction:0000000000000001", () => "2026-09-02T00:00:00.000Z");
  const upsertCall = sb.calls.find((c) => c.table === "estimated_values");
  assert.ok(upsertCall);
  assert.equal(upsertCall.payload.scenario_key, "default");
  assert.equal(upsertCall.opts.onConflict, "entity_id,model_id,model_version,scenario_key");
});

test("seedAutomateVsHire apply: an estimated_values upsert failure is counted as failed, not thrown", async () => {
  const sb = fakeClient({ regional_data_facts: [WAGE, ENERGY] }, { upsertHandler: () => ({ data: null, error: { message: "conflict" } }) });
  const r = await seedAutomateVsHire(sb, "apply", async () => "cl:jurisdiction:0000000000000001");
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /conflict/);
});

test("seedAutomateVsHire: picks the most recently updated fact per dimension when a region has more than one", async () => {
  const older = { ...WAGE, id: "wage-old", value_numeric: 10, last_updated: "2020-01-01T00:00:00Z" };
  const sb = fakeClient({ regional_data_facts: [older, WAGE, ENERGY] });
  await seedAutomateVsHire(sb, "apply", async () => "cl:jurisdiction:0000000000000001", () => "2026-09-02T00:00:00.000Z");
  const rpcCall = sb.calls.find((c) => c.fn === "register_derived_value");
  const wageInput = rpcCall.args.p_inputs.find((i) => i.pk === "wage-1" || i.pk === "wage-old");
  assert.equal(wageInput.pk, "wage-1", "the more recently updated wage fact (28.5) should be used, not the older one (10)");
});

// ── resolveRegionEntityId (2026-09-02 coordinator follow-up task 2: region -> entity_refs resolve/mint) ──

const REGION_US = { id: "r-us", code: "us-northeast", iso_codes: ["US"] };
const REGION_EU = { id: "r-eu", code: "eu-west", iso_codes: ["DE", "FR"] }; // multi-code region
const REGION_NO_ISO = { id: "r-none", code: "unmapped", iso_codes: [] };

function fakeEntityDb(tables) {
  return fakeClient({ entity_refs: [], entities: [], entity_identifiers: [], regions: [], ...tables });
}

test("resolveRegionEntityId: an existing entity_refs row is returned directly, no mint attempted", async () => {
  const existingRef = { ref_table: "regions", ref_id: "r-us", entity_id: "cl:jurisdiction:existingexisting", role: "jurisdiction" };
  const sb = fakeEntityDb({ entity_refs: [existingRef], regions: [REGION_US] });
  const insertCalls = [];
  const id = await resolveRegionEntityId(sb, "r-us", "apply", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  assert.equal(id, "cl:jurisdiction:existingexisting");
  assert.equal(insertCalls.length, 0, "an already-resolved region never triggers a mint");
});

test("resolveRegionEntityId dry: no entity_refs row yet -> returns the deterministic preview id, writes nothing", async () => {
  const sb = fakeEntityDb({ regions: [REGION_US] });
  const insertCalls = [];
  const id = await resolveRegionEntityId(sb, "r-us", "dry", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  assert.equal(id, entityId("jurisdiction", "US"));
  assert.equal(insertCalls.length, 0, "dry mode never mints, even when nothing resolves yet");
});

test("resolveRegionEntityId apply: no entity_refs row yet -> mints entities/entity_identifiers/entity_refs and returns the same id dry mode previewed", async () => {
  const sb = fakeEntityDb({ regions: [REGION_US] });
  const insertCalls = [];
  const id = await resolveRegionEntityId(sb, "r-us", "apply", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  assert.equal(id, entityId("jurisdiction", "US"));

  const entitiesCall = insertCalls.find((c) => c.table === "entities");
  assert.ok(entitiesCall, "mints an entities row");
  assert.equal(entitiesCall.rows[0].entity_id, entityId("jurisdiction", "US"));
  assert.equal(entitiesCall.rows[0].kind, "jurisdiction");

  const refsCall = insertCalls.find((c) => c.table === "entity_refs");
  assert.ok(refsCall, "mints an entity_refs row");
  assert.equal(refsCall.rows[0].ref_table, "regions");
  assert.equal(refsCall.rows[0].ref_id, "r-us");
  assert.equal(refsCall.rows[0].entity_id, entityId("jurisdiction", "US"));
  assert.equal(refsCall.rows[0].role, "jurisdiction");
});

test("resolveRegionEntityId apply: a multi-iso-code region mints one entity_refs row per code, resolves to the alphabetically-first code's entity", async () => {
  const sb = fakeEntityDb({ regions: [REGION_EU] });
  const insertCalls = [];
  const id = await resolveRegionEntityId(sb, "r-eu", "apply", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  // "DE" sorts before "FR" alphabetically -> the resolved id is DE's jurisdiction entity.
  assert.equal(id, entityId("jurisdiction", "DE"));

  const refsCall = insertCalls.find((c) => c.table === "entity_refs");
  assert.ok(refsCall);
  assert.equal(refsCall.rows.length, 2, "one entity_refs row per iso code, same shape backfill-entities.mjs writes");
  const refEntityIds = refsCall.rows.map((r) => r.entity_id).sort();
  assert.deepEqual(refEntityIds, [entityId("jurisdiction", "DE"), entityId("jurisdiction", "FR")].sort());
});

test("resolveRegionEntityId: a region with no iso_codes resolves to null (nothing to mint from), never mints", async () => {
  const sb = fakeEntityDb({ regions: [REGION_NO_ISO] });
  const insertCalls = [];
  const idDry = await resolveRegionEntityId(sb, "r-none", "dry", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  const idApply = await resolveRegionEntityId(sb, "r-none", "apply", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  assert.equal(idDry, null);
  assert.equal(idApply, null);
  assert.equal(insertCalls.length, 0);
});

test("resolveRegionEntityId apply: an already-existing entity (minted elsewhere, e.g. by backfill-entities.mjs) is not re-inserted, only the missing entity_refs row is written", async () => {
  const preExistingEntity = { entity_id: entityId("jurisdiction", "US"), kind: "jurisdiction" };
  const sb = fakeEntityDb({ regions: [REGION_US], entities: [preExistingEntity] });
  const insertCalls = [];
  const id = await resolveRegionEntityId(sb, "r-us", "apply", { insertMany: async (table, rows) => { insertCalls.push({ table, rows }); return { inserted: rows.length }; } });
  assert.equal(id, entityId("jurisdiction", "US"));
  assert.equal(insertCalls.find((c) => c.table === "entities"), undefined, "the entity already exists — planJurisdictionEntities must not re-mint it");
  assert.ok(insertCalls.find((c) => c.table === "entity_refs"), "the entity_refs row is still missing and gets written");
});
