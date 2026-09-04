// @ts-check
// PERF-7 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §13): pins
// requireCommunityAuth's getClaims()-based contract — authenticated cookie,
// authenticated bearer, unauthenticated, expired, malformed, and the
// symmetric-secret fallback path all resolve userId the same way the prior
// getUser()/getUser(token) branches used to, using only claims.sub via the
// single shared resolveCommunityUserId() core. jiti (@/ alias resolution)
// needed because community-auth.ts imports @/lib/supabase-server-client,
// which value-imports next/headers — same reason org.npmtest.mjs uses it.
// Runs via the CI "App unit tests requiring npm deps" step's
// *.npmtest.mjs glob (git ls-files 'fsi-app/src/**/*.npmtest.mjs') — no
// run-test-suite.sh edit needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// requireCommunityAuth's first branch 500s when these are unset ("Authentication service not
// configured") — set dummy values so the end-to-end tests below reach the cookie/bearer branches
// instead. Fake, well-formed-looking values only: createClient() never dials out at construction time,
// and none of the tests below reach a real network call (see each test's own comment for why).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { requireCommunityAuth, isCommunityAuthError, resolveCommunityUserId } = await jiti.import("./community-auth.ts");
const { NextRequest } = await jiti.import("next/server");

function requestWithAuth(headerValue) {
  const headers = headerValue ? { authorization: headerValue } : {};
  return new NextRequest("https://example.com/api/community/groups", { headers });
}

// ── resolveCommunityUserId: the shared core both branches call — the mocked-client unit tests ──

test("authenticated (cookie-shaped call, no jwt arg): getClaims resolves claims.sub → userId", async () => {
  const supabase = { auth: { async getClaims(jwt) { assert.equal(jwt, undefined); return { data: { claims: { sub: "user-123" } }, error: null }; } } };
  assert.equal(await resolveCommunityUserId(supabase), "user-123");
});

test("authenticated (bearer-shaped call, explicit jwt): getClaims resolves claims.sub → userId", async () => {
  const supabase = { auth: { async getClaims(jwt) { assert.equal(jwt, "a.b.c"); return { data: { claims: { sub: "user-999" } }, error: null }; } } };
  assert.equal(await resolveCommunityUserId(supabase, "a.b.c"), "user-999");
});

test("unauthenticated: getClaims reports an error (no session) → null", async () => {
  const supabase = { auth: { async getClaims() { return { data: null, error: { message: "no session" } }; } } };
  assert.equal(await resolveCommunityUserId(supabase), null);
});

test("expired token: getClaims reports an AuthInvalidJwtError-shaped error → null", async () => {
  const supabase = { auth: { async getClaims() { return { data: null, error: { name: "AuthInvalidJwtError", message: "JWT expired" } }; } } };
  assert.equal(await resolveCommunityUserId(supabase, "expired-token"), null);
});

test("claims object with no sub → null (malformed, never throws)", async () => {
  const supabase = { auth: { async getClaims() { return { data: { claims: {} }, error: null }; } } };
  assert.equal(await resolveCommunityUserId(supabase, "token"), null);
});

// The symmetric-secret fallback path (installed GoTrueClient.getClaims's `!signingKey` branch calls
// getUser(jwt)/getUser() internally and returns ITS claims) is opaque to resolveCommunityUserId: both
// the asymmetric-verified and the symmetric-fallback-verified cases return the identical
// { data: { claims }, error } shape, so one test stands in for both.
test("symmetric-secret fallback shape → resolves the same as the asymmetric path", async () => {
  const supabase = { auth: { async getClaims() { return { data: { claims: { sub: "user-456", role: "authenticated", email: "a@b.com" } }, error: null }; } } };
  assert.equal(await resolveCommunityUserId(supabase), "user-456");
});

test("getClaims rejecting propagates (requireCommunityAuth's own try/catch is what turns this into fall-through)", async () => {
  const supabase = { auth: { async getClaims() { throw new Error("network unreachable"); } } };
  await assert.rejects(() => resolveCommunityUserId(supabase, "token"), /network unreachable/);
});

// ── requireCommunityAuth end-to-end: the parts provable without a live Supabase Auth server ──
//
// Path A (cookie session) always runs first and, outside a Next.js request context (plain
// `node --test`), next/headers' cookies() throws synchronously (no request scope) — same realistic
// failure mode org.npmtest.mjs's resolveOrgIdFromCookies test exercises. requireCommunityAuth's own
// try/catch around Path A turns that into "fall through to Bearer," so every test below exercises the
// REAL (non-mocked) cookie-branch failure path, then the Bearer branch, end to end.

test("no Authorization header, no cookie session → 401 Authentication required", async () => {
  const result = await requireCommunityAuth(requestWithAuth(undefined));
  assert.ok(isCommunityAuthError(result));
  assert.equal(result.status, 401);
  const body = await result.json();
  assert.equal(body.error, "Authentication required");
});

test("Authorization header without Bearer prefix, no cookie session → 401 Authentication required", async () => {
  const result = await requireCommunityAuth(requestWithAuth("Basic dXNlcjpwYXNz"));
  assert.ok(isCommunityAuthError(result));
  assert.equal(result.status, 401);
});

// A malformed/garbage bearer token is NOT a network call: getClaims() calls decodeJWT() synchronously
// before any fetch, and decodeJWT() throws AuthInvalidJwtError on a string with no 3 "."-separated
// base64url segments (node_modules/@supabase/auth-js's lib/helpers.js decodeJWT). getClaims()'s own
// try/catch recognizes that as an AuthError and returns it as a normal `{ data: null, error }` result
// rather than rethrowing — so resolveCommunityUserId returns null and requireCommunityAuth reaches its
// final 401, exercising the real (non-mocked) Bearer-branch code path end to end, no network reached.
test("malformed bearer token (not a JWT), no cookie session → 401 Authentication required, no network reached", async () => {
  const result = await requireCommunityAuth(requestWithAuth("Bearer not-a-real-jwt"));
  assert.ok(isCommunityAuthError(result));
  assert.equal(result.status, 401);
  const body = await result.json();
  assert.equal(body.error, "Authentication required");
});

test("isCommunityAuthError narrows correctly for a success shape", () => {
  assert.equal(isCommunityAuthError({ userId: "user-1", supabase: {} }), false);
});
