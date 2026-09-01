#!/usr/bin/env node
// ratify-flag-to-census.mjs — the FLYWHEEL-TO-HARNESS feed. Given --flag <id>, reads an integrity_flags
// row this lane's own producers wrote (coverage_gap / anticipated-coverage / signal-candidate — any
// namespace from flag-namespaces.mjs, or an operator-authored flag), requires it to already be
// OPERATOR-RESOLVED with a specific resolution marker (defined below — this is the "marker you define
// and document" the dispatch asks for), and idempotently creates a census_worklist row so the document
// the operator identified enters the SAME gap-census pipeline (migration 221) real census producers
// feed. Skip-if-exists on census_worklist's natural unique key (source_id, document_url).
//
// THE RESOLUTION-MARKER DESIGN (read this before changing the parser).
//
// integrity_flags (migration 048) has no `evidence` column and no structured "what to do about this"
// field — description/recommended_actions are free text, and none of this lane's producers (gaps.mjs,
// anticipate.mjs, signal-candidates.mjs) can supply a document_url or source_id: a coverage_gap's
// subject_ref is a theme id, an anticipate finding's is a forward-event id, a signal candidate's is a
// pair of existing item ids — none of them names an EXTERNAL document to add to the census. That
// document is something the OPERATOR finds while investigating the flag (e.g. "this theme spans
// jurisdiction X with no member — I found the actual X regulation at <url>, source <uuid>"). So the
// resolution marker is not a bare status flip; it is the vehicle for the operator's own finding,
// carried in the ALREADY-EXISTING `resolution_note` free-text column (the admin platform
// integrity-flags PATCH route — /api/admin/integrity-flags?platform=1 — already accepts resolution_note
// on every resolve; no new API surface needed).
//
// FORMAT (resolution_note, when ratifying a flag to the census):
//   ratify:census source_id=<uuid> url=<document-url> [lane=A|C] [shape_class=<value>]
//     [surface_tags=<a,b,c>] [notes=<free text, no spaces — quote-free tokenizer, see below>]
//
//   - The literal token `ratify:census` (case-insensitive) marks this note as a census ratification —
//     this is the "resolution marker" the dispatch asks for. Its ABSENCE means "resolved for some
//     other reason" (a false positive, an accepted-as-is gap, whatever) — this script refuses those.
//   - `source_id=<uuid>` and `url=<document-url>` are REQUIRED — census_worklist.source_id (FK to
//     sources, NOT NULL) and .document_url (NOT NULL) have no legal default; a resolution_note that
//     ratifies to the census without both is a malformed ratification, refused rather than guessed.
//   - `lane` defaults to 'C' (discovery lane) when omitted — this script is discovery-shaped (an
//     operator surfacing a document mid-investigation), not intake-shaped ('A', Chrome-driven);
//     migration 221's own CHECK constrains lane to exactly {'A','C'}.
//   - Tokens are whitespace-separated `key=value` pairs (no quoting support — a value containing a
//     space is not representable in this v1 parser; `notes` is the one field most likely to want
//     spaces, so operators should keep it short or omit it and rely on the flag's own description).
//
// REQUIRES "operator-resolved": the flag's `status` must be 'resolved' (not just 'in_review' or
// 'open') AND `resolved_by` must be set (integrity_flags' own resolve path always sets both together —
// migration 048's admin route pattern, see admin/integrity-flags PATCH). A flag an operator only
// looked at (in_review) is not yet a ratification.
//
// Usage:
//   node scripts/connections/ratify-flag-to-census.mjs --flag <integrity_flags-id> [--dry|--execute]
//     --dry      compute + report, write nothing (DEFAULT)
//     --execute  actually create the census_worklist row (explicit opt-in)
// Exit 0 done (including "already exists, skipped") · 1 bad args / flag not ratifiable · 2 no DB creds.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

export const RATIFY_CITE = {
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

  const row = buildCensusRow(flagId, decision.fields);

  const { data: existing, error: existErr } = await deps.findExisting(row.source_id, row.document_url);
  if (existErr) return { status: "exists_error", error: existErr.message };
  if (existing) return { status: "skipped_exists", existingId: existing.id, row };

  if (!execute) return { status: "dry_run", row };

  const ins = await deps.insertRow(row);
  return { status: "ratified", row, insertedId: ins.inserted.id, snapshot: ins.snapshot };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN) await main();

async function main() {
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

const args = process.argv.slice(2);
const flagIdRaw = args[args.indexOf("--flag") + 1];
const flagId = args.includes("--flag") && flagIdRaw && !flagIdRaw.startsWith("--") ? flagIdRaw : null;
const EXECUTE = args.includes("--execute");

if (!flagId) {
  console.error("ratify-flag-to-census: --flag <integrity_flags-id> is required.");
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ratify-flag-to-census: no DB creds — cannot run here (exit 2).");
  process.exit(2);
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
