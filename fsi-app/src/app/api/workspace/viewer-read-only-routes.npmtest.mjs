// viewer-read-only-routes.npmtest.mjs: lane SEC-3b (2026-10-08, coordinator ruling on the route expansion).
// The service-role routes that write the six viewer-gap tables bypass RLS, so the viewer role must be refused in
// the route itself. For each route: a viewer gets 403 { error: "viewer_read_only" } and the service client is
// never called (the role lookup is a stubbed module, so any client call is a write path or a read behind it); a
// member passes through (no viewer refusal, and the handler reaches the client). The route's guard, org, rate
// limit, client, error-capture and cache modules are replaced by stubs through jiti aliases so the real handlers
// run with no network.
//
// Run: node --test fsi-app/src/app/api/workspace/viewer-read-only-routes.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "viewer-routes-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const state = { role: "viewer", calls: [] };
globalThis.__sec3bState = state;

const stubs = {
  "@/lib/api/route-guard": f("guard.mjs", `
export function isRefusal(r) { return r instanceof Response; }
export async function requireUserRoute() { return { userId: "user-1" }; }
`),
  "@/lib/api/rate-limit": f("limit.mjs", `export function rateLimitHeaders() { return {}; }\n`),
  "@/lib/api/org": f("org.mjs", `
export async function resolveOrgIdFromUserId() { return "org-1"; }
export async function resolveOrgMembershipFromUserId() { return { orgId: "org-1", role: globalThis.__sec3bState.role }; }
`),
  "@/lib/supabase-service": f("svc.mjs", `
function chain() {
  const p = new Proxy(function () {}, {
    get(_t, k) { if (k === "then") return (res) => res({ data: null, error: null, count: 0 }); return () => p; },
    apply() { return p; },
  });
  return p;
}
export function getServiceSupabase() {
  return {
    from(t) { globalThis.__sec3bState.calls.push("from:" + t); return chain(); },
    rpc(n) { globalThis.__sec3bState.calls.push("rpc:" + n); return chain(); },
  };
}
`),
  "@/lib/telemetry/capture-error": f("cap.mjs", `export function withErrorCapture(_n, h) { return h; }\n`),
  "@/lib/data": f("data.mjs", `export const APP_DATA_TAG = "app-data";\n`),
  "@/lib/notifications/dispatch": f("disp.mjs", `export async function dispatchNotification() { return { ok: true }; }\n`),
  "next/cache": f("cache.mjs", `export function revalidateTag() {}\nexport function revalidatePath() {}\n`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");

const UUID = "11111111-1111-4111-8111-111111111111";
const mk = (method, url, body) =>
  new NextRequest("http://x" + url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = { params: Promise.resolve({ id: UUID }) };

const CASES = [
  { route: "overrides", file: "./overrides/route.ts", method: "POST", req: () => mk("POST", "/api/workspace/overrides", { itemId: UUID, priorityOverride: "HIGH" }) },
  { route: "overrides", file: "./overrides/route.ts", method: "DELETE", req: () => mk("DELETE", "/api/workspace/overrides", { itemId: UUID }) },
  { route: "watchlist (team)", file: "../watchlist/route.ts", method: "POST", req: () => mk("POST", "/api/watchlist", { itemType: "reg", itemId: "r1", scope: "team" }) },
  { route: "watchlist (team)", file: "../watchlist/route.ts", method: "DELETE", req: () => mk("DELETE", "/api/watchlist?item_type=reg&item_id=r1&scope=team") },
  { route: "tags", file: "./tags/route.ts", method: "POST", req: () => mk("POST", "/api/workspace/tags", { name: "proof" }) },
  { route: "tags", file: "./tags/route.ts", method: "DELETE", req: () => mk("DELETE", "/api/workspace/tags", { tagId: UUID }) },
  { route: "tags/[id]/items", file: "./tags/[id]/items/route.ts", method: "PUT", ctx, req: () => mk("PUT", "/api/workspace/tags/x/items", { itemId: UUID }) },
  { route: "tags/[id]/items", file: "./tags/[id]/items/route.ts", method: "DELETE", ctx, req: () => mk("DELETE", "/api/workspace/tags/x/items", { itemId: UUID }) },
  { route: "portfolios", file: "./portfolios/route.ts", method: "POST", req: () => mk("POST", "/api/workspace/portfolios", { name: "proof" }) },
  { route: "portfolios/[id]", file: "./portfolios/[id]/route.ts", method: "PATCH", ctx, req: () => mk("PATCH", "/api/workspace/portfolios/x", { name: "proof" }) },
  { route: "portfolios/[id]", file: "./portfolios/[id]/route.ts", method: "DELETE", ctx, req: () => mk("DELETE", "/api/workspace/portfolios/x") },
  { route: "portfolios/[id]/members", file: "./portfolios/[id]/members/route.ts", method: "POST", ctx, req: () => mk("POST", "/api/workspace/portfolios/x/members", { itemId: UUID }) },
  { route: "portfolios/[id]/members", file: "./portfolios/[id]/members/route.ts", method: "DELETE", ctx, req: () => mk("DELETE", "/api/workspace/portfolios/x/members", { itemId: UUID }) },
];

for (const c of CASES) {
  const mod = await jiti.import(c.file);
  const handler = mod[c.method];

  test(`${c.route} ${c.method}: a viewer is refused 403 viewer_read_only and the service client is never called`, async () => {
    state.role = "viewer";
    state.calls.length = 0;
    const res = await handler(c.req(), c.ctx);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "viewer_read_only" });
    assert.deepEqual(state.calls, []);
  });

  test(`${c.route} ${c.method}: a member passes through to the client`, async () => {
    state.role = "member";
    state.calls.length = 0;
    // The stub client returns empty results, so a handler may throw on a null row after it has reached the
    // client; reaching the client without the viewer refusal is the property under test.
    let res = null;
    let threw = false;
    try { res = await handler(c.req(), c.ctx); } catch { threw = true; }
    let body = null;
    if (res) { try { body = await res.clone().json(); } catch { body = null; } }
    assert.ok(!(res && res.status === 403 && body && body.error === "viewer_read_only"), "a member must not get the viewer refusal");
    assert.ok(state.calls.length > 0, `the member request reached the client (${threw ? "handler threw on the empty stub" : "status " + res.status})`);
  });
}

test("the personal watch stays open to a viewer: the watchlist personal scope is not refused", async () => {
  const { POST } = await jiti.import("../watchlist/route.ts");
  state.role = "viewer";
  state.calls.length = 0;
  const res = await POST(mk("POST", "/api/watchlist", { itemType: "reg", itemId: "r1", scope: "personal" }));
  assert.notEqual(res.status, 403);
  assert.ok(state.calls.includes("from:user_watchlist"));
});
