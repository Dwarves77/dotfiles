// @ts-check
// RULE 16 CONFORMANCE, UPDATE PATH (contract v2.2, "the forward-participation clause") —
// apply-staged-update.ts's own update_item participation in the corpus flywheel, mirroring
// mint-forward-participation.npmtest.mjs's coverage of the mint path. Proven here:
//   1. a SUBSTANTIVE update_item (touches a content column) triggers BOTH (a) connection discovery and
//      (b) forward-event extraction
//   2. a status-only update_item (proposed_changes = {status: "..."}) triggers NEITHER — the
//      NON_SUBSTANTIVE_UPDATE_FIELDS boundary
//   3. re-extraction against an item that already carries item_forward_events rows does not duplicate:
//      an already-present row (matched by the migration-275 dedupe key) is skipped, only the genuinely
//      new one is inserted
//   4. a discovery failure and a forward-event-extraction failure are each recorded as a rule-16(d)
//      flywheel-defect integrity_flags row (never a silent skip), exactly like the mint path
//   5. an existing item_forward_events row whose supporting claim/section is gone is flagged
//      "stale-events" (subtype), never deleted
// jiti imports the TS materializer (mint-idempotency.npmtest.mjs / mint-forward-participation.npmtest.mjs
// pattern — @/ alias resolution).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { applyStagedUpdate, isSubstantiveUpdate } = await jiti.import("./apply-staged-update.ts");

const md5 = (s) => createHash("md5").update(String(s ?? ""), "utf8").digest("hex");

/**
 * A full chainable fake of the supabase client, covering every query the update_item path issues on a
 * substantive update that reaches full rule-16 participation: the bare update itself, the discovery
 * re-read + corpus scan (intelligence_items, two different .select() shapes distinguished by whether
 * `.single()` or `.range()` terminates the chain), the section_claim_provenance / intelligence_item_sections
 * reads, the item_forward_events existing-rows read + insert, and integrity_flags inserts.
 */
function fakeClient({
  updateError = null,
  itemRow = { id: "item-1", item_type: "regulation", canonical_instrument_key: null, source_id: "src-1", operational_scenario_tags: [], compliance_object_tags: [], jurisdictions: [], jurisdiction_iso: [], topic_tags: [] },
  itemReadError = null,
  corpusRows = [],
  corpusError = null,
  claimRows = [],
  claimError = null,
  sectionRows = [],
  sectionError = null,
  existingForwardRows = [],
  existingReadError = null,
  forwardInsertError = null,
} = {}) {
  const flagInserts = [];
  const forwardEventInserts = [];
  let updateCalls = 0;

  function intelligenceItemsChain() {
    return {
      update() {
        updateCalls++;
        return {
          eq() {
            return Promise.resolve({ error: updateError });
          },
        };
      },
      select() {
        const chain = {
          eq() { return chain; },
          neq() { return chain; },
          order() { return chain; },
          range() {
            return Promise.resolve({ data: corpusError ? null : corpusRows, error: corpusError });
          },
          single() {
            return Promise.resolve({ data: itemReadError ? null : itemRow, error: itemReadError });
          },
        };
        return chain;
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
      select() {
        return {
          eq() {
            return Promise.resolve({ data: existingReadError ? null : existingForwardRows, error: existingReadError });
          },
        };
      },
      insert(rows) {
        forwardEventInserts.push(...rows);
        return Promise.resolve({ error: forwardInsertError });
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

  // write-edges.mjs's writer (called by runConnectionDiscovery when a corpus item scores a material
  // connection) reads existing item_cross_references once (paginated select), then upserts the writable
  // edges. Empty-corpus tests never reach this table; the tests that DO produce a connection need it
  // stubbed so writeDiscoveredEdges' own read+upsert sequence has somewhere to land.
  const crossRefUpserts = [];
  function itemCrossReferencesChain() {
    return {
      select() {
        return {
          order() {
            return {
              range() {
                return Promise.resolve({ data: [], error: null }); // no pre-existing edges
              },
            };
          },
        };
      },
      upsert(rows) {
        crossRefUpserts.push(...rows);
        return Promise.resolve({ error: null });
      },
    };
  }

  return {
    flagInserts: () => flagInserts,
    forwardEventInserts: () => forwardEventInserts,
    crossRefUpserts: () => crossRefUpserts,
    updateCalls: () => updateCalls,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "section_claim_provenance") return sectionClaimProvenanceChain();
      if (table === "intelligence_item_sections") return intelligenceItemSectionsChain();
      if (table === "item_forward_events") return itemForwardEventsChain();
      if (table === "integrity_flags") return integrityFlagsChain();
      if (table === "item_cross_references") return itemCrossReferencesChain();
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

// ── isSubstantiveUpdate boundary, in isolation (pure, no client needed) ─────────────────────────────────

test("isSubstantiveUpdate: status-only proposed_changes is non-substantive", () => {
  assert.equal(isSubstantiveUpdate({ status: "in_force" }), false);
});

test("isSubstantiveUpdate: a bookkeeping-only combination (status + updated_at) is non-substantive", () => {
  assert.equal(isSubstantiveUpdate({ status: "monitoring", updated_at: "2026-09-01T00:00:00Z" }), false);
});

test("isSubstantiveUpdate: empty/missing proposed_changes is non-substantive", () => {
  assert.equal(isSubstantiveUpdate({}), false);
  assert.equal(isSubstantiveUpdate(null), false);
  assert.equal(isSubstantiveUpdate(undefined), false);
});

test("isSubstantiveUpdate: a content column (title) is substantive, even mixed with a status touch", () => {
  assert.equal(isSubstantiveUpdate({ title: "New title" }), true);
  assert.equal(isSubstantiveUpdate({ status: "in_force", title: "New title" }), true);
});

test("isSubstantiveUpdate: an unrecognized column name defaults to substantive (fail toward running the flywheel)", () => {
  assert.equal(isSubstantiveUpdate({ some_future_column_this_boundary_has_never_seen: true }), true);
});

// ── end-to-end applyStagedUpdate(update_item) behavior ──────────────────────────────────────────────────

test("status-only update_item: the bare update runs, but NEITHER discovery NOR forward-event extraction fires", async () => {
  const sb = fakeClient();
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { status: "in_force" } });
  assert.equal(r.success, true);
  assert.equal(sb.updateCalls(), 1, "the bare intelligence_items update must still happen");
  assert.deepEqual(r.flags, [], "no rule-16 flags on a non-substantive update");
  assert.equal(sb.forwardEventInserts().length, 0);
  assert.equal(sb.flagInserts().length, 0, "no integrity_flags at all — nothing ran, nothing failed");
});

test("substantive update_item (title change): both (a) discovery and (b) forward-event extraction run", async () => {
  const span = "This Regulation shall enter into force on 1 January 2027.";
  const sb = fakeClient({
    claimRows: [{ id: "claim-1", claim_kind: "FACT", claim_text: span, source_span: span }],
    corpusRows: [{ id: "other-item", item_type: "regulation", canonical_instrument_key: null, source_id: "src-1", operational_scenario_tags: [], compliance_object_tags: [], jurisdictions: [], jurisdiction_iso: [], topic_tags: [] }],
  });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { title: "Updated title" } });
  assert.equal(r.success, true);
  assert.equal(sb.updateCalls(), 1);

  // (a) discovery: shared source_id with the one corpus item -> a material connection -> flagged.
  assert.ok(r.flags.some((f) => f.startsWith("discovery:")), `expected a discovery:<n> flag, got ${JSON.stringify(r.flags)}`);

  // (b) forward-events: one obligation-bound date in the claim span -> one event row written.
  const written = sb.forwardEventInserts();
  assert.equal(written.length, 1);
  assert.equal(written[0].intelligence_item_id, "item-1");
  assert.equal(written[0].event_date, "2027-01-01");
  assert.ok(r.flags.includes("forward-events:1"));

  assert.equal(sb.flagInserts().length, 0, "no defect flags on an all-success update");
});

test("re-extraction does not duplicate against the migration-275 dedupe key: an already-present event is skipped, only the new one is inserted", async () => {
  const span1 = "This Regulation shall enter into force on 1 January 2027.";
  const span2 = "By 2030, Member States shall adopt implementing measures.";
  const obligationText1 = "This Regulation shall enter into force on 1 January 2027.";
  const sb = fakeClient({
    claimRows: [
      { id: "claim-1", claim_kind: "FACT", claim_text: span1, source_span: span1 },
      { id: "claim-2", claim_kind: "GAP", claim_text: span2, source_span: span2 },
    ],
    // one of the two events extraction will produce is already present, keyed exactly as migration 275
    // computes it: (event_date, event_kind, md5(obligation_text), coalesce(claim_id, section_id)).
    existingForwardRows: [
      {
        id: "existing-1",
        event_date: "2027-01-01",
        event_kind: "entry_into_force",
        obligation_text: obligationText1,
        source_claim_id: "claim-1",
        source_section_id: null,
      },
    ],
  });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { summary: "Updated summary" } });
  assert.equal(r.success, true);

  const written = sb.forwardEventInserts();
  assert.equal(written.length, 1, "the already-present event must be skipped; only the genuinely new one is inserted");
  assert.equal(written[0].source_claim_id, "claim-2", "the surviving insert is the NEW event, not a re-insert of the existing one");
  assert.ok(r.flags.includes("forward-events:1"));
  assert.ok(!r.flags.some((f) => f === "forward-events-failed"));
});

test("re-extraction where EVERY extracted event already exists: zero rows inserted, no forward-events:<n> flag (nothing new)", async () => {
  const span = "This Regulation shall enter into force on 1 January 2027.";
  const sb = fakeClient({
    claimRows: [{ id: "claim-1", claim_kind: "FACT", claim_text: span, source_span: span }],
    existingForwardRows: [
      { id: "existing-1", event_date: "2027-01-01", event_kind: "entry_into_force", obligation_text: span, source_claim_id: "claim-1", source_section_id: null },
    ],
  });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { summary: "Updated summary" } });
  assert.equal(r.success, true);
  assert.equal(sb.forwardEventInserts().length, 0, "insert is never called when there is nothing new to write");
  assert.ok(!r.flags.some((f) => f.startsWith("forward-events:")), "no forward-events:<n> flag when nothing new was written");
  assert.ok(!r.flags.includes("forward-events-failed"));
});

test("discovery failure on a substantive update -> update still succeeds, and a rule-16(d) flywheel-defect flag is recorded", async () => {
  const sb = fakeClient({ corpusError: { message: "corpus read timeout" } });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { title: "New title" } });
  assert.equal(r.success, true, "a discovery failure must never fail the update");
  assert.ok(r.flags.includes("discovery-failed"));
  assert.ok(!r.flags.some((f) => f.startsWith("discovery:")));

  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:discovery");
  assert.ok(defect, "a flywheel-defect:discovery integrity_flags row must be written");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "item-1");
  assert.equal(defect.status, "open");
  assert.match(defect.description, /corpus read timeout/, "the caught error message must be recorded verbatim");
  assert.match(defect.description, /at update/, "the update-path context must be named, not mint-item.ts's default 'mint' wording");
});

test("forward-event extraction failure on a substantive update -> update still succeeds, and a rule-16(d) flywheel-defect flag is recorded", async () => {
  const sb = fakeClient({ claimError: { message: "section_claim_provenance read failed: statement timeout" } });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { title: "New title" } });
  assert.equal(r.success, true, "an extraction failure must never fail the update");
  assert.ok(r.flags.includes("forward-events-failed"));
  assert.equal(sb.forwardEventInserts().length, 0);

  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:forward-events");
  assert.ok(defect, "a flywheel-defect:forward-events integrity_flags row must be written");
  assert.match(defect.description, /statement timeout/);
});

test("stale-events: an existing item_forward_events row whose claim is gone is flagged, never deleted", async () => {
  const sb = fakeClient({
    // no claims/sections currently ground the item any more (e.g. re-grounding dropped the old claim).
    claimRows: [],
    sectionRows: [],
    existingForwardRows: [
      { id: "stale-1", event_date: "2027-01-01", event_kind: "entry_into_force", obligation_text: "gone", source_claim_id: "claim-that-no-longer-exists", source_section_id: null },
    ],
  });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { title: "New title" } });
  assert.equal(r.success, true);
  assert.ok(r.flags.includes("stale-events:1"));

  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:stale-events");
  assert.ok(defect, "a flywheel-defect:stale-events integrity_flags row must be written");
  assert.match(defect.description, /stale-1/, "the stale row's id must be named");

  // never deleted: no delete() was ever offered/called on the fake item_forward_events chain (it has no
  // delete method at all — a call to it would throw, which the test's overall success:true already rules
  // out for this run).
  assert.equal(sb.forwardEventInserts().length, 0, "nothing new to extract from empty claims/sections");
});

test("discovery success and forward-events success can BOTH be recorded on the same update (independent try/catch blocks)", async () => {
  const span = "no later than 1 July 2028, Member States shall transpose this Directive";
  const sb = fakeClient({
    corpusRows: [],
    claimRows: [{ id: "claim-2", claim_kind: "GAP", claim_text: span, source_span: span }],
  });
  const r = await applyStagedUpdate(sb, { update_type: "update_item", item_id: "item-1", proposed_changes: { why_matters: "Updated rationale" } });
  assert.equal(r.success, true);
  assert.ok(!r.flags.includes("discovery-failed"));
  assert.ok(!r.flags.includes("forward-events-failed"));
  assert.equal(sb.forwardEventInserts().length, 1);
  assert.equal(sb.flagInserts().filter((f) => f.created_by.startsWith("flywheel-defect:")).length, 0, "no defect flags on an all-success update");
});
