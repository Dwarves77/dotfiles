import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveObligationRow,
  deriveObligationRows,
  filterNewRows,
  main,
  DERIVATION_VERSION,
} from "./derive-obligations.mjs";

const EVENT_DATED = {
  id: "evt-1",
  intelligence_item_id: "item-1",
  event_date: "2030-12-02",
  date_precision: "day",
  event_kind: "compliance_deadline",
};

const ITEM_COUNTEMISSIONS = {
  id: "item-1",
  title: "CountEmissions EU, Regulation (EU) 2026/1030",
  legal_instrument: null,
  jurisdiction_iso: ["EU"],
  transport_modes: ["ocean", "road"],
  is_archived: false,
};

test("deriveObligationRow: copies due_date/date_precision verbatim from a dated event", () => {
  const row = deriveObligationRow(EVENT_DATED, ITEM_COUNTEMISSIONS);
  assert.equal(row.due_date, "2030-12-02");
  assert.equal(row.date_precision, "day");
  assert.equal(row.forward_event_id, "evt-1");
  assert.equal(row.intelligence_item_id, "item-1");
  assert.equal(row.event_kind, "compliance_deadline");
  assert.equal(row.derivation_version, DERIVATION_VERSION);
});

test("deriveObligationRow: NEVER invents a due date — a dateless event yields null/null", () => {
  const dateless = { id: "evt-2", intelligence_item_id: "item-1", event_date: null, date_precision: null, event_kind: "other" };
  const row = deriveObligationRow(dateless, ITEM_COUNTEMISSIONS);
  assert.equal(row.due_date, null);
  assert.equal(row.date_precision, null);
});

test("deriveObligationRow: an event_date that is an empty string is treated as no date, not a literal date", () => {
  const row = deriveObligationRow({ id: "evt-3", intelligence_item_id: "item-1", event_date: "", date_precision: "day", event_kind: "other" }, ITEM_COUNTEMISSIONS);
  assert.equal(row.due_date, null);
  assert.equal(row.date_precision, null);
});

test("deriveObligationRow: classifies binding_position deterministically from the item title", () => {
  const row = deriveObligationRow(EVENT_DATED, ITEM_COUNTEMISSIONS);
  assert.equal(row.binding_position, "direct_duty");
});

test("deriveObligationRow: binding_position is null (not guessed) for an unmapped instrument", () => {
  const unmapped = { ...ITEM_COUNTEMISSIONS, title: "Some obscure regional ordinance" };
  const row = deriveObligationRow(EVENT_DATED, unmapped);
  assert.equal(row.binding_position, null);
});

test("deriveObligationRow: normalizes transport_modes through the canonical vocabulary (sea -> ocean, never sea)", () => {
  const item = { ...ITEM_COUNTEMISSIONS, transport_modes: ["sea", "SEA", "road", "not-a-real-mode"] };
  const row = deriveObligationRow(EVENT_DATED, item);
  assert.deepEqual(row.modes.sort(), ["ocean", "road"]);
  assert.ok(!row.modes.includes("sea"), "canonical modes array must never contain the raw alias 'sea'");
});

test("deriveObligationRow: a corridor-only mode (multimodal) never reaches a leg-grain register row", () => {
  const item = { ...ITEM_COUNTEMISSIONS, transport_modes: ["ocean", "multimodal"] };
  const row = deriveObligationRow(EVENT_DATED, item);
  assert.deepEqual(row.modes, ["ocean"]);
  assert.ok(!row.modes.includes("multimodal"), "modes must never carry the corridor-only token multimodal (migration 290 obligations_modes_no_alias_check)");
});

test("deriveObligationRow: missing jurisdiction/transport_modes on the item yield empty arrays, never invented values", () => {
  const bare = { id: "item-2", title: "CBAM", jurisdiction_iso: null, transport_modes: undefined, is_archived: false };
  const row = deriveObligationRow(EVENT_DATED, bare);
  assert.deepEqual(row.jurisdiction, []);
  assert.deepEqual(row.modes, []);
});

test("deriveObligationRow: status mirrors the parent item's is_archived flag", () => {
  const archived = { ...ITEM_COUNTEMISSIONS, is_archived: true };
  assert.equal(deriveObligationRow(EVENT_DATED, archived).status, "archived");
  assert.equal(deriveObligationRow(EVENT_DATED, ITEM_COUNTEMISSIONS).status, "active");
});

test("deriveObligationRows: skips an event whose parent item was not fetched, never crashes", () => {
  const events = [EVENT_DATED, { id: "evt-orphan", intelligence_item_id: "item-missing", event_date: "2027-01-01", date_precision: "day", event_kind: "other" }];
  const itemsById = new Map([["item-1", ITEM_COUNTEMISSIONS]]);
  const rows = deriveObligationRows(events, itemsById);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].forward_event_id, "evt-1");
});

test("deriveObligationRows: deterministic — same input always produces the same output", () => {
  const itemsById = new Map([["item-1", ITEM_COUNTEMISSIONS]]);
  const a = deriveObligationRows([EVENT_DATED], itemsById);
  const b = deriveObligationRows([EVENT_DATED], itemsById);
  assert.deepEqual(a, b);
});

test("filterNewRows: drops rows whose forward_event_id is already registered — idempotent re-run", () => {
  const derived = [
    { forward_event_id: "evt-1", due_date: "2030-12-02" },
    { forward_event_id: "evt-2", due_date: "2027-01-01" },
  ];
  const out = filterNewRows(derived, ["evt-1"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].forward_event_id, "evt-2");
});

test("filterNewRows: re-running derivation over an unchanged corpus yields zero new rows", () => {
  const derived = deriveObligationRows([EVENT_DATED], new Map([["item-1", ITEM_COUNTEMISSIONS]]));
  const out = filterNewRows(derived, derived.map((r) => r.forward_event_id));
  assert.equal(out.length, 0);
});

// ── main(): deps-injected, no real database (mirrors screen-reconcile-records.mjs's own test shape) ──

function fakeDeps({ events, items, existingObligations = [] }) {
  const inserted = [];
  return {
    inserted,
    deps: {
      readAll: async (table, columns, opts) => {
        if (table === "item_forward_events") return events;
        if (table === "intelligence_items") return items;
        if (table === "obligations") return existingObligations;
        throw new Error(`unexpected readAll(${table})`);
      },
      guardedInsertMany: async (table, rows, { cite }) => {
        assert.equal(table, "obligations");
        assert.ok(cite && cite.skill && cite.reason, "guardedInsertMany must always be called with a real cite");
        inserted.push(...rows);
        return { inserted: rows.length, snapshot: "fake-snapshot.jsonl", rows };
      },
    },
  };
}

test("main: dry-run never calls guardedInsertMany and reports what would be inserted", async () => {
  const { deps, inserted } = fakeDeps({ events: [EVENT_DATED], items: [ITEM_COUNTEMISSIONS], existingObligations: [] });
  const summary = await main({ apply: false }, deps);
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.to_insert, 1);
  assert.equal(summary.inserted, 0);
  assert.equal(inserted.length, 0);
});

test("main: --apply inserts only the new rows through guardedInsertMany", async () => {
  const { deps, inserted } = fakeDeps({
    events: [EVENT_DATED, { id: "evt-2", intelligence_item_id: "item-1", event_date: "2027-06-01", date_precision: "month", event_kind: "review_or_report" }],
    items: [ITEM_COUNTEMISSIONS],
    existingObligations: [{ forward_event_id: "evt-1" }], // evt-1 already registered
  });
  const summary = await main({ apply: true }, deps);
  assert.equal(summary.mode, "apply");
  assert.equal(summary.to_insert, 1);
  assert.equal(summary.inserted, 1);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].forward_event_id, "evt-2");
});

test("main: --apply against a fully-registered corpus inserts nothing (idempotent)", async () => {
  const { deps, inserted } = fakeDeps({
    events: [EVENT_DATED],
    items: [ITEM_COUNTEMISSIONS],
    existingObligations: [{ forward_event_id: "evt-1" }],
  });
  const summary = await main({ apply: true }, deps);
  assert.equal(summary.to_insert, 0);
  assert.equal(summary.inserted, 0);
  assert.equal(inserted.length, 0);
});
