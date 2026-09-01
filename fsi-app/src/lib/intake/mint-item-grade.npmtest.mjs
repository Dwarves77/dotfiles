// @ts-check
// Lane POP (2026-09-01, migration 278) — mintIntelligenceItem's item_grade stamping. Proves:
//   1. plan.grade === "record" -> the INSERTed row carries item_grade: "record"
//   2. plan.grade omitted -> item_grade: "brief" (the historical default; every pre-existing caller
//      that never sets plan.grade is unaffected)
//   3. a caller-preset seed.item_grade (e.g. a record payload applied via buildRecordPayload, whose
//      item.grade the caller copies onto seed.item_grade) is trusted as-is, not overwritten by plan.grade
//   4. rule 16 (discovery + forward-event extraction) still runs post-insert for a record-grade mint,
//      exactly as for a brief-grade one — same jiti/fakeClient harness as
//      mint-forward-participation.npmtest.mjs, reused here rather than re-derived.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

const CONNECTION_SIGNATURE_COLUMNS =
  "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";

/** Minimal full-chain fake covering every query a successful mint reaches (same query set as
 *  mint-forward-participation.npmtest.mjs's fakeClient), plus capturing the exact row passed to
 *  intelligence_items.insert() so this file can assert on item_grade directly. */
function fakeClient({ itemId = "new-item-1" } = {}) {
  const inserted = [];
  const forwardEventInserts = [];

  function intelligenceItemsChain() {
    const state = { cols: null };
    return {
      select(cols) { state.cols = cols; return this; },
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      range() { return this; },
      maybeSingle: async () => ({ data: null, error: null }), // idempotency probes: no existing row
      insert(row) {
        inserted.push(row);
        return {
          select() { return this; },
          single: async () => ({ data: { id: itemId }, error: null }),
        };
      },
      then(res, rej) {
        // dedup corpus scan + discovery corpus scan, both direct-`then` reads with no insert/maybeSingle.
        return Promise.resolve({ data: [], error: null }).then(res, rej);
      },
    };
  }

  const emptyReadChain = () => ({
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
  });

  return {
    insertedRows: () => inserted,
    forwardEventInserts: () => forwardEventInserts,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "section_claim_provenance") return emptyReadChain();
      if (table === "intelligence_item_sections") return emptyReadChain();
      if (table === "item_forward_events") {
        return {
          insert(rows) {
            forwardEventInserts.push(...rows);
            return { then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); } };
          },
        };
      }
      if (table === "integrity_flags") {
        return { insert() { return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } }; } };
      }
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const baseSeed = { source_url: "https://example.gov/reg/pop-9001", item_type: "regulation", domain: 1, source_id: "src-preset" };

test("plan.grade omitted -> INSERTed row carries item_grade: 'brief' (default, pre-existing callers unaffected)", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, { seed: { ...baseSeed }, origin: "staged_materialization" });
  assert.equal(r.ok, true);
  assert.equal(sb.insertedRows().length, 1);
  assert.equal(sb.insertedRows()[0].item_grade, "brief");
});

test("plan.grade === 'record' -> INSERTed row carries item_grade: 'record'", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, { seed: { ...baseSeed }, origin: "staged_materialization", grade: "record" });
  assert.equal(r.ok, true);
  assert.equal(sb.insertedRows()[0].item_grade, "record");
});

test("a caller-preset seed.item_grade wins over plan.grade (trusted as-is, never overwritten)", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, {
    seed: { ...baseSeed, item_grade: "record" },
    origin: "staged_materialization",
    grade: "brief", // deliberately conflicting — seed's own value must win
  });
  assert.equal(r.ok, true);
  assert.equal(sb.insertedRows()[0].item_grade, "record");
});

test("rule 16 still runs post-insert for a record-grade mint (discovery + forward-event extraction unaffected by grade)", async () => {
  const span = "This Regulation shall enter into force on 1 January 2027.";
  const sb = fakeClient();
  // Route claim rows through the same emptyReadChain override isn't enough for this one test — build a
  // dedicated client so section_claim_provenance returns one obligation-bound FACT claim.
  const inserted = [];
  const forwardEventInserts = [];
  const richClient = {
    insertedRows: () => inserted,
    forwardEventInserts: () => forwardEventInserts,
    from(table) {
      if (table === "intelligence_items") {
        const state = { cols: null };
        return {
          select(cols) { state.cols = cols; return this; },
          eq() { return this; },
          neq() { return this; },
          order() { return this; },
          range() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
          insert(row) {
            inserted.push(row);
            return { select() { return this; }, single: async () => ({ data: { id: "new-item-1" }, error: null }) };
          },
          then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
        };
      }
      if (table === "section_claim_provenance") {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          then(res, rej) {
            return Promise.resolve({
              data: [{ id: "claim-1", claim_kind: "FACT", claim_text: span, source_span: span }],
              error: null,
            }).then(res, rej);
          },
        };
      }
      if (table === "intelligence_item_sections") {
        return { select() { return this; }, eq() { return this; }, then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } };
      }
      if (table === "item_forward_events") {
        return { insert(rows) { forwardEventInserts.push(...rows); return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } }; } };
      }
      if (table === "integrity_flags") {
        return { insert() { return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const r = await mintIntelligenceItem(richClient, { seed: { ...baseSeed }, origin: "staged_materialization", grade: "record" });
  assert.equal(r.ok, true);
  assert.equal(richClient.insertedRows()[0].item_grade, "record");
  const written = richClient.forwardEventInserts();
  assert.equal(written.length, 1, "rule 16(b) forward-event extraction runs identically for a record-grade mint");
  assert.equal(written[0].event_kind, "entry_into_force");
  assert.ok(r.flags.includes("forward-events:1"));
});
