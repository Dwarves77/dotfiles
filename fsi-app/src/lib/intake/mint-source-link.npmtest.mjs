// @ts-check
// GOLDEN (line-read-is-not-verification, RD-14/RD-22): the SOURCE-LINK mint gate (Fix A). Two halves:
//  (1) sourceLinkDecision — the PURE decision (preset / link / reject-unregistered / reject-nourl).
//  (2) mintIntelligenceItem end-to-end — a REGISTERED source links source_id + INSERTs; an UNREGISTERED url
//      REJECTS (action='unsourced') and NEVER reaches the INSERT. jiti imports the TS chokepoint (@/ alias).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem, sourceLinkDecision } = await jiti.import("./mint-item.ts");

// ── (1) the pure decision ──
test("decision: caller-preset source_id → preset (trusted, no resolution)", () => {
  assert.deepEqual(sourceLinkDecision({ source_id: "src-x", source_url: "https://e.gov/r" }, null), { kind: "preset" });
});
test("decision: no source_id + a matched registered source → link", () => {
  assert.deepEqual(sourceLinkDecision({ source_url: "https://e.gov/r" }, "src-1"), { kind: "link", sourceId: "src-1" });
});
test("decision: no source_id + no matched source → reject (register first)", () => {
  const r = sourceLinkDecision({ source_url: "https://e.gov/r" }, null);
  assert.equal(r.kind, "reject");
  assert.match(r.error, /no registered source/i);
});
test("decision: no source_id + no url → reject (cannot mint without a source)", () => {
  const r = sourceLinkDecision({}, null);
  assert.equal(r.kind, "reject");
  assert.match(r.error, /without a source/i);
});

// ── (2) end-to-end mint through the chokepoint ──
// Fake client: idempotency probes miss (new item), sources.in(url) returns `sourcesRows`, dedup corpus empty,
// INSERT captures the seed. insert on intelligence_items records the seed; any OTHER table insert is a no-op.
function fakeClient({ sourcesRows = [] } = {}) {
  let insertedSeed = null;
  return {
    insertedSeed: () => insertedSeed,
    from(table) {
      const st = { table, col: null };
      const q = {
        select() { return this; },
        eq(col) { st.col = col; return this; },
        in() { return this; },
        limit() { return Promise.resolve({ data: table === "sources" ? sourcesRows : [], error: null }); },
        maybeSingle: async () => ({ data: null, error: null }),       // idempotency probes → miss
        single: async () => ({ data: { id: "new-1" }, error: null }), // the INSERT ... .select("id").single()
        insert(seed) {
          if (table === "intelligence_items") { insertedSeed = seed; return q; }
          return Promise.resolve({ data: null, error: null });        // integrity_flags etc — no-op
        },
        upsert() { return { then: (r) => Promise.resolve().then(r) }; },
        then(res) { return Promise.resolve({ data: [], error: null }).then(res); }, // dedup corpus scan → []
      };
      return q;
    },
  };
}

test("mint: REGISTERED source → links source_id onto the seed and INSERTs", async () => {
  const sb = fakeClient({ sourcesRows: [{ id: "src-1" }] });
  const r = await mintIntelligenceItem(sb, { seed: { source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R1056", item_type: "regulation", domain: 1 }, origin: "staged_materialization" });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.itemId, "new-1");
  assert.equal(sb.insertedSeed()?.source_id, "src-1", "the resolved source_id was written onto the inserted seed");
  assert.ok(r.flags.includes("source-linked"));
});

test("mint: UNREGISTERED url → REJECTS with reason, action='unsourced', NO insert", async () => {
  const sb = fakeClient({ sourcesRows: [] });
  const r = await mintIntelligenceItem(sb, { seed: { source_url: "https://unregistered.example/reg", item_type: "regulation", domain: 1 }, origin: "staged_materialization" });
  assert.equal(r.ok, false);
  assert.equal(r.action, "unsourced");
  assert.match(r.error, /no registered source/i);
  assert.equal(sb.insertedSeed(), null, "no INSERT on a source-less mint");
});
