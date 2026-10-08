import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  deriveObligationRow,
  deriveObligationRows,
  filterNewRows,
  main,
  DERIVATION_VERSION,
  classifyItemBindingPosition,
  contextFromClaims,
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

function fakeDeps({ events, items, existingObligations = [], claims = [], objects = [], objectsMissing = false }) {
  const inserted = [];
  return {
    inserted,
    deps: {
      readAll: async (table, _columns, _opts) => {
        if (table === "item_forward_events") return events;
        if (table === "obligations") return existingObligations;
        throw new Error(`unexpected readAll(${table})`);
      },
      readAllByIds: async (table, columns, ids) => {
        if (table === "intelligence_items") return items.filter((i) => ids.includes(i.id));
        if (table === "section_claim_provenance") return claims.filter((c) => ids.includes(c.intelligence_item_id));
        if (table === "obligation_objects") {
          if (objectsMissing) throw new Error('relation "public.obligation_objects" does not exist');
          return objects.filter((o) => ids.includes(o.instrument_item_id));
        }
        throw new Error(`unexpected readAllByIds(${table})`);
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

// ── lane OBL-2 (2026-10-08): the classifier reads the canonical instrument key, legal_instrument and the
// record-facts [binding_position] claim BEFORE the title; the generic-phrase PPWR and CBAM title rules no longer
// fire for other instruments; monitoring_only exists (OBL-1 register section 8 items 8 and 9) ────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const CENSUS = JSON.parse(readFileSync(join(HERE, "..", "..", "src", "lib", "connections", "fixtures", "census-rows.apply-ready.json"), "utf8"));
const claimTexts = (row) => (row.claims ?? []).map((c) => c.claim_text);
function censusItem(i) {
  const r = CENSUS[i];
  return {
    item: {
      id: r.id,
      title: r.item.title,
      instrument_identifier: r.item.instrument_identifier,
      canonical_instrument_key: r.item.canonical_instrument_key,
      jurisdiction_iso: [r.item.jurisdiction_iso],
    },
    ctx: contextFromClaims(claimTexts(r)),
  };
}
const classify = (i) => classifyItemBindingPosition(censusItem(i).item, censusItem(i).ctx)?.position ?? null;

test("census index 51 (Directive 2004/12/EC amending 94/62/EC, addressed to the Member States): not direct_duty from the generic packaging phrase; monitoring_only from its duty holder", () => {
  assert.equal(classify(51), "monitoring_only");
  assert.deepEqual(censusItem(51).ctx.dutyHolderClasses, ["member_state"]);
});

test("census index 61 (UK CBAM transitory regulations): the generic carbon-border phrase no longer reads as the EU CBAM; unclassified", () => {
  assert.equal(classify(61), null);
});

test("census index 81 (Implementing Regulation (EU) 2025/2621 applying Regulation (EU) 2023/956): classified by the instrument number it names, direct_duty", () => {
  assert.equal(classify(81), "direct_duty");
});

test("census index 103 (UK packaging producer regulations): the record-facts [binding_position] claim wins, monitoring_only", () => {
  assert.equal(censusItem(103).ctx.recordFactsPosition, "monitoring_only");
  assert.equal(classify(103), "monitoring_only");
});

test("census index 164 (2001/171/EC glass packaging derogation): no longer direct_duty from the generic packaging phrase", () => {
  assert.equal(classify(164), null);
});

test("the four forwarder-direct instruments still classify direct_duty (by key, number or name)", () => {
  const cases = [
    { title: "CountEmissions EU", canonical_instrument_key: "32026R1030" },
    { title: "EU CBAM", canonical_instrument_key: null, jurisdiction_iso: ["EU"] },
    { title: "Directive (EU) 2024/825 empowering consumers for the green transition", canonical_instrument_key: "32024L0825" },
    { title: "EU PPWR 2025/40", canonical_instrument_key: "32025R0040" },
    { title: "Regulation on packaging", canonical_instrument_key: "32025R0040" }, // by the CELEX key alone
  ];
  for (const c of cases) assert.equal(classifyItemBindingPosition({ id: "x", ...c }, {})?.position, "direct_duty", c.title);
});

test("the instrument key is read before the title: a generic title with the CBAM key classifies by the key", () => {
  const r = classifyItemBindingPosition({ id: "x", title: "Default values for goods", canonical_instrument_key: "32023R0956" }, {});
  assert.equal(r.position, "direct_duty");
  assert.equal(r.source, "instrument_identity");
});

test("legal_instrument is read when the row carries it", () => {
  const r = classifyItemBindingPosition({ id: "x", title: "Update", legal_instrument: "Regulation (EU) 2025/40" }, {});
  assert.equal(r.position, "direct_duty");
});

test("an EU item whose title names the carbon border adjustment mechanism (no acronym, no number) is still the CBAM family", () => {
  const r = classifyItemBindingPosition({ id: "x", title: "Carbon Border Adjustment Mechanism definitive regime", jurisdiction_iso: ["EU"] }, {});
  assert.equal(r.position, "direct_duty");
});

test("monitoring_only: duty holders that exclude every forwarder role map to monitoring_only, but only after named instruments are tried", () => {
  const csrd = classifyItemBindingPosition(
    { id: "x", title: "CSRD, Corporate Sustainability Reporting Directive", jurisdiction_iso: ["EU"] },
    { dutyHolderClasses: ["member_state"] },
  );
  assert.equal(csrd.position, "direct_duty"); // a named spec 01 instrument is never turned into monitoring_only by an addressee
  const other = classifyItemBindingPosition({ id: "x", title: "Some other directive" }, { dutyHolderClasses: ["member_state"] });
  assert.equal(other.position, "monitoring_only");
  assert.equal(other.source, "duty_holder_excludes_forwarder");
  // a forwarder among the duty holders is not excluded
  assert.equal(classifyItemBindingPosition({ id: "x", title: "Some other directive" }, { dutyHolderClasses: ["member_state", "forwarder"] }), null);
  // no duty holder known: never guessed
  assert.equal(classifyItemBindingPosition({ id: "x", title: "Some other directive" }, {}), null);
});

test("contextFromClaims: reads the claim position from the extracted text and ignores a GAP claim", () => {
  const ctx = contextFromClaims([
    "[binding_position] The captured source's own applicability language places this item at direct_duty (Your duty), from the passage: x",
    "[jurisdictional_scope] The captured source states, verbatim: «addressed to the Member States»",
  ]);
  assert.equal(ctx.recordFactsPosition, "direct_duty");
  assert.deepEqual(ctx.dutyHolderClasses, ["member_state"]);
  const gap = contextFromClaims(["[binding_position] No verbatim applicability language naming a duty-holder class was located in the captured source text for this record-grade item."]);
  assert.equal(gap.recordFactsPosition, null);
  assert.deepEqual(contextFromClaims([]), { recordFactsPosition: null, dutyHolderClasses: [] });
});

test("deriveObligationRow takes the classification context as its third argument and stamps the new derivation version", () => {
  const row = deriveObligationRow(EVENT_DATED, { ...ITEM_COUNTEMISSIONS, title: "Some other directive" }, { dutyHolderClasses: ["member_state"] });
  assert.equal(row.binding_position, "monitoring_only");
  assert.equal(DERIVATION_VERSION, "oblig-derive-2026-10-08.1");
});

test("main: reads claims and obligation objects for the classification context; monitoring_only appears in the breakdown", async () => {
  const item = { id: "item-9", title: "Some other directive", jurisdiction_iso: ["EU"], transport_modes: [], is_archived: false };
  const { deps } = fakeDeps({
    events: [{ id: "evt-9", intelligence_item_id: "item-9", event_date: "2027-01-01", date_precision: "day", event_kind: "other" }],
    items: [item],
    claims: [{ intelligence_item_id: "item-9", claim_kind: "FACT", claim_text: "[jurisdictional_scope] The captured source states, verbatim: «addressed to the Member States»" }],
  });
  const summary = await main({ apply: false }, deps);
  assert.equal(summary.binding_position_breakdown.monitoring_only, 1);
  assert.deepEqual(summary.optional_reads_unavailable, []);
});

test("main: obligation_objects duty holders feed the monitoring_only rule; a missing table (migration 376 not applied) is disclosed, never fatal", async () => {
  const item = { id: "item-8", title: "Some other directive", jurisdiction_iso: ["EU"], transport_modes: [], is_archived: false };
  const events = [{ id: "evt-8", intelligence_item_id: "item-8", event_date: "2027-01-01", date_precision: "day", event_kind: "other" }];
  const withObjects = fakeDeps({
    events,
    items: [item],
    objects: [{ instrument_item_id: "item-8", obligation_id: "cl:obligation:0000000000000001", supersedes: null, duty_holder_class: ["carrier"] }],
  });
  // a carrier-only object excludes the forwarder role
  assert.equal((await main({ apply: false }, withObjects.deps)).binding_position_breakdown.monitoring_only, 1);
  const missing = fakeDeps({ events, items: [item], objectsMissing: true });
  const s = await main({ apply: false }, missing.deps);
  assert.equal(s.derived, 1);
  assert.deepEqual(s.optional_reads_unavailable.map((r) => r.table), ["obligation_objects"]);
  assert.match(s.optional_reads_unavailable[0].error, /does not exist/);
});

test("main --apply with the new reads still inserts only through guardedInsertMany", async () => {
  const item = { id: "item-7", title: "Some other directive", jurisdiction_iso: ["EU"], transport_modes: [], is_archived: false };
  const { deps, inserted } = fakeDeps({
    events: [{ id: "evt-7", intelligence_item_id: "item-7", event_date: "2027-01-01", date_precision: "day", event_kind: "other" }],
    items: [item],
    claims: [{ intelligence_item_id: "item-7", claim_kind: "FACT", claim_text: "[binding_position] The captured source's own applicability language places this item at «customer_contract» (Customer contract)" }],
  });
  const summary = await main({ apply: true }, deps);
  assert.equal(summary.inserted, 1);
  assert.equal(inserted[0].binding_position, "customer_contract");
});
