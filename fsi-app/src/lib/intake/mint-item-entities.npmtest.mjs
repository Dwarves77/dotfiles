// @ts-check
// RULE 16(e) CONFORMANCE (lane W9 part 1, task 1.1, 2026-09-11) -- mint-item.ts's own post-insert
// participation in the entity spine (migration 282/283), the same "connected at birth" posture rule
// 16(a)/(b) already proved for discovery/forward-events in mint-forward-participation.npmtest.mjs. This
// file proves the FOURTH participant: a mint carrying jurisdiction_iso writes an entity_refs row and
// surfaces an `entities:<n>` flag, and a linkItemEntities failure records a rule-16(d) defect instead of
// failing the mint -- never a silent skip.
//
// jiti imports the TS chokepoint (same pattern as mint-forward-participation.npmtest.mjs). The
// "entities" / "entity_refs" / "entity_identifiers" tables are served by the SAME injected fake
// (src/test-support/fake-supabase.mjs) link-item-entities.test.mjs uses directly -- composed here inside
// a larger fakeClient that ALSO answers every other query a successful mint issues (idempotency probes,
// dedup scan, the INSERT, discovery/forward-events/compliance-deadline reads), so linkItemEntities runs
// inside a real end-to-end mint, not in isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { fakeSupabase } from "../../test-support/fake-supabase.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

const CONNECTION_SIGNATURE_COLUMNS =
  "id, item_type, canonical_instrument_key, source_id, operational_scenario_tags, compliance_object_tags, jurisdictions, jurisdiction_iso, topic_tags";

/**
 * Same shape as mint-forward-participation.npmtest.mjs's fakeClient, plus "entities" / "entity_refs" /
 * "entity_identifiers" delegated to a fresh fakeSupabase() spine so linkItemEntities's real read/write
 * chain (`.select().in()`, `.select().eq().eq()`, `.upsert()`) runs against real (in-memory) state.
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
  entitySpineSeed = { entities: [], entity_refs: [], entity_identifiers: [] },
} = {}) {
  const flagInserts = [];
  const forwardEventInserts = [];
  const entitySpine = fakeSupabase(entitySpineSeed);

  function intelligenceItemsChain() {
    const state = { cols: null };
    return {
      select(cols) { state.cols = cols; return this; },
      eq() { return this; },
      neq() { return this; },
      order() { return this; },
      range() { return this; },
      maybeSingle: async () => ({ data: null, error: null }), // both idempotency probes: no existing row
      single: async () => ({ data: { compliance_deadline: null }, error: null }),
      update() {
        return { eq: async () => ({ error: null }) };
      },
      insert() {
        return {
          select() { return this; },
          single: async () => ({ data: { id: itemId }, error: null }),
        };
      },
      then(res, rej) {
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
      select() {
        return { eq: () => ({ error: null, data: [] }) };
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

  // task 6.1c rule 16(f)'s own probes: no prior timeline row, no captures -- honest "nothing to derive
  // from" (the hook's own npmtest covers the hit path).
  const emptyReadChain = () => ({
    select() { return this; },
    eq() { return this; },
    limit() { return Promise.resolve({ data: [], error: null }); },
    then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); },
  });

  return {
    flagInserts: () => flagInserts,
    forwardEventInserts: () => forwardEventInserts,
    entitySpine,
    from(table) {
      if (table === "intelligence_items") return intelligenceItemsChain();
      if (table === "section_claim_provenance") return sectionClaimProvenanceChain();
      if (table === "intelligence_item_sections") return intelligenceItemSectionsChain();
      if (table === "item_forward_events") return itemForwardEventsChain();
      if (table === "integrity_flags") return integrityFlagsChain();
      if (table === "entities" || table === "entity_refs" || table === "entity_identifiers") return entitySpine.from(table);
      if (table === "item_timelines" || table === "agent_run_searches") return emptyReadChain();
      throw new Error(`fakeClient: unexpected table ${table}`);
    },
  };
}

const basePlanFR = {
  seed: { source_url: "https://example.gov/reg/9002", item_type: "regulation", domain: 1, source_id: "src-preset", jurisdiction_iso: ["FR"] },
  origin: "staged_materialization",
};

test("mint with jurisdiction_iso writes an entity_refs row and surfaces entities:<n>", async () => {
  const sb = fakeClient();
  const r = await mintIntelligenceItem(sb, basePlanFR);
  assert.equal(r.ok, true);
  assert.equal(r.action, "minted");
  assert.ok(r.flags.includes("entities:1"), `expected entities:1 in flags, got ${JSON.stringify(r.flags)}`);
  assert.equal(sb.entitySpine.tables.entity_refs.length, 1);
  assert.equal(sb.entitySpine.tables.entity_refs[0].ref_table, "intelligence_items");
  assert.equal(sb.entitySpine.tables.entity_refs[0].ref_id, "new-item-1");
  assert.ok(!r.flags.includes("entities-failed"));
});

test("mint with no jurisdiction and no instrument key writes no entity_refs row and no entities flag", async () => {
  const sb = fakeClient();
  const plan = { ...basePlanFR, seed: { ...basePlanFR.seed, jurisdiction_iso: undefined } };
  const r = await mintIntelligenceItem(sb, plan);
  assert.equal(r.ok, true);
  assert.equal(sb.entitySpine.tables.entity_refs.length, 0);
  assert.ok(!r.flags.some((f) => f.startsWith("entities")));
});

test("linkItemEntities failure -> mint still succeeds, a rule-16(d) flywheel-defect flag is recorded", async () => {
  const sb = fakeClient();
  // Force linkItemEntities to throw: the "entities" table read errors, the same class of injected
  // failure mint-forward-participation.npmtest.mjs uses for discovery/forward-events.
  const realFrom = sb.from.bind(sb);
  sb.from = (table) => {
    if (table === "entities") {
      return { select: () => ({ in: () => { throw new Error("entities read failed: simulated"); } }) };
    }
    return realFrom(table);
  };
  const r = await mintIntelligenceItem(sb, basePlanFR);
  assert.equal(r.ok, true, "an entity-linking failure must never fail the mint");
  assert.ok(r.flags.includes("entities-failed"));
  const defect = sb.flagInserts().find((f) => f.created_by === "flywheel-defect:entities");
  assert.ok(defect, "a flywheel-defect:entities integrity_flags row must be written");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "new-item-1");
  assert.match(defect.description, /simulated/);
});
