import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
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

/** The sibling step's out dir name and the file it writes (scripts/plan-quarantine-disposition.mjs). */
export const PLAN_STEP = "plan-quarantine-disposition";
export const PLAN_FILE = "plan.json";

/**
 * Pure: where plan-quarantine-disposition wrote its plan, relative to THIS step's out dir (siblings under
 * the run's OUT_ROOT). Null when there is no out dir to anchor on.
 * @param {string|null} out
 */
export function defaultPlanPath(out) {
  if (!out) return null;
  return resolve(dirname(resolve(String(out))), PLAN_STEP, PLAN_FILE);
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {object} deps -- `readDeferralsFile(path) -> Promise<array>` (injected so this stays DB/fs-free
 *   under `node --test`), and, apply mode only, `insertDeferralFlag(row) -> Promise<{id}>`.
 */
export async function main({ mode = "dry", arg = "", out = null } = {}, deps) {
  const explicit = String(arg ?? "").trim();
  const path = explicit || defaultPlanPath(out);
  if (!path) {
    return {
      step: "apply-deferrals", mode, counts: {}, applied: 0, read_back: { residue: { "no-plan-file": 0 } }, exitCode: 0,
      note: "no-plan-file: no --arg and no --out to locate the plan-quarantine-disposition plan.json, nothing to apply.",
    };
  }

  let rows;
  try {
    rows = await deps.readDeferralsFile(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!explicit) {
      return {
        step: "apply-deferrals", mode, counts: {}, applied: 0, read_back: { residue: { "no-plan-file": 1 }, plan_path: path }, exitCode: 0,
        note: `no-plan-file: the default plan '${path}' is not present (${msg}); run plan-quarantine-disposition in apply mode first. Nothing to apply.`,
      };
    }
    return {
      step: "apply-deferrals", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: `REFUSED -- could not read deferrals file '${path}': ${msg}`,
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
