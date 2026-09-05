// supabase-server-category-rpc-paging.test.mjs — CAP-1000 (2026-09-05, "two defects one cause" audit).
//
// runCategoryRpc/runCategoryRpcPublic used to call their RPC with NO .range()/.limit() at all — a bare
// `serviceClient.rpc(name, args)`. PostgREST's db-max-rows setting caps that response at 1000 rows
// regardless (the exact bug class PERF-13's slug enumeration and the obligations register's
// OVERFETCH_CAP both tripped). Same source-text-proof rationale as supabase-server-rpc-scope.test.mjs
// right above this file in the tree: supabase-server.ts imports `next/cache` (unstable_cache), which
// only resolves inside Next's own module graph, so this is a source-text proof, not a live import; tsc
// (run separately) proves it compiles.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = dirname(fileURLToPath(import.meta.url));
const CODE = readFileSync(join(SRC, "supabase-server.ts"), "utf8");

test("fetchAllCategoryRows pages via fetchAllRows + .range(), not a single unranged rpc() call", () => {
  const m = CODE.match(/async function fetchAllCategoryRows\(([\s\S]*?)\n\}/);
  assert.ok(m, "fetchAllCategoryRows not found");
  const body = m[1];
  assert.match(body, /fetchAllRows\(/, "must delegate to the shared fetchAllRows helper");
  assert.match(body, /serviceClient\.rpc\(rpcName, rpcArgs\)\.range\(from, to\)/, "each page must chain .range(from, to) onto the rpc() call");
});

test("fetchAllRows is imported from the shared paginate.mjs helper — no second copy of the range-walk", () => {
  assert.match(
    CODE,
    /import\s*\{\s*fetchAllRows\s*\}\s*from\s*"@\/lib\/db\/paginate\.mjs";/,
    "supabase-server.ts must import fetchAllRows from @/lib/db/paginate.mjs"
  );
});

test("runCategoryRpc (org-scoped) routes through fetchAllCategoryRows, not a bare serviceClient.rpc() call", () => {
  const m = CODE.match(/async function runCategoryRpc\(([\s\S]*?)\n\}/);
  assert.ok(m, "runCategoryRpc not found");
  const body = m[1];
  assert.match(body, /fetchAllCategoryRows\(serviceClient, rpcName, \{ p_org_id: orgId \}\)/);
  assert.doesNotMatch(
    body,
    /const \{ data: rows, error \} = await serviceClient\.rpc/,
    "runCategoryRpc must not call serviceClient.rpc() directly — that was the unranged, cap-vulnerable call this fix removes"
  );
});

test("runCategoryRpcPublic routes through fetchAllCategoryRows, not a bare serviceClient.rpc() call", () => {
  const m = CODE.match(/async function runCategoryRpcPublic\(([\s\S]*?)\n\}/);
  assert.ok(m, "runCategoryRpcPublic not found");
  const body = m[1];
  assert.match(body, /fetchAllCategoryRows\(serviceClient, rpcName, \{\}\)/);
  assert.doesNotMatch(
    body,
    /const \{ data: rows, error \} = await serviceClient\.rpc/,
    "runCategoryRpcPublic must not call serviceClient.rpc() directly — that was the unranged, cap-vulnerable call this fix removes"
  );
});

test("all four category RPCs' live SQL end their ORDER BY with the id ASC tiebreak fetchAllRows' offset-paging contract requires", () => {
  // [CONFIRMED, Supabase MCP pg_get_functiondef, 2026-09-05] — re-asserted here as a source-text check
  // against the migration files so a future edit to any of these five functions cannot silently drop
  // the tiebreak without a red test: fetchAllRows' own header names this a hard paging-correctness
  // requirement ("ties in an undefined order that varies per page query... offset paging silently
  // SKIPS/duplicates rows").
  const orgScoped = readFileSync(join(SRC, "../../supabase/migrations/272_customer_rpcs_project_jurisdiction_iso.sql"), "utf8");
  const pub = readFileSync(join(SRC, "../../supabase/migrations/306_public_workspace_intelligence_listings.sql"), "utf8");
  for (const fn of ["get_research_items", "get_operations_items", "get_market_intel_items", "get_technology_items"]) {
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(p_org_id uuid\\)[\\s\\S]*?ii\\.id ASC;`);
    assert.match(orgScoped, re, `${fn}'s live definition (migration 272) must end its ORDER BY with ii.id ASC`);
  }
  for (const fn of ["get_market_intel_items_public", "get_operations_items_public", "get_research_items_public"]) {
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(\\)[\\s\\S]*?ii\\.id ASC;`);
    assert.match(pub, re, `${fn}'s live definition (migration 306) must end its ORDER BY with ii.id ASC`);
  }
});
