// SHARED-WRITER: integrity_flags
// apply-deferrals.mjs -- MAINT dispatch step (lane M6, 2026-09-21, build plan section 6.1 row M6,
// Amendment 1 section E). Item 3 of brief-m6.md is SPLIT: this lane BUILDS the applier, it does NOT run
// it and does NOT wire the quarantine-disposition verifier into the CI data-audit lane (that one-line
// wiring plus its red-then-green proof is lane M6b, dispatched straight after the coordinator applies the
// deferrals this script writes -- see docs/ops/session-log.d/2026-09-21-m6.md, "Owed").
//
// WHY THIS EXISTS. scripts/verify/quarantine-disposition-audit.mjs's HARD tripwire is 53 past-bound live-
// quarantined items with no valid deferral (stage-audit-2026-09-18/s3-evaluate.md). Wiring that verifier
// into the CI data-audit lane fail-closed (brief-m6.md item 3) would turn the lane red on landing unless
// those 53 are first dispositioned-as-blocked with a REAL reason, owner and future resolution_event per
// item class (source silence, stubs, truncated captures, mistyped items, retype decisions pending the
// operator -- the classes named in the stage-audit s3 file and the W9 ledger). This script is the write
// path for that disposition: it validates a reviewed JSON file of per-item deferral rows against
// scripts/lib/deferral.mjs's assertValidDeferral (the SAME mechanical guard quarantine-disposition-
// audit.mjs's own read side already re-checks), then, apply mode only, writes one open integrity_flags
// row per valid row through the guarded db.mjs path (rule 015).
//
// UPSTREAM CONTRACT (unchanged, no second copy): isValidDeferral / assertValidDeferral live in
// scripts/lib/deferral.mjs. This file adds no new validation semantics -- it is dry-then-apply plumbing
// around that one existing guard, matching every other MAINT wrapper's own "the logic lives upstream,
// this wrapper is the CLI + write path" shape (see reopen-validation-holds.mjs's own header for the
// precedent this follows).
//
// REVIEWED-JSON CONTRACT. `--arg` IS the required path (repo-relative or absolute) to a JSON file: an
// array of { item_id, reason, deferred_until, owner, resolution_event }. Every field is passed straight
// through to assertValidDeferral verbatim -- this script never invents, rewrites or defaults a field. A
// row failing validation is reported by item_id and reason, never silently dropped and never written.
//
// WRITE SHAPE (apply mode only). One integrity_flags row per VALID row:
//   { category: "data_quality", subject_type: "item", subject_ref: <item_id>, created_by:
//     "disposition_deferred", status: "open", description: <reason>,
//     recommended_actions: [{ deferral: { reason, deferred_until, owner, resolution_event } }] }
// This is the EXACT shape scripts/verify/quarantine-disposition-audit.mjs's read side already parses
// (created_by === "disposition_deferred", recommended_actions[0].deferral) -- no second reader is needed
// or built here.
//
// NOT RUN BY THIS LANE. The coordinator runs this against the reviewed 53-item disposition file before
// M6b wires the verifier into the CI data-audit lane; this lane only builds and unit-tests it (pure
// validation only -- no DB call is made by any test in apply-deferrals.test.mjs).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidDeferral } from "../lib/deferral.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";

export const CITE = Object.freeze({
  skill: "apply-deferrals-2026-09-21",
  reason:
    "MAINT apply-deferrals dispatch (lane M6, build plan section 6.1 row M6, Amendment 1 section E): " +
    "dispositions a past-bound live-quarantined item as BLOCKED with a reviewed reason/owner/future " +
    "resolution_event, through scripts/lib/deferral.mjs's own assertValidDeferral guard -- the same " +
    "mechanical check scripts/verify/quarantine-disposition-audit.mjs's read side re-verifies.",
});

/**
 * Validate one raw deferral row's shape (item_id present) plus its deferral payload (via
 * scripts/lib/deferral.mjs's isValidDeferral). Pure, no I/O, no Date.now() unless `now` is omitted.
 * Returns { ok: true, item_id, payload } or { ok: false, item_id, error }.
 * @param {object} row
 * @param {Date} [now]
 */
export function validateDeferralRow(row, now = new Date()) {
  const item_id = row && typeof row === "object" ? row.item_id : undefined;
  if (typeof item_id !== "string" || item_id.trim().length === 0) {
    return { ok: false, item_id: item_id ?? null, error: "row.item_id is required (a non-empty string)" };
  }
  const payload = {
    reason: row.reason,
    deferred_until: row.deferred_until,
    owner: row.owner,
    resolution_event: row.resolution_event,
  };
  const verdict = isValidDeferral(payload, now);
  if (!verdict.ok) return { ok: false, item_id, error: verdict.error };
  return { ok: true, item_id, payload };
}

/**
 * Partition a raw array of rows into { valid, invalid } via validateDeferralRow. Pure. A non-array input
 * yields both lists empty (never throws) -- the caller reports that as its own "not an array" note.
 * @param {unknown} rows
 * @param {Date} [now]
 */
export function partitionDeferralRows(rows, now = new Date()) {
  const valid = [];
  const invalid = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const v = validateDeferralRow(row, now);
    if (v.ok) valid.push(v);
    else invalid.push(v);
  }
  return { valid, invalid };
}

/**
 * Build the integrity_flags row for one validated deferral. Pure -- the exact shape
 * quarantine-disposition-audit.mjs's read side parses (see this file's header, "WRITE SHAPE").
 * @param {{item_id: string, payload: object}} valid
 */
export function buildDeferralFlagRow({ item_id, payload }) {
  return {
    category: "data_quality",
    subject_type: "item",
    subject_ref: item_id,
    created_by: "disposition_deferred",
    status: "open",
    description: `Quarantine disposition deferred: ${payload.reason}`,
    recommended_actions: [{ deferral: { ...payload } }],
  };
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {object} deps -- `readDeferralsFile(path) -> Promise<array>` (injected so this stays DB/fs-free
 *   under `node --test`), and, apply mode only, `insertDeferralFlag(row) -> Promise<{id}>`.
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const path = String(arg ?? "").trim();
  if (!path) {
    return {
      step: "apply-deferrals", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: 'REFUSED -- --arg must name the reviewed deferrals JSON file path (e.g. "docs/ops/deferrals/<date>.json"). See this step\'s own header for the {item_id, reason, deferred_until, owner, resolution_event} contract.',
    };
  }

  let rows;
  try {
    rows = await deps.readDeferralsFile(path);
  } catch (e) {
    return {
      step: "apply-deferrals", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: `REFUSED -- could not read deferrals file '${path}': ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!Array.isArray(rows)) {
    return {
      step: "apply-deferrals", mode, counts: { rows: 0 }, applied: 0, read_back: {}, exitCode: 1,
      note: `REFUSED -- '${path}' does not parse to a JSON array of deferral rows.`,
    };
  }

  const { valid, invalid } = partitionDeferralRows(rows);
  const baseCounts = { rows: rows.length, valid: valid.length, invalid: invalid.length };

  if (mode === "dry") {
    return {
      step: "apply-deferrals", mode, counts: baseCounts, applied: 0,
      read_back: {
        plan: valid.map((v) => ({ item_id: v.item_id, reason: v.payload.reason, deferred_until: v.payload.deferred_until, owner: v.payload.owner })),
        invalid: invalid.map((v) => ({ item_id: v.item_id, error: v.error })),
      },
      exitCode: 0,
    };
  }

  // apply: write one integrity_flags row per VALID row only. Invalid rows are reported, never written.
  const written = [];
  for (const v of valid) {
    const row = buildDeferralFlagRow(v);
    const res = await deps.insertDeferralFlag(row);
    written.push({ item_id: v.item_id, flag_id: res?.id ?? null });
  }

  return {
    step: "apply-deferrals", mode, counts: baseCounts, applied: written.length,
    read_back: {
      written,
      invalid: invalid.map((v) => ({ item_id: v.item_id, error: v.error })),
    },
    exitCode: 0,
  };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const { guardedInsert } = await import("../lib/db.mjs");
  await runCli({
    step: "apply-deferrals",
    main,
    needsDb: true,
    buildDeps: async () => ({
      readDeferralsFile: async (path) => JSON.parse(readFileSync(resolve(fsiRoot(), path), "utf8")),
      insertDeferralFlag: async (row) => {
        const { inserted } = await guardedInsert("integrity_flags", row, { cite: CITE });
        return inserted;
      },
    }),
  });
}
