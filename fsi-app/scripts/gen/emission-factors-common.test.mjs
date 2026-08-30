/**
 * Tests for emission-factors-common.mjs (WO-18) — pure, $0, offline, no DB, no fetch, no --apply.
 *
 * WIRING NOTE for the coordinator (this lane's write set excludes fsi-app/.discipline/run-test-suite.sh,
 * so this file cannot be added to the `node --test` glob list from inside the lane). Until it is added
 * there (one line: `fsi-app/scripts/gen/*.test.mjs \` alongside the other directory globs), this file
 * is NOT execution-wired per .discipline/governance/execution-wiring.mjs, and
 * .discipline/fitness/functions/F23-governed-surface-coverage.mjs's PROOF_RE will classify it as an
 * ORPHANED-PROOF gap (current committed GAP_BASELINE.orphaned_proofs = 0, so F23 regresses to 1 until
 * the line is added). Flagged in the WO-18 lane report; not something this lane's write set can fix.
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
import { naturalKey, buildRow, loadFixtureRows, validateAll, seedFactors } from "./emission-factors-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESNZ_FIXTURE = resolve(HERE, "fixtures/emission-factors/desnz-modal-defaults-2025.json");
const EPA_FIXTURE = resolve(HERE, "fixtures/emission-factors/epa-modal-defaults-2025.json");
const MIGRATION_258 = resolve(HERE, "../../supabase/migrations/258_emission_factors_and_licence_gate.sql");

// ── Positive control: every committed fixture row is well-formed ──────────────────────────────────
test("every DESNZ fixture row passes validateFactor() with zero errors", () => {
  const rows = loadFixtureRows(DESNZ_FIXTURE);
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
  const rows = loadFixtureRows(DESNZ_FIXTURE);
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
  const rows = loadFixtureRows(DESNZ_FIXTURE);
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
  const rows = loadFixtureRows(DESNZ_FIXTURE);
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
