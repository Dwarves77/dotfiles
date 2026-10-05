// questions-on-change.mjs, lane L4-A (l4a-questions-on-change), 2026-10-05, ADR-044 decision 1, ADR-043
// (propagation_events is append-only and is not touched), learning-loop-design-2026-09-25.md section 1.
//
// WHAT THIS IS. Until now a question was raised only when an item was minted or touched. When a value the
// system holds CHANGES (a derived value is revised, an emission factor is superseded, a statutory
// computation moves) nothing asked what that change means for the items that depend on it. This module is
// the change side: for each outbox row the drain just processed, it names the event type, finds the
// verified items linked to the changed row's entity, and raises the same four product questions per
// item and surface through the SAME generator (trigger-questions.mjs generateTriggerQuestions), the SAME
// flag row builder and the SAME dedup rule (no duplicate while an open row exists for the same
// subject_ref and created_by). It answers nothing; answering is the session-batch lane (ADR-044).
//
// EVENT MAPPING (pure). propagation_events has NO event_type column (migration 284 carries change_kind
// insert/update/delete/supersede), so the six TRIGGER_EVENT_TYPES in constants.mjs are derived here from
// the outbox row's (table_name, change_kind). Every table that attaches propagation_outbox_trg today is
// mapped, and questions-on-change.test.mjs parses the migrations and fails when a new emitting table has
// no mapping.
//
//   table_name               change_kind                     event type
//   emission_factors         supersede                       factor_superseded
//   emission_factors         insert, update, delete          value_revised
//   market_series            any                             value_revised
//   regional_data_facts      any                             value_revised
//   derived_values           any                             value_revised
//   estimated_values         any                             value_revised
//   statutory_computations   any                             obligation_amended
//
// signpost_fired, confidence_decayed and source_frozen are reserved: no table that emits outbox events
// today corresponds to them, so nothing maps to them.
//
// ENTITY TO ITEM LINK (the EXISTING one, read in reverse; no new table). migration 283: an item names an
// entity through `intelligence_items.instrument_entity_id` (single-valued) and through `entity_refs`
// (ref_table='intelligence_items', ref_id=<item id>, entity_id=<entity>, role open text, today
// 'jurisdiction'). src/app/api/notices/resolve-watched-entities.ts reads the item-to-entity direction;
// this module reads the entity-to-item direction over the same two paths. An outbox row carries an
// entity_id only for derived_values, statutory_computations and estimated_values (migration 284); a row
// from emission_factors, market_series or regional_data_facts has a NULL entity_id today and so reaches no
// item (counted as events_no_entity, never guessed).
//
// BOUNDED. At most MAX_ITEMS_PER_EVENT items per event raise questions (items sorted by id, so the choice
// is deterministic); the count dropped is reported as items_dropped_by_cap, never silent.

import { TRIGGER_EVENT_TYPES } from "./constants.mjs";
import { generateTriggerQuestions, mainForQuestions } from "./trigger-questions.mjs";
import { fetchAllRows, fetchAllByIdChunks } from "../db/paginate.mjs";

export const CITE = Object.freeze({
  skill: "learning-loop-design-2026-09-25",
  reason:
    "Lane L4-A (2026-10-05): questions on change, ADR-044 decision 1. Writes one integrity_flags row per " +
    "(verified linked item, surface, product_question) under the QUESTION_NAMESPACE ('question:') when a " +
    "value the system holds changes. Answered from holdings by a session batch, never auto-priced.",
});

/** Max items per event that raise questions (4 questions per item on its surface). */
export const MAX_ITEMS_PER_EVENT = 25;

/** table_name -> { default event type, per change_kind overrides }, plus a plain label for the question. */
export const EMITTING_TABLE_EVENT_MAP = Object.freeze({
  emission_factors: Object.freeze({ type: "value_revised", byKind: Object.freeze({ supersede: "factor_superseded" }), label: "an emission factor" }),
  market_series: Object.freeze({ type: "value_revised", byKind: Object.freeze({}), label: "a market series value" }),
  regional_data_facts: Object.freeze({ type: "value_revised", byKind: Object.freeze({}), label: "a regional data fact" }),
  derived_values: Object.freeze({ type: "value_revised", byKind: Object.freeze({}), label: "a derived value" }),
  estimated_values: Object.freeze({ type: "value_revised", byKind: Object.freeze({}), label: "an estimated value" }),
  statutory_computations: Object.freeze({ type: "obligation_amended", byKind: Object.freeze({}), label: "a statutory computation" }),
});

const KIND_VERB = Object.freeze({ insert: "was added", update: "was revised", delete: "was removed", supersede: "was superseded" });

/**
 * Map one outbox row to one of the existing TRIGGER_EVENT_TYPES, or null when the table has no mapping.
 * PURE.
 * @param {{table_name?:string, change_kind?:string}|null} row
 * @returns {string|null}
 */
export function eventTypeForOutboxRow(row) {
  const entry = row && EMITTING_TABLE_EVENT_MAP[row.table_name];
  if (!entry) return null;
  const type = entry.byKind[row.change_kind] ?? entry.type;
  return TRIGGER_EVENT_TYPES.includes(type) ? type : null;
}

/**
 * Plain words for what changed, from the outbox row and the entity name only. PURE.
 * @param {{tableName:string, rowPk?:string, entityId?:string|null, changeKind?:string}} event
 * @param {string|null} entityName
 * @returns {string}
 */
export function describeChange(event, entityName) {
  const entry = EMITTING_TABLE_EVENT_MAP[event.tableName];
  const what = entry ? entry.label : `a value in ${event.tableName}`;
  const verb = KIND_VERB[event.changeKind] ?? "changed";
  const where = entityName ? `${entityName} (${event.entityId})` : String(event.entityId);
  return `${what} (${event.rowPk}) ${verb} on ${where}`;
}

/**
 * Read the items linked to an entity through the existing link, in reverse: items whose
 * instrument_entity_id is the entity, plus items with an entity_refs row naming it. Returns the entity's
 * canonical name and every verified linked item (archived ones are filtered by the planner).
 * @param {object} sb a Supabase client (service-role in the runner; a fake in tests)
 * @returns {(entityId:string) => Promise<{entityName:string|null, items:object[]}>}
 */
export function buildEntityItemsReader(sb) {
  const COLS = "id,title,domain,item_type,provenance_status,is_archived";
  return async (entityId) => {
    const { data: ent, error: entErr } = await sb.from("entities").select("entity_id,kind,canonical_name").eq("entity_id", entityId).maybeSingle();
    if (entErr) throw new Error(`entities read failed: ${entErr.message}`);

    const viaInstrument = await fetchAllRows((from, to) =>
      sb.from("intelligence_items").select("id").eq("instrument_entity_id", entityId).order("id").range(from, to));
    const viaRefs = await fetchAllRows((from, to) =>
      sb.from("entity_refs").select("ref_id,role").eq("ref_table", "intelligence_items").eq("entity_id", entityId).order("ref_id").order("role").range(from, to));

    const ids = new Set([...viaInstrument.map((r) => r.id), ...viaRefs.map((r) => r.ref_id)]);
    const items = await fetchAllByIdChunks(ids, async (slice) => {
      // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
      const { data, error } = await sb.from("intelligence_items").select(COLS).in("id", slice).eq("provenance_status", "verified");
      if (error) throw new Error(`intelligence_items read failed: ${error.message}`);
      return data ?? [];
    });
    return { entityName: ent?.canonical_name ?? null, items };
  };
}

/**
 * Raise questions for the items affected by a batch of processed outbox events.
 * @param {{
 *   mode?: "dry"|"apply",
 *   events: Array<{eventId:number|string, tableName:string, rowPk:string, entityId:string|null, changeKind:string}>,
 *   deps: {
 *     readEntityLinks: (entityId:string) => Promise<{entityName:string|null, items:object[]}>,
 *     readExistingOpen: () => Promise<Array<{subject_ref:string, created_by:string}>>,
 *     insertMany: (rows:object[]) => Promise<{inserted:number, snapshot:string|null}>,
 *   },
 *   cap?: number,
 * }} opts
 */
export async function runQuestionsOnChange({ mode = "dry", events = [], deps, cap = MAX_ITEMS_PER_EVENT } = {}) {
  const counts = {
    events_seen: events.length, events_mapped: 0, events_unmapped: 0, events_no_entity: 0, read_errors: 0,
    items_affected: 0, items_dropped_by_cap: 0,
  };
  const linkCache = new Map();
  const questions = [];
  const failedEventIds = [];

  for (const ev of events) {
    const eventType = eventTypeForOutboxRow({ table_name: ev.tableName, change_kind: ev.changeKind });
    if (!eventType) { counts.events_unmapped += 1; continue; }
    if (!ev.entityId) { counts.events_no_entity += 1; continue; }
    counts.events_mapped += 1;

    let links = linkCache.get(ev.entityId);
    if (!links) {
      try {
        links = await deps.readEntityLinks(ev.entityId);
      } catch {
        counts.read_errors += 1;
        failedEventIds.push(ev.eventId);
        continue;
      }
      linkCache.set(ev.entityId, links);
    }

    const eligible = (links.items ?? [])
      .filter((i) => i && i.id && i.provenance_status === "verified" && !i.is_archived)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const affected = eligible.slice(0, cap);
    counts.items_affected += affected.length;
    counts.items_dropped_by_cap += eligible.length - affected.length;

    const change = describeChange(ev, links.entityName ?? null);
    for (const item of affected) {
      questions.push(...generateTriggerQuestions(item, { eventType, eventId: ev.eventId, change }));
    }
  }

  const written = await mainForQuestions(
    { mode, questions, itemsConsidered: counts.items_affected, step: "questions-on-change" },
    deps,
  );
  return { ...written, counts: { ...counts, ...written.counts }, failed_event_ids: failedEventIds };
}


const OUTBOX_COLS = "event_id,table_name,row_pk,entity_id,change_kind,occurred_at";

function toProcessedEvent(r) {
  return { eventId: r.event_id, tableName: r.table_name, rowPk: r.row_pk, entityId: r.entity_id ?? null, changeKind: r.change_kind ?? null, occurredAt: r.occurred_at };
}

/**
 * Read outbox rows back as processed events, by id list or by inclusive id range. propagation_events is
 * append-only (ADR-043), so a drained event is still there to be replayed. Ordered by event_id.
 * @param {object} sb a Supabase client
 * @param {{ids?: Array<number|string>, from?: number, to?: number}} sel
 */
export async function readOutboxEvents(sb, { ids, from, to } = {}) {
  let rows;
  if (Array.isArray(ids)) {
    rows = await fetchAllByIdChunks(ids, async (slice) => {
      // fitness-allow: F39 (slice is one fetchAllByIdChunks chunk, at most 50 ids)
      const { data, error } = await sb.from("propagation_events").select(OUTBOX_COLS).in("event_id", slice);
      if (error) throw new Error(`propagation_events read failed: ${error.message}`);
      return data ?? [];
    });
  } else {
    rows = await fetchAllRows((a, b) =>
      sb.from("propagation_events").select(OUTBOX_COLS).gte("event_id", from).lte("event_id", to).order("event_id").range(a, b));
  }
  return rows.map(toProcessedEvent).sort((a, b) => Number(a.eventId) - Number(b.eventId));
}
