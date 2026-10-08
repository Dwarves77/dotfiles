// limiter-coverage.npmtest.mjs: lane ROUTES-1 (2026-10-08), register finding AT2-7d.
// The written policy says rate limiting is enforced on all API routes; 18 route methods called no limiter.
// The worker-secret routes and the LinkedIn callback now call the shared limiter (src/lib/api/rate-limit.ts,
// 60 requests a minute, the only tier the routes use). Behaviour is proven on one representative route per
// key kind, with the REAL limiter module and stubs for everything else: a worker route (bucket per route, the
// shared-secret holder is the one principal) and the LinkedIn callback (bucket per user id, same as
// requireUserRoute). The other seven worker routes are held to the same shape by a source check
// (guard first, then the limiter), because their handlers need a database to run past it.
//
// Run: node --test fsi-app/src/app/api/limiter-coverage.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = mkdtempSync(resolve(tmpdir(), "limiter-cov-"));
const f = (name, body) => {
  const p = resolve(dir, name);
  writeFileSync(p, body);
  return p;
};

const state = { workerAllowed: true, user: { id: "user-1" }, fetches: 0 };
globalThis.__limCovState = state;

const stubs = {
  "@/lib/api/worker-auth": f("wa.mjs", `
export function workerAuthGuard() {
  return globalThis.__limCovState.workerAllowed ? null : new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
}
`),
  "@/lib/cache/revalidate-item": f("ri.mjs", `export async function revalidateItem() { return { ok: true }; }\n`),
  "next/cache": f("cache.mjs", `export function revalidateTag() {}\nexport function revalidatePath() {}\n`),
  "@/lib/supabase-server-client": f("ssc.mjs", `
export async function createSupabaseServerClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.__limCovState.user }, error: null }) } };
}
`),
  "@/lib/supabase-service": f("svc.mjs", `export function getServiceSupabase() { return {}; }\n`),
};

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
  alias: { ...stubs, "@": resolve(ROOT, "src") },
});
const { NextRequest } = await jiti.import("next/server");
const revalidateItem = await jiti.import("./cache/revalidate-item/route.ts");
const revalidate = await jiti.import("./revalidate/route.ts");
const linkedin = await jiti.import("./auth/linkedin/callback/route.ts");

const workerReq = (path, body) =>
  new NextRequest("http://x" + path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("worker route: the 61st authorised call in a minute is a 429 with Retry-After, the first 60 are not", async () => {
  state.workerAllowed = true;
  for (let i = 1; i <= 60; i++) {
    const res = await revalidateItem.POST(workerReq("/api/cache/revalidate-item", { itemId: "i" + i }));
    assert.notEqual(res.status, 429, "call " + i);
  }
  const res = await revalidateItem.POST(workerReq("/api/cache/revalidate-item", { itemId: "i61" }));
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"));
});

test("worker route: the bucket is per route, so a second worker route is untouched by the first one's exhaustion", async () => {
  state.workerAllowed = true;
  const res = await revalidate.POST(workerReq("/api/revalidate", { tags: ["x"] }));
  assert.notEqual(res.status, 429);
});

test("worker route: an unauthorised call is refused 401 and spends no slot (the secret check runs before the limiter)", async () => {
  state.workerAllowed = false;
  for (let i = 0; i < 70; i++) {
    const res = await revalidate.POST(workerReq("/api/revalidate", { tags: ["x"] }));
    assert.equal(res.status, 401, "call " + i);
  }
  state.workerAllowed = true;
  const res = await revalidate.POST(workerReq("/api/revalidate", { tags: ["x"] }));
  assert.notEqual(res.status, 429, "70 refused calls must not have drained the bucket");
});

test("linkedin callback: bucket per user, 61st call from one user is a 429 before any call out to LinkedIn", async () => {
  process.env.LINKEDIN_CLIENT_ID = "cid";
  process.env.LINKEDIN_CLIENT_SECRET = "secret";
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    state.fetches++;
    return new Response("{}", { status: 400 });
  };
  try {
    state.user = { id: "user-linkedin" };
    const call = () =>
      linkedin.GET(
        new NextRequest("http://x/api/auth/linkedin/callback?code=c&state=s", { headers: { cookie: "linkedin_oauth_state=s" } })
      );
    // find the real cookie name the route reads
    const { STATE_COOKIE } = await jiti.import("./auth/linkedin/start/logic.ts");
    const mk = () =>
      linkedin.GET(
        new NextRequest("http://x/api/auth/linkedin/callback?code=c&state=s", { headers: { cookie: STATE_COOKIE + "=s" } })
      );
    void call;
    for (let i = 1; i <= 60; i++) {
      const res = await mk();
      assert.notEqual(res.status, 429, "call " + i);
    }
    const fetchesBefore = state.fetches;
    const res = await mk();
    assert.equal(res.status, 429);
    assert.equal(state.fetches, fetchesBefore, "the limited call made no request to LinkedIn");
    // a different user has a different bucket
    state.user = { id: "user-other" };
    const other = await mk();
    assert.notEqual(other.status, 429);
  } finally {
    globalThis.fetch = realFetch;
  }
});

const WORKER_ROUTES = [
  "admin/recompute-trust",
  "admin/spot-check/recurring",
  "cache/revalidate-item",
  "health/spend",
  "health/surfaces",
  "revalidate",
  "worker/check-sources",
  "worker/reconcile",
];
for (const r of WORKER_ROUTES) {
  test(`${r}: calls workerAuthGuard first, then checkRateLimit with its own worker bucket`, () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), r, "route.ts"), "utf8");
    const guardAt = src.search(/workerAuthGuard\(request\)/);
    const limitAt = src.search(/checkRateLimit\("worker:\/api\/[^"]+"\)/);
    assert.ok(guardAt >= 0, "calls the secret guard");
    assert.ok(limitAt > guardAt, "calls the limiter after the secret guard");
    assert.ok(src.includes(`checkRateLimit("worker:/api/${r}")`), "bucket named for this route");
    assert.ok(src.includes('import { checkRateLimit } from "@/lib/api/rate-limit";'));
  });
}

// ---- anonymous callers (coordinator grant): keyed by clientKey(request) ----
const linkedinStart = await jiti.import("./auth/linkedin/start/route.ts");
const startReq = (xff) =>
  new NextRequest("http://x/api/auth/linkedin/start", { headers: xff ? { "x-forwarded-for": xff } : {} });

test("anonymous route: the 61st request from one address is 429, another address is untouched", async () => {
  for (let i = 1; i <= 60; i++) {
    const res = await linkedinStart.GET(startReq("203.0.113.50, 10.0.0.1"));
    assert.notEqual(res.status, 429, "call " + i);
  }
  const res = await linkedinStart.GET(startReq("203.0.113.50"));
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"));
  const other = await linkedinStart.GET(startReq("203.0.113.51"));
  assert.notEqual(other.status, 429);
});

test("anonymous route: requests with no x-forwarded-for share one bucket and are limited, not skipped", async () => {
  for (let i = 1; i <= 60; i++) {
    const res = await linkedinStart.GET(startReq(null));
    assert.notEqual(res.status, 429, "call " + i);
  }
  assert.equal((await linkedinStart.GET(startReq(null))).status, 429);
});

const ANON_ROUTES = [
  ["auth/identity", /async function handleGET\(/],
  ["detail/relevance", /async function handleGET\(/],
  ["listings/cursor", /export async function GET\(/],
  ["listings/rest", /export async function GET\(/],
  ["obligations/register", /async function handleGET\(/],
  ["obligations/upcoming", /async function handleGET\(/],
  ["auth/linkedin/start", /export async function GET\(/],
  ["../auth/callback", /export async function GET\(/],
];
for (const [r, decl] of ANON_ROUTES) {
  test(`${r}: the handler's first act is the limiter keyed by clientKey(request)`, () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), r, "route.ts"), "utf8");
    const at = src.search(decl);
    assert.ok(at >= 0, "handler found");
    const body = src.slice(at);
    const limitAt = body.indexOf("checkRateLimit(clientKey(request))");
    assert.ok(limitAt >= 0, "calls the limiter with clientKey(request)");
    const firstAwait = body.indexOf("await ");
    assert.ok(firstAwait < 0 || limitAt < firstAwait, "the limiter runs before any await");
    assert.ok(src.includes('import { checkRateLimit, clientKey } from "@/lib/api/rate-limit";'));
  });
}
