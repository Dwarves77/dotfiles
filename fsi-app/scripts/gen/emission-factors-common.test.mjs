/**
 * Tests for emission-factors-common.mjs (WO-18) — pure, $0, offline, no DB, no fetch, no --apply.
 *
 * WIRING (corrected 2026-09-02, lane PROD-FIX): `fsi-app/scripts/gen/*.test.mjs` is already an existing
 * line in fsi-app/.discipline/run-test-suite.sh (checked live) — this file matches it as-is and is
 * execution-wired today. The stale note previously here (claiming the glob line was missing and this
 * file was an ORPHANED-PROOF gap under F23) was checked against the live script and found false; a flag
 * that dissolves under evidence gets a same-session correction, never a quiet drop (CLAUDE.md rule 13's
 * corollary).
 *
 * THE CHECK-REJECTION PROOF (below), and why validateFactor() is the right thing to attack: migration
 * 258's `emission_factors_scope_modal` CHECK and factor-tier.mjs's `SCOPE_KINDS.modal.forbids` are not
 * two independent rules that happen to agree — the CHECK is CODEGEN'D from SCOPE_KINDS by
 * renderTierConstraintsSql() (factor-tier.mjs, verified by reading the function and by
 * migration-258.mjs's own drift guard). validateFactor() enforces the identical `forbids` list before
 * every write this repo's seeders make (see emission-factors-common.mjs seedFactors ->
 * validateAll -> validateFactor). So asserting validateFactor() rejects a scope_kind='modal' row
 * carrying operator_key is, by construction, asserting the same rule the live CHECK enforces — not a
 * parallel invention that could silently drift from it (the exact defect class F24's header names).
 * Test 2 below additionally reads migration 258's COMMITTED, APPLIED SQL text directly and asserts the
 * `emission_factors_scope_modal` constraint literally contains `operator_key IS NULL` for the modal
 * branch — so the proof does not rest on trusting factor-tier.mjs's own claim about what it generated,
 * it reads the artifact migration 258 shipped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFactor } from "../../src/lib/contracts/factor-tier.mjs";
import { naturalKey, buildRow, loadFixtureRows, validateAll, seedFactors, authorCarbonIntensityEdges } from "./emission-factors-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESNZ_FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");
const EPA_FIXTURE = resolve(HERE, "fixtures/emission-factors/epa-modal-defaults-2025.json");
const MIGRATION_258 = resolve(HERE, "../../supabase/migrations/258_emission_factors_and_licence_gate.sql");

// ── Positive control: every committed fixture row is well-formed ──────────────────────────────────
//
// LANE PROD-FIX, 2026-09-02: the DESNZ fixture grew 7 needs_runner_fetch shell rows (air/sea freighting-
// goods, added per the finish-plan brief but the primary xlsx was unreachable from this container — see
// the fixture header for the full account). Those rows FAIL validateFactor() BY DESIGN: they carry no
// figure and no needs_runner_fetch-tolerant caller would ever seed them (emission-factors-desnz.mjs's
// splitPending() filters them out before seedFactors ever sees them). This positive control is therefore
// scoped to the seedable rows only; emission-factors-desnz.test.mjs (this lane's dedicated producer test)
// asserts the shells themselves are well-formed AS SHELLS, and that the null tolerance is marker-gated.
function desnzSeedableRows() {
  return loadFixtureRows(DESNZ_FIXTURE).filter((r) => r.needs_runner_fetch !== true);
}

test("every DESNZ fixture row passes validateFactor() with zero errors", () => {
  const rows = desnzSeedableRows();
  assert.equal(rows.length, 4, "fixture row count changed — update this test deliberately if intended");
  for (const row of rows) {
    const errors = validateFactor(row);
    assert.deepEqual(errors, [], `unexpected validation errors for ${naturalKey(row)}: ${errors.join("; ")}`);
  }
});

test("every EPA fixture row passes validateFactor() with zero errors", () => {
  const rows = loadFixtureRows(EPA_FIXTURE);
  assert.equal(rows.length, 2, "fixture row count changed — update this test deliberately if intended");
  for (const row of rows) {
    const errors = validateFactor(row);
    assert.deepEqual(errors, [], `unexpected validation errors for ${naturalKey(row)}: ${errors.join("; ")}`);
  }
});

// ── THE CHECK-REJECTION PROOF ───────────────────────────────────────────────────────────────────────
test("a modal-default row carrying an operator_key is REJECTED (proves the scope_modal rule is doing work, not vacuous)", () => {
  const [good] = loadFixtureRows(DESNZ_FIXTURE);
  const malformed = { ...good, operator_key: "some-carrier-fleet-key" };

  // Sanity: the row we are about to corrupt was valid before corruption (otherwise the rejection below
  // would be meaningless — it could be failing for an unrelated reason).
  assert.deepEqual(validateFactor(good), [], "fixture row must be valid before the malformation is applied");

  const errors = validateFactor(malformed);
  assert.ok(errors.length > 0, "expected validateFactor to reject a modal row carrying operator_key");
  assert.ok(
    errors.some((e) => /scope_kind "modal" must not carry operator_key/.test(e)),
    `expected a scope-forbids error naming operator_key, got: ${JSON.stringify(errors)}`
  );
});

test("a modal-default row missing a required scope dimension (vehicle_class) is REJECTED", () => {
  const [good] = loadFixtureRows(DESNZ_FIXTURE);
  const { vehicle_class, ...malformed } = good;
  const errors = validateFactor(malformed);
  assert.ok(
    errors.some((e) => /scope_kind "modal" requires vehicle_class/.test(e)),
    `expected a scope-requires error naming vehicle_class, got: ${JSON.stringify(errors)}`
  );
});

test("the live migration 258 SQL literally forbids operator_key on scope_kind='modal' (reads the applied artifact, not factor-tier.mjs's claim about itself)", () => {
  const sql = readFileSync(MIGRATION_258, "utf8");
  const m = sql.match(/CONSTRAINT emission_factors_scope_modal CHECK \(([\s\S]*?)\)\n(?:\s*-- <<< END GENERATED)/);
  assert.ok(m, "could not locate emission_factors_scope_modal in migration 258 — file structure changed");
  const clause = m[1];
  assert.match(clause, /operator_key IS NULL/, "scope_modal CHECK no longer forbids operator_key");
  assert.match(clause, /corridor_id IS NULL/, "scope_modal CHECK no longer forbids corridor_id");
  assert.match(clause, /movement_ref IS NULL/, "scope_modal CHECK no longer forbids movement_ref");
  assert.match(clause, /vehicle_class IS NOT NULL/, "scope_modal CHECK no longer requires vehicle_class");
});

test("a proxy_estimate tier row without a donor is REJECTED (separate CHECK, same defence-in-depth pattern)", () => {
  const [good] = loadFixtureRows(DESNZ_FIXTURE);
  const malformed = { ...good, tier: "proxy_estimate", pedigree: 4 };
  const errors = validateFactor(malformed);
  assert.ok(
    errors.some((e) => /proxy_estimate must name its donor/.test(e)),
    `expected a proxy-needs-donor error, got: ${JSON.stringify(errors)}`
  );
});

test("a modal_default row claiming a better pedigree than its floor is REJECTED", () => {
  const [good] = loadFixtureRows(DESNZ_FIXTURE);
  const malformed = { ...good, pedigree: 1 }; // modal_default floor is 3 (1 = best, so 1 is TOO good)
  const errors = validateFactor(malformed);
  assert.ok(
    errors.some((e) => /pedigree 1 is better than tier "modal_default" may claim/.test(e)),
    `expected a pedigree-floor error, got: ${JSON.stringify(errors)}`
  );
});

// ── naturalKey / idempotency ────────────────────────────────────────────────────────────────────────
test("naturalKey is stable across unrelated field changes and differs on any key-dimension change", () => {
  const [a] = loadFixtureRows(DESNZ_FIXTURE);
  const bSameKey = { ...a, ttw_co2e: a.ttw_co2e + 0.001, source_ref: "different citation text" };
  assert.equal(naturalKey(a), naturalKey(bSameKey), "changing a non-key field must not change the natural key");

  const cDifferentVintage = { ...a, valid_from: "2026-06-10" };
  assert.notEqual(naturalKey(a), naturalKey(cDifferentVintage), "a new valid_from must be a new natural key (new vintage)");
});

test("seedFactors dry-run: no writes attempted, reports the full fixture as 'to write' when nothing exists yet", async () => {
  const rows = desnzSeedableRows(); // excludes the needs_runner_fetch shells (fail validateAll by design)
  let insertCalled = false;
  const summary = await seedFactors({
    label: "test-desnz",
    rows,
    cite: { skill: "environmental-policy-and-innovation", reason: "test" },
    apply: false,
    readAllFn: async () => [],
    insertFn: async () => { insertCalled = true; throw new Error("must not be called in dry-run"); },
  });
  assert.equal(insertCalled, false, "dry-run must never call the write function");
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.fixtureRows, rows.length);
  assert.equal(summary.toWrite, rows.length);
  assert.equal(summary.skipped, 0);
});

test("seedFactors is idempotent: a row whose natural key already exists (live, non-superseded) is skipped, not re-inserted", async () => {
  const rows = desnzSeedableRows(); // excludes the needs_runner_fetch shells (fail validateAll by design)
  const already = rows[0]; // pretend the first row is already live
  let insertedRows = null;
  const summary = await seedFactors({
    label: "test-desnz-idempotent",
    rows,
    cite: { skill: "environmental-policy-and-innovation", reason: "test" },
    apply: true,
    readAllFn: async () => [already],
    insertFn: async (table, toWrite) => { insertedRows = toWrite; return { inserted: toWrite.length, snapshot: "test-snapshot" }; },
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.toWrite, rows.length - 1);
  assert.equal(insertedRows.length, rows.length - 1);
  assert.ok(!insertedRows.some((r) => naturalKey(r) === naturalKey(already)), "the already-live row must not be in the write batch");
});

test("seedFactors --apply with everything already live is a true no-op (insertFn never called)", async () => {
  const rows = desnzSeedableRows(); // excludes the needs_runner_fetch shells (fail validateAll by design)
  let insertCalled = false;
  const summary = await seedFactors({
    label: "test-desnz-noop",
    rows,
    cite: { skill: "environmental-policy-and-innovation", reason: "test" },
    apply: true,
    readAllFn: async () => rows,
    insertFn: async () => { insertCalled = true; return { inserted: 0, snapshot: null }; },
  });
  assert.equal(insertCalled, false);
  assert.equal(summary.written, 0);
  assert.equal(summary.toWrite, 0);
});

// ── DAG authorship at write time (lane DAG-AUTHOR, 2026-09-04) ─────────────────────────────────────
test("authorCarbonIntensityEdges: no insertRes.rows (a test double or a caller with no select) -> silent no-op, all zero", async () => {
  const counts = await authorCarbonIntensityEdges([{ source_key: "desnz_ghg_factors" }], { inserted: 1, snapshot: null });
  assert.deepEqual(counts, { authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 });
});

test("authorCarbonIntensityEdges: a non-embeddable source_key is licence-blocked, never authored", async () => {
  let called = false;
  const counts = await authorCarbonIntensityEdges(
    [{ source_key: "not_a_registered_source" }],
    { rows: [{ factor_id: "f1" }] },
    { authorEdgesFn: async () => { called = true; return { ok: true, action: "authored", valueId: "v1" }; } }
  );
  assert.equal(called, false);
  assert.equal(counts.licenceBlocked, 1);
  assert.equal(counts.authored, 0);
});

test("authorCarbonIntensityEdges: an embeddable source calls authorEdges with the right shape and counts 'authored'", async () => {
  let seenFigure = null;
  const counts = await authorCarbonIntensityEdges(
    [{ source_key: "desnz_ghg_factors" }],
    { rows: [{ factor_id: "f1" }] },
    {
      sb: { marker: "fake-sb" },
      authorEdgesFn: async (sb, figure) => { seenFigure = { sb, figure }; return { ok: true, action: "authored", valueId: "v1" }; },
    }
  );
  assert.equal(counts.authored, 1);
  assert.equal(seenFigure.sb.marker, "fake-sb");
  assert.deepEqual(seenFigure.figure, {
    table: "emission_factors",
    id: "f1",
    entity: null,
    method: { id: "carbon_intensity_tkm", version: "1.0.0" },
    inputs: [{ table: "emission_factors", pk: "f1" }],
  });
});

test("authorCarbonIntensityEdges: 'skipped-already-authored' counts as skippedAlready, not authored", async () => {
  const counts = await authorCarbonIntensityEdges(
    [{ source_key: "desnz_ghg_factors" }],
    { rows: [{ factor_id: "f1" }] },
    { sb: {}, authorEdgesFn: async () => ({ ok: true, action: "skipped-already-authored" }) }
  );
  assert.equal(counts.skippedAlready, 1);
  assert.equal(counts.authored, 0);
});

test("authorCarbonIntensityEdges: a thrown authorEdges call is caught, counted, and never propagates (the seeder's own write must not fail on this)", async () => {
  const counts = await authorCarbonIntensityEdges(
    [{ source_key: "desnz_ghg_factors" }],
    { rows: [{ factor_id: "f1" }] },
    { sb: {}, authorEdgesFn: async () => { throw new Error("network blip"); } }
  );
  assert.equal(counts.errored, 1);
});

// ── validateAll aborts loudly on any invalid row, naming every offender ────────────────────────────
test("validateAll throws and names every invalid row, not just the first", () => {
  const [good] = loadFixtureRows(DESNZ_FIXTURE);
  const badA = { ...good, valid_from: "2025-01-01", operator_key: "x" };
  const badB = { ...good, valid_from: "2025-02-01", tier: "not-a-real-tier" };
  assert.throws(
    () => validateAll([good, badA, badB]),
    (err) => {
      assert.match(err.message, /2 invalid row/);
      assert.match(err.message, /operator_key/);
      assert.match(err.message, /unknown tier/);
      return true;
    }
  );
});

test("buildRow merges the fixture header (source_key/as_at_date/valid_from) into each entry without mutating the header", () => {
  const header = { source_key: "desnz_ghg_factors", as_at_date: "2025-06-10", valid_from: "2025-06-10" };
  const entry = { tier: "modal_default", mode: "road" };
  const row = buildRow(header, entry);
  assert.equal(row.source_key, "desnz_ghg_factors");
  assert.equal(row.mode, "road");
  assert.deepEqual(header, { source_key: "desnz_ghg_factors", as_at_date: "2025-06-10", valid_from: "2025-06-10" });
});

// ── The read has to actually work against the real table ────────────────────
//
// WHY THESE EXIST. Every seedFactors test above injects `readAllFn: async () => [...]`, a stub that
// ignores its arguments. That proves the idempotency LOGIC and says nothing about whether the read
// can succeed against the live schema — and it could not. readAll paginates with `.order(orderBy)`
// where orderBy DEFAULTS to "id", `emission_factors` has no `id` column (PK is `factor_id`), so the
// real read threw every time and the catch block swallowed it on dry runs. Producers run #11
// (2026-08-30) printed "already live (skip, idempotent): 0" that was the fallback, not a
// measurement. Parts tested, composition untested — the defect class F27 exists for, arriving on the
// one seam F27 does not scan.

test("seedFactors reads emission_factors ordered by factor_id — NOT readAll's default 'id', which does not exist on this table", async () => {
  let seenOpts = null;
  const rows = desnzSeedableRows(); // excludes the needs_runner_fetch shells (fail validateAll by design)
  await seedFactors({
    label: "orderby-probe",
    rows,
    cite: "test",
    apply: false,
    readAllFn: async (_table, _cols, opts) => { seenOpts = opts; return []; },
    insertFn: async () => { throw new Error("dry run must not write"); },
  });
  assert.ok(seenOpts, "readAll was never called — the idempotency read has been removed");
  assert.equal(
    seenOpts.orderBy, "factor_id",
    "seedFactors must pass orderBy:'factor_id'. readAll defaults to 'id' and emission_factors has no " +
    "such column, so omitting this makes the read throw and the idempotency rule unreachable."
  );
});

test("every column seedFactors reads, orderBy included, exists in the applied migration 258 DDL", () => {
  // Binds the seeder's read to the artifact that actually shipped, so a rename on either side is RED
  // rather than a runtime PostgREST error discovered by dispatching a workflow.
  const sql = readFileSync(MIGRATION_258, "utf8");
  const create = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.emission_factors\s*\(([\s\S]*?)\n\s*\);/);
  assert.ok(create, "could not locate the emission_factors CREATE TABLE in migration 258");
  const ddl = create[1];

  let seenCols = null, seenOpts = null;
  const rows = desnzSeedableRows(); // excludes the needs_runner_fetch shells (fail validateAll by design)
  return seedFactors({
    label: "column-probe",
    rows,
    cite: "test",
    apply: false,
    readAllFn: async (_t, cols, opts) => { seenCols = cols; seenOpts = opts; return []; },
    insertFn: async () => { throw new Error("dry run must not write"); },
  }).then(() => {
    const wanted = seenCols.split(",").map((c) => c.trim()).concat(seenOpts.orderBy);
    for (const col of wanted) {
      assert.match(
        ddl, new RegExp(`(^|\\n)\\s*${col}\\s`),
        `seedFactors reads "${col}" but migration 258 declares no such column on emission_factors`
      );
    }
    assert.ok(!/\bid\s+uuid/.test(ddl.split("\n")[1] || ""), "sanity: emission_factors is not keyed on a bare `id`");
  });
});
