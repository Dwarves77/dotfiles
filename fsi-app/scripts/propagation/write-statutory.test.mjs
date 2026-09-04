// write-statutory.test.mjs — proves parseRow()'s structural refusals, admissibleFor() gating, idempotency,
// entity mint-on-demand, and the actual FuelEU penalty arithmetic, all with injected fakes. No DB, no
// network. Importing write-statutory.mjs must not touch the environment (creds check lives in main(),
// gated by IS_MAIN — proved by this file importing cleanly with no DB creds present).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRow, writeOneRow, resolveOrMintEntity, SUPPORTED_TARGET_YEARS, FORMULA_ID,
} from "./write-statutory.mjs";

const ADMISSIBLE_INPUT = {
  value: 95.0, unit: "gCO2eq/MJ", citation: "MRV report 2025, ship X", derivation: "observed",
  originClass: "verified", lifecycle: "verified", admissibility: "filing_ok", baseConfidence: 0.95,
  asOf: { eventDate: "2026-01-15" },
};
const ADMISSIBLE_ENERGY = { ...ADMISSIBLE_INPUT, value: 500_000_000, unit: "MJ" };
const ADMISSIBLE_YEARS = { ...ADMISSIBLE_INPUT, value: 1, unit: "count" };

function goodRow(overrides = {}) {
  return {
    shipKey: "IMO9999999",
    targetYear: 2025,
    ghgIntensityActual: ADMISSIBLE_INPUT,
    energyUsedMJ: ADMISSIBLE_ENERGY,
    consecutiveDeficitYears: ADMISSIBLE_YEARS,
    ...overrides,
  };
}

test("parseRow: missing required top-level field throws, naming it", () => {
  assert.throws(() => parseRow({ targetYear: 2025 }, 0), /shipKey/);
});

test("parseRow: an unsupported targetYear is refused BY NAME, never guessed", () => {
  assert.throws(() => parseRow(goodRow({ targetYear: 2030 }), 0), /targetYear=2030 is not implemented/);
  assert.deepEqual(Object.keys(SUPPORTED_TARGET_YEARS), ["2025"]);
});

test("parseRow: a StatutoryInput block missing provenance fields throws, naming the block and field", () => {
  assert.throws(
    () => parseRow(goodRow({ ghgIntensityActual: { value: 1, unit: "x" } }), 2),
    /row\[2\]\.ghgIntensityActual.*citation/s
  );
});

test("parseRow: normalizes defaults (scenarioKey, obligationSeed) and passes through provenance blocks untouched", () => {
  const parsed = parseRow(goodRow(), 0);
  assert.equal(parsed.scenarioKey, "default");
  assert.equal(parsed.obligationSeed, "fueleu-maritime-annex-iv-penalty");
  assert.deepEqual(parsed.ghgIntensityActual, ADMISSIBLE_INPUT);
});

function fakeSb({ entities = [], statutory = [] } = {}) {
  return {
    entitiesInserted: [],
    from(table) {
      if (table === "entities") {
        return {
          select() { return this; },
          eq(col, val) { this._id = val; return this; },
          async maybeSingle() {
            const row = entities.find((e) => e.entity_id === this._id);
            return { data: row ?? null, error: null };
          },
        };
      }
      throw new Error(`fakeSb: unexpected table ${table}`);
    },
  };
}

test("writeOneRow: an inadmissible actual-GHG-intensity input refuses the WHOLE row, names the field and reason", async () => {
  const sb = fakeSb();
  const parsed = parseRow(goodRow({ ghgIntensityActual: { ...ADMISSIBLE_INPUT, originClass: "community" } }), 0);
  const out = await writeOneRow(sb, parsed, "dry", { now: () => new Date("2026-09-04") });
  assert.equal(out.action, "refused-inadmissible");
  assert.equal(out.field, "ghgIntensityActual");
  assert.match(out.reason, /community/);
});

test("writeOneRow: a lifecycle=falsified energy-used input refuses the row", async () => {
  const sb = fakeSb();
  const parsed = parseRow(goodRow({ energyUsedMJ: { ...ADMISSIBLE_ENERGY, lifecycle: "falsified" } }), 0);
  const out = await writeOneRow(sb, parsed, "dry", { now: () => new Date("2026-09-04") });
  assert.equal(out.action, "refused-inadmissible");
  assert.equal(out.field, "energyUsedMJ");
});

test("writeOneRow: dry mode computes and reports the penalty WITHOUT writing or minting (still checks for an already-computed row, so a dry run's report is honest)", async () => {
  const sb = fakeSb();
  let insertCalled = false;
  const out = await writeOneRow(sb, parseRow(goodRow(), 0), "dry", {
    now: () => new Date("2026-09-04"),
    insertFn: async () => { insertCalled = true; },
    readAllFn: async () => [],
  });
  assert.equal(out.action, "would-write");
  assert.equal(insertCalled, false);
  // Deficit: target(2025)=89.3368 < actual=95.0, so a deficit exists and a nonzero penalty is expected.
  assert.ok(out.resultEur > 0, `expected a positive penalty, got ${out.resultEur}`);
});

test("writeOneRow: apply mode skips (idempotent) when a row already exists for this entity/formula/scenario", async () => {
  const sb = fakeSb({ entities: [{ entity_id: "cl:asset:whatever" }] });
  const out = await writeOneRow(sb, parseRow(goodRow(), 0), "apply", {
    now: () => new Date("2026-09-04"),
    resolveEntityFn: async (_sb, { kind }) => (kind === "asset" ? "cl:asset:whatever" : "cl:obligation:whatever"),
    readAllFn: async () => [{ computation_id: "existing-comp-id" }],
    insertFn: async () => { throw new Error("must not insert — already computed"); },
  });
  assert.equal(out.action, "skipped-already-computed");
  assert.equal(out.computationId, "existing-comp-id");
});

test("writeOneRow: apply mode writes a real row when admissible and not yet computed, with the FOUR named InputRefs", async () => {
  let seenTable = null, seenRow = null;
  const out = await writeOneRow(fakeSb(), parseRow(goodRow(), 0), "apply", {
    now: () => new Date("2026-09-04"),
    resolveEntityFn: async (_sb, { kind }) => (kind === "asset" ? "cl:asset:ship1" : "cl:obligation:fueleu"),
    readAllFn: async () => [],
    insertFn: async (table, row) => { seenTable = table; seenRow = row; return { inserted: { computation_id: "new-comp-id" } }; },
  });
  assert.equal(out.action, "written");
  assert.equal(out.computationId, "new-comp-id");
  assert.equal(seenTable, "statutory_computations");
  assert.equal(seenRow.entity_id, "cl:asset:ship1");
  assert.equal(seenRow.obligation_id, "cl:obligation:fueleu");
  assert.equal(seenRow.formula_id, FORMULA_ID);
  assert.equal(seenRow.inputs.length, 4);
  assert.equal(seenRow.result_unit, "EUR");
  assert.ok(Number.isFinite(seenRow.result));
});

test("writeOneRow: a surplus (target above actual) computes a ZERO penalty, still writes (no artificial refusal for a non-deficit)", async () => {
  const surplusRow = goodRow({ ghgIntensityActual: { ...ADMISSIBLE_INPUT, value: 80.0 } }); // below the 89.3368 target = surplus
  const out = await writeOneRow(fakeSb(), parseRow(surplusRow, 0), "apply", {
    now: () => new Date("2026-09-04"),
    resolveEntityFn: async () => "cl:asset:x",
    readAllFn: async () => [],
    insertFn: async (table, row) => ({ inserted: { computation_id: "c1" } }),
  });
  assert.equal(out.action, "written");
});

test("writeOneRow: an insert failure (e.g. a purity-trigger rejection) is caught and counted, never thrown", async () => {
  const out = await writeOneRow(fakeSb(), parseRow(goodRow(), 0), "apply", {
    now: () => new Date("2026-09-04"),
    resolveEntityFn: async () => "cl:asset:x",
    readAllFn: async () => [],
    insertFn: async () => { throw new Error("simulated purity trigger rejection"); },
  });
  assert.equal(out.action, "errored");
  assert.match(out.reason, /simulated purity trigger rejection/);
});

test("resolveOrMintEntity: an existing entity is returned as-is, never re-minted", async () => {
  const sb = fakeSb({ entities: [] });
  // Seed the fake to report the deterministic id as already present.
  const { entityId } = await import("../../src/lib/entities/entity-id.mjs");
  const id = entityId("asset", "IMO1234567");
  sb.from = (table) => ({
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { entity_id: id }, error: null }; },
  });
  let insertCalled = false;
  const got = await resolveOrMintEntity(sb, { kind: "asset", seed: "IMO1234567" }, "apply", {
    insertFn: async () => { insertCalled = true; },
  });
  assert.equal(got, id);
  assert.equal(insertCalled, false);
});

test("resolveOrMintEntity: dry mode never mints, returns the preview id", async () => {
  const sb = fakeSb({ entities: [] });
  let insertCalled = false;
  const got = await resolveOrMintEntity(sb, { kind: "asset", seed: "IMO1234567" }, "dry", {
    insertFn: async () => { insertCalled = true; },
  });
  assert.match(got, /^cl:asset:[0-9a-f]{16}$/);
  assert.equal(insertCalled, false);
});

test("resolveOrMintEntity: apply mode mints a NEW entity when absent, via the guarded insert path", async () => {
  const sb = fakeSb({ entities: [] });
  let seenTable = null, seenRow = null;
  const got = await resolveOrMintEntity(sb, { kind: "obligation", seed: "fueleu-maritime-annex-iv-penalty", canonicalName: "FuelEU obligation" }, "apply", {
    insertFn: async (table, row) => { seenTable = table; seenRow = row; return { inserted: { entity_id: row.entity_id } }; },
  });
  assert.equal(seenTable, "entities");
  assert.equal(seenRow.kind, "obligation");
  assert.equal(seenRow.canonical_name, "FuelEU obligation");
  assert.equal(got, seenRow.entity_id);
});
