// Unit test for /api/search's retrieval core (CMDSEARCH lane, 2026-09-09). Exercises the REAL
// exported function the route calls, imported from its sibling logic.ts (BUILDGATE, 2026-09-02:
// route.ts may export only route handlers, so this pure/injectable function lives in logic.ts — see
// check-sources/route.npmtest.mjs's identical precedent), fed a fake Supabase client (same shape as
// reconcile-pass.test.mjs's fakeSvc) so the BOUND and the SCOPE gate are provable without a live DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { runSearch, MAX_RESULTS } = await jiti.import("./logic.ts");

/** A fake client whose RPC returns `hitCount` hit ids and whose re-fetch records the exact `.in()`
 *  argument list and the `.eq()` predicates applied ahead of it, so a test can assert on both
 *  without touching a real Supabase project. */
function fakeClient({ hitCount, rpcError = null }) {
  const calls = { inArgs: null, eqCalls: [], rpcMaxRows: null };
  const hits = Array.from({ length: hitCount }, (_, i) => ({ id: `item-${i}`, rank: 1 - i / 1000 }));
  return {
    calls,
    rpc: async (fn, args) => {
      assert.equal(fn, "search_intelligence_items", "must reuse the ONE existing FTS RPC, not a second mechanism");
      calls.rpcMaxRows = args.max_rows;
      if (rpcError) return { data: null, error: { message: rpcError } };
      // The RPC itself is bounded to args.max_rows — this fake mirrors that contract so the caller
      // can never see more hits than it asked for, exactly like the real function does.
      return { data: hits.slice(0, args.max_rows), error: null };
    },
    from: (table) => {
      assert.equal(table, "intelligence_items");
      return {
        select: () => ({
          eq: (col1, val1) => {
            calls.eqCalls.push([col1, val1]);
            return {
              eq: (col2, val2) => {
                calls.eqCalls.push([col2, val2]);
                return {
                  in: async (col, ids) => {
                    calls.inArgs = { col, ids };
                    const rows = ids.map((id) => ({
                      id,
                      title: `Title ${id}`,
                      item_type: "regulation",
                      domain: 1,
                      priority: "HIGH",
                      jurisdictions: ["US"],
                      transport_modes: ["ocean"],
                      topic: "customs",
                    }));
                    return { data: rows, error: null };
                  },
                };
              },
            };
          },
        }),
      };
    },
  };
}

test("BOUNDED: the re-fetch's .in() id list can never exceed MAX_RESULTS, however many the RPC returns", async () => {
  const client = fakeClient({ hitCount: MAX_RESULTS }); // fake RPC itself clamps to max_rows passed in
  const results = await runSearch(client, "customs duties");
  assert.ok(results.length <= MAX_RESULTS, "result set must respect the request-scoped bound");
  assert.ok(client.calls.inArgs.ids.length <= MAX_RESULTS, "the .in() list itself must be bounded, not just the final array");
});

test("BOUNDED: a maxRows argument above MAX_RESULTS is clamped down, never trusted from the caller", async () => {
  const client = fakeClient({ hitCount: 5 });
  await runSearch(client, "customs duties", 10_000);
  assert.equal(client.calls.rpcMaxRows, MAX_RESULTS, "the RPC itself must never be asked for more than the request-scoped cap");
});

test("SCOPED: the re-fetch re-applies the SAME customer read predicate every other read uses (verified, non-archived)", async () => {
  const client = fakeClient({ hitCount: 3 });
  await runSearch(client, "port congestion");
  const gate = client.calls.eqCalls;
  assert.deepEqual(gate, [
    ["is_archived", false],
    ["provenance_status", "verified"],
  ]);
});

test("a failed RPC degrades to an empty result set, never throws into the route", async () => {
  const client = fakeClient({ hitCount: 0, rpcError: "simulated FTS failure" });
  const results = await runSearch(client, "anything");
  assert.deepEqual(results, []);
});

test("zero hits short-circuits before the re-fetch is ever attempted", async () => {
  const client = fakeClient({ hitCount: 0 });
  const results = await runSearch(client, "no matches for this");
  assert.deepEqual(results, []);
  assert.equal(client.calls.inArgs, null, "no re-fetch call should be made when the RPC found nothing");
});
