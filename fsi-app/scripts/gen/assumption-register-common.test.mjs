/**
 * Tests for assumption-register-common.mjs (WO-20) — pure, $0, offline, no DB, no fetch, no --apply.
 * Mirrors scripts/gen/emission-factors-common.test.mjs's shape (WO-18) — read that file's header before
 * editing this one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  naturalKey, buildRow, loadFixtureRows, validateAssumptionRow, validateAll, seedAssumptions,
} from "./assumption-register-common.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "fixtures/assumption-register/wo20-catalogued-assumptions-2026-08-30.json");
const MIGRATION_271 = resolve(HERE, "../../supabase/migrations/271_assumption_register.sql");

// ── Positive control: every committed fixture row is well-formed ──────────────────────────────────

test("every WO-20 fixture row passes validateAssumptionRow() with zero errors", () => {
  const rows = loadFixtureRows(FIXTURE);
  assert.equal(rows.length, 10, "fixture row count changed — update this test deliberately if intended (spec §5.4: 10 rows, one per §2 entry)");
  for (const row of rows) {
    const errors = validateAssumptionRow(row);
    assert.deepEqual(errors, [], `unexpected validation errors for ${naturalKey(row)}: ${errors.join("; ")}`);
  }
});

test("every fixture row's assumption_key is unique", () => {
  const rows = loadFixtureRows(FIXTURE);
  const keys = rows.map(naturalKey);
  assert.equal(new Set(keys).size, keys.length, "duplicate assumption_key in the fixture");
});

test("every fixture row's as_at_date is 2026-08-30 (re-verified this session, spec §2's own instruction)", () => {
  const rows = loadFixtureRows(FIXTURE);
  for (const row of rows) {
    assert.equal(row.as_at_date, "2026-08-30", `${naturalKey(row)} carries a stale/missing as_at_date`);
  }
});

// ── THE CHECK-REJECTION PROOFS ──────────────────────────────────────────────────────────────────────

test("a row missing a required field (label) is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const { label, ...malformed } = good;
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /missing\/empty required field "label"/.test(e)), JSON.stringify(errors));
});

test("a malformed (non dot-namespaced) assumption_key is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, assumption_key: "NotDotNamespaced" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /not dot-namespaced/.test(e)), JSON.stringify(errors));
});

test("subsystem not matching assumption_key's first segment is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, subsystem: "totally-different-subsystem" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /does not match assumption_key's first segment/.test(e)), JSON.stringify(errors));
});

test("an unknown status is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, status: "not-a-real-status" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /status "not-a-real-status" is not one of/.test(e)), JSON.stringify(errors));
});

test("status='superseded' without superseded_by is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, status: "superseded" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /requires superseded_by to be set/.test(e)), JSON.stringify(errors));
});

test("value_numeric set with no unit is REJECTED (malformed envelope, per provenance-envelope.mjs's own comment)", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, unit: null };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /malformed envelope/.test(e)), JSON.stringify(errors));
});

test("an unknown derivation is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, derivation: "not-a-real-derivation" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /derivation "not-a-real-derivation" is not one of/.test(e)), JSON.stringify(errors));
});

test("an unknown origin_class is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, origin_class: "not-a-real-origin-class" };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /origin_class "not-a-real-origin-class" is not one of/.test(e)), JSON.stringify(errors));
});

test("a non-positive n_observations is REJECTED", () => {
  const [good] = loadFixtureRows(FIXTURE);
  const malformed = { ...good, n_observations: 0 };
  const errors = validateAssumptionRow(malformed);
  assert.ok(errors.some((e) => /n_observations must be a positive integer/.test(e)), JSON.stringify(errors));
});

// ── naturalKey / idempotency ────────────────────────────────────────────────────────────────────────

test("naturalKey is the assumption_key column itself", () => {
  const [a] = loadFixtureRows(FIXTURE);
  assert.equal(naturalKey(a), a.assumption_key);
});

test("seedAssumptions dry-run: no writes attempted, reports the full fixture as 'to write' when nothing exists yet", async () => {
  const rows = loadFixtureRows(FIXTURE);
  let insertCalled = false;
  const summary = await seedAssumptions({
    label: "test-seed",
    rows,
    cite: { skill: "ledger", reason: "test" },
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

test("seedAssumptions is idempotent: a row whose assumption_key already exists is skipped, not re-inserted", async () => {
  const rows = loadFixtureRows(FIXTURE);
  const already = rows[0];
  let insertedRows = null;
  const summary = await seedAssumptions({
    label: "test-idempotent",
    rows,
    cite: { skill: "ledger", reason: "test" },
    apply: true,
    readAllFn: async () => [already],
    insertFn: async (table, toWrite) => { insertedRows = toWrite; return { inserted: toWrite.length, snapshot: "test-snapshot" }; },
  });
  assert.equal(summary.skipped, 1);
  assert.equal(summary.toWrite, rows.length - 1);
  assert.equal(insertedRows.length, rows.length - 1);
  assert.ok(!insertedRows.some((r) => naturalKey(r) === naturalKey(already)), "the already-live row must not be in the write batch");
});

test("seedAssumptions --apply with everything already live is a true no-op (insertFn never called)", async () => {
  const rows = loadFixtureRows(FIXTURE);
  let insertCalled = false;
  const summary = await seedAssumptions({
    label: "test-noop",
    rows,
    cite: { skill: "ledger", reason: "test" },
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
  const [good] = loadFixtureRows(FIXTURE);
  const badA = { ...good, assumption_key: "a.b", label: "" };
  const badB = { ...good, assumption_key: "c.d", status: "not-a-real-status" };
  assert.throws(
    () => validateAll([good, badA, badB]),
    (err) => {
      assert.match(err.message, /2 invalid row/);
      assert.match(err.message, /label/);
      assert.match(err.message, /status/);
      return true;
    }
  );
});

test("buildRow merges the fixture header (as_at_date) and defaults into each entry without mutating the header", () => {
  const header = { as_at_date: "2026-08-30" };
  const entry = { assumption_key: "urgency.priority_and_tier.score_mapping", subsystem: "urgency" };
  const row = buildRow(header, entry);
  assert.equal(row.as_at_date, "2026-08-30");
  assert.equal(row.assumption_key, "urgency.priority_and_tier.score_mapping");
  assert.equal(row.status, "active");
  assert.equal(row.source_key, null);
  assert.deepEqual(header, { as_at_date: "2026-08-30" });
});

// ── The read has to actually work against the real table ────────────────────
//
// WHY THESE EXIST. Every seedAssumptions test above injects `readAllFn: async () => [...]`, a stub
// that ignores its arguments. That proves the idempotency LOGIC and says nothing about whether the
// read can succeed against the live schema. readAll (scripts/lib/db.mjs) paginates with `.order(orderBy)`
// where orderBy DEFAULTS to "id" — assumption_register's PK IS literally "id" (unlike emission_factors,
// keyed on factor_id, which is what made the DEFAULT throw for that seeder — see
// emission-factors-common.test.mjs's own version of this test for that story). Explicit orderBy is
// still required here and still asserted here, not because the default would throw on this table today,
// but because (a) a future PK rename would otherwise silently reintroduce the exact failure class, with
// no test catching it, and (b) "assumption_key" — this table's real natural key — is a materially more
// useful sort order for a human reading the dry-run/apply console report than an opaque random uuid.

test("seedAssumptions reads assumption_register ordered by assumption_key, not readAll's default 'id'", async () => {
  let seenOpts = null;
  const rows = loadFixtureRows(FIXTURE);
  await seedAssumptions({
    label: "orderby-probe",
    rows,
    cite: "test",
    apply: false,
    readAllFn: async (_table, _cols, opts) => { seenOpts = opts; return []; },
    insertFn: async () => { throw new Error("dry run must not write"); },
  });
  assert.ok(seenOpts, "readAll was never called — the idempotency read has been removed");
  assert.equal(
    seenOpts.orderBy, "assumption_key",
    "seedAssumptions must pass orderBy:'assumption_key' explicitly. assumption_register's PK happens " +
    "to be named 'id' (readAll's default) today, but the natural key is assumption_key and this must " +
    "be passed explicitly rather than relying on the default coinciding with a real column."
  );
});

test("seedAssumptions reads assumption_register — every table it reads is that table, not a typo'd name", async () => {
  let seenTable = null;
  const rows = loadFixtureRows(FIXTURE);
  await seedAssumptions({
    label: "table-name-probe",
    rows,
    cite: "test",
    apply: false,
    readAllFn: async (table) => { seenTable = table; return []; },
    insertFn: async () => { throw new Error("dry run must not write"); },
  });
  assert.equal(seenTable, "assumption_register");
});

test("every column seedAssumptions reads, orderBy included, exists in the applied migration 271 DDL", () => {
  // Binds the seeder's read to the artifact that will actually ship, so a rename on either side is RED
  // rather than a runtime PostgREST error discovered by dispatching a workflow (the same defect class
  // emission-factors-common.test.mjs's equivalent test exists for).
  const sql = readFileSync(MIGRATION_271, "utf8");
  const create = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.assumption_register\s*\(([\s\S]*?)\n\);/);
  assert.ok(create, "could not locate the assumption_register CREATE TABLE in migration 271");
  const handWrittenDdl = create[1];
  const fullSql = sql; // envelope columns are ADD COLUMN lines further down the same file

  let seenCols = null, seenOpts = null;
  const rows = loadFixtureRows(FIXTURE);
  return seedAssumptions({
    label: "column-probe",
    rows,
    cite: "test",
    apply: false,
    readAllFn: async (_t, cols, opts) => { seenCols = cols; seenOpts = opts; return []; },
    insertFn: async () => { throw new Error("dry run must not write"); },
  }).then(() => {
    const wanted = seenCols.split(",").map((c) => c.trim()).concat(seenOpts.orderBy);
    for (const col of wanted) {
      const inCreateTable = new RegExp(`(^|\\n)\\s*${col}\\s`).test(handWrittenDdl);
      const inAddColumn = new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`).test(fullSql);
      assert.ok(inCreateTable || inAddColumn, `seedAssumptions reads "${col}" but migration 271 declares no such column on assumption_register`);
    }
  });
});
