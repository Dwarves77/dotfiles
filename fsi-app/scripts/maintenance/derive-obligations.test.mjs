// Run: node --test scripts/maintenance/derive-obligations.test.mjs — no DB, deps injected. The derivation
// itself is proven in scripts/obligations/derive-obligations.test.mjs; this tests the wrapper's orchestration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, loadObjectCandidates } from "./derive-obligations.mjs";

const EVENTS = [
  { id: "e1", intelligence_item_id: "i1", event_date: "2026-11-29", date_precision: "day", event_kind: "compliance_deadline" },
  { id: "e2", intelligence_item_id: "i1", event_date: "2027-01-01", date_precision: "day", event_kind: "entry_into_force" },
];
const ITEMS = [{ id: "i1", title: "Regulation (EU) 2024/1257 (Euro 7)", jurisdiction_iso: ["EU"], transport_modes: ["road"], is_archived: false }];

function deps() {
  const inserted = [];
  const store = { obligations: [] };
  return {
    inserted,
    readAll: async (table, _cols, _opts) => {
      if (table === "item_forward_events") return EVENTS;
      if (table === "intelligence_items") return ITEMS;
      if (table === "obligations") return store.obligations;
      throw new Error(`unexpected table ${table}`);
    },
    readAllByIds: async (table, _cols, ids, _opts) => {
      if (table === "intelligence_items") return ITEMS.filter((i) => ids.includes(i.id));
      throw new Error(`unexpected table ${table}`);
    },
    guardedInsertMany: async (table, rows, opts) => {
      assert.equal(table, "obligations");
      assert.ok(opts.cite?.skill || opts.cite?.reason, "every write carries a cite");
      inserted.push(...rows);
      store.obligations.push(...rows.map((r, i) => ({ id: `o${i}`, ...r })));
      return { inserted: rows.length, snapshot: "test" };
    },
  };
}

test("dry: derives, writes nothing, reports counts", async () => {
  const d = deps();
  const s = await main({ mode: "dry" }, d);
  assert.equal(s.step, "derive-obligations");
  assert.equal(d.inserted.length, 0);
  assert.equal(s.counts.forward_events, 2);
  assert.equal(s.counts.to_insert, 2);
  assert.equal(s.applied, 0);
  assert.equal(s.exitCode, 0);
});

test("apply: inserts through the guarded path, reads back the register, exit 0 when counts agree", async () => {
  const d = deps();
  const s = await main({ mode: "apply" }, d);
  assert.equal(d.inserted.length, 2);
  assert.equal(s.applied, 2);
  assert.equal(s.read_back.obligations_total, 2);
  assert.equal(s.read_back.active, 2);
  assert.equal(s.exitCode, 0);
});

// ── lane HALF-1 (2026-10-11): the obligation_objects writer rides this chain step ─────────────────────────────
const OBJ_ITEM = { id: "00000000-0000-4000-8000-0000000000a2", title: "FIXTURE unnamed measure", is_archived: false, jurisdiction_iso: ["EU"] };
const OBJ_CAPTURE = { id: "00000000-0000-4000-8000-0000000000b2", intelligence_item_id: OBJ_ITEM.id, result_content: "FIXTURE capture. importers or their indirect customs representatives must apply for authorised CBAM declarant status. End." };
const OBJ_CANDIDATE = {
  instrument_item_id: OBJ_ITEM.id,
  capture_id: OBJ_CAPTURE.id,
  pinpoint_citation: "FIXTURE pinpoint",
  verbatim_text: "importers or their indirect customs representatives must apply for authorised CBAM declarant status",
  binding_position: "direct_duty",
  duty_holder_class: ["customs_representative_indirect"],
  applicability_trigger: { attribute: "org_role", value: "forwarder" },
};
function objDeps() {
  const objectRows = [];
  const d = deps();
  const base = d.readAllByIds;
  return {
    ...d,
    objectRows,
    readAll: async (table, ...rest) => (table === "obligations" ? [] : table === "item_forward_events" ? [] : d.readAll(table, ...rest)),
    readAllByIds: async (table, cols, ids, opts) => {
      if (table === "intelligence_items" && ids.includes(OBJ_ITEM.id)) return [OBJ_ITEM];
      if (table === "agent_run_searches") return [OBJ_CAPTURE].filter((c) => ids.includes(c.id));
      if (table === "obligation_objects") return objectRows;
      return base(table, cols, ids, opts);
    },
    guardedInsertMany: async (table, rows) => {
      assert.equal(table, "obligation_objects");
      objectRows.push(...rows);
      return { inserted: rows.length, snapshot: "test" };
    },
  };
}

test("chained run (no --arg): the object phase runs and reports zero candidates, nothing written", async () => {
  const d = objDeps();
  const s = await main({ mode: "apply" }, d);
  assert.equal(s.objects.candidates, 0);
  assert.equal(s.objects.inserted, 0);
  assert.equal(d.objectRows.length, 0);
  assert.equal(s.exitCode, 0);
});

test("--arg names a grounded candidate batch: dry plans it, apply writes it, a paraphrase is refused and reported", async () => {
  assert.deepEqual(loadObjectCandidates(""), []);
  assert.deepEqual(loadObjectCandidates("batch.json", () => JSON.stringify({ candidates: [OBJ_CANDIDATE] })), [OBJ_CANDIDATE]);
  assert.deepEqual(loadObjectCandidates("batch.json", () => JSON.stringify([OBJ_CANDIDATE])), [OBJ_CANDIDATE]);
  const dir = mkdtempSync(join(tmpdir(), "half1-"));
  const file = join(dir, "batch.json");
  try {
    writeFileSync(file, JSON.stringify([OBJ_CANDIDATE, { ...OBJ_CANDIDATE, pinpoint_citation: "FIXTURE paraphrase", verbatim_text: "not in the capture at all" }]));
    const d = objDeps();
    const dry = await main({ mode: "dry", arg: file }, d);
    assert.equal(dry.objects.candidates, 2);
    assert.equal(dry.objects.to_insert, 1);
    assert.deepEqual(dry.objects.refusal_reasons, ["span_not_verbatim"]);
    assert.equal(d.objectRows.length, 0);
    const applied = await main({ mode: "apply", arg: file }, d);
    assert.equal(applied.objects.inserted, 1);
    assert.equal(applied.exitCode, 0);
    assert.equal(d.objectRows.length, 1);
    assert.equal(d.objectRows[0].status, "not_assessed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
