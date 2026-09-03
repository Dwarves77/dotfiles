#!/usr/bin/env node
// derive-obligations.mjs — derive the obligation register (migration 290 `obligations`) from
// `item_forward_events` joined to `intelligence_items` (Lane OBLIG, 2026-09-02).
//
// WHY THIS EXISTS. Migration 274 extracts "what is due, when" into item_forward_events (901+ rows) but
// that table carries no jurisdiction / transport mode / binding_position of its own — those live on the
// parent intelligence_items row. This script is the derivation pass spec-01 §2 asks for ("the atomic
// unit is not the document, it is the obligation"): for every forward event, read its parent item, copy
// over jurisdiction/mode, deterministically classify binding_position (never invented — see
// src/lib/obligations/classify-binding-position.mjs's own header), and write one `obligations` row.
//
// DETERMINISTIC. Same input (a forward event + its parent item's current jurisdiction/mode/title) always
// produces the same output row — no LLM, no fetch, $0 (COMMON lane contract). Re-running over an
// unchanged corpus slice is therefore a true no-op: `deriveObligationRows` is pure, and `main` diffs
// against the forward_event_ids already present in `obligations` before writing anything (idempotent at
// the SCRIPT layer; migration 290's `obligations_forward_event_unique` constraint backs it as a second,
// DB-enforced guarantee, matching item_forward_events' own two-layer idempotency posture).
//
// NEVER INVENTS A DUE DATE. `deriveObligationRows` copies `due_date`/`date_precision` straight from the
// source forward event and ONLY from it — a forward event with no date (defensive: every live row in
// item_forward_events carries one today, migration 274's own NOT NULL; this script does not trust that
// blindly and is tested against a fixture event object that omits it) yields `due_date: null,
// date_precision: null` on the derived row, never a synthesized date. See migration 290's own header for
// why the column stays nullable for exactly this reason.
//
// DRY BY DEFAULT, --apply THROUGH THE GUARDED PATH (COMMON lane contract §"Where you work"). Row
// mutations go through scripts/lib/db.mjs's guardedInsertMany — a fresh-row audit-sink insert, the same
// class of write population-turn scripts already use (never guardedUpdate: an obligations row is never
// mutated in place by this script; a changed item is picked up as a NEW row only if its forward event
// changes, which never happens for an existing event_id since events are themselves immutable/versioned
// by re-extraction, not edited).
//
// DEPS-INJECTED (mirrors scripts/mint/screen-reconcile-records.mjs's own shape): `main({ apply }, deps)`
// takes `{ readAll, guardedInsertMany }` so this proof runs with zero database, and the live entrypoint
// at the bottom wires the real scripts/lib/db.mjs.
//
// USAGE:
//   node scripts/obligations/derive-obligations.mjs            # dry: what would be inserted
//   node scripts/obligations/derive-obligations.mjs --apply    # insert new register rows through the guarded path
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyBindingPosition } from "../../src/lib/obligations/classify-binding-position.mjs";
import { normaliseMode, LEG_MODE_CODES } from "../../src/lib/contracts/vocabularies.mjs";

// `normaliseMode` resolves a raw string to ANY member of TRANSPORT_MODES, corridor-only tokens included
// (`multimodal` is itself a valid vocabulary member, just `corridorOnly: true`) — it has no opinion on
// grain. Migration 290's own CHECK constraint (`obligations_modes_no_alias_check`) is explicit that a
// single leg, and therefore a single obligations row, never carries `multimodal`: "a corridor may be
// multimodal; a factor never is, because a factor is per leg" (vocabularies.mjs's own TRANSPORT_MODES
// comment). LEG_MODE_CODES is the vocabulary's own leg-grain subset (excludes `multimodal`) — filtering
// through it here means a source item that happens to carry a stray `multimodal` in its transport_modes
// (nothing in the corpus does today, checked by grep against every intelligence_items snapshot on this
// branch; this filter is defensive, not observed-necessary) never reaches the guarded insert and trips
// that CHECK constraint at write time.
const LEG_MODE_SET = new Set(LEG_MODE_CODES);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch { /* CI: env injected */ }

export const DERIVATION_VERSION = "oblig-derive-2026-09-02.1";

export const CITE = Object.freeze({
  skill: "surface-spec-01-regulations",
  reason:
    "Derive the obligation register (migration 290 `obligations`) from item_forward_events joined to " +
    "intelligence_items: spec-01 §2's atomic unit ('the obligation, not the document') with " +
    "binding_position (spec-01 §1's named-instrument table) actually populated for the first time. " +
    "Fresh audit-sink rows only, never a mutation of an existing row (guardedInsertMany).",
});

/**
 * Pure: derive ONE obligations row from a single forward event + its parent item's current metadata.
 * Never throws on a partial/malformed input — a forward event missing a date yields a row with
 * due_date/date_precision both null (never invented); an item missing jurisdiction/transport_modes
 * yields empty arrays (never invented); an item that matches none of classifyBindingPosition's rules
 * yields binding_position: null ("not yet classified").
 *
 * @param {{ id: string, intelligence_item_id: string, event_date?: string|null, date_precision?: string|null, event_kind: string }} event
 * @param {{ id: string, title?: string|null, legal_instrument?: string|null, jurisdiction_iso?: string[]|null, transport_modes?: string[]|null, is_archived?: boolean }} item
 *   `legal_instrument` is accepted for forward-compatibility (classifyBindingPosition's own match
 *   surface) but `intelligence_items` carries no such column today (checked against migration 004's
 *   full column list; a prior audit finding — src/lib/supabase-server.ts's own P1-4 comment — records
 *   the same "no migration ever added it" fact for the sibling `legal_instrument`/`penalty_range`/
 *   `enforcement_body` trio) — `main`'s own readAll select list below does NOT request it, so a live
 *   item passed here never actually carries it and classification runs on `title` alone. Kept as an
 *   accepted (unused-today) field rather than removed so a future migration adding the column needs no
 *   change here, only to `main`'s select list.
 * @returns {object} a row shaped for the `obligations` table (minus id/created_at/updated_at, DB-defaulted)
 */
export function deriveObligationRow(event, item) {
  const jurisdiction = Array.isArray(item?.jurisdiction_iso) ? item.jurisdiction_iso.filter(Boolean) : [];
  const modes = Array.isArray(item?.transport_modes)
    ? [...new Set(item.transport_modes.map((m) => normaliseMode(m)).filter((m) => m && LEG_MODE_SET.has(m)))]
    : [];
  const classified = classifyBindingPosition({ title: item?.title, legalInstrument: item?.legal_instrument });

  const hasDate = typeof event?.event_date === "string" && event.event_date.length > 0;
  return {
    intelligence_item_id: event.intelligence_item_id,
    forward_event_id: event.id,
    jurisdiction,
    modes,
    binding_position: classified ? classified.position : null,
    due_date: hasDate ? event.event_date : null,
    date_precision: hasDate ? (event.date_precision ?? null) : null,
    event_kind: event.event_kind,
    status: item?.is_archived ? "archived" : "active",
    derivation_version: DERIVATION_VERSION,
  };
}

/**
 * Pure: derive every obligations row for a batch of forward events + an item lookup map, skipping any
 * event whose parent item is not in `itemsById` (an event on an archived/removed item this script's
 * caller chose not to fetch — never a crash, never a fabricated row for an item we know nothing about).
 *
 * @param {Array<object>} events - item_forward_events rows
 * @param {Map<string, object>} itemsById - intelligence_items rows keyed by id
 * @returns {Array<object>} derived obligations rows, one per event whose item was found
 */
export function deriveObligationRows(events, itemsById) {
  const out = [];
  for (const event of events ?? []) {
    const item = itemsById.get(event.intelligence_item_id);
    if (!item) continue;
    out.push(deriveObligationRow(event, item));
  }
  return out;
}

/**
 * Pure: the idempotency filter — given the set of forward_event_ids already present in `obligations`,
 * keep only the derived rows for events not yet registered. This is what makes a re-run over an
 * unchanged corpus slice a true no-op at the script layer (migration 290's UNIQUE constraint is the
 * second, DB-enforced backstop, not the only guarantee).
 */
export function filterNewRows(derivedRows, existingForwardEventIds) {
  const seen = new Set(existingForwardEventIds ?? []);
  return derivedRows.filter((r) => !seen.has(r.forward_event_id));
}

/**
 * @param {{ apply?: boolean }} opts
 * @param {{ readAll: Function, guardedInsertMany: Function }} deps
 */
export async function main({ apply = false } = {}, deps) {
  const { readAll, guardedInsertMany } = deps;
  console.log(`[derive-obligations] mode = ${apply ? "APPLY" : "DRY-RUN"}, version = ${DERIVATION_VERSION}`);

  const events = await readAll(
    "item_forward_events",
    "id, intelligence_item_id, event_date, date_precision, event_kind",
  );
  const itemIds = [...new Set(events.map((e) => e.intelligence_item_id))];
  // NOTE: no `legal_instrument` column — intelligence_items carries no such field today (see
  // deriveObligationRow's own JSDoc). Selecting it would fail this read against the live schema.
  const items = itemIds.length
    ? await readAll(
        "intelligence_items",
        "id, title, jurisdiction_iso, transport_modes, is_archived",
        { match: (q) => q.in("id", itemIds) },
      )
    : [];
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const derived = deriveObligationRows(events, itemsById);
  const skippedNoItem = events.length - derived.length;

  const existing = await readAll("obligations", "forward_event_id");
  const existingIds = existing.map((r) => r.forward_event_id);
  const toInsert = filterNewRows(derived, existingIds);

  const byBindingPosition = {};
  for (const r of derived) byBindingPosition[r.binding_position ?? "unclassified"] = (byBindingPosition[r.binding_position ?? "unclassified"] ?? 0) + 1;

  console.log(
    `[derive-obligations] forward events: ${events.length} | items resolved: ${itemsById.size} | ` +
    `events skipped (item not found): ${skippedNoItem} | derived rows: ${derived.length} | ` +
    `already registered: ${existingIds.length} | new to insert: ${toInsert.length}`,
  );
  console.log(`[derive-obligations] binding_position breakdown of this run's derived rows:`, byBindingPosition);

  const summary = {
    mode: apply ? "apply" : "dry-run",
    forward_events: events.length,
    derived: derived.length,
    skipped_no_item: skippedNoItem,
    already_registered: existingIds.length,
    to_insert: toInsert.length,
    inserted: 0,
    binding_position_breakdown: byBindingPosition,
  };
  if (!apply || toInsert.length === 0) return summary;

  const res = await guardedInsertMany("obligations", toInsert, { cite: CITE, select: "id" });
  console.log(`[derive-obligations] inserted ${res.inserted} row(s) (snapshot: ${res.snapshot ?? "n/a"})`);
  if (res.inserted !== toInsert.length) {
    console.error(`[derive-obligations] MISMATCH — ${toInsert.length} rows prepared, ${res.inserted} confirmed inserted`);
    process.exitCode = 1;
  }
  return { ...summary, inserted: res.inserted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[derive-obligations] no DB creds — cannot run here (exit 2).");
    process.exit(2);
  }
  const { readAll, guardedInsertMany } = await import("../lib/db.mjs");
  main({ apply: process.argv.includes("--apply") }, { readAll, guardedInsertMany }).catch((e) => {
    console.error("[derive-obligations] fatal:", e);
    process.exit(1);
  });
}
