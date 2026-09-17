// @ts-check
// Lane L31 (2026-09-17): the shared route guard replaces the guard block the route files carried by hand.
// Every branch is forced with injected dependencies (no network, no env): the refusal of each step
// passes through untouched, the order authenticate -> rate-limit -> admin gate holds (a later step
// never runs after an earlier refusal), and the resolved context carries what the routes read.
// Runs via the CI "App unit tests requiring npm deps" step (the *.npmtest.mjs glob).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { requireUserRoute, requireCommunityRoute, requireAdminRoute, isRefusal, ADMIN_REQUIRED_ERROR } =
  await jiti.import("./route-guard.ts");
const { NextRequest, NextResponse } = await jiti.import("next/server");

const request = () => new NextRequest("https://example.com/api/admin/anything");
const refuse = (status, error) => NextResponse.json({ error }, { status });
const ok = (userId) => async () => ({ userId });
const stubClient = { tag: "service-client" };

test("isRefusal: a NextResponse is a refusal, a context is not", () => {
  assert.equal(isRefusal(refuse(401, "x")), true);
  assert.equal(isRefusal({ userId: "u1" }), false);
});

test("requireUserRoute: the authenticate refusal passes through and the rate limiter never runs", async () => {
  let limited = 0;
  const r = await requireUserRoute(request(), {
    authenticate: async () => refuse(401, "Authentication required"),
    rateLimit: () => { limited++; return null; },
  });
  assert.equal(isRefusal(r), true);
  assert.equal(r.status, 401);
  assert.equal(limited, 0);
});

test("requireUserRoute: a rate-limit refusal passes through with its status", async () => {
  const r = await requireUserRoute(request(), { authenticate: ok("u1"), rateLimit: () => refuse(429, "Too many") });
  assert.equal(isRefusal(r), true);
  assert.equal(r.status, 429);
});

test("requireUserRoute: resolves the caller", async () => {
  const seen = [];
  const r = await requireUserRoute(request(), { authenticate: ok("u1"), rateLimit: (id) => { seen.push(id); return null; } });
  assert.deepEqual(r, { userId: "u1" });
  assert.deepEqual(seen, ["u1"]);
});

test("requireCommunityRoute: returns the community-auth result (cookie-bound client kept) after the rate limit", async () => {
  const client = { tag: "cookie-client" };
  const r = await requireCommunityRoute(request(), { authenticate: async () => ({ userId: "u2", supabase: client }), rateLimit: () => null });
  assert.deepEqual(r, { userId: "u2", supabase: client });
  const denied = await requireCommunityRoute(request(), { authenticate: async () => refuse(401, "no session"), rateLimit: () => { throw new Error("must not run"); } });
  assert.equal(denied.status, 401);
});

test("requireAdminRoute: non-admin gets 403 with the canonical body and the rate-limit headers; no context leaks", async () => {
  const r = await requireAdminRoute(request(), {
    authenticate: ok("u3"), rateLimit: () => null,
    isAdmin: async () => false, serviceClient: () => stubClient, limitHeaders: () => ({ "X-RateLimit-Remaining": "59" }),
  });
  assert.equal(isRefusal(r), true);
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: ADMIN_REQUIRED_ERROR });
  assert.equal(r.headers.get("X-RateLimit-Remaining"), "59");
});

test("requireAdminRoute: the admin gate never runs for an unauthenticated or rate-limited caller", async () => {
  let gate = 0;
  const isAdmin = async () => { gate++; return true; };
  const a = await requireAdminRoute(request(), { authenticate: async () => refuse(401, "x"), isAdmin, serviceClient: () => stubClient });
  const b = await requireAdminRoute(request(), { authenticate: ok("u"), rateLimit: () => refuse(429, "x"), isAdmin, serviceClient: () => stubClient });
  assert.equal(a.status, 401);
  assert.equal(b.status, 429);
  assert.equal(gate, 0);
});

test("requireAdminRoute: admin resolves userId, the same service client the gate used, and the headers", async () => {
  const gateSaw = [];
  const r = await requireAdminRoute(request(), {
    authenticate: ok("admin-1"), rateLimit: () => null,
    isAdmin: async (id, client) => { gateSaw.push([id, client]); return true; },
    serviceClient: () => stubClient, limitHeaders: () => ({ "X-RateLimit-Limit": "60" }),
  });
  assert.equal(isRefusal(r), false);
  assert.equal(r.userId, "admin-1");
  assert.equal(r.supabase, stubClient);
  assert.deepEqual(r.headers, { "X-RateLimit-Limit": "60" });
  assert.deepEqual(gateSaw, [["admin-1", stubClient]]);
});
