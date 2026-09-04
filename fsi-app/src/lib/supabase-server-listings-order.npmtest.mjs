// FIRSTPAGE lane (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §14): pins
// buildWorkspaceItemsQuery's contract — the exact bug/fix pair described in its own header comment
// in supabase-server.ts. The live defect [CONFIRMED, read-only SQL against the production DB,
// 2026-09-04]: chaining an outer `.order("added_date", desc).order("id", asc)` onto the paged
// `get_workspace_intelligence_listings` call discarded the RPC's own internal
// `CASE effective_priority ... END, added_date DESC, id ASC` order (migration 272, live-confirmed
// via pg_get_functiondef) and left the /regulations first page 100% MODERATE-band rows with zero of
// the 13 CRITICAL / 30 HIGH rows a reader opens the page for.
//
// This test proves the fix at the query-builder level, RPC name by RPC name:
//  - `get_workspace_intelligence_listings` (the fixed one, its own ORDER BY ends in a unique `id`
//    tiebreak): page mode chains `.range()` only, no `.order()` call at all, so the RPC's internal
//    order survives.
//  - `get_workspace_intelligence_slim` (/operations + /market first-paint pagination): since migration
//    303 (SLIM-ORDER lane, applied live 2026-09-04) its own ORDER BY ends in the same `ii.id ASC`
//    tiebreak, so it is allowlisted too and paginates with `.range()` only. Before 303 it kept the
//    outer order (no tiebreak of its own, page-boundary duplicates otherwise); that state is history.
//  - Unpaged mode is unchanged for any RPC name (bare `.rpc()` result, matching the pre-existing
//    "omitted = unpaged, unbounded" contract ResourcePage's own doc comment states).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { buildWorkspaceItemsQuery } = await jiti.import("./supabase-server.ts");

/** Fake service client that records every method PostgREST chain call made on the RPC builder,
 *  so the test can assert the EXACT chain shape (which calls happened, in what order, with what
 *  args) rather than just the final query's semantics. Terminal call resolves to a stub "rows"
 *  sentinel so a caller could `await` it if it wanted to, matching a real PostgREST thenable
 *  without needing a real client. */
function fakeServiceClient() {
  const calls = [];
  function chain(methodTrail) {
    return {
      order(...args) {
        calls.push({ method: "order", args, methodTrail });
        return chain([...methodTrail, "order"]);
      },
      range(...args) {
        calls.push({ method: "range", args, methodTrail });
        return chain([...methodTrail, "range"]);
      },
      then(resolve) {
        resolve({ data: [], error: null });
      },
    };
  }
  return {
    calls,
    rpc(name, args) {
      calls.push({ method: "rpc", args: [name, args], methodTrail: [] });
      return chain(["rpc"]);
    },
  };
}

// ── get_workspace_intelligence_listings (the fixed RPC — /regulations) ──────────────────────────

test("listings + page: chains .rpc().range() only — no .order() call anywhere in the chain", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_listings", "org-1", {
    limit: 60,
    offset: 0,
  });
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc", "range"], "must be exactly rpc() then range(), nothing else");
  assert.equal(
    client.calls.filter((c) => c.method === "order").length,
    0,
    "no .order() call — see header comment for why: it would discard the RPC's own priority-band CASE rank"
  );
});

test("listings + page: .range() receives the correct offset/limit-derived bounds", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_listings", "org-1", {
    limit: 60,
    offset: 120,
  });
  const rangeCall = client.calls.find((c) => c.method === "range");
  assert.deepEqual(rangeCall.args, [120, 179]); // offset, offset + limit - 1
});

test("listings, no page: bare .rpc() result, unpaged/unbounded — no .order(), no .range()", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_listings", "org-1", undefined);
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc"], "omitted page must stay exactly the pre-existing unpaged contract");
});

test("listings + page: zero offset/limit still range()s (page=0-length is still a page, not 'no page')", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_listings", "org-1", { limit: 1, offset: 0 });
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc", "range"]);
  const rangeCall = client.calls.find((c) => c.method === "range");
  assert.deepEqual(rangeCall.args, [0, 0]);
});

test(".rpc() is always called with the exact rpcName and p_org_id passed through, for any RPC name", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_listings", "org-42", { limit: 10, offset: 0 });
  const rpcCall = client.calls.find((c) => c.method === "rpc");
  assert.deepEqual(rpcCall.args, ["get_workspace_intelligence_listings", { p_org_id: "org-42" }]);
});

// ── get_workspace_intelligence_slim (/operations, /market) — migration 303 (SLIM-ORDER lane,
// applied live 2026-09-04, post md5 3ca10db08f84c019c9fa0e16bfe3b49b) gave its own ORDER BY the
// `ii.id ASC` tiebreak, and the allowlist gained the name in the same train, so it paginates the
// same way as listings: `.range()` only, the RPC's priority-band rank survives. A failure here means
// the outer order came back and /operations + /market lost their band rank again. ────────────────

test("slim + page: with migration 303 live, chains .rpc().range() only — no .order() call, the RPC's own order survives", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_slim", "org-1", { limit: 60, offset: 0 });
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc", "range"], "must be exactly rpc() then range(), no .order() calls");
  const rangeCall = client.calls.find((c) => c.method === "range");
  assert.deepEqual(rangeCall.args, [0, 59]);
});

test("slim, no page: bare .rpc() result, same unpaged contract as every other RPC name", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence_slim", "org-1", undefined);
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc"]);
});

// ── any other RPC name (get_workspace_intelligence full, _dashboard — never paginated in practice,
// but the guard set is a strict allowlist, not a denylist, so an unknown name must fail SAFE into
// the pre-existing outer-order behavior, not silently drop ordering) ────────────────────────────

test("unknown/non-allowlisted RPC name + page: falls back to the safe pre-existing outer order, same as slim", () => {
  const client = fakeServiceClient();
  buildWorkspaceItemsQuery(client, "get_workspace_intelligence", "org-1", { limit: 5, offset: 0 });
  const methods = client.calls.map((c) => c.method);
  assert.deepEqual(methods, ["rpc", "order", "order", "range"]);
});

