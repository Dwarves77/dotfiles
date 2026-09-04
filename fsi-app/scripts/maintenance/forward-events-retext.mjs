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
// `extractForwardEvents` every writer already calls. Two outputs, both read-only in dry mode:
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
//       THIS STEP NEVER DELETES A ROW. It reports every such group (dropped id, kept id, event_date,
//       event_kind, both obligation_texts, the dedupe reason) so the coordinator can put an explicit
//       deletion decision to the operator — the schema gap, not a policy choice made here.
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
// GUARDED WRITE, PER ROW [CONFIRMED, read `scripts/lib/db.mjs`'s `guardedUpdate`]: unlike
// `canonical-key-dedup.mjs`/`record-hollow-sweep.mjs` (one SHARED patch applied to every target via
// `guardedUpdateByIds`), every retext target here carries a DIFFERENT `obligation_text`, so each row is
// written with its own single-row `guardedUpdate` call (same shape those two steps already use for their
// own per-row "keeper" patch) — snapshotted, cited, read back, individually reversible.
//
// REVERSIBILITY: `summary.json`'s `per_item[].restore_sql` — one self-contained
// `UPDATE item_forward_events SET obligation_text = '...' WHERE id = '...'` per rewritten row, built from
// THIS run's own "before" value (the same durable, artifact-based pattern `canonical-key-dedup.mjs` and
// `record-hollow-sweep.mjs` use) — plus `--arg restore:<id,id,...>`, best-effort, same-disk-only, replaying
// this run's own db.mjs snapshot.
//
// $0, deterministic, no LLM: `extractForwardEvents` is pure (see that module's own header); this step adds
// only reads (`readAll`) and, in apply mode, guarded per-row UPDATEs — no LLM call anywhere in the path.
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { extractForwardEvents } from "../../src/lib/forward-events/extract-forward-events.mjs";

export const CITE = Object.freeze({
  skill: "remediation-discipline",
  reason:
    "MAINT forward-events-retext dispatch (Lane FWD-TEXT, 2026-09-04): re-runs the fixed, unmodified " +
    "extractForwardEvents (EXTRACTOR_VERSION fe1-2026-09-04.1) over each item's current claims/sections and " +
    "rewrites obligation_text on any existing item_forward_events row whose freshly-computed text differs " +
    "(clause-boundary + markdown-defect fix). Never touches event_date/event_kind/source_span/confidence/ " +
    "any FK column, never deletes a row (item_forward_events has no archive/superseded column to use).",
});

export const RESTORE_CITE = Object.freeze({
  skill: "remediation-discipline",
  reason: "MAINT forward-events-retext --arg restore: reversal — replays this step's own db.mjs prior-state snapshot for a row id it rewrote, verbatim.",
});

export const RESTORE_ARG_PREFIX = "restore:";
export const IDS_ARG_PREFIX = "ids:";

// ── pure: read-back-and-extract shape (mirrors src/lib/forward-events/read-and-extract.mjs's row mapping,
//    duplicated rather than imported because that module is non-pure (it takes a live `sb` client) and
//    this step's own deps injection already isolates the DB calls — see buildDeps below) ─────────────────

/** Map raw section_claim_provenance rows into extractForwardEvents' claim shape. Pure. */
export function mapClaimRows(rows) {
  return (rows ?? []).map((r) => ({
    claim_id: r.id,
    kind: r.claim_kind,
    text: r.claim_text,
    span: r.source_span ?? null,
  }));
}

/** Map raw intelligence_item_sections rows into extractForwardEvents' section shape. Pure. */
export function mapSectionRows(rows) {
  return (rows ?? []).map((r) => ({
    section_id: r.id,
    key: r.section_key,
    md: r.content_md ?? "",
  }));
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
 *   updateObligationText: (id: string, text: string) => Promise<{updated: number, rows: object[]}>,
 *   readRowsByIds: (ids: string[]) => Promise<object[]>,
 *   readSnapshotEntries: () => Promise<object[]>,
 *   restoreOne: (id: string, text: string) => Promise<{updated: number}>,
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
  for (const itemId of itemIds) {
    const [existingRows, claimRows, sectionRows] = await Promise.all([
      deps.readForwardEventsForItem(itemId),
      deps.readClaimsForItem(itemId),
      deps.readSectionsForItem(itemId),
    ]);
    const { retextTargets, duplicateGroups } = planItemRetext({
      itemId,
      existingRows,
      claims: mapClaimRows(claimRows),
      sections: mapSectionRows(sectionRows),
    });
    allRetextTargets.push(...retextTargets);
    allDuplicateGroups.push(...duplicateGroups);
  }

  const byDefectClass = {};
  const byAfterDefectClass = {};
  for (const t of allRetextTargets) {
    for (const c of t.defect_classes) byDefectClass[c] = (byDefectClass[c] ?? 0) + 1;
    for (const c of t.after_defect_classes) byAfterDefectClass[c] = (byAfterDefectClass[c] ?? 0) + 1;
  }

  summary.counts = {
    items_scanned: itemIds.length,
    retext_target_total: allRetextTargets.length,
    by_defect_class: byDefectClass,
    // The dry report proving itself (lane FWD-TEXT-2, 2026-09-04): residue classification of the SAME
    // rows' freshly-recomputed text. "clean" and "honest_fragment_marked" are the two expected buckets on
    // a healthy run; any other key here means the fix still leaves a defect class live and needs a look.
    by_after_defect_class: byAfterDefectClass,
    duplicate_group_total: allDuplicateGroups.length,
  };
  summary.retext_targets = allRetextTargets;
  summary.duplicate_groups = allDuplicateGroups;
  summary.note =
    "duplicate_groups is a REPORT ONLY -- item_forward_events has no is_archived/superseded column, so " +
    "this step never deletes a row; a deletion, if wanted, is an operator decision the coordinator puts " +
    "forward separately, citing would_drop_id/would_keep_id from this run's own summary.";

  if (!apply) return summary;

  if (!allRetextTargets.length) {
    summary.note2 = "0 retext targets matched this run -- nothing to rewrite.";
    return summary;
  }

  const perItem = [];
  let applied = 0;
  for (const target of allRetextTargets) {
    const r = await deps.updateObligationText(target.id, target.after);
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

  const readBackRows = await deps.readRowsByIds(allRetextTargets.map((t) => t.id));
  const byId = new Map(readBackRows.map((r) => [r.id, r]));
  const notConfirmed = allRetextTargets.filter((t) => byId.get(t.id)?.obligation_text !== t.after);
  summary.read_back = {
    retexted_total: allRetextTargets.length - notConfirmed.length,
    not_confirmed_ids: notConfirmed.map((t) => t.id),
  };
  if (notConfirmed.length) summary.exitCode = 1;

  return summary;
}

async function runRestore({ apply, arg }, deps, summary) {
  const ids = arg.slice(RESTORE_ARG_PREFIX.length).split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    summary.note = `restore: no ids given -- usage: --arg ${RESTORE_ARG_PREFIX}<id,id,...>`;
    summary.exitCode = 1;
    return summary;
  }

  const entries = await deps.readSnapshotEntries();
  const citeMarker = "MAINT forward-events-retext dispatch (Lane FWD-TEXT";
  const idSet = new Set(ids);
  const latest = new Map();
  for (const e of entries ?? []) {
    if (e?.table !== "item_forward_events") continue;
    if (!e?.prior?.id || !idSet.has(e.prior.id)) continue;
    if (!String(e?._cite?.reason ?? "").includes(citeMarker)) continue;
    latest.set(e.prior.id, e.prior);
  }
  const found = [...latest.keys()];
  const missing = ids.filter((id) => !latest.has(id));
  summary.counts = { requested: ids.length, found: found.length, missing: missing.length };
  summary.missing_ids = missing;

  if (!apply) {
    summary.plan = found.map((id) => ({ id, obligation_text: latest.get(id).obligation_text }));
    if (missing.length) summary.exitCode = 1;
    return summary;
  }

  let restored = 0;
  const results = [];
  for (const id of found) {
    const r = await deps.restoreOne(id, latest.get(id).obligation_text);
    restored += r.updated ?? 0;
    results.push({ id, updated: r.updated ?? 0 });
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
      const { readAll, guardedUpdate } = await import("../lib/db.mjs");

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
            "id, event_date, event_kind, obligation_text, source_kind, source_claim_id, source_section_id",
            { match: (q) => q.eq("intelligence_item_id", itemId) },
          ),
        readClaimsForItem: (itemId) =>
          readAll(
            "section_claim_provenance",
            "id, claim_kind, claim_text, source_span",
            { match: (q) => q.eq("intelligence_item_id", itemId).in("claim_kind", ["FACT", "GAP"]) },
          ),
        readSectionsForItem: (itemId) =>
          readAll(
            "intelligence_item_sections",
            "id, section_key, content_md",
            { match: (q) => q.eq("item_id", itemId) },
          ),
        updateObligationText: (id, text) =>
          guardedUpdate("item_forward_events", (q) => q.eq("id", id), { obligation_text: text }, {
            cite: CITE,
            select: "id, obligation_text",
          }),
        readRowsByIds: (ids) => readChunked("item_forward_events", "id, obligation_text", "id", ids),
        readSnapshotEntries: async () => readSnapshotEntriesFromDisk(),
        restoreOne: (id, text) =>
          guardedUpdate("item_forward_events", (q) => q.eq("id", id), { obligation_text: text }, {
            cite: RESTORE_CITE,
            select: "id",
          }),
      };
    },
  });
}
