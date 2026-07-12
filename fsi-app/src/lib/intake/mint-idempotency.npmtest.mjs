// @ts-check
// MINT IDEMPOTENCY SHORT-CIRCUITS (line-read-is-not-verification, RD-14). The POSITIVE half of the
// idempotency contract: a source_url or legacy_id that already exists returns the EXISTING item
// (action='exists') and NEVER reaches the single INSERT — no duplicate mint. The fail-closed read-error
// half lives in mint-failclosed.npmtest.mjs. jiti imports the TS chokepoint (@/ alias resolution).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

// Chainable fake supabase client. `existingBySourceUrl` / `existingByLegacyId` are returned by the
// respective maybeSingle probe (keyed on the eq() column). insert() THROWS so any path reaching the
// single INSERT fails loud — proving the short-circuit returned first.
function fakeClient({ existingBySourceUrl = null, existingByLegacyId = null } = {}) {
  let inserted = false;
  return {
    insertedFlag: () => inserted,
    from() {
      let lastCol = null;
      const q = {
        select() { return this; },
        eq(col) { lastCol = col; return this; },
        maybeSingle: async () => {
          if (lastCol === "source_url") return { data: existingBySourceUrl, error: null };
          if (lastCol === "legacy_id") return { data: existingByLegacyId, error: null };
          return { data: null, error: null };
        },
        then(res) { return Promise.resolve({ data: [], error: null }).then(res); }, // dedup corpus scan (unused on short-circuit)
        insert() { inserted = true; throw new Error("INSERT REACHED — idempotency short-circuit failed"); },
      };
      return q;
    },
  };
}

test("source_url already exists → returns existing item (action='exists'), NO insert", async () => {
  const sb = fakeClient({ existingBySourceUrl: { id: "existing-src" } });
  const r = await mintIntelligenceItem(sb, { seed: { source_url: "https://example.gov/reg/1", item_type: "regulation", domain: 1 }, origin: "staged_materialization" });
  assert.equal(r.ok, true);
  assert.equal(r.itemId, "existing-src");
  assert.equal(r.action, "exists");
  assert.equal(sb.insertedFlag(), false, "no INSERT on a source_url idempotency hit");
});

test("legacy_id already exists (source_url misses) → returns existing item, NO insert", async () => {
  const sb = fakeClient({ existingBySourceUrl: null, existingByLegacyId: { id: "existing-leg" } });
  const r = await mintIntelligenceItem(sb, { seed: { source_url: "https://example.gov/reg/2", item_type: "regulation", domain: 1 }, legacyId: "leg-9", origin: "staged_materialization" });
  assert.equal(r.ok, true);
  assert.equal(r.itemId, "existing-leg");
  assert.equal(r.action, "exists");
  assert.equal(sb.insertedFlag(), false, "no INSERT on a legacy_id idempotency hit");
});
