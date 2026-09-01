// @ts-check
// RULE 16 CONFORMANCE (contract v2026-09-01, "the forward-participation clause") — mint-item.ts's own
// post-insert participation in the corpus flywheel. Three behaviors proved here, none covered by
// mint-idempotency/mint-failclosed (both stop at the idempotency short-circuits, before the INSERT):
//   1. a connection-discovery failure records a rule-16(d) integrity_flags defect (never a silent skip)
//   2. forward events are written to item_forward_events when the item's already-grounded claims/
//      sections contain an obligation-bound date (rule 16(b))
//   3. a forward-event-extraction failure ALSO records a rule-16(d) integrity_flags defect
// jiti imports the TS chokepoint (mint-idempotency.npmtest.mjs pattern — @/ alias resolution).
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

/**
 * A full chainable fake of the supabase client, covering every query mint-item.ts issues on a
 * successful mint that reaches the post-insert flywheel blocks: the two idempotency probes, the dedup
 * corpus scan, the mint INSERT itself, the discovery corpus scan, the section_claim_provenance /
 * intelligence_item_sections reads, and inserts into item_forward_events / integrity_flags.
 * `seed.source_id` is always preset by the test plans below, so the source-registry probe (`sources`)
 * is never reached — out of scope for this file (covered elsewhere).
 */
function fakeClient({
  discoveryError = null,
  discoveryRows = [],
  claimRows = [],
  claimError = null,
  sectionRows = [],
  sectionError = null,
  forwardInsertError = null,
  itemId = "new-item-1",
} = {}) {
  const flagInserts = [];
  const forwardEventInserts = [];

  function intelligenceItemsChain() {
    const state = { cols: null };
    return {
      select(cols) { state.cols = cols; return this; },
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      range() { return this; },
      maybeSingle: async () => ({ data: null, error: null }), // both idempotency probes: no existing row
      insert() {
        return {
          select() { return this; },
          single: async () => ({ data: { id: itemId }, error: null }),
        };
      },
      then(res, rej) {
        // Reached directly (no maybeSingle/insert call) by exactly two queries: the dedup corpus scan
        // (short column list) and the discovery corpus scan (CONNECTION_SIGNATURE_COLUMNS).
        if (state.cols === CONNECTION_SIGNATURE_COLUMNS) {
          return Promise.resolve({ data: discoveryError ? null : discoveryRows, error: discoveryError }).then(res, rej);
        }
        return Promise.resolve({ data: [], error: null }).then(res, rej); // dedup corpus: empty, no dup
      },
    };
  }

  function sectionClaimProvenanceChain() {
    return {
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      then(res, rej) {
        return Promise.resolve({ data: claimError ? null : claimRows, error: claimError }).then(res, rej);
      },
    };
  }

  function intelligenceItemSectionsChain() {
    return {
      select() { return this; },
      eq() { return this; },
      then(res, rej) {
        return Promise.resolve({ data: sectionError ? null : sectionRows, error: sectionError }).then(res, rej);
      },
    };
  }

  function itemForwardEventsChain() {
    return {
      insert(rows) {
        forwardEventInserts.push(...rows);
        return { then(res, rej) { return Promise.resolve({ data: null, error: forwardInsertError }).then(res, rej); } };
      },
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
    forwardEventInserts: () => forwardEventInserts,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "section_claim_provenance") return sectionClaimProvenanceChain();
      if (table === "intelligence_item_sections") return intelligenceItemSectionsChain();
      if (table === "item_forward_events") return itemForwardEventsChain();
      if (table === "integrity_flags") return integrityFlagsChain();
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const basePlan = {
  seed: { source_url: "https://example.gov/reg/9001", item_type: "regulation", domain: 1, source_id: "src-preset" },
  origin: "staged_materialization",
};

test("discovery failure -> mint still succeeds, and a rule-16(d) flywheel-defect flag is recorded (never a silent skip)", async () => {
  const sb = fakeClient({ discoveryError: { message: "corpus read timeout" } });
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true, "a discovery failure must never fail the mint");
  assert.equal(r.action, "minted");
  assert.ok(r.flags.includes("discovery-failed"), "flags must name the discovery failure");
  assert.ok(!r.flags.some((f) => f.startsWith("discovery:")), "no discovery:<n> success flag on a failure path");

  const flags = sb.flagInserts();
  const defect = flags.find((f) => f.created_by === "flywheel-defect:discovery");
  assert.ok(defect, "a flywheel-defect:discovery integrity_flags row must be written");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "new-item-1");
  assert.equal(defect.status, "open");
  assert.match(defect.description, /corpus read timeout/, "the caught error message must be recorded verbatim");
});

test("mint with no grounded content yet -> forward-event extraction runs, finds nothing, writes nothing (honest zero, not a skip)", async () => {
  const sb = fakeClient({}); // claimRows/sectionRows both default empty — the common brand-new-mint case
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true);
  assert.equal(sb.forwardEventInserts().length, 0, "nothing to extract from empty claims/sections");
  assert.ok(!r.flags.some((f) => f.startsWith("forward-events")), "no forward-events flag when there is nothing to extract and nothing failed");
});

test("mint with an obligation-bound claim -> forward event is extracted and written to item_forward_events", async () => {
  const span = "This Regulation shall enter into force on 1 January 2027.";
  const sb = fakeClient({
    claimRows: [{ id: "claim-1", claim_kind: "FACT", claim_text: span, source_span: span }],
  });
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true);
  const written = sb.forwardEventInserts();
  assert.equal(written.length, 1, "one obligation-bound date in the claim span -> one event row");
  assert.equal(written[0].intelligence_item_id, "new-item-1");
  assert.equal(written[0].event_date, "2027-01-01");
  assert.equal(written[0].event_kind, "entry_into_force");
  assert.equal(written[0].confidence, "high", "claim-sourced (not section-sourced)");
  assert.equal(written[0].source_claim_id, "claim-1");
  assert.ok(r.flags.includes("forward-events:1"));
});

test("forward-event extraction failure -> mint still succeeds, and a rule-16(d) flywheel-defect flag is recorded", async () => {
  const sb = fakeClient({ claimError: { message: "section_claim_provenance read failed: statement timeout" } });
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true, "an extraction failure must never fail the mint");
  assert.ok(r.flags.includes("forward-events-failed"));
  assert.equal(sb.forwardEventInserts().length, 0, "nothing is written when the read that feeds extraction failed");

  const flags = sb.flagInserts();
  const defect = flags.find((f) => f.created_by === "flywheel-defect:forward-events");
  assert.ok(defect, "a flywheel-defect:forward-events integrity_flags row must be written");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "new-item-1");
  assert.match(defect.description, /statement timeout/);
});

test("item_forward_events insert failure -> recorded as a rule-16(d) defect, mint still succeeds", async () => {
  const span = "shall enter into force on 1 January 2027";
  const sb = fakeClient({
    claimRows: [{ id: "claim-1", claim_kind: "FACT", claim_text: span, source_span: span }],
    forwardInsertError: { message: "duplicate key value violates unique constraint" },
  });
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true);
  assert.ok(r.flags.includes("forward-events-failed"));
  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:forward-events");
  assert.ok(defect);
  assert.match(defect.description, /duplicate key value/);
});

test("discovery success and forward-events success can BOTH be recorded on the same mint (independent try/catch blocks)", async () => {
  const span = "no later than 1 July 2028, Member States shall transpose this Directive";
  const sb = fakeClient({
    discoveryRows: [], // empty corpus -> discoverConnections finds nothing, but the block itself succeeds (no error)
    claimRows: [{ id: "claim-2", claim_kind: "GAP", claim_text: span, source_span: span }],
  });
  const r = await mintIntelligenceItem(sb, basePlan);
  assert.equal(r.ok, true);
  assert.ok(!r.flags.includes("discovery-failed"));
  assert.ok(!r.flags.includes("forward-events-failed"));
  assert.equal(sb.forwardEventInserts().length, 1);
  assert.equal(sb.flagInserts().filter((f) => f.created_by.startsWith("flywheel-defect:")).length, 0, "no defect flags on an all-success mint");
});
