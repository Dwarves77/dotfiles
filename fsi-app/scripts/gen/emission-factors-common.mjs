/**
 * WO-18 — shared seeding machinery for the `emission_factors` licence-clear modal-default seeders
 * (emission-factors-desnz.mjs, emission-factors-epa.mjs). One home for the natural-key idempotency
 * rule and the guarded-write plumbing, so the two source-specific seeders differ only in their
 * fixture data and source_key, never in how they write.
 *
 * WHY A NATURAL KEY, HAND-DEFINED HERE. `emission_factors` (migration 258) carries only ONE database
 * constraint that could dedupe a row — the `factor_id uuid` primary key, which is generated at insert
 * and therefore can never collide with anything, so it enforces nothing about re-running a seeder.
 * Confirmed live (rule 0.15, this session): `SELECT conname, pg_get_constraintdef(oid) FROM
 * pg_constraint WHERE conrelid = 'public.emission_factors'::regclass` returns 34 constraints and not
 * one UNIQUE or EXCLUDE constraint beyond `emission_factors_pkey (factor_id)`. The table is
 * deliberately append-only (migration 258's own header: "correct by inserting a new row and setting
 * superseded_by, never by editing") — an enforced UNIQUE would fight that design the day a real
 * supersession needs two rows that agree on every scope column and differ only in valid_from. So
 * idempotency is a SEEDER-LEVEL discipline, not a schema one: this module defines the tuple that
 * identifies "the same factor, again" for a MODAL scope row (the only scope kind either seeder
 * writes) and skips a row whose key already exists among LIVE (non-superseded) rows for the same
 * source_key before writing.
 *
 * The key: (tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction, source_key,
 * valid_from). Two rows agreeing on all eight are the same published vintage of the same factor;
 * a later re-seed with a NEW valid_from is a new vintage and is expected to insert as a fresh row
 * (append-only supersession is a separate, human-reviewed step this module does not attempt).
 *
 * WRITE PATH: guardedInsertMany from scripts/lib/db.mjs (cite + snapshot + reversibility — the same
 * guarded path backfill-canonical-keys.mjs uses for its guardedUpdate). Every row is run through
 * validateFactor() from src/lib/contracts/factor-tier.mjs BEFORE any write is attempted — a single
 * invalid row aborts the whole run rather than partially seeding (a seeder that writes 9 good rows
 * and silently drops a 10th bad one is the same "confidently wrong" failure class factor-tier.mjs's
 * own header warns about for the DQI direction bug).
 *
 * DRY-RUN by default; --apply required to write (WO-18 lane contract). This module never calls
 * `--apply` itself — only a human or the coordinator's own run decides that.
 */
import { readAll, guardedInsertMany } from "../lib/db.mjs";
import { validateFactor } from "../../src/lib/contracts/factor-tier.mjs";

/** The natural key for a modal-scope emission_factors row (see module header). */
export function naturalKey(row) {
  return [
    row.tier, row.scope_kind, row.mode, row.vehicle_class, row.energy_carrier,
    row.jurisdiction, row.source_key, row.valid_from,
  ].join("|");
}

/**
 * Build the full envelope row for `guardedInsertMany` from one fixture entry plus the fixture's
 * shared header (source_key, as_at_date, valid_from). Columns not set here (movement_ref,
 * operator_key, corridor_id, wtt_co2e, co2_biogenic, load_factor_pct, empty_running_pct, valid_to,
 * superseded_by, donor, n_observations) stay absent so Postgres applies their column default / NULL —
 * every one of them is nullable for a `modal` scope_kind per migration 258's per-kind CHECKs.
 */
export function buildRow(header, entry) {
  return {
    source_key: header.source_key,
    as_at_date: header.as_at_date,
    valid_from: header.valid_from,
    ...entry,
  };
}

/**
 * Load a fixture file's `rows`, decorated with the shared header fields, ready for validateFactor().
 * `fixturePath` is an absolute path (caller resolves it import.meta.url-relative, rule-012).
 */
export function loadFixtureRows(fixturePath) {
  const raw = JSON.parse(readFileSyncUtf8(fixturePath));
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) {
    throw new Error(`emission-factors-common: fixture ${fixturePath} has no rows[]`);
  }
  if (!raw.source_key || !raw.as_at_date || !raw.valid_from) {
    throw new Error(`emission-factors-common: fixture ${fixturePath} is missing source_key/as_at_date/valid_from`);
  }
  return raw.rows.map((entry) => buildRow(raw, entry));
}

// Thin wrapper so this module has exactly one place that touches the filesystem for a fixture read,
// and so the test file can stub it without needing a real file on disk.
import { readFileSync } from "node:fs";
function readFileSyncUtf8(p) { return readFileSync(p, "utf8"); }

/**
 * Validate every candidate row (abort-on-first-invalid, reporting ALL invalid rows before exiting —
 * a seeder that stops at the first error hides how many more are wrong). Returns the valid rows;
 * throws if any row failed.
 */
export function validateAll(rows) {
  const problems = [];
  for (const [i, row] of rows.entries()) {
    const errors = validateFactor(row);
    if (errors.length) problems.push({ index: i, key: naturalKey(row), errors });
  }
  if (problems.length) {
    const detail = problems.map((p) => `  [${p.index}] ${p.key}: ${p.errors.join("; ")}`).join("\n");
    throw new Error(`emission-factors-common: ${problems.length} invalid row(s), refusing to seed any:\n${detail}`);
  }
  return rows;
}

/**
 * Full seeder run for one source: validate -> diff against live rows for this source_key -> dry-run
 * report, or --apply write via guardedInsertMany. Returns a summary object for the caller to log/test.
 *
 * `apply` is the caller's parsed --apply flag, never inferred here — an explicit boolean keeps the
 * dry-by-default contract visible at the call site rather than buried in an env check.
 */
export async function seedFactors({ label, rows, cite, apply, readAllFn = readAll, insertFn = guardedInsertMany }) {
  const valid = validateAll(rows);
  const sourceKey = valid[0]?.source_key;

  let existing = [];
  try {
    existing = await readAllFn("emission_factors", "factor_id, tier, scope_kind, mode, vehicle_class, energy_carrier, jurisdiction, source_key, valid_from, superseded_by", {
      match: (qb) => qb.eq("source_key", sourceKey).is("superseded_by", null),
    });
  } catch (e) {
    if (apply) throw e; // never write blind if we can't confirm what already exists
    console.warn(`[${label}] could not read existing emission_factors rows (${e.message}) — dry-run proceeds assuming none exist.`);
  }
  const existingKeys = new Set(existing.map(naturalKey));

  const toWrite = valid.filter((r) => !existingKeys.has(naturalKey(r)));
  const skipped = valid.length - toWrite.length;

  console.log(`[${label}] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[${label}] fixture rows: ${valid.length}  |  already live (skip, idempotent): ${skipped}  |  to write: ${toWrite.length}`);
  for (const r of toWrite) {
    console.log(`   ${naturalKey(r)}  ttw_co2e=${r.ttw_co2e ?? "-"}  wtt=${r.wtt_co2e ?? "-"}  wtw=${r.wtw_co2e ?? "-"}`);
  }

  if (!apply) {
    console.log(`[${label}] DRY-RUN — pass --apply to write.`);
    return { mode: "dry-run", fixtureRows: valid.length, skipped, toWrite: toWrite.length, rows: toWrite };
  }
  if (!toWrite.length) {
    console.log(`[${label}] nothing to write (idempotent no-op).`);
    return { mode: "apply", fixtureRows: valid.length, skipped, toWrite: 0, written: 0 };
  }
  const res = await insertFn("emission_factors", toWrite, { cite, select: "factor_id" });
  console.log(`[${label}] written=${res.inserted}  snapshot=${res.snapshot}`);
  return { mode: "apply", fixtureRows: valid.length, skipped, toWrite: toWrite.length, written: res.inserted, snapshot: res.snapshot };
}
