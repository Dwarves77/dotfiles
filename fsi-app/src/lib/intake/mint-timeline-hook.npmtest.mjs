// @ts-check
// RULE 16(f) CONFORMANCE (task 6.1c, ADR-030 "every item carries a timeline date", 2026-09-12).
// mint-item.ts's own post-insert timeline-title-derivation hook: a record item minted with no
// item_timelines row of its own gets a title-derived row when the title's own date is verified against
// the item's own stored capture text (agent_run_searches). Four behaviors proved here, none covered by
// the other mint-*.npmtest.mjs files:
//   1. no captures at all (the common case today for this chokepoint) -> honest no-op, no insert, no flag
//   2. a title date verified against a real capture -> one item_timelines row inserted, flag recorded
//   3. a title date present in the title but NOT found in the capture -> refused, no invented row
//   4. an existing item_timelines row -> the hook never re-derives or re-reads captures
//   5. a read/write failure -> recorded as a rule-16(d) flywheel-defect, mint still succeeds
// jiti imports the TS chokepoint (mint-idempotency.npmtest.mjs pattern -- @/ alias resolution).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

/**
 * A full chainable fake of the supabase client, covering every query mint-item.ts issues on a
 * successful mint that reaches the post-insert flywheel blocks, plus item_timelines/agent_run_searches
 * for THIS hook. `seed.source_id` is always preset by the test plans below, so the source-registry probe
 * is never reached.
 */
function fakeClient({
  itemId = "new-item-1",
  existingTimelineRows = [],
  timelineReadError = null,
  captureRows = [],
  captureReadError = null,
  timelineInsertError = null,
} = {}) {
  const flagInserts = [];
  const timelineInserts = [];

  function intelligenceItemsChain() {
    return {
      select() { return this; },
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      range() { return this; },
      maybeSingle: async () => ({ data: null, error: null }), // idempotency probes: no existing row
      single: async () => ({ data: { compliance_deadline: null }, error: null }),
      update() { return { eq: async () => ({ error: null }) }; },
      insert() {
        return {
          select() { return this; },
          single: async () => ({ data: { id: itemId }, error: null }),
        };
      },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); }, // dedup corpus: empty
    };
  }

  const emptyReadChain = () => ({
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
  });

  function itemTimelinesChain() {
    return {
      select() { return this; },
      eq() { return this; },
      limit() {
        return Promise.resolve({ data: timelineReadError ? null : existingTimelineRows, error: timelineReadError });
      },
      insert(row) {
        timelineInserts.push(row);
        return { then(res, rej) { return Promise.resolve({ data: null, error: timelineInsertError }).then(res, rej); } };
      },
    };
  }

  function agentRunSearchesChain() {
    return {
      select() { return this; },
      eq() { return this; },
      then(res, rej) { return Promise.resolve({ data: captureReadError ? null : captureRows, error: captureReadError }).then(res, rej); },
    };
  }

  function integrityFlagsChain() {
    return {
      insert(row) {
        flagInserts.push(row);
        return { then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); } };
      },
    };
  }

  return {
    flagInserts: () => flagInserts,
    timelineInserts: () => timelineInserts,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "section_claim_provenance") return emptyReadChain();
      if (table === "intelligence_item_sections") return emptyReadChain();
      if (table === "item_forward_events") {
        return { insert(rows) { return { then(res) { return Promise.resolve({ data: null, error: null }).then(res); } }; } };
      }
      if (table === "integrity_flags") return integrityFlagsChain();
      if (table === "item_timelines") return itemTimelinesChain();
      if (table === "agent_run_searches") return agentRunSearchesChain();
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const basePlan = (seedOverrides = {}) => ({
  seed: {
    source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242",
    item_type: "regulation",
    domain: 1,
    source_id: "src-preset",
    title: "Regulation (EU) 2019/1242 of 20 June 2019 setting CO2 emission performance standards",
    ...seedOverrides,
  },
  origin: "staged_materialization",
});

test("no captures at all -> honest no-op: no item_timelines insert, no flag (the common case at this chokepoint today)", async () => {
  const sb = fakeClient({ captureRows: [] });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  assert.equal(sb.timelineInserts().length, 0);
  assert.ok(!r.flags.includes("timeline:title"));
  assert.ok(!r.flags.includes("timeline-failed"));
});

test("title date verified against a real capture -> one item_timelines row inserted, flag recorded", async () => {
  const capturedText =
    "REGULATION (EU) 2019/1242 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL of 20 June 2019 setting CO2 " +
    "emission performance standards for new heavy-duty vehicles. ".repeat(3);
  const sb = fakeClient({ captureRows: [{ result_content: capturedText }] });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  const inserted = sb.timelineInserts();
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].item_id, "new-item-1");
  assert.equal(inserted[0].milestone_date, "2019-06-20");
  assert.equal(inserted[0].label, "Adopted (from the instrument title)");
  assert.equal(inserted[0].is_completed, true);
  assert.equal(inserted[0].sort_order, 0);
  assert.ok(r.flags.includes("timeline:title"));
});

test("title date present but NOT found in the capture -> refused, no invented row", async () => {
  const sb = fakeClient({ captureRows: [{ result_content: "x".repeat(250) + " this capture never states that date at all" }] });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  assert.equal(sb.timelineInserts().length, 0, "never invent a date the capture does not verbatim state");
  assert.ok(!r.flags.includes("timeline:title"));
});

test("existing item_timelines row -> the hook never re-derives or reads captures", async () => {
  const sb = fakeClient({ existingTimelineRows: [{ id: "tl-1" }], captureRows: [{ result_content: "should never be read" }] });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  assert.equal(sb.timelineInserts().length, 0);
  assert.ok(!r.flags.includes("timeline:title"));
});

test("a title with no date token at all -> honest no-op even with a rich capture", async () => {
  const sb = fakeClient({ captureRows: [{ result_content: "x".repeat(250) }] });
  const r = await mintIntelligenceItem(sb, basePlan({ title: "Directive on packaging waste" }));
  assert.equal(r.ok, true);
  assert.equal(sb.timelineInserts().length, 0);
});

test("item_timelines read failure -> recorded as a rule-16(d) flywheel-defect, mint still succeeds", async () => {
  const sb = fakeClient({ timelineReadError: { message: "item_timelines statement timeout" } });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true, "a timeline-hook failure must never fail the mint");
  assert.ok(r.flags.includes("timeline-failed"));
  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:timeline");
  assert.ok(defect, "a flywheel-defect:timeline integrity_flags row must be written");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "new-item-1");
  assert.match(defect.description, /statement timeout/);
});

test("agent_run_searches read failure -> recorded as a rule-16(d) flywheel-defect, mint still succeeds", async () => {
  const sb = fakeClient({ captureReadError: { message: "agent_run_searches connection reset" } });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  assert.ok(r.flags.includes("timeline-failed"));
  assert.equal(sb.timelineInserts().length, 0);
  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:timeline");
  assert.match(defect.description, /connection reset/);
});

test("item_timelines insert failure -> recorded as a rule-16(d) flywheel-defect, mint still succeeds", async () => {
  const capturedText = "Regulation (EU) 2019/1242 of 20 June 2019 setting CO2 emission performance standards. ".repeat(3);
  const sb = fakeClient({ captureRows: [{ result_content: capturedText }], timelineInsertError: { message: "duplicate key value" } });
  const r = await mintIntelligenceItem(sb, basePlan());
  assert.equal(r.ok, true);
  assert.ok(r.flags.includes("timeline-failed"));
  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:timeline");
  assert.match(defect.description, /duplicate key value/);
});
