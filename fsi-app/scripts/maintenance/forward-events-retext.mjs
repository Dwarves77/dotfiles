#!/usr/bin/env node
// forward-events-retext.mjs — MAINT dispatch step, Lane FWD-TEXT (2026-09-04).
//
// THE DEFECT [CONFIRMED, live customer surface https://carosledge.com/regulations "Upcoming obligations"
// strip, 2026-09-04 ~08:15 UTC, page text captured by the coordinator]: of 8 events shown, several
// item_forward_events rows rendered garbled obligation_text — starting mid-word ("re|venues generated
// from fines. By 25 September 2026..."), carrying a leaked source-URL tail plus a markdown bold label
// ("7/oj/eng **Primary headline compliance deadline — FACT:** \"It shall apply from 29 November 2026...\""),
// or a markdown table pipe/cell plus a label ("hicles (M₂, M₃, N₂, N₃) | MONITORING **FACT — deadline:**
// \"By 29 November 2026...\""). Root cause [CONFIRMED, read `src/lib/forward-events/extract-forward-
// events.mjs` lines 262-271 pre-fix]: `clauseAround`'s leading edge was a fixed byte offset
// (`start - maxBefore`), never snapped to a sentence/clause boundary, so a section-derived window could
// start mid-word or mid-markdown-artifact. Fixed in that module this same lane (EXTRACTOR_VERSION
// 'fe1-2026-09-04.1') — see that file's own header for the full fix and the within-extraction dedupe that
// went with it (Euro 7 carried the SAME date 2026-11-29 six times, at least two pairs the identical
// sentence once via a claim, clean, and once via a section's rendered markdown, garbled).
//
// WHAT THIS STEP DOES. The extractor fix is forward-looking only — it changes what a FUTURE extraction
// produces, never rewrites what is already stored (migration 274/275's own idempotency guarantee is about
// not DUPLICATING rows on a re-run, not about correcting existing text). This step is the one-time (and
// re-runnable) catch-up: for every intelligence_item that already carries item_forward_events rows, it
// re-reads that item's CURRENT grounded claims/sections (the exact same shape
// `src/lib/forward-events/read-and-extract.mjs` builds) and re-runs the SAME pure, unmodified
// `extractForwardEvents` every writer already calls. Three findings, all read-only in dry mode:
//   (1) RETEXT TARGETS — an existing row whose (source_claim_id ?? source_section_id, event_date,
//       event_kind) key matches a freshly-extracted event, but whose obligation_text differs. The fresh
//       text becomes the new obligation_text; `source_span`, `event_date`, `event_kind`, `confidence`,
//       `source_kind`, and every FK column are UNTOUCHED (never re-derived here) — this step corrects
//       display text only, never re-grounds anything.
//   (2) DUPLICATE GROUPS — an existing row that the FRESH extraction's own within-extraction dedupe
//       (`dedupeEvents`, same module) would now drop as a content-duplicate of another existing row it
//       keeps. `item_forward_events` (migration 274/275, read in full) has NO `is_archived` / `superseded`
//       / status column of any kind — 13 columns total, none of them a lifecycle flag — so there is
//       nowhere to mark a row superseded and NO SANCTIONED WAY for this script to make it stop rendering.
//       THIS FINDING NEVER DELETES A ROW. It reports every such group (dropped id, kept id, event_date,
//       event_kind, both obligation_texts, the dedupe reason) so the coordinator can put an explicit
//       deletion decision to the operator — the schema gap, not a policy choice made here.
//   (3) COLLISIONS [added lane RETEXT-COLLIDE, 2026-09-04, after Maintenance #35 (run 33864089323, APPLY)
//       died 6s in: "db.mjs update failed: duplicate key value violates unique constraint
//       uq_item_forward_events_dedupe"]. Unlike (2), this is not about the extractor's own within-run
//       dedupe — it is the live `uq_item_forward_events_dedupe` index itself (migration 275) rejecting a
//       per-row rewrite because TWO EXISTING rows that already share `(intelligence_item_id, event_date,
//       event_kind, coalesce(source_claim_id, source_section_id))` — the exact reason two rows with a
//       shared source object can legitimately coexist pre-fix is that their `obligation_text` differs —
//       converge to the IDENTICAL text once both are retexted (a section sentence whose one date appears
//       twice produced two garbled rows from the one section; honest text is the same sentence for both).
//       For EVERY row of the table (target or not — a target's post-rewrite text, or an untouched row's
//       current text), this step computes the row's post-rewrite key exactly as Postgres computes the live
//       index: `(intelligence_item_id, event_date, event_kind, md5(after_text),
//       coalesce(source_claim_id, source_section_id))`. A group of >1 row under that key would violate the
//       live unique index once retexted, so it cannot all survive: one SURVIVOR is kept (deterministically
//       — a row already carrying the normalized text is preferred; otherwise earliest `created_at`, then
//       lowest `id`), the rest are `collide_delete`. `item_forward_events` is DERIVED (regenerable from
//       claims/sections by the extractor — never a primary record of anything), so unlike finding (2) this
//       one IS a deletion this step performs, but only ever a guarded, snapshotted, reversible one
//       (`db.mjs`'s `guardedDelete` — `item_forward_events` is not in `DELETE_PROTECTED_TABLES`, confirmed
//       by reading that module) — every deleted row's full prior state is captured before it is removed,
//       and `--arg restore:<id,...>` (below) can reinsert it verbatim, same id. Deletes are applied BEFORE
//       any rewrite in the same run, so no rewrite ever attempts to create the very key its own collision
//       resolution just cleared a spot for. The rewrite loop is tolerant of a target row that has already
//       been removed (by this run's own collision delete, or by a prior half-applied run) or already
//       carries its planned text — both count as `no_op`, never a failure.
//
//       UPDATED (lane FE-DEDUP, 2026-09-04): migration 307 (this same lane) replaces
//       `uq_item_forward_events_dedupe` (migration 275) with `uq_item_forward_events_text_identity` —
//       `(intelligence_item_id, event_kind, event_date, md5(obligation_text))`, DROPPING the
//       `coalesce(source_claim_id, source_section_id)` term (see that migration's own header for why: it
//       was the exact loophole letting a claim-backed and a section-backed row with byte-identical text
//       coexist undetected — finding (2)'s own new auto-delete closes the pre-existing-duplicate half of
//       that gap; this finding's own `postRewriteKey` below closes the RETEXT-TIME half, so a future
//       retext run cannot itself create a new instance of the same shape by converging two DIFFERENT
//       source objects' text). `postRewriteKey`/`planCollisions` below compute the NEW (narrower) key.
//
// WHY OBLIGATION_TEXT ALONE, NEVER THE OBLIGATIONS REGISTER (migration 290, `scripts/obligations/
// derive-obligations.mjs`) [CONFIRMED, read `supabase/migrations/290_obligations.sql` in full]: the
// `obligations` table has NO `obligation_text` column and NO `source_span` column — its 14 columns are
// `jurisdiction`/`modes`/`binding_position`/`due_date`/`date_precision`/`event_kind`/`status` plus
// provenance (`forward_event_id`, `intelligence_item_id`, `derivation_version`, `derived_at`) — the
// migration's own header states it explicitly: "The event's own obligation_text / source_span / ... stay
// on item_forward_events (this table does not duplicate them) and are reached via forward_event_id — one
// home per fact, not two." A `forward_event_id` FK stays valid (and a register row's own denormalized
// columns are all UNCHANGED by an obligation_text edit) regardless of what this step rewrites, so
// `scripts/obligations/derive-obligations.mjs` needs no companion re-derivation here.
//
// GUARDED WRITE, PER ROW [CONFIRMED, read `scripts/lib/db.mjs`'s `guardedUpdate`/`guardedDelete`]: unlike
// `canonical-key-dedup.mjs`/`record-hollow-sweep.mjs` (one SHARED patch applied to every target via
// `guardedUpdateByIds`), every retext target here carries a DIFFERENT `obligation_text`, so each row is
// written with its own single-row `guardedUpdate` call (same shape those two steps already use for their
// own per-row "keeper" patch) — snapshotted, cited, read back, individually reversible. Collision deletes
// (finding 3 above) go through `guardedDelete`, chunked, in the same apply pass, before any rewrite.
//
// REVERSIBILITY: `summary.json`'s `per_item[].restore_sql` — one self-contained
// `UPDATE item_forward_events SET obligation_text = '...' WHERE id = '...'` per rewritten row, built from
// THIS run's own "before" value (the same durable, artifact-based pattern `canonical-key-dedup.mjs` and
// `record-hollow-sweep.mjs` use) — plus `--arg restore:<id,id,...>`, best-effort, same-disk-only, replaying
// this run's own db.mjs snapshot: for a rewritten row this replays the prior `obligation_text` via
// `guardedUpdate`; for a `collide_delete`d row, `guardedDelete`'s own snapshot always captures the FULL
// prior row (`select("*")`, unlike the text-only `guardedUpdate` snapshot), so restore reinserts it
// verbatim — same id, same every column — via `guardedInsert`. Both snapshot shapes carry this step's own
// cite, so one `--arg restore:<id,...>` call finds and replays whichever happened to a given id.
//
// $0, deterministic, no LLM: `extractForwardEvents` is pure (see that module's own header); this step adds
// only reads (`readAll`) and, in apply mode, guarded per-row UPDATEs/DELETEs — no LLM call anywhere in the
// path.
//
// DUPLICATE_GROUPS NOW AUTO-DELETES (lane FE-DEDUP, 2026-09-04). THE DEFECT [CONFIRMED by the coordinator,
// Supabase MCP 2026-09-04 23:22 UTC]: `public.obligations` had 1,149 rows but only 562 distinct
// (intelligence_item_id, event_kind, due_date) — 359 duplicate item_forward_events groups, each a
// claim-backed row and a section-backed row from the SAME extraction run, same obligation_text, that
// SHOULD have been collapsed to one row by this module's own imported `extractForwardEvents`/
// `dedupeEvents`/`sameObligationContent` but were not. Root cause [CONFIRMED, read
// `src/lib/forward-events/extract-forward-events.mjs` in full]: `sameObligationContent`'s
// `DEDUPE_MIN_COMPARE_LEN` (40-char) floor was applied even to an EXACT full-string match, so two
// byte-identical `obligation_text` values under 40 characters (e.g. the coordinator's own cited pair, item
// `02470d94-…`, events `a4ad1ce7-…`/`ca126684-…`, both "…entered into force on 14 April 1967…", 37 chars)
// were never recognized as the same event. Fixed in that module this same lane (EXTRACTOR_VERSION bumped
// to 'fe1-2026-09-04.6' — see that file's own "SHORT-TEXT EXACT-DUPLICATE FIX" header for the full defect,
// measurement, and fix; unit tests there use this exact live pair as a fixture).
//
// The fix is forward-looking only, same as every prior lane's fix to this same extractor (see this file's
// own opening header) — it does not rewrite what is already stored. THIS finding — duplicateGroups, which
// this step already computes on every run by re-running the fixed extractor over each item's current
// claims/sections — was previously REPORT ONLY (this file's own prior note, preserved in this lane's diff
// history, read "duplicate_groups is a REPORT ONLY -- item_forward_events has no is_archived/superseded
// column... a deletion, if wanted, is an operator decision the coordinator puts forward separately"). That
// operator decision is exactly what THIS lane's dispatch is: "for each twin group, delete the
// section-backed event ... through the existing guarded writer". So duplicateGroups now applies its own
// deletion, mirroring the collisions finding's existing auto-apply shape exactly (chunked guardedDelete,
// snapshotted, reversible via --arg restore:<id,...>, applied before any rewrite in the same run) —
// `would_drop_id` (already the section-backed loser per `dedupeEvents`'s claim-preferred rule; see that
// function's own doc) is deleted, `would_keep_id` (the claim-backed survivor) is left untouched.
// `item_forward_events` is DERIVED (regenerable from claims/sections by the extractor, never a primary
// record — same rationale the collisions finding's own note states), so this is not a new writer: it is
// the SAME `deleteForwardEvents` guarded-delete path this step already uses for collisions, cited
// separately (`DUPLICATE_CITE` below) so the audit trail names the actual reason. `obligations.
// forward_event_id` carries `ON DELETE CASCADE` (migration 290, read in full) — deleting the duplicate
// forward-event row automatically removes its `obligations` row too; no second writer, no re-derivation
// call needed here.
//
// ORDERING WITH COLLISIONS: a row this run deletes as a duplicate-group loser is excluded from collision
// planning up front (once it's gone it cannot converge with anything), and duplicate deletes are applied
// BEFORE collision deletes, which are applied BEFORE any retext rewrite — same "delete first, from the
// safest/most-independent finding down, then write" ordering the collisions finding already established.
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { extractForwardEvents } from "../../src/lib/forward-events/extract-forward-events.mjs";
import {
  CLAIM_KIND_FILTER,
  mapClaimRow,
  mapSectionRow,
  attachDueDateContext,
  claimNeedsDueDateContext,
} from "../../src/lib/forward-events/read-and-extract.mjs";

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04): re-runs the fixed, unmodified " +
    "extractForwardEvents (EXTRACTOR_VERSION fe1-2026-09-04.1) over each item's current claims/sections and " +
    "rewrites obligation_text on any existing item_forward_events row whose freshly-computed text differs " +
    "(clause-boundary + markdown-defect fix). This write path (guardedUpdate) never touches " +
    "event_date/event_kind/source_span/confidence/any FK column and never deletes a row -- the SEPARATE " +
    "collision-resolution delete this step can perform (lane RETEXT-COLLIDE) is cited independently, see " +
    "DELETE_CITE below.",
});

export const RESTORE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason: "MAINT forward-events-retext --arg restore: reversal — replays this step's own db.mjs prior-state snapshot for a row id it rewrote or collide_delete'd, verbatim.",
});

export const DELETE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04), collision resolution (lane " +
    "RETEXT-COLLIDE): deletes an item_forward_events row that the live unique index on " +
    "(intelligence_item_id, event_kind, event_date, md5(obligation_text)) -- uq_item_forward_events_dedupe " +
    "pre migration 307, uq_item_forward_events_text_identity from migration 307 (lane FE-DEDUP, " +
    "2026-09-04) onward -- would reject once obligation_text is corrected: two existing rows converge to " +
    "the identical post-rewrite text. The row is DERIVED (regenerable from claims/sections by the " +
    "extractor, never a primary record), and the delete is snapshotted (db.mjs guardedDelete captures the " +
    "full prior row before removing it), so it is reversible via --arg restore:<id,...> (this same script).",
});

export const DUPLICATE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT forward-events-retext dispatch (Lane FE-DEDUP, 2026-09-04): deletes the section-backed loser of " +
    "a claim/section duplicate pair that the fixed, unmodified extractForwardEvents's own within-extraction " +
    "dedupe (dedupeEvents/sameObligationContent, EXTRACTOR_VERSION fe1-2026-09-04.6) now correctly collapses " +
    "to one event -- this step's own duplicate_groups finding, previously report-only (see extract-forward-" +
    "events.mjs's own 'SHORT-TEXT EXACT-DUPLICATE FIX' header for the defect this closes). The row is " +
    "DERIVED (regenerable from claims/sections by the extractor, never a primary record), and the delete is " +
    "snapshotted (db.mjs guardedDelete captures the full prior row before removing it), so it is reversible " +
    "via --arg restore:<id,...> (this same script). obligations.forward_event_id has ON DELETE CASCADE " +
    "(migration 290), so the corresponding obligations row is removed automatically -- no second writer.",
});

export const RESTORE_ARG_PREFIX = "restore:";
export const IDS_ARG_PREFIX = "ids:";

// POOL READ IS PER-ITEM CONDITIONAL (lane FE-SLOT-2b, 2026-09-04 — see read-and-extract.mjs's own header,
// "FETCH ONLY WHAT MIGHT BE CONSUMED"). FE-SLOT-2 (this file's own diff above) called `readPoolForItem`
// for EVERY item this step touches, unconditionally — `agent_run_searches.result_content` is the item's
// full grounding source pool per ADR-016, never truncated, so that was tens of KB per capture times
// several captures on every single item, even the ones with no due_date claim at all. `main` below now
// checks `claimNeedsDueDateContext` (imported above) over the item's own mapped claims first and calls
// `deps.readPoolForItem` only when at least one of them would actually consult that context.

// ── pure: read-back-and-extract shape — lane FE-SLOT-2, 2026-09-04, imports
//    src/lib/forward-events/read-and-extract.mjs's own row-mapping functions (that module's "THE ONE
//    READER" header note) rather than re-typing them a second time; this step's own `deps` injection still
//    isolates the DB calls (that module is non-pure, it takes a live `sb` client this step's own
//    `readAll`-based deps do not have — see buildDeps below), so only the ROW MAPPING is shared, never the
//    query mechanism. `mapClaimRows`/`mapSectionRows` are re-exported here (thin wrappers over the shared
//    per-row functions) so this file's own callers below and its own test suite keep the same names. ──

/** Map raw section_claim_provenance rows into extractForwardEvents' claim shape. Pure. */
export function mapClaimRows(rows) {
  return (rows ?? []).map(mapClaimRow);
}

/** Map raw intelligence_item_sections rows into extractForwardEvents' section shape. Pure. */
export function mapSectionRows(rows) {
  return (rows ?? []).map(mapSectionRow);
}

// ── pure: matching key (mirrors apply-staged-update.ts's own forwardEventDedupeKey's non-text half —
//    the source-object identity, which is stable across a retext of the TEXT alone) ───────────────────────

/** The (source object, date, kind) identity a fresh event and an existing row are compared under. Rows
 *  with neither a claim nor a section id (should never happen — migration 274's own CHECK constraint
 *  forbids it) sort into a key no fresh event can ever match, so they are silently left alone rather than
 *  crashing. Pure. */
export function forwardEventIdentityKey(row) {
  const sourceObjectId = row.source_claim_id ?? row.source_section_id ?? "(none)";
  return `${sourceObjectId}|${row.event_date}|${row.event_kind}`;
}

// ── pure: collision resolution (lane RETEXT-COLLIDE, 2026-09-04) ──────────────────────────────────────

/** md5 of the UTF-8 bytes of `text`, lowercase hex — exactly what Postgres' `md5(text)` computes, so a
 *  key built with this function matches the live expression index (uq_item_forward_events_dedupe pre
 *  migration 307; uq_item_forward_events_text_identity from migration 307 onward -- lane FE-DEDUP,
 *  2026-09-04) byte-for-byte. Pure, deterministic, no LLM. */
export function pgMd5(text) {
  return createHash("md5").update(String(text ?? ""), "utf8").digest("hex");
}

/** The row's key AFTER whatever rewrite this run plans (or, for a row with no planned rewrite, its
 *  CURRENT key) — the shape of the live unique index: `(intelligence_item_id, event_kind, event_date,
 *  md5(obligation_text))`, matching migration 307's `uq_item_forward_events_text_identity` (lane FE-DEDUP,
 *  2026-09-04 -- superseding migration 275's `uq_item_forward_events_dedupe`, which additionally
 *  discriminated on `coalesce(source_claim_id, source_section_id)`; see that migration's own header for
 *  why the term was dropped: it was the exact loophole letting a claim-backed and a section-backed row
 *  with byte-identical text coexist undetected). `row.after_text` is the caller's job to set (the fresh
 *  `after` for a retext target, the current `obligation_text` for every other row) — this function only
 *  builds the key, it never decides what the text should be. Pure. */
export function postRewriteKey(row) {
  return `${row.intelligence_item_id}|${row.event_kind}|${row.event_date}|${pgMd5(row.after_text)}`;
}

/** Deterministic survivor choice within one collision group: a row already carrying its own after-text
 *  (nothing to rewrite for it) is preferred over one that still needs a rewrite; among ties, earliest
 *  `created_at` wins; among ties on that, lowest `id` wins. Pure, total order (never throws on equal
 *  inputs — falls through to 0). */
export function compareForSurvivor(a, b) {
  const aNormalized = a.obligation_text === a.after_text ? 0 : 1;
  const bNormalized = b.obligation_text === b.after_text ? 0 : 1;
  if (aNormalized !== bNormalized) return aNormalized - bNormalized;
  const aCreated = a.created_at ?? "";
  const bCreated = b.created_at ?? "";
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * Groups EVERY row passed in (not only retext targets) by its post-rewrite key and, for every group of
 * more than one row, deterministically picks one survivor and marks the rest `collide_delete` — the set
 * the live unique index (see `postRewriteKey`'s own doc for its exact shape, and the migration history
 * behind it) would otherwise reject once the rewrite in this same run lands. Pure — takes rows already
 * annotated with `after_text` (see `postRewriteKey`'s own doc) and `created_at`; does no I/O and makes no
 * DB call.
 * @param {Array<{id:string, intelligence_item_id:string, event_date:string, event_kind:string,
 *   obligation_text:string, after_text:string, source_claim_id:?string, source_section_id:?string,
 *   created_at?:string}>} rows
 * @returns {{groups: Array<object>, survivorIds: string[], deletions: Array<object>}}
 */
export function planCollisions(rows) {
  const byKey = new Map();
  for (const row of rows ?? []) {
    const key = postRewriteKey(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }

  const groups = [];
  const deletions = [];
  const survivorIds = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(compareForSurvivor);
    const survivor = sorted[0];
    const rest = sorted.slice(1);
    survivorIds.push(survivor.id);
    for (const row of rest) {
      deletions.push({
        id: row.id,
        intelligence_item_id: row.intelligence_item_id,
        event_date: row.event_date,
        event_kind: row.event_kind,
        source_kind: row.source_kind,
        source_claim_id: row.source_claim_id ?? null,
        source_section_id: row.source_section_id ?? null,
        created_at: row.created_at ?? null,
        obligation_text: row.obligation_text,
        after_text: row.after_text,
        collides_with_survivor_id: survivor.id,
        collision_key: key,
      });
    }
    groups.push({
      key,
      intelligence_item_id: survivor.intelligence_item_id,
      event_date: survivor.event_date,
      event_kind: survivor.event_kind,
      after_text: survivor.after_text,
      survivor_id: survivor.id,
      deleted_ids: rest.map((r) => r.id),
    });
  }
  return { groups, survivorIds, deletions };
}

// ── pure: defect classification (reporting only — never a decision input) ──────────────────────────────

/** Which observable defect class(es) the OLD obligation_text carries, for the dry-run's counts-by-class.
 *  Purely descriptive: the retext decision itself is "the freshly extracted text differs", not this list.
 *  Pure. */
export function classifyDefects(text) {
  const t = typeof text === "string" ? text : "";
  const classes = [];
  if (/^[a-z]/.test(t)) classes.push("starts_lowercase");
  else if (t.length > 0 && /^[^A-Za-z]/.test(t)) classes.push("starts_nonletter");
  if (t.includes("**")) classes.push("bold_marker");
  if (/\s\|\s|^\S*\|/.test(t)) classes.push("pipe_cell");
  if (/^\S*\/\S*\s/.test(t) || /\/oj\//.test(t)) classes.push("url_tail");
  if (classes.length === 0) classes.push("other_or_dedupe_only");
  return classes;
}

/** Which residue class(es) the FRESHLY-recomputed obligation_text still carries, if any (lane FWD-TEXT-2,
 *  2026-09-04) -- "the retext step's dry report gains the residue classification of the AFTER text so the
 *  next dry run proves itself". Uses the SAME character-class rules extract-forward-events.mjs's own
 *  corpus-wide property test enforces (a letter/quote/digit/"("/"…" leading char is fine; the
 *  honest-fragment "…" marker is fine, never a defect) -- deliberately a SEPARATE function from
 *  `classifyDefects` above, which targets OLD pre-fix garbled text and flags a bare digit/URL-tail start
 *  as a defect ON PURPOSE (that is exactly what makes a `before` row a retext target); the same rule
 *  cannot honestly describe fresh, already-normalized text. Pure. */
// A record-facts.mjs template wrapper token leaking into DISPLAY text (lane FWD-TEXT-3, 2026-09-04 --
// extract-forward-events.mjs's own "RECORD-FACTS TEMPLATE UNWRAP" header note has the full defect and fix;
// `unwrapRecordFactsTemplate` there is what makes this class go to zero on a healthy run). Checked here,
// independently of that module's own internals, so a FUTURE regression in the unwrap logic still shows up
// in this dry report even if nobody re-reads that file's own tests -- the same "prove the fix against
// itself on every future run" role `honest_fragment_marked`/etc. already play for the FWD-TEXT-2 defect
// classes above. Six literal signals, matching the property test extract-forward-events.test.mjs runs over
// this same corpus: the "[slot_key] " marker itself, the two FACT-quote lead-ins ("The captured source
// states"/"verbatim:"), the due_date precision label, binding_position's "from the passage" lead-in, and
// the GAP tail sentence.
const RECORD_FACTS_WRAPPER_RE = /\[[a-z][a-z0-9_]*\]\s|captured source|verbatim:|date_precision|from the passage|full-brief regrounding/i;

export function classifyAfterResidue(text) {
  const t = typeof text === "string" ? text : "";
  if (!t) return ["empty"];
  const classes = [];
  if (t.startsWith("…") || t.endsWith("…")) classes.push("honest_fragment_marked");
  if (!/^[A-Za-z0-9"'“‘«(…]/.test(t)) classes.push("bad_leading_char");
  if (t.includes("*")) classes.push("contains_star");
  if (/\s\|\s|^\S*\|/.test(t)) classes.push("contains_pipe_cell");
  if (/https?:\/\//i.test(t)) classes.push("contains_bare_url");
  if (!/[.!?"”»…]$/.test(t)) classes.push("bad_trailing_punctuation");
  if (RECORD_FACTS_WRAPPER_RE.test(t)) classes.push("contains_record_facts_wrapper");
  if (classes.length === 0) classes.push("clean");
  return classes;
}

// ── pure: per-item plan ─────────────────────────────────────────────────────────────────────────────────

/**
 * Plans one item's retext + duplicate-group findings. Pure — takes the item's already-read existing
 * item_forward_events rows and its already-mapped claims/sections, runs the unmodified extractor, and
 * diffs.
 * @param {{itemId: string, existingRows: Array<object>, claims: Array<object>, sections: Array<object>}} input
 * @returns {{retextTargets: Array<object>, duplicateGroups: Array<object>}}
 */
export function planItemRetext({ itemId, existingRows, claims, sections }) {
  const rows = existingRows ?? [];
  const { events: freshEvents, counts } = extractForwardEvents({ claims, sections });

  const existingByKey = new Map();
  for (const row of rows) existingByKey.set(forwardEventIdentityKey(row), row);

  // Retexting is judged against EVERY freshly-recomputed candidate, including ones the within-run dedupe
  // then drops as a duplicate -- a row can simultaneously be "its own text is stale" (retext target) and
  // "a newer duplicate of another row" (duplicate group); the second finding never suppresses the first,
  // since a dropped row still needs its stored obligation_text corrected as long as it stays live in the DB
  // (the drop is a report, not a delete -- see the note on duplicate_groups below).
  const freshByKey = new Map();
  for (const ev of freshEvents) freshByKey.set(forwardEventIdentityKey(ev), ev);
  for (const dropped of counts.dedupe_dropped_detail ?? []) {
    const droppedKey = forwardEventIdentityKey({
      source_claim_id: dropped.source_claim_id,
      source_section_id: dropped.source_section_id,
      event_date: dropped.event_date,
      event_kind: dropped.event_kind,
    });
    if (!freshByKey.has(droppedKey)) {
      freshByKey.set(droppedKey, { obligation_text: dropped.obligation_text });
    }
  }

  const retextTargets = [];
  for (const row of rows) {
    const key = forwardEventIdentityKey(row);
    const fresh = freshByKey.get(key);
    if (!fresh) continue; // no matching fresh event -- covered by flywheel-defect:stale-events elsewhere, not this step
    if (fresh.obligation_text === row.obligation_text) continue;
    retextTargets.push({
      id: row.id,
      intelligence_item_id: itemId,
      event_date: row.event_date,
      event_kind: row.event_kind,
      source_kind: row.source_kind,
      before: row.obligation_text,
      after: fresh.obligation_text,
      defect_classes: classifyDefects(row.obligation_text),
      // The dry report proving itself (lane FWD-TEXT-2): the SAME residue check run over the freshly
      // recomputed text, so the next dry run over the same items shows this row's own fix held.
      after_defect_classes: classifyAfterResidue(fresh.obligation_text),
    });
  }

  const duplicateGroups = [];
  for (const dropped of counts.dedupe_dropped_detail ?? []) {
    const droppedKey = forwardEventIdentityKey({
      source_claim_id: dropped.source_claim_id,
      source_section_id: dropped.source_section_id,
      event_date: dropped.event_date,
      event_kind: dropped.event_kind,
    });
    const keptKey = forwardEventIdentityKey({
      source_claim_id: dropped.kept_source_claim_id,
      source_section_id: dropped.kept_source_section_id,
      event_date: dropped.event_date,
      event_kind: dropped.event_kind,
    });
    const droppedRow = existingByKey.get(droppedKey);
    const keptRow = existingByKey.get(keptKey);
    // Only report a group where BOTH sides are rows that actually exist in the DB today -- never
    // fabricate a group from a fresh-extraction artifact that has no corresponding live row.
    if (!droppedRow || !keptRow) continue;
    duplicateGroups.push({
      intelligence_item_id: itemId,
      event_date: dropped.event_date,
      event_kind: dropped.event_kind,
      would_drop_id: droppedRow.id,
      would_drop_source_kind: droppedRow.source_kind,
      would_drop_obligation_text: droppedRow.obligation_text,
      would_keep_id: keptRow.id,
      would_keep_source_kind: keptRow.source_kind,
      would_keep_obligation_text: keptRow.obligation_text,
      reason: dropped.reason,
    });
  }

  return { retextTargets, duplicateGroups };
}

function sqlLiteral(v) {
  return v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
}

/** A self-contained SQL restore statement for one rewritten row. Pure. */
export function buildRestoreSql(before) {
  return `UPDATE item_forward_events SET obligation_text = ${sqlLiteral(before.obligation_text)} WHERE id = '${before.id}';`;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{
 *   readItemIdsWithForwardEvents: () => Promise<string[]>,
 *   readForwardEventsForItem: (itemId: string) => Promise<object[]>,
 *   readClaimsForItem: (itemId: string) => Promise<object[]>,
 *   readSectionsForItem: (itemId: string) => Promise<object[]>,
 *   readPoolForItem: (itemId: string) => Promise<object[]>,
 *   updateObligationText: (id: string, text: string) => Promise<{updated: number, rows: object[]}>,
 *   deleteForwardEvents: (ids: string[]) => Promise<{deleted: number, snapshot: string, rows: object[]}>,
 *   readRowsByIds: (ids: string[]) => Promise<object[]>,
 *   readSnapshotEntries: () => Promise<object[]>,
 *   restoreOne: (id: string, text: string) => Promise<{updated: number}>,
 *   restoreDeletedRow: (row: object) => Promise<{inserted: object, snapshot: string}>,
 * }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "forward-events-retext", mode, counts: {}, applied: 0, read_back: {}, exitCode: 0 };

  if (arg && arg.startsWith(RESTORE_ARG_PREFIX)) {
    return runRestore({ apply, arg }, deps, summary);
  }

  let itemIds = await deps.readItemIdsWithForwardEvents();
  if (arg && arg.startsWith(IDS_ARG_PREFIX)) {
    const scoped = new Set(
      arg.slice(IDS_ARG_PREFIX.length).split(",").map((s) => s.trim()).filter(Boolean)
    );
    itemIds = itemIds.filter((id) => scoped.has(id));
  }

  const allRetextTargets = [];
  const allDuplicateGroups = [];
  const allRows = []; // EVERY existing row (target or not), for collision planning -- see planCollisions' own doc
  for (const itemId of itemIds) {
    const [existingRows, claimRows, sectionRows] = await Promise.all([
      deps.readForwardEventsForItem(itemId),
      deps.readClaimsForItem(itemId),
      deps.readSectionsForItem(itemId),
    ]);
    // lane FE-SLOT-2, 2026-09-04: due_date slot claims gain `context` via read-and-extract.mjs's own
    // shared `attachDueDateContext` (this file's header note above) before this REWRITE step re-runs the
    // extractor -- otherwise a retext pass over a fixed extractor would still see the pre-fix, context-less
    // shape and never actually pick up FE-SLOT-2's own rescue.
    // lane FE-SLOT-2b, 2026-09-04 (this file's own header note, "POOL READ IS PER-ITEM CONDITIONAL"):
    // deps.readPoolForItem is called ONLY when at least one of this item's claims would actually consult
    // that context -- never unconditionally.
    const mappedClaims = mapClaimRows(claimRows);
    const poolRows = mappedClaims.some(claimNeedsDueDateContext) ? await deps.readPoolForItem(itemId) : [];
    const { retextTargets, duplicateGroups } = planItemRetext({
      itemId,
      existingRows,
      claims: attachDueDateContext(mappedClaims, poolRows),
      sections: mapSectionRows(sectionRows),
    });
    allRetextTargets.push(...retextTargets);
    allDuplicateGroups.push(...duplicateGroups);
    for (const row of existingRows) allRows.push({ ...row, intelligence_item_id: itemId });
  }

  const byDefectClass = {};
  const byAfterDefectClass = {};
  for (const t of allRetextTargets) {
    for (const c of t.defect_classes) byDefectClass[c] = (byDefectClass[c] ?? 0) + 1;
    for (const c of t.after_defect_classes) byAfterDefectClass[c] = (byAfterDefectClass[c] ?? 0) + 1;
  }

  // Duplicate-group deletes (lane FE-DEDUP, 2026-09-04 -- see this file's own header): the section-backed
  // loser of every duplicate pair this run's fixed extractor now correctly identifies. Deduplicated via
  // Set (two groups could in principle name the same would_drop_id; each id is deleted at most once).
  const duplicateDeleteIds = new Set(allDuplicateGroups.map((g) => g.would_drop_id));

  // Collision plan: EVERY row's post-rewrite key, target or not -- a target's after_text is the fresh
  // extracted text this run WOULD write; every other row's after_text is simply its current obligation_text
  // (this run leaves it alone unless collision resolution below deletes it). See planCollisions' own doc.
  // Rows this run is ALSO deleting as a duplicate-group loser are excluded up front -- once gone, a row
  // cannot converge with anything.
  const afterTextById = new Map(allRetextTargets.map((t) => [t.id, t.after]));
  const collisionRows = allRows
    .filter((row) => !duplicateDeleteIds.has(row.id))
    .map((row) => ({
      ...row,
      after_text: afterTextById.has(row.id) ? afterTextById.get(row.id) : row.obligation_text,
    }));
  const collisionPlan = planCollisions(collisionRows);
  const deletedIdSet = new Set([...duplicateDeleteIds, ...collisionPlan.deletions.map((d) => d.id)]);

  summary.counts = {
    items_scanned: itemIds.length,
    retext_target_total: allRetextTargets.length,
    by_defect_class: byDefectClass,
    // The dry report proving itself (lane FWD-TEXT-2, 2026-09-04): residue classification of the SAME
    // rows' freshly-recomputed text. "clean" and "honest_fragment_marked" are the two expected buckets on
    // a healthy run; any other key here means the fix still leaves a defect class live and needs a look.
    by_after_defect_class: byAfterDefectClass,
    duplicate_group_total: allDuplicateGroups.length,
    duplicate_delete_total: duplicateDeleteIds.size,
    collision_group_total: collisionPlan.groups.length,
    collision_delete_total: collisionPlan.deletions.length,
  };
  summary.retext_targets = allRetextTargets;
  summary.duplicate_groups = allDuplicateGroups;
  summary.collisions = {
    groups: collisionPlan.groups,
    survivors: collisionPlan.survivorIds,
    deletions: collisionPlan.deletions,
    note:
      "Rows here are the ones the live unique index on (intelligence_item_id, event_kind, event_date, " +
      "md5(obligation_text)) -- uq_item_forward_events_text_identity from migration 307 (lane FE-DEDUP, " +
      "2026-09-04) onward, uq_item_forward_events_dedupe (migration 275, additionally keyed on " +
      "coalesce(source_claim_id, source_section_id)) before it -- would reject once their post-rewrite " +
      "text is honest, computed over EVERY row of the table minus this run's own duplicate-group deletes " +
      "(not only retext targets). One survivor per group is kept (a row already carrying its own " +
      "after-text is preferred; otherwise earliest created_at, then lowest id); the rest are deleted in " +
      "apply mode via db.mjs guardedDelete BEFORE any rewrite runs, chunked, cited, and snapshotted -- " +
      "item_forward_events is derived/regenerable, not a primary record. Restore: --arg restore:<id,...> " +
      "(this same script) reinserts a deleted row verbatim, same id, from its own guardedDelete snapshot.",
  };
  summary.note =
    "duplicate_groups IS applied automatically (lane FE-DEDUP, 2026-09-04 -- see this file's own header) " +
    "-- each group's would_drop_id (the section-backed loser) is deleted via db.mjs guardedDelete " +
    "(DUPLICATE_CITE), same mechanism and same reversibility as collisions below; " +
    "obligations.forward_event_id's ON DELETE CASCADE (migration 290) removes the corresponding " +
    "obligations row automatically, no second writer. collisions IS applied automatically (see " +
    "summary.collisions.note) -- that deletion is not a policy choice, it is the live unique index's own " +
    "requirement once the text is corrected.";

  if (!apply) return summary;

  if (duplicateDeleteIds.size) {
    const ids = [...duplicateDeleteIds];
    const deleted = await applyGuardedDeletes(ids, deps.deleteDuplicateForwardEvents);
    summary.duplicate_deletes = deleted;
    const stillPresent = await deps.readRowsByIds(ids);
    summary.duplicate_deletes.read_back = {
      requested: ids.length,
      deleted_total: ids.length - stillPresent.length,
      still_present_ids: stillPresent.map((r) => r.id),
    };
    if (stillPresent.length) summary.exitCode = 1;
  }

  if (collisionPlan.deletions.length) {
    const deleted = await applyGuardedDeletes(collisionPlan.deletions.map((d) => d.id), deps.deleteForwardEvents);
    summary.collisions.deleted = deleted;
    const stillPresent = await deps.readRowsByIds(collisionPlan.deletions.map((d) => d.id));
    summary.collisions.read_back = {
      requested: collisionPlan.deletions.length,
      deleted_total: collisionPlan.deletions.length - stillPresent.length,
      still_present_ids: stillPresent.map((r) => r.id),
    };
    if (stillPresent.length) summary.exitCode = 1;
  }

  // Every duplicate-delete'd or collide_delete'd row is dropped from the rewrite pass -- it no longer
  // exists, and (for a collision loser) its partner (the survivor) either already carries the same
  // after-text or is itself still a normal target.
  const targetsToApply = allRetextTargets.filter((t) => !deletedIdSet.has(t.id));

  if (!targetsToApply.length) {
    summary.note2 = collisionPlan.deletions.length
      ? "0 retext targets left to rewrite after collision deletes -- nothing more to write."
      : "0 retext targets matched this run -- nothing to rewrite.";
    return summary;
  }

  const perItem = [];
  let applied = 0;
  const noOpIds = [];
  for (const target of targetsToApply) {
    const r = await deps.updateObligationText(target.id, target.after);
    if ((r.updated ?? 0) === 0) {
      // Tolerant, never a failure: the row no longer exists (already collide_delete'd by a run whose
      // collision plan differed slightly, or by a prior half-applied run) OR it already carries target.after
      // (a prior half-applied run's own update already landed). Either way there is nothing left to write.
      noOpIds.push(target.id);
      continue;
    }
    applied += r.updated ?? 0;
    const after = (r.rows ?? [])[0] ?? null;
    perItem.push({
      id: target.id,
      intelligence_item_id: target.intelligence_item_id,
      event_date: target.event_date,
      event_kind: target.event_kind,
      before: { obligation_text: target.before },
      after: { obligation_text: after?.obligation_text ?? target.after },
      restore_sql: buildRestoreSql({ id: target.id, obligation_text: target.before }),
    });
  }
  summary.applied = applied;
  summary.per_item = perItem;
  summary.counts.no_op_total = noOpIds.length;
  summary.no_op_ids = noOpIds;

  // Read back EVERY surviving target (applied or no_op) -- a healthy run has every one of them landed on
  // its planned after text, whichever guarded write (this run's or an earlier half-applied one) put it there.
  const readBackRows = await deps.readRowsByIds(targetsToApply.map((t) => t.id));
  const byId = new Map(readBackRows.map((r) => [r.id, r]));
  const notConfirmed = targetsToApply.filter((t) => byId.get(t.id)?.obligation_text !== t.after);
  summary.read_back = {
    retexted_total: targetsToApply.length - notConfirmed.length,
    not_confirmed_ids: notConfirmed.map((t) => t.id),
  };
  if (notConfirmed.length) summary.exitCode = 1;

  return summary;
}

const DELETE_CHUNK = 200;

/** Chunked guarded-delete apply (lane FE-DEDUP, 2026-09-04 -- generalized from the collision-only
 *  `applyCollisionDeletes`, same shape, now reused for duplicate-group deletes too): calls `deleteFn` per
 *  chunk (never one giant IN(...) list), aggregating counts + per-chunk snapshot paths. `deleteFn` is
 *  whichever guarded-delete dep already carries the right cite for this finding (`deps.deleteForwardEvents`
 *  for collisions, `deps.deleteDuplicateForwardEvents` for duplicate groups). */
async function applyGuardedDeletes(ids, deleteFn) {
  const out = { deleted: 0, snapshots: [], rows: [] };
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const slice = ids.slice(i, i + DELETE_CHUNK);
    const r = await deleteFn(slice);
    out.deleted += r.deleted ?? 0;
    if (r.snapshot) out.snapshots.push(r.snapshot);
    out.rows.push(...(r.rows ?? []));
  }
  return out;
}

// A guardedDelete snapshot (collide_delete reversal) always carries the FULL prior row (guardedDelete's
// own snapshot read is a hardcoded `select("*")` -- see db.mjs) -- it has intelligence_item_id, event_date
// etc. A guardedUpdate snapshot (a plain retext reversal) carries only the columns this step's own
// updateObligationText dep selected (`id, obligation_text`) -- never intelligence_item_id. That single
// field's presence is what tells the two apart with no extra bookkeeping. Pure.
function isFullRowSnapshot(prior) {
  return !!prior && typeof prior === "object" && typeof prior.intelligence_item_id === "string";
}

async function runRestore({ apply, arg }, deps, summary) {
  const ids = arg.slice(RESTORE_ARG_PREFIX.length).split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    summary.note = `restore: no ids given -- usage: --arg ${RESTORE_ARG_PREFIX}<id,id,...>`;
    summary.exitCode = 1;
    return summary;
  }

  const entries = await deps.readSnapshotEntries();
  // Widened (lane FE-DEDUP, 2026-09-04) from the original "...(Lane FWD-TEXT" literal to just this script's
  // own dispatch prefix, so a restore also finds a DUPLICATE_CITE snapshot (lane FE-DEDUP's own cite) --
  // CITE/DELETE_CITE/DUPLICATE_CITE all start with this exact string; the check is a strict widening, every
  // reason that matched before still matches.
  const citeMarker = "MAINT forward-events-retext dispatch";
  const idSet = new Set(ids);
  const latest = new Map();
  for (const e of entries ?? []) {
    if (e?.table !== "item_forward_events") continue;
    if (!e?.prior?.id || !idSet.has(e.prior.id)) continue;
    if (!String(e?._cite?.reason ?? "").includes(citeMarker)) continue;
    latest.set(e.prior.id, e.prior); // files are read/sorted oldest-first (see readSnapshotEntriesFromDisk), so the last write here is the latest
  }
  const found = [...latest.keys()];
  const missing = ids.filter((id) => !latest.has(id));
  summary.counts = { requested: ids.length, found: found.length, missing: missing.length };
  summary.missing_ids = missing;

  if (!apply) {
    summary.plan = found.map((id) => {
      const prior = latest.get(id);
      return isFullRowSnapshot(prior)
        ? { id, action: "reinsert", row: prior }
        : { id, action: "update_text", obligation_text: prior.obligation_text };
    });
    if (missing.length) summary.exitCode = 1;
    return summary;
  }

  let restored = 0;
  const results = [];
  for (const id of found) {
    const prior = latest.get(id);
    if (isFullRowSnapshot(prior)) {
      const r = await deps.restoreDeletedRow(prior);
      const ok = !!r?.inserted;
      if (ok) restored += 1;
      results.push({ id, updated: ok ? 1 : 0, action: "reinsert" });
    } else {
      const r = await deps.restoreOne(id, prior.obligation_text);
      restored += r.updated ?? 0;
      results.push({ id, updated: r.updated ?? 0, action: "update_text" });
    }
  }
  summary.applied = restored;
  summary.read_back = { restored_ids: results.filter((r) => r.updated > 0).map((r) => r.id) };
  if (missing.length || restored < found.length) summary.exitCode = 1;
  return summary;
}

// ── real deps (CLI entrypoint) ───────────────────────────────────────────────────────────────────────

const READ_CHUNK = 150;

function readSnapshotEntriesFromDisk() {
  const dir = join(fsiRoot(), "scripts", "_snapshots");
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith("_item_forward_events.jsonl")).sort();
  } catch {
    return [];
  }
  const entries = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // malformed line -- skip
      }
    }
  }
  return entries;
}

const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "forward-events-retext",
    main,
    needsDb: true,
    buildDeps: async () => {
      const { readAll, guardedUpdate, guardedDelete, guardedInsert } = await import("../lib/db.mjs");

      const readChunked = async (table, columns, column, values) => {
        const out = [];
        for (let i = 0; i < (values?.length ?? 0); i += READ_CHUNK) {
          const c = values.slice(i, i + READ_CHUNK);
          const rows = await readAll(table, columns, { match: (q) => q.in(column, c) });
          out.push(...rows);
        }
        return out;
      };

      return {
        readItemIdsWithForwardEvents: async () => {
          const rows = await readAll("item_forward_events", "intelligence_item_id");
          return [...new Set(rows.map((r) => r.intelligence_item_id))];
        },
        readForwardEventsForItem: (itemId) =>
          readAll(
            "item_forward_events",
            // created_at is required for collision survivor tie-breaking (compareForSurvivor) -- see
            // planCollisions' own doc.
            "id, event_date, event_kind, obligation_text, source_kind, source_claim_id, source_section_id, created_at",
            { match: (q) => q.eq("intelligence_item_id", itemId) },
          ),
        readClaimsForItem: (itemId) =>
          readAll(
            "section_claim_provenance",
            "id, claim_kind, claim_text, source_span",
            { match: (q) => q.eq("intelligence_item_id", itemId).in("claim_kind", CLAIM_KIND_FILTER) },
          ),
        readSectionsForItem: (itemId) =>
          readAll(
            "intelligence_item_sections",
            "id, section_key, content_md",
            { match: (q) => q.eq("item_id", itemId) },
          ),
        // lane FE-SLOT-2, 2026-09-04: due_date slot context source pool (this file's header note above) --
        // the same `agent_run_searches` table read-and-extract.mjs's own live reader consults, batched per
        // item here rather than per single sb call, matching this step's other per-item reads.
        readPoolForItem: (itemId) =>
          readAll(
            "agent_run_searches",
            "id, result_content, result_index",
            { match: (q) => q.eq("intelligence_item_id", itemId) },
          ),
        updateObligationText: (id, text) =>
          guardedUpdate("item_forward_events", (q) => q.eq("id", id), { obligation_text: text }, {
            cite: CITE,
            select: "id, obligation_text",
          }),
        deleteForwardEvents: (ids) => guardedDelete("item_forward_events", ids, { cite: DELETE_CITE }),
        // lane FE-DEDUP, 2026-09-04: duplicate-group deletes go through the SAME guardedDelete path as
        // collisions, cited separately (DUPLICATE_CITE) so the audit trail names the actual reason.
        deleteDuplicateForwardEvents: (ids) => guardedDelete("item_forward_events", ids, { cite: DUPLICATE_CITE }),
        readRowsByIds: (ids) => readChunked("item_forward_events", "id, obligation_text", "id", ids),
        readSnapshotEntries: async () => readSnapshotEntriesFromDisk(),
        restoreOne: (id, text) =>
          guardedUpdate("item_forward_events", (q) => q.eq("id", id), { obligation_text: text }, {
            cite: RESTORE_CITE,
            select: "id",
          }),
        restoreDeletedRow: (row) => guardedInsert("item_forward_events", row, { cite: RESTORE_CITE, select: "id" }),
      };
    },
  });
}
