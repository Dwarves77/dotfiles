// write-statutory.test.mjs — proves parseRow()'s structural refusals, admissibleFor() gating, idempotency,
// entity mint-on-demand, and the actual FuelEU penalty arithmetic, all with injected fakes. No DB, no
// network. Importing write-statutory.mjs must not touch the environment (creds check lives in main(),
// gated by IS_MAIN — proved by this file importing cleanly with no DB creds present).
//
// runWriter integration tests (added lane STATUTORY-WRITER, 2026-09-28): prove the FULL row-write-then-
// harness-record flow end to end with injected fakes (fake sb, fake readAllFn, tmp familyDir,
// recordHarnessRunFn override), no real DB, no real repo writes, no network. Mirrors
// scripts/plan-quarantine-disposition.test.mjs's own runPlanner integration tests exactly (same shape,
// same fakes convention), the "real local end-to-end dry run" a worktree with no DB credentials can prove.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseRow, writeOneRow, resolveOrMintEntity, SUPPORTED_TARGET_YEARS, FORMULA_ID,
  runWriter, nextRunNumberFromHarnessRuns,
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

function fakeSb({ entities = [], statutory: _statutory = [] } = {}) {
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
    insertFn: async (_table, _row) => ({ inserted: { computation_id: "c1" } }),
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
  sb.from = (_table) => ({
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

// -- runWriter integration (fake sb/readAllFn/familyDir, no real DB, no real repo writes) --------------

function fakeSbForRun({ entities = [], statutory: _statutory = [] } = {}) {
  return {
    from(table) {
      if (table === "entities") {
        return {
          select() { return this; },
          eq(_col, val) { this._id = val; return this; },
          async maybeSingle() {
            const row = entities.find((e) => e.entity_id === this._id);
            return { data: row ?? null, error: null };
          },
        };
      }
      throw new Error(`fakeSbForRun: unexpected table ${table}`);
    },
  };
}

// writeOneRow's OWN default readAllFn (write-statutory.mjs's CLI-flavored wrapper) reaches db.mjs's real
// readAll, which needs live DB creds; these runWriter tests inject this fake instead (readAllFn: async
// () => [], i.e. "never already computed"), the same convention writeOneRow's own unit tests above use.
function fakeWriteOneRow(sb, parsed, mode) {
  return writeOneRow(sb, parsed, mode, { readAllFn: async () => [] });
}

test("runWriter (dry): writes a run artifact and best-effort records it to harness_runs, with NO statutory_computations write", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "statutory-writer-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const recorded = [];
  const r = await runWriter(
    { mode: "dry", rawRows: [goodRow()] },
    {
      sb: fakeSbForRun(),
      now: new Date("2026-09-28"),
      trigger: "manual",
      familyDir,
      readAllFn: async () => [], // no prior harness_runs rows for this family
      writeOneRowFn: fakeWriteOneRow,
      recordHarnessRunFn: async (_sb, artifact) => { recorded.push(artifact); return { ok: true, run_id: artifact.run_id }; },
    }
  );

  assert.equal(r.runId, "statutory-run-001");
  assert.equal(r.counts.wouldWrite, 1);
  assert.equal(r.counts.written, 0);
  assert.ok(existsSync(r.artifactPath), "run artifact file must exist on disk");
  const onDisk = JSON.parse(readFileSync(r.artifactPath, "utf8"));
  assert.equal(onDisk.harness_family, "statutory");
  assert.equal(onDisk.config.mode, "dry");
  assert.equal(onDisk.config.r14_live_write_held, false);
  assert.equal(onDisk.per_item.length, 1);
  assert.equal(onDisk.per_item[0].outcome, "would-write");

  assert.equal(recorded.length, 1, "recordHarnessRunFn must be called exactly once");
  assert.equal(recorded[0].run_id, "statutory-run-001");
  assert.equal(r.harnessRunRow.ok, true);
});

test("runWriter (apply): a structural row refusal is counted and named in the artifact's per_item, harness record still lands", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "statutory-writer-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const recorded = [];
  const r = await runWriter(
    { mode: "apply", rawRows: [{ targetYear: 2025 }] }, // missing shipKey etc, structural refusal
    {
      sb: fakeSbForRun(),
      now: new Date("2026-09-28"),
      familyDir,
      readAllFn: async () => [],
      recordHarnessRunFn: async (_sb, artifact) => { recorded.push(artifact); return { ok: true, run_id: artifact.run_id }; },
    }
  );

  assert.equal(r.counts.refused, 1);
  assert.equal(r.perItem[0].outcome, "refused-structural");
  assert.match(r.perItem[0].verdict, /shipKey/);
  assert.equal(recorded.length, 1, "a structural-refusal-only run still gets a harness record");
  const onDisk = JSON.parse(readFileSync(r.artifactPath, "utf8"));
  assert.equal(onDisk.config.r14_live_write_held, true); // apply mode: the (not-attempted, here) live write would be R14-held
});

test("runWriter: the run_id NUMBER is read from harness_runs (not always -001), matching plan-quarantine-disposition's own convention", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "statutory-writer-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const r = await runWriter(
    { mode: "dry", rawRows: [goodRow()] },
    {
      sb: fakeSbForRun(),
      now: new Date("2026-09-28"),
      familyDir,
      readAllFn: async () => [{ run_id: "statutory-run-001" }, { run_id: "statutory-run-002" }],
      writeOneRowFn: fakeWriteOneRow,
      recordHarnessRunFn: async () => ({ ok: true, run_id: "n/a" }),
    }
  );
  assert.equal(r.runId, "statutory-run-003");
});

test("nextRunNumberFromHarnessRuns: no prior rows for this family returns 1; a malformed foreign-shaped row is skipped, not thrown on", async () => {
  const n1 = await nextRunNumberFromHarnessRuns(async () => [], "statutory");
  assert.equal(n1, 1);
  const n2 = await nextRunNumberFromHarnessRuns(
    async () => [{ run_id: "statutory-run-005" }, { run_id: "some-other-family-run-099" }, { run_id: null }],
    "statutory"
  );
  assert.equal(n2, 6);
});

test("runWriter (dry): record-harness-run failure is caught, never thrown; the run's own outcome is still returned", async (t) => {
  const familyDir = mkdtempSync(join(tmpdir(), "statutory-writer-test-"));
  t.after(() => rmSync(familyDir, { recursive: true, force: true }));

  const r = await runWriter(
    { mode: "dry", rawRows: [goodRow()] },
    {
      sb: fakeSbForRun(),
      now: new Date("2026-09-28"),
      familyDir,
      readAllFn: async () => [],
      writeOneRowFn: fakeWriteOneRow,
      recordHarnessRunFn: async () => { throw new Error("simulated harness_runs insert failure"); },
    }
  );
  assert.equal(r.harnessRunRow.ok, false);
  assert.match(r.harnessRunRow.error, /simulated harness_runs insert failure/);
  assert.ok(existsSync(r.artifactPath), "the artifact on disk survives a harness_runs insert failure (best-effort)");
});
