#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Prior art (lane L36, 2026-09-17): runCli (scripts/maintenance/lib/cli.mjs) is the shared bootstrap
// (argv scaffold, .env.local load, DB-creds-check-and-exit(2), IS_MAIN pattern) that record-hollow-sweep.mjs,
// canonical-key-dedup.mjs and every scripts/maintenance/*.mjs wrapper already use. This script hand-rolled
// the same boilerplate; runCli replaces it below. Its own --flag/--execute flags and console lines are
// unchanged; the maintenance.yml ratify-flag-to-census step keeps calling this script's own --flag/--execute
// flags directly (system-health-audit-2026-09-17.md section 2 names this script in the clone family).
import { runCli } from "../maintenance/lib/cli.mjs";

export const RATIFY_TOKEN = "ratify:census";

/**
 * Parse a resolution_note for the ratify:census marker + its key=value payload. PURE.
 * @param {string} note - integrity_flags.resolution_note
 * @returns {{ok:true, fields:Record<string,string>} | {ok:false, error:string}}
 */
export function parseRatificationNote(note) {
  const text = String(note || "");
  // Whitespace/start/end-delimited match, NOT a bare \b word-boundary: '-' is a non-word character,
  // so \bratify:census\b would also match inside "not-ratify:census-either" (a boundary exists at
  // both hyphens too). Requiring the marker be its own whitespace-delimited token avoids that
  // false-positive on a hyphenated lookalike.
  if (!new RegExp(`(^|\\s)${RATIFY_TOKEN.replace(":", "\\:")}(\\s|$)`, "i").test(text)) {
    return { ok: false, error: `resolution_note does not carry the '${RATIFY_TOKEN}' marker.` };
  }
  const fields = {};
  for (const tok of text.split(/\s+/)) {
    const m = /^([a-zA-Z_]+)=(.+)$/.exec(tok);
    if (m) fields[m[1].toLowerCase()] = m[2];
  }
  if (!fields.source_id) return { ok: false, error: "ratification note is missing required 'source_id=<uuid>'." };
  if (!fields.url) return { ok: false, error: "ratification note is missing required 'url=<document-url>'." };
  const lane = (fields.lane || "C").toUpperCase();
  if (lane !== "A" && lane !== "C") return { ok: false, error: `lane must be 'A' or 'C' (got '${fields.lane}').` };
  return {
    ok: true,
    fields: {
      source_id: fields.source_id,
      url: fields.url,
      lane,
      shape_class: fields.shape_class || null,
      surface_tags: fields.surface_tags ? fields.surface_tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
      notes: fields.notes || null,
    },
  };
}

/**
 * Decide whether an integrity_flags row is ratifiable to the census. PURE.
 * @param {{id?:string, status?:string, resolved_by?:string|null, resolution_note?:string|null}} flag
 * @returns {{ok:true, fields:Record<string,any>} | {ok:false, error:string}}
 */
export function evaluateRatification(flag) {
  if (!flag || typeof flag.id !== "string") return { ok: false, error: "flag not found." };
  if (flag.status !== "resolved") {
    return { ok: false, error: `flag status is '${flag.status}', not 'resolved' — not yet operator-resolved.` };
  }
  if (!flag.resolved_by) {
    return { ok: false, error: "flag has no resolved_by — not confirmed operator-resolved." };
  }
  const parsed = parseRatificationNote(flag.resolution_note);
  if (!parsed.ok) return parsed;
  return { ok: true, fields: parsed.fields };
}

/**
 * Build the census_worklist insert payload for a ratified flag. PURE.
 * @param {string} flagId
 * @param {Record<string,any>} fields - evaluateRatification()'s `fields`
 * @returns {object}
 */
export function buildCensusRow(flagId, fields) {
  return {
    source_id: fields.source_id,
    document_url: fields.url,
    lane: fields.lane,
    created_by: `flywheel-ratified:${flagId}`,
    shape_class: fields.shape_class,
    surface_tags: fields.surface_tags,
    notes: fields.notes ? `${fields.notes} (ratified from integrity_flags ${flagId})` : `Ratified from integrity_flags ${flagId}`,
  };
}

const RATIFY_CITE = {
  skill: "flywheel-build-plan-2026-08-10",
  reason: "Ratification feed: promote an operator-ratified integrity_flags finding into a census_worklist row (guarded path, rule 015).",
};

/**
 * The whole ratify decision + idempotent write, taking its DB access as INJECTED functions so it is
 * directly testable with a fake client — no real Supabase creds, no process.exit (main() below
 * translates the returned status to an exit code). Mirrors db.test.mjs's fixture-the-client approach
 * (scripts/lib/db.test.mjs's __setWriteClientForTest pattern): this function's three DB touchpoints
 * (read the flag, check for an existing census row, insert) are each a plain injected function so a
 * test can fake exactly those three calls without standing up a real Supabase client at all.
 * @param {{
 *   readFlag: (flagId:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   findExisting: (sourceId:string, documentUrl:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   insertRow: (row:object) => Promise<{inserted:object, snapshot:string}>,
 * }} deps
 * @param {string} flagId
 * @param {{execute:boolean}} opts
 * @returns {Promise<
 *   {status:'not_found'|'read_error'|'not_ratifiable', error:string} |
 *   {status:'exists_error', error:string} |
 *   {status:'skipped_exists', existingId:string, row:object} |
 *   {status:'dry_run', row:object} |
 *   {status:'ratified', row:object, insertedId:string, snapshot:string}
 * >}
 */
export async function ratifyFlag(deps, flagId, { execute } = {}) {
  const { data: flag, error } = await deps.readFlag(flagId);
  if (error) return { status: "read_error", error: error.message };
  if (!flag) return { status: "not_found", error: `no integrity_flags row with id ${flagId}.` };

  const decision = evaluateRatification(flag);
  if (!decision.ok) return { status: "not_ratifiable", error: decision.error };

  return ensureCensusRow(deps, flagId, decision.fields, { execute });
}

/**
 * The census write alone: build the row for `fields`, skip when the (source_id, document_url) pair already has one,
 * insert otherwise. Exported (lane G5-SEARCH, 2026-10-07) so a caller whose `fields` come from somewhere other than
 * an operator-written resolution note (scripts/turns/apply-need-urls.mjs, a session-found URL) reaches the same
 * row shape, the same `flywheel-ratified:<flagId>` identity and the same skip-if-exists check, never a second
 * copy. ratifyFlag above calls it, so its behaviour is unchanged.
 * @param {{
 *   findExisting: (sourceId:string, documentUrl:string) => Promise<{data:object|null, error:{message:string}|null}>,
 *   insertRow: (row:object) => Promise<{inserted:object, snapshot:string}>,
 * }} deps
 * @param {string} flagId
 * @param {Record<string,any>} fields - same keys evaluateRatification()'s `fields` carries
 * @param {{execute:boolean}} opts
 */
export async function ensureCensusRow(deps, flagId, fields, { execute } = {}) {
  const row = buildCensusRow(flagId, fields);

  const { data: existing, error: existErr } = await deps.findExisting(row.source_id, row.document_url);
  if (existErr) return { status: "exists_error", error: existErr.message };
  if (existing) return { status: "skipped_exists", existingId: existing.id, row };

  if (!execute) return { status: "dry_run", row };

  const ins = await deps.insertRow(row);
  return { status: "ratified", row, insertedId: ins.inserted.id, snapshot: ins.snapshot };
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) {
  await runCli({ step: "ratify-flag-to-census", main, needsDb: true });
}

async function main() {
const args = process.argv.slice(2);
const flagIdRaw = args[args.indexOf("--flag") + 1];
const flagId = args.includes("--flag") && flagIdRaw && !flagIdRaw.startsWith("--") ? flagIdRaw : null;
const EXECUTE = args.includes("--execute");

if (!flagId) {
  console.error("ratify-flag-to-census: --flag <integrity_flags-id> is required.");
  process.exit(1);
}

const { readClient, guardedInsert } = await import("../lib/db.mjs");
const sb = readClient();

const result = await ratifyFlag(
  {
    readFlag: (id) => sb.from("integrity_flags").select("*").eq("id", id).maybeSingle(),
    findExisting: (sourceId, url) => sb.from("census_worklist").select("id").eq("source_id", sourceId).eq("document_url", url).maybeSingle(),
    insertRow: (row) => guardedInsert("census_worklist", row, { cite: RATIFY_CITE, select: "id" }),
  },
  flagId,
  { execute: EXECUTE },
);

switch (result.status) {
  case "not_found":
  case "read_error":
  case "not_ratifiable":
  case "exists_error":
    console.error(`ratify-flag-to-census: flag ${flagId} — ${result.error}`);
    process.exit(1);
    break;
  case "skipped_exists":
    console.log(`ratify-flag-to-census: census_worklist row already exists (${result.existingId}) for this (source_id, document_url) — skipped, idempotent no-op.`);
    process.exit(0);
    break;
  case "dry_run":
    console.log(
      `ratify-flag-to-census: flag ${flagId} ratifiable -> census_worklist row (source_id=${result.row.source_id}, ` +
      `url=${result.row.document_url}, lane=${result.row.lane}) (DRY RUN — nothing written. Re-run with --execute to apply.)`,
    );
    process.exit(0);
    break;
  case "ratified":
    console.log(`WROTE: census_worklist row ${result.insertedId} created (snapshot: ${result.snapshot}).`);
    process.exit(0);
    break;
}
}
