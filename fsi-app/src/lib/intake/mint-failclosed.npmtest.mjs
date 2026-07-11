// @ts-check
// MINT FAIL-CLOSED (Wave-α C4) — a READ ERROR during any duplicate-probe must REFUSE the mint, never
// proceed to the single INSERT (CODE-1 F-09: a dropped-error probe read null-ish -> INSERT ran ->
// duplicate mint on a DB hiccup). jiti imports the TS chokepoint (mint-domain-guard.npmtest.mjs pattern).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { mintIntelligenceItem } = await jiti.import("./mint-item.ts");

// A chainable fake of the supabase client. `probeError` fires on the FIRST intelligence_items read
// (the source_url idempotency probe); `insert()` THROWS so any path that reaches the INSERT fails loud.
function fakeClient({ probeError = null, corpusError = null } = {}) {
  let inserted = false;
  const api = {
    insertedFlag: () => inserted,
    from(table) {
      return {
        _table: table,
        select() { return this; },
        eq() { return this; },
        // maybeSingle = the source_url / legacy_id probes
        maybeSingle: async () => ({ data: null, error: probeError }),
        // awaited select().eq() with no maybeSingle = the dedup corpus scan
        then(res) { return Promise.resolve({ data: [], error: corpusError }).then(res); },
        insert() {
          inserted = true;
          throw new Error("INSERT REACHED — mint was not refused (fail-closed violated)");
        },
      };
    },
  };
  return api;
}

const plan = { seed: { source_url: "https://example.gov/reg/1", item_type: "regulation", domain: 1 }, origin: "first_fetch" };

test("probe read error -> mint REFUSED (ok:false), never reaches INSERT", async () => {
  const sb = fakeClient({ probeError: { message: "connection reset" } });
  const r = await mintIntelligenceItem(sb, plan);
  assert.equal(r.ok, false, "mint must be refused on a probe read error");
  assert.match(r.error || "", /fail-closed/i);
  assert.match(r.error || "", /idempotency probe/i);
  assert.equal(sb.insertedFlag(), false, "no INSERT may run on a probe read error");
});

test("dedup corpus read error -> mint REFUSED (ok:false), never reaches INSERT", async () => {
  const sb = fakeClient({ corpusError: { message: "statement timeout" } });
  const r = await mintIntelligenceItem(sb, plan);
  assert.equal(r.ok, false, "mint must be refused on a dedup corpus read error");
  assert.match(r.error || "", /fail-closed/i);
  assert.match(r.error || "", /dedup corpus/i);
  assert.equal(sb.insertedFlag(), false, "no INSERT may run on a dedup corpus read error");
});
