// @ts-check
// PROOF (Phase R, F6 — plan-intake retired into a dryRun of the ONE mint chokepoint). A dryRun runs EVERY gate
// the real mint runs (idempotency, congruence, dedup, relevance, domain, SOURCE-LINK) and returns the SAME
// disposition, minus the INSERT. Equivalence is proven on the three cases the operator named: a would-mint, a
// dedup rejection, and the SOURCE-LINK-INVARIANT rejection (the exact case the retired planIntakeCycle got
// WRONG — it never modeled source-link, so it reported would_mint where the real mint rejects `unsourced`).
// jiti imports the TS chokepoint (@/ alias). Runs in the *.npmtest.mjs job (after npm ci).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

// Fake client: idempotency probes miss; sources.in(url) returns `sourcesRows`; the dedup corpus scan
// (eq is_archived → awaited) returns `corpus`; INSERT on intelligence_items captures the seed.
function fakeClient({ sourcesRows = [], corpus = [] } = {}) {
  let insertedSeed = null;
  return {
    insertedSeed: () => insertedSeed,
    from(table) {
      const st = { table };
      const q = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        limit() { return Promise.resolve({ data: table === "sources" ? sourcesRows : [], error: null }); },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: "new-1" }, error: null }),
        insert(seed) {
          if (table === "intelligence_items") { insertedSeed = seed; return q; }
          return Promise.resolve({ data: null, error: null });
        },
        upsert() { return { then: (r) => Promise.resolve().then(r) }; },
        then(res) { return Promise.resolve({ data: table === "intelligence_items" ? corpus : [], error: null }).then(res); },
      };
      return q;
    },
  };
}

// Run the SAME candidate through real and dry (fresh clients), return both results + whether each inserted.
async function bothModes(cfg, seed) {
  const realSb = fakeClient(cfg);
  const real = await mintIntelligenceItem(realSb, { seed, origin: "staged_materialization" });
  const drySb = fakeClient(cfg);
  const dry = await mintIntelligenceItem(drySb, { seed, origin: "staged_materialization" }, { dryRun: true });
  return { real, dry, realInserted: realSb.insertedSeed() != null, dryInserted: drySb.insertedSeed() != null };
}

test("F6 would_mint: dry decision == real decision; real INSERTs, dry does NOT", async () => {
  const { real, dry, realInserted, dryInserted } = await bothModes(
    {},
    { source_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32099R9999", item_type: "regulation", domain: 1, source_id: "preset-src" },
  );
  assert.equal(real.ok, true, real.error);
  assert.equal(dry.ok, real.ok, "dry ok must equal real ok");
  assert.equal(dry.action, real.action, "dry action must equal real action");
  assert.equal(dry.dryRun, true);
  assert.equal(realInserted, true, "real mint INSERTs");
  assert.equal(dryInserted, false, "dryRun never INSERTs");
});

test("F6 dedup reject: dry decision == real decision (duplicate); NEITHER inserts", async () => {
  const corpus = [{ id: "exist-1", title: "Regulation (EU) 2020/1056 eFTI", instrument_identifier: "2020/1056", source_url: "https://x.example/a" }];
  const { real, dry, realInserted, dryInserted } = await bothModes(
    { corpus },
    { title: "eFTI 2020/1056 re-scan", source_url: "https://eur-lex.europa.eu/eli/reg/2020/1056/oj", instrument_identifier: "2020/1056", item_type: "regulation", domain: 1, source_id: "preset-src" },
  );
  assert.equal(real.ok, false);
  assert.equal(real.action, "duplicate");
  assert.equal(dry.ok, real.ok, "dry ok must equal real ok");
  assert.equal(dry.action, real.action, "dry action must equal real action");
  assert.equal(dry.error, real.error, "dry reason must equal real reason");
  assert.match(dry.error, /subject already exists/i);
  assert.equal(realInserted, false);
  assert.equal(dryInserted, false);
});

test("F6 source-link reject (the case the old planner got WRONG): dry == real == unsourced; NEITHER inserts", async () => {
  const { real, dry, realInserted, dryInserted } = await bothModes(
    { sourcesRows: [] }, // no registered source for the url, and no preset source_id
    { title: "Unsourced reg", source_url: "https://unregistered.example/reg", item_type: "regulation", domain: 1 },
  );
  assert.equal(real.ok, false);
  assert.equal(real.action, "unsourced");
  assert.equal(dry.ok, false, "dry must REJECT — plan-intake reported would_mint here (the drift F6 closes)");
  assert.equal(dry.action, real.action);
  assert.equal(dry.error, real.error);
  assert.match(dry.error, /no registered source/i);
  assert.equal(realInserted, false);
  assert.equal(dryInserted, false);
});
