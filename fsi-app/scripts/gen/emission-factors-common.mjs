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
import { readAll, guardedInsertMany, readClient } from "../lib/db.mjs";
import { validateFactor } from "../../src/lib/contracts/factor-tier.mjs";
import { authorEdges } from "../../src/lib/propagation/author-edges.mjs";
import { mayEmbedAsSeed } from "../../src/lib/contracts/source-licence.mjs";

const CARBON_METHOD_ID = "carbon_intensity_tkm";
const CARBON_METHOD_VERSION = "1.0.0";

/**
 * DAG AUTHORSHIP AT WRITE TIME (docs/audits/wiring-audit-2026-09-04/C1-loop-map.md §3: "new producer/mint
 * data -> derivation_edges | NOBODY does this today"). Runs ONLY after a real --apply insert, over the
 * rows PostgREST actually reported back (never the pre-insert candidates — a row that failed to insert
 * must never be authored). `insertRes.rows` may be absent (a test double, or a caller whose `select`
 * omitted `factor_id`) — that is not an error, it just means nothing here can be correlated back to a
 * live factor_id, so authorship is silently skipped for this call (the producer's OWN write already
 * succeeded and is not affected either way). Licence-gated exactly like seed-derived-values.mjs's own
 * carbon-intensity seed path (`mayEmbedAsSeed`) — a non-embeddable source's factor is never turned into a
 * derived value. Never throws: a DAG-authoring failure must not fail the seeder's own primary write, which
 * already committed by the time this runs — every outcome (authored/skipped/refused/unknown-method/
 * licence-blocked/errored) is counted and returned/logged instead.
 * @param {Array<object>} writtenRows the candidate rows (pre-insert shape, includes source_key) IN THE
 *   SAME ORDER `insertRes.rows` reports them — true for a single INSERT...VALUES statement (guardedInsertMany
 *   chunks at 500; this seeder's fixtures are always far smaller than one chunk).
 * @param {{rows?: Array<{factor_id: string}>}} insertRes
 * @param {{ sb?: object, authorEdgesFn?: typeof authorEdges }} [deps]
 */
export async function authorCarbonIntensityEdges(writtenRows, insertRes, deps = {}) {
  const counts = { authored: 0, skippedAlready: 0, licenceBlocked: 0, refused: 0, unknownMethod: 0, errored: 0 };
  const insertedRows = insertRes && Array.isArray(insertRes.rows) ? insertRes.rows : null;
  if (!insertedRows || !insertedRows.length) return counts; // nothing to correlate factor_id back to

  // Lazy + memoized: readClient() requires live DB env (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)
  // and must not be constructed at all when every row this call sees is licence-blocked/unresolvable —
  // exactly the shape a --dry seeder run (or a test with no DB creds) hits.
  let _sb = deps.sb ?? null;
  const getSb = () => (_sb ??= readClient());
  const authorFn = deps.authorEdgesFn ?? authorEdges;

  const n = Math.min(writtenRows.length, insertedRows.length);
  for (let i = 0; i < n; i++) {
    const candidate = writtenRows[i];
    const factorId = insertedRows[i]?.factor_id;
    if (!factorId) continue;
    if (!mayEmbedAsSeed(candidate.source_key)) { counts.licenceBlocked += 1; continue; }
    try {
      const result = await authorFn(getSb(), {
        table: "emission_factors",
        id: factorId,
        entity: null,
        method: { id: CARBON_METHOD_ID, version: CARBON_METHOD_VERSION },
        inputs: [{ table: "emission_factors", pk: factorId }],
      });
      if (!result.ok) {
        if (result.action === "unknown-method") counts.unknownMethod += 1;
        else counts.refused += 1;
      } else if (result.action === "skipped-already-authored") {
        counts.skippedAlready += 1;
      } else {
        counts.authored += 1;
      }
    } catch (err) {
      counts.errored += 1;
      console.warn(`[author-edges] carbon_intensity_tkm authorship failed for emission_factors/${factorId}: ${err.message}`);
    }
  }
  return counts;
}

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
      // MUST be passed explicitly. readAll paginates with `.order(orderBy)` and orderBy DEFAULTS TO
      // "id" — but `emission_factors` has no `id` column. Migration 258 keys it on `factor_id`
      // (verified live 2026-08-30: information_schema reports no `id`, and the only PK/UNIQUE on the
      // table is `emission_factors_pkey PRIMARY KEY (factor_id)`).
      //
      // WITHOUT THIS THE READ ALWAYS THREW, and the whole natural-key idempotency rule this module's
      // header describes was unreachable in production. It cost a real dispatch to find: producers
      // run #11 (DESNZ, dry, 2026-08-30) printed `already live (skip, idempotent): 0`, which was the
      // catch-block FALLBACK below, not a measurement — and the `if (apply) throw e` line means an
      // --apply run would have ABORTED rather than written blind. The fail-closed branch did exactly
      // its job; the bug was that the read could never succeed for this table in the first place.
      //
      // Found by READING THE DRY-RUN PLAN before applying (ADR-023 §4), which is the third defect
      // that gate has caught on this producer family.
      orderBy: "factor_id",
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

  const authorCounts = await authorCarbonIntensityEdges(toWrite, res);
  console.log(
    `[${label}] DAG authorship (carbon_intensity_tkm): authored=${authorCounts.authored} ` +
    `already=${authorCounts.skippedAlready} licence-blocked=${authorCounts.licenceBlocked} ` +
    `refused=${authorCounts.refused} unknown-method=${authorCounts.unknownMethod} errored=${authorCounts.errored}`
  );

  return { mode: "apply", fixtureRows: valid.length, skipped, toWrite: toWrite.length, written: res.inserted, snapshot: res.snapshot, authorCounts };
}
