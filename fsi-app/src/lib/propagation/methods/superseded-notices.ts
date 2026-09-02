// methods/superseded-notices.ts — reads the old->new pairs a RecalculationNotice renders (docs/specs/
// 08-flywheel-design.md §2.2 Part 3: a stale value's recompute writes a NEW derived_values row pointing
// `supersedes` at the OLD one, which the drain has already marked `admissibility='stale'`). Lane DP-SURF,
// system-completion train, 2026-09-02.
//
// WHY THIS LIVES HERE, NOT IN THE ROUTE. F31 (.discipline/fitness/functions/F31-derived-values-gate.mjs)
// fails CI on any raw `.from("derived_values")` read outside `src/lib/propagation/` — the WHOLE directory
// tree is the sanctioned zone, `derived_values_admissible` (the view) is the only thing safe to read
// anywhere else. A superseded (stale) OLD row is EXCLUDED by that view by design (migration 285:
// `WHERE ... admissibility <> 'stale'`), so a notice — which is precisely "here is the stale figure a
// reader may have already seen, and here is what replaced it" — cannot be built from the view alone; it
// needs a raw read of the table itself, which this lane's write set restricts to `methods/*.mjs|ts`. This
// file is that raw read's one legal, F31-sanctioned home: `src/app/api/notices/route.ts` (outside the
// gate) calls this function rather than querying `derived_values` itself.
//
// PLAIN RELATIVE IMPORTS, NO `@/` ALIAS, NO NPM PACKAGE AT MODULE SCOPE — same discipline as every other
// file in this directory (types.ts's header). `sb` is always a parameter.
//
// THREE ROUND TRIPS, DELIBERATELY SEPARATE (not a single hand-written join): (1) NEW rows — the
// superseding side, entity_id IN (watched entities) AND computed_at >= since; (2) their OLD (superseded)
// counterparts, looked up by value_id IN (those NEW rows' own `supersedes` column); (3) a best-effort
// triggering-event lookup, keyed off the OLD row's `invalidated_by_event` (set by invalidate_dependents()
// at the moment THAT row was marked stale — the NEW row that later superseded it carries no such pointer
// of its own; the fact "why did this go stale" lives on the row that WENT stale). A hand-written PostgREST
// join across three tables in one query is not meaningfully cheaper here (this is a notices list, not a
// hot path) and keeps every step independently readable and independently fakeable in a test.

export interface NoticesQueryBuilder {
  select(cols: string): NoticesQueryBuilder;
  in(col: string, values: unknown[]): NoticesQueryBuilder;
  gte(col: string, value: string): NoticesQueryBuilder;
  then<T>(onfulfilled: (value: { data: unknown; error: { message: string } | null }) => T): Promise<T>;
}

/** The narrow Supabase client surface this module needs — same minimal-interface posture as drain.ts's
 *  `DrainClient` (a hand-rolled fake satisfies it with zero npm dependency, no real database). */
export interface NoticesClient {
  from(table: string): NoticesQueryBuilder;
}

/** One old->new pair, the exact shape RecalculationNotice.tsx renders. */
export interface SupersededNotice {
  entityId: string | null;
  methodId: string;
  oldValueId: string;
  oldMethodVersion: string;
  oldValue: number | null;
  oldValueLow: number | null;
  oldValueHigh: number | null;
  newValueId: string;
  newMethodVersion: string;
  newValue: number | null;
  newValueLow: number | null;
  newValueHigh: number | null;
  unit: string | null;
  currency: string | null;
  /** The NEW row's own computed_at — when the recompute (and so this notice) happened. */
  supersededAt: string;
  /** Best-effort — null when the old row's invalidated_by_event does not resolve to a live
   *  propagation_events row (e.g. it has since been pruned; no retention policy exists yet, so this is a
   *  defensive null, not an expected case). */
  triggeringEvent: { table: string; pk: string; changeKind: string; occurredAt: string } | null;
}

interface RawDerivedValueRow {
  value_id: string;
  entity_id: string | null;
  method_id: string;
  method_version: string;
  value: number | null;
  value_low: number | null;
  value_high: number | null;
  unit: string | null;
  currency: string | null;
  supersedes: string | null;
  computed_at: string;
  invalidated_by_event: number | null;
}

interface RawPropagationEventRow {
  event_id: number;
  table_name: string;
  row_pk: string;
  change_kind: string;
  occurred_at: string;
}

const DERIVED_VALUES_COLS =
  "value_id,entity_id,method_id,method_version,value,value_low,value_high,unit,currency,supersedes,computed_at,invalidated_by_event";

/**
 * Every `derived_values` row that superseded another, for one of `entityIds`, computed at or after
 * `sinceIso`. Never throws on a query error — an error or malformed response yields `[]` (an empty
 * notices list is the honest degraded state; a notices ROUTE is not a place to 500 the caller over a
 * transient read failure on a secondary feed).
 */
export async function fetchSupersededNotices(sb: NoticesClient, entityIds: string[], sinceIso: string): Promise<SupersededNotice[]> {
  if (entityIds.length === 0) return [];

  const newRes = await sb.from("derived_values").select(DERIVED_VALUES_COLS).in("entity_id", entityIds).gte("computed_at", sinceIso);
  if (newRes.error || !Array.isArray(newRes.data)) return [];
  const newRows = (newRes.data as RawDerivedValueRow[]).filter((r) => r.supersedes);
  if (newRows.length === 0) return [];

  const oldIds = [...new Set(newRows.map((r) => r.supersedes as string))];
  const oldRes = await sb.from("derived_values").select(DERIVED_VALUES_COLS).in("value_id", oldIds);
  const oldById = new Map<string, RawDerivedValueRow>((Array.isArray(oldRes.data) ? (oldRes.data as RawDerivedValueRow[]) : []).map((r) => [r.value_id, r]));

  const eventIds = [...new Set([...oldById.values()].map((r) => r.invalidated_by_event).filter((id): id is number => id != null))];
  let eventsById = new Map<number, RawPropagationEventRow>();
  if (eventIds.length > 0) {
    const evRes = await sb.from("propagation_events").select("event_id,table_name,row_pk,change_kind,occurred_at").in("event_id", eventIds);
    eventsById = new Map((Array.isArray(evRes.data) ? (evRes.data as RawPropagationEventRow[]) : []).map((e) => [e.event_id, e]));
  }

  const out: SupersededNotice[] = [];
  for (const n of newRows) {
    const o = oldById.get(n.supersedes as string);
    if (!o) continue; // old row unresolvable (deleted, or query race) — skip rather than render a half notice
    const ev = o.invalidated_by_event != null ? eventsById.get(o.invalidated_by_event) : undefined;
    out.push({
      entityId: n.entity_id,
      methodId: n.method_id,
      oldValueId: o.value_id,
      oldMethodVersion: o.method_version,
      oldValue: o.value,
      oldValueLow: o.value_low,
      oldValueHigh: o.value_high,
      newValueId: n.value_id,
      newMethodVersion: n.method_version,
      newValue: n.value,
      newValueLow: n.value_low,
      newValueHigh: n.value_high,
      unit: n.unit,
      currency: n.currency,
      supersededAt: n.computed_at,
      triggeringEvent: ev ? { table: ev.table_name, pk: ev.row_pk, changeKind: ev.change_kind, occurredAt: ev.occurred_at } : null,
    });
  }
  return out;
}
