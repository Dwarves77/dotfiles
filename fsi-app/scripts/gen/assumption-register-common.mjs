/**
 * WO-20 — shared seeding machinery for the `assumption_register` table
 * (docs/plans/wo20-assumption-register-spec.md), mirroring scripts/gen/emission-factors-common.mjs's
 * shape exactly (WO-18): one home for the natural-key idempotency rule and the guarded-write plumbing,
 * so a source-specific seeder differs from another only in its fixture data, never in how it writes.
 *
 * NATURAL KEY: assumption_key itself (spec §3 — a dot-namespaced text UNIQUE NOT NULL column, the
 * register's own natural key by design, not a derived tuple the way emission_factors needs one). A
 * later re-seed of the SAME assumption_key with a changed value is a RETUNE, not a new vintage — spec
 * §3's `status`/`superseded_by` columns model that as its own guarded-path pass (a new row + the old
 * row's superseded_by set), never an in-place UPDATE (CLAUDE.md standing rule 1). This seeder therefore
 * treats "already live" as SKIP, exactly like emission-factors-common.mjs treats an existing natural key
 * — it inserts only rows whose assumption_key has never been seeded, and never touches an existing row.
 *
 * WRITE PATH: guardedInsertMany from scripts/lib/db.mjs (cite + snapshot + reversibility). Every row is
 * validated by validateAssumptionRow() BEFORE any write is attempted — a single invalid row aborts the
 * whole run rather than partially seeding.
 *
 * DRY-RUN by default; --apply required to write. This module never calls --apply itself — only a human
 * or the coordinator's own run decides that. NO DB ACCESS HAPPENS FROM THIS SESSION (Sonnet executor
 * lane, wave18/la, 2026-08-30): this module and its tests exercise only the dry-run path and the pure
 * validate/diff logic with injected readAllFn/insertFn stubs — never a real Supabase client.
 *
 * THE readAll ORDER-BY LESSON (scripts/gen/emission-factors-common.mjs's own header, its
 * "seedFactors reads emission_factors ordered by factor_id" test, and this session's brief): readAll's
 * `orderBy` DEFAULTS to "id" (scripts/lib/db.mjs). assumption_register's primary key IS literally named
 * `id` (spec §3's own CREATE TABLE: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`) — so, UNLIKE
 * emission_factors (keyed on `factor_id`), the default would not throw here; the emission_factors
 * precondition that made the default fatal does not reproduce on this table. orderBy is still passed
 * EXPLICITLY below, as "assumption_key" rather than the default "id": (a) defensive — a future PK rename
 * away from the bare `id` convention (the way emission_factors itself is keyed on `factor_id`) would
 * otherwise silently reintroduce exactly the failure class that lesson is about, with no test catching
 * it; (b) `assumption_key` is the register's own natural key (spec §3) and orders the dry-run/apply
 * console report alphabetically by dot-path — grouping by subsystem prefix — rather than by an opaque,
 * randomly-generated uuid, which is the more useful order for a human reading the report.
 */
import { readAll, guardedInsertMany } from "../lib/db.mjs";
import { DERIVATIONS } from "../../src/lib/contracts/envelope.mjs";
import { ORIGIN_CLASSES } from "../../src/lib/contracts/vocabularies.mjs";

const STATUSES = Object.freeze(["active", "superseded", "retired"]);

// assumption_key format (spec §3): <subsystem>.<mechanism>.<parameter>, lower-case/hyphen/underscore
// segments joined by dots, at least two segments (a bare subsystem with no parameter is not a key).
const ASSUMPTION_KEY_RE = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/;

/** The natural key for an assumption_register row: the column IS the key (spec §3). */
export function naturalKey(row) {
  return row.assumption_key;
}

/**
 * Validate one candidate row against the shape migration 271 (scripts/gen/migration-271-
 * assumption-register.mjs) will enforce at the DB level — the CHECK constraints and NOT NULL columns —
 * PLUS the envelope's documented co-nullability convention (value_numeric requires unit) that the DB
 * migration deliberately does NOT enforce with a CHECK (spec's own envelope column comment: "enforced at
 * the write path"). Mirrors validateFactor()'s shape (src/lib/contracts/factor-tier.mjs): returns an
 * array of human-readable error strings, empty when the row is clean.
 */
export function validateAssumptionRow(row) {
  const errors = [];
  const req = (field) => {
    if (typeof row[field] !== "string" || !row[field].trim()) errors.push(`missing/empty required field "${field}"`);
  };

  req("assumption_key");
  req("subsystem");
  req("label");
  req("rationale");
  req("code_location");

  if (typeof row.assumption_key === "string" && row.assumption_key.trim() && !ASSUMPTION_KEY_RE.test(row.assumption_key)) {
    errors.push(`assumption_key "${row.assumption_key}" is not dot-namespaced lower-case (expected <subsystem>.<mechanism>.<parameter>, e.g. "connections-scorer.weight.shared_source")`);
  }
  if (typeof row.subsystem === "string" && typeof row.assumption_key === "string" && row.assumption_key.trim()) {
    const firstSegment = row.assumption_key.split(".")[0];
    if (firstSegment !== row.subsystem) {
      errors.push(`subsystem "${row.subsystem}" does not match assumption_key's first segment "${firstSegment}" (spec §3: subsystem is denormalized FROM the key's first segment)`);
    }
  }

  const status = row.status ?? "active";
  if (!STATUSES.includes(status)) {
    errors.push(`status "${status}" is not one of ${STATUSES.join("|")}`);
  }
  if (status === "superseded" && !row.superseded_by) {
    errors.push(`status "superseded" requires superseded_by to be set`);
  }
  if (status !== "superseded" && row.superseded_by) {
    errors.push(`superseded_by is set but status is "${status}", not "superseded"`);
  }

  if (row.governing_decision != null && (typeof row.governing_decision !== "string" || !row.governing_decision.trim())) {
    errors.push(`governing_decision must be a non-empty string or null, got ${JSON.stringify(row.governing_decision)}`);
  }

  if (row.value_numeric != null) {
    if (typeof row.value_numeric !== "number" || !Number.isFinite(row.value_numeric)) {
      errors.push(`value_numeric must be a finite number or null, got ${JSON.stringify(row.value_numeric)}`);
    }
    if (row.unit == null || (typeof row.unit === "string" && !row.unit.trim())) {
      errors.push(`value_numeric is set (${row.value_numeric}) but unit is missing — a populated value_numeric with no unit is a malformed envelope (provenance-envelope.mjs column comment)`);
    }
  }

  if (row.derivation != null && !DERIVATIONS.includes(row.derivation)) {
    errors.push(`derivation "${row.derivation}" is not one of ${DERIVATIONS.join("|")}`);
  }
  if (row.origin_class != null && !ORIGIN_CLASSES.includes(row.origin_class)) {
    errors.push(`origin_class "${row.origin_class}" is not one of ${ORIGIN_CLASSES.join("|")}`);
  }

  if (row.n_observations != null) {
    if (!Number.isInteger(row.n_observations) || row.n_observations <= 0) {
      errors.push(`n_observations must be a positive integer or null, got ${JSON.stringify(row.n_observations)}`);
    }
  }

  if (row.as_at_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(row.as_at_date)) {
    errors.push(`as_at_date "${row.as_at_date}" is not an ISO date (YYYY-MM-DD)`);
  }

  return errors;
}

/**
 * Merge one fixture entry with the fixture's shared header defaults (as_at_date today; source_key,
 * source_ref, n_observations, method_version, governing_decision default to null; status defaults to
 * "active"; superseded_by defaults to null) — same spread shape as emission-factors-common.mjs's
 * buildRow(), so the fixture file only ever states what differs from the shared default.
 */
export function buildRow(header, entry) {
  return {
    source_key: null,
    source_ref: null,
    n_observations: null,
    method_version: null,
    governing_decision: null,
    status: "active",
    superseded_by: null,
    as_at_date: header.as_at_date ?? null,
    ...entry,
  };
}

/**
 * Load a fixture file's `rows`, decorated with the shared header fields, ready for
 * validateAssumptionRow(). `fixturePath` is an absolute path (caller resolves it
 * import.meta.url-relative, rule-012).
 */
export function loadFixtureRows(fixturePath) {
  const raw = JSON.parse(readFileSyncUtf8(fixturePath));
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) {
    throw new Error(`assumption-register-common: fixture ${fixturePath} has no rows[]`);
  }
  return raw.rows.map((entry) => buildRow(raw, entry));
}

// Thin wrapper so this module has exactly one place that touches the filesystem for a fixture read,
// and so the test file can stub it without needing a real file on disk.
import { readFileSync } from "node:fs";
function readFileSyncUtf8(p) { return readFileSync(p, "utf8"); }

/**
 * Validate every candidate row (abort-on-first-invalid, reporting ALL invalid rows before exiting — a
 * seeder that stops at the first error hides how many more are wrong). Returns the valid rows; throws
 * if any row failed.
 */
export function validateAll(rows) {
  const problems = [];
  for (const [i, row] of rows.entries()) {
    const errors = validateAssumptionRow(row);
    if (errors.length) problems.push({ index: i, key: naturalKey(row), errors });
  }
  if (problems.length) {
    const detail = problems.map((p) => `  [${p.index}] ${p.key}: ${p.errors.join("; ")}`).join("\n");
    throw new Error(`assumption-register-common: ${problems.length} invalid row(s), refusing to seed any:\n${detail}`);
  }
  return rows;
}

const SELECT_COLUMNS = "id, assumption_key, subsystem, status, superseded_by";

/**
 * Full seeder run: validate -> diff against live rows (by assumption_key) -> dry-run report, or --apply
 * write via guardedInsertMany. Returns a summary object for the caller to log/test.
 *
 * `apply` is the caller's parsed --apply flag, never inferred here — an explicit boolean keeps the
 * dry-by-default contract visible at the call site rather than buried in an env check.
 */
export async function seedAssumptions({ label, rows, cite, apply, readAllFn = readAll, insertFn = guardedInsertMany }) {
  const valid = validateAll(rows);

  let existing = [];
  try {
    existing = await readAllFn("assumption_register", SELECT_COLUMNS, {
      // MUST be passed explicitly — see this module's own header note on why, and the sibling lesson in
      // emission-factors-common.mjs. assumption_register's PK IS "id" (readAll's default), so omitting
      // this would NOT throw here the way it did for emission_factors/factor_id — but "assumption_key"
      // is the register's real natural key and orders the report by dot-path, not by an opaque uuid.
      orderBy: "assumption_key",
    });
  } catch (e) {
    if (apply) throw e; // never write blind if we can't confirm what already exists
    console.warn(`[${label}] could not read existing assumption_register rows (${e.message}) — dry-run proceeds assuming none exist.`);
  }
  const existingKeys = new Set(existing.map(naturalKey));

  const toWrite = valid.filter((r) => !existingKeys.has(naturalKey(r)));
  const skipped = valid.length - toWrite.length;

  console.log(`[${label}] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[${label}] fixture rows: ${valid.length}  |  already live (skip, idempotent): ${skipped}  |  to write: ${toWrite.length}`);
  for (const r of toWrite) {
    console.log(`   ${naturalKey(r)}  value_numeric=${r.value_numeric ?? "-"}  unit=${r.unit ?? "-"}  governing_decision=${r.governing_decision ?? "(none)"}`);
  }

  if (!apply) {
    console.log(`[${label}] DRY-RUN — pass --apply to write.`);
    return { mode: "dry-run", fixtureRows: valid.length, skipped, toWrite: toWrite.length, rows: toWrite };
  }
  if (!toWrite.length) {
    console.log(`[${label}] nothing to write (idempotent no-op).`);
    return { mode: "apply", fixtureRows: valid.length, skipped, toWrite: 0, written: 0 };
  }
  const res = await insertFn("assumption_register", toWrite, { cite, select: "id" });
  console.log(`[${label}] written=${res.inserted}  snapshot=${res.snapshot}`);
  return { mode: "apply", fixtureRows: valid.length, skipped, toWrite: toWrite.length, written: res.inserted, snapshot: res.snapshot };
}
