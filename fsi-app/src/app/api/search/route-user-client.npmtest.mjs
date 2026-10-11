// route-user-client.npmtest.mjs: lane SEC-10 (2026-10-11), BACKLOG B-0005, B-0006.
// GET /api/search used to build a SERVICE-ROLE client (RLS off) for a user route while /search (the page)
// runs the same runSearch on the caller's RLS client: privilege differed by entry point. Decision (session
// log): the route runs on the caller's own bearer-bound client, exposed by requireUserRoute as `userClient`.
// Attack: with requireUserRoute stubbed to return { userId, userClient: fake }, the search RPC and the
// re-fetch are observed on the fake user client, and the route source carries no service-role key and no
// createClient import.
//
// Run: node --test fsi-app/src/app/api/search/route-user-client.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "search-route-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const ROWS = [{ id: "a1", title: "Alpha", item_type: "regulation", domain: 1, priority: "HIGH", jurisdictions: [], transport_modes: [], topic: null }];
const state = { rpcCalls: [], fromCalls: [], guardCalls: 0 };
globalThis.__sec10SearchState = state;

const userClient = {
  rpc(name, args) {
    state.rpcCalls.push({ name, args });
    return Promise.resolve({ data: [{ id: "a1" }], error: null });
  },
  from(table) {
    state.fromCalls.push(table);
    const chain = { select: () => chain, eq: () => chain, in: () => Promise.resolve({ data: ROWS, error: null }) };
    return chain;
  },
};
globalThis.__sec10SearchUserClient = userClient;

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireUserRoute() {
  globalThis.__sec10SearchState.guardCalls++;
  return { userId: "user-1", userClient: globalThis.__sec10SearchUserClient };
}
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/telemetry/capture-error": f("cap.mjs", `export function withErrorCapture(_n, h) { return h; }\n`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");
const { GET } = await jiti.import("./route.ts");

test("search runs on the caller's own client: the RPC and the re-fetch are observed on userClient", async () => {
  state.rpcCalls.length = 0;
  state.fromCalls.length = 0;
  const res = await GET(new NextRequest("http://x/api/search?q=carbon"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.results.map((r) => r.id), ["a1"]);
  assert.equal(state.guardCalls >= 1, true);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].name, "search_intelligence_items");
  assert.deepEqual(state.fromCalls, ["intelligence_items"]);
});

test("a short query never reaches the client", async () => {
  state.rpcCalls.length = 0;
  state.fromCalls.length = 0;
  const res = await GET(new NextRequest("http://x/api/search?q=a"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).results, []);
  assert.equal(state.rpcCalls.length, 0);
});

test("route.ts holds no service-role key and no createClient import (privilege cannot differ by entry point)", () => {
  const src = readFileSync(resolve(HERE, "route.ts"), "utf8");
  assert.ok(!src.includes("SUPABASE_SERVICE_ROLE_KEY"), "no service-role key in the search route");
  assert.ok(!/\bcreateClient\b/.test(src), "no createClient in the search route");
  assert.ok(!src.includes("getServiceSupabase"), "no service client factory in the search route");
});
