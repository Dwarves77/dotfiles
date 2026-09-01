// @ts-check
// MINT-TIME CONNECTION DISCOVERY (flywheel U4 — L1 incremental, closes the growth loop). The
// moat-boundary test pattern: assert the discovery scan writes land ONLY in item_cross_references
// (never intelligence_items again, never claims/provenance), that it's non-fatal (a scan failure never
// fails the mint), and that it reuses discover.mjs's real scoring (not a stub) — same signals the
// backfill (A2) already proved. jiti imports the TS chokepoint (@/ alias resolution).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

// Chainable fake supabase client covering every table mint-item.ts touches on a clean mint path:
// intelligence_items (idempotency probes → miss, dedup-corpus scan → empty, corpus-signature scan →
// `corpusRows`, the single INSERT), sources (registry probe → `sourcesRows`), item_cross_references
// (write-edges.mjs's existing-edges read → `existingEdges`, then the upsert). `writesLog` records every
// insert/upsert by table so the moat-boundary assertion has ground truth, not an inference.
function fakeClient({ corpusRows = [], existingEdges = [], sourcesRows = [{ id: "src-1" }], corpusReadError = null } = {}) {
  const writesLog = [];
  let insertedSeed = null;
  return {
    insertedSeed: () => insertedSeed,
    writesLog: () => writesLog,
    from(table) {
      let col = null;
      const q = {
        select() { return this; },
        eq(c) { col = c; return this; },
        neq() { return this; },
        in() { return this; },
        order() { return this; },
        range() {
          if (table === "intelligence_items") {
            if (corpusReadError) return Promise.resolve({ data: null, error: { message: corpusReadError } });
            return Promise.resolve({ data: corpusRows, error: null });
          }
          if (table === "item_cross_references") return Promise.resolve({ data: existingEdges, error: null });
          return Promise.resolve({ data: [], error: null });
        },
        limit() {
          if (table === "sources") return Promise.resolve({ data: sourcesRows, error: null });
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle: async () => ({ data: null, error: null }), // idempotency probes → miss (fresh mint)
        single: async () => ({ data: { id: "new-1" }, error: null }), // the INSERT ... .select("id").single()
        insert(row) {
          if (table === "intelligence_items") { insertedSeed = row; return q; } // chainable: .select().single()
          writesLog.push({ table, op: "insert", rows: [row] });
          return Promise.resolve({ data: null, error: null });
        },
        upsert(rows) {
          writesLog.push({ table, op: "upsert", rows: Array.isArray(rows) ? rows : [rows] });
          return Promise.resolve({ error: null });
        },
        // dedup-corpus scan (`.select(...).eq("is_archived", false)`, awaited directly, no terminal call)
        then(res) {
          if (table === "intelligence_items" && col === "is_archived") return Promise.resolve({ data: [], error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return q;
    },
  };
}

const seed = (overrides = {}) => ({
  source_url: "https://example.gov/reg/new",
  item_type: "regulation",
  domain: 1,
  operational_scenario_tags: ["dangerous-goods-transport-road"],
  ...overrides,
});

test("mint: corpus shares provenance with the new item → discovers edges, writes ONLY item_cross_references", async () => {
  // fakeClient's default sourcesRows resolves the new item's source_id to "src-1" (Fix A source-link);
  // the corpus row shares that source_id, so the shared_source signal (weight 0.4) fires and clears the
  // 0.3 discovery threshold — same signal discover.mjs actually emits, not the removed key-equality one.
  const sb = fakeClient({
    corpusRows: [{ id: "existing-1", item_type: "market_signal", source_id: "src-1" }],
  });
  const r = await mintIntelligenceItem(sb, { seed: seed(), origin: "staged_materialization" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.itemId, "new-1");
  assert.ok(r.flags.some((f) => f.startsWith("discovery:")), `expected a discovery: flag, got ${r.flags.join(",")}`);

  const edgeWrites = sb.writesLog().filter((w) => w.table === "item_cross_references");
  assert.equal(edgeWrites.length, 1, "exactly one upsert to item_cross_references");
  const [written] = edgeWrites[0].rows;
  assert.equal(written.source_item_id, "new-1");
  assert.equal(written.target_item_id, "existing-1");
  assert.equal(written.origin, "provenance_discovery");
  assert.ok(written.basis.some((b) => b.signal === "shared_source"), "grounded in the real shared source, not invented");

  // MOAT BOUNDARY: no write reaches any table besides item_cross_references — no claims/provenance touch.
  const otherTableWrites = sb.writesLog().filter((w) => w.table !== "item_cross_references");
  assert.deepEqual(otherTableWrites, [], "discovery must never write outside item_cross_references");
});

test("mint: no corpus overlap → mint succeeds, no discovery flag, no edge write", async () => {
  // Different source_id and no shared operational_scenario_tags → no basis at all (not just a weak one).
  const sb = fakeClient({
    corpusRows: [{ id: "unrelated-1", item_type: "research_finding", source_id: "src-other", operational_scenario_tags: ["unrelated-tag"] }],
  });
  const r = await mintIntelligenceItem(sb, { seed: seed(), origin: "staged_materialization" });
  assert.equal(r.ok, true, r.error);
  assert.ok(!r.flags.some((f) => f.startsWith("discovery:")), "no shared basis → no discovery flag");
  assert.deepEqual(sb.writesLog(), [], "no basis found → nothing written to item_cross_references");
});

test("mint: corpus-signature read fails → discovery is non-fatal, the mint still succeeds, and rule 16(d) records the defect (never a silent skip)", async () => {
  const sb = fakeClient({ corpusReadError: "connection reset (simulated)" });
  const r = await mintIntelligenceItem(sb, { seed: seed(), origin: "staged_materialization" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.itemId, "new-1");
  assert.ok(!r.flags.some((f) => f.startsWith("discovery:")), "a scan failure must not fabricate a discovery: success flag");
  assert.ok(r.flags.includes("discovery-failed"), "the failure itself must be named in flags");

  // MOAT BOUNDARY, unchanged: a scan failure must never attempt an item_cross_references edge write.
  const edgeWrites = sb.writesLog().filter((w) => w.table === "item_cross_references");
  assert.deepEqual(edgeWrites, [], "a scan failure must not attempt an edge write");

  // RULE 16(d) (contract v2026-09-01): this is the class fix for the pre-rule-16 posture this test used
  // to assert (a bare empty-catch swallow) — a discovery failure is now a RECORDED integrity_flags
  // defect, not a silent skip.
  const flagWrites = sb.writesLog().filter((w) => w.table === "integrity_flags");
  assert.equal(flagWrites.length, 1, "exactly one integrity_flags row recording the discovery defect");
  const [defect] = flagWrites[0].rows;
  assert.equal(defect.created_by, "flywheel-defect:discovery");
  assert.equal(defect.subject_type, "item");
  assert.equal(defect.subject_ref, "new-1");
  assert.equal(defect.status, "open");
  assert.match(defect.description, /connection reset \(simulated\)/);

  // Nothing reaches any OTHER table besides item_cross_references (still zero, correctly) and
  // integrity_flags (the one legitimate rule-16(d) write) — no claims/provenance touch either way.
  const otherWrites = sb.writesLog().filter((w) => w.table !== "item_cross_references" && w.table !== "integrity_flags");
  assert.deepEqual(otherWrites, [], "a scan failure must write nowhere except the rule-16(d) defect flag");
});
