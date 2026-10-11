// @ts-check
// PERF-6 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §10): pins
// requireAuth's getClaims()-based contract — authenticated, unauthenticated
// (no header / no session), expired token, and the symmetric-secret
// fallback path all resolve userId the same way getUser(token)-based code
// used to, using only claims.sub. jiti (@/ alias resolution not needed
// here — auth.ts has no @/ imports — but jiti is still required to
// transpile the .ts file and to resolve next/server, same reasoning as
// generation-pause.npmtest.mjs). Runs via the CI "App unit tests requiring
// npm deps" step's *.npmtest.mjs glob (git ls-files
// 'fsi-app/src/**/*.npmtest.mjs') — no run-test-suite.sh edit needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

// requireAuth's first branch 500s when these are unset ("Authentication service not configured") — set
// dummy values so the end-to-end requireAuth tests below reach the auth-header / token branches instead.
// Fake, well-formed-looking values only: createClient() never dials out at construction time, and none
// of the requireAuth tests below reach a real network call (see each test's own comment for why).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { requireAuth, isAuthError, resolveUserIdFromToken } = await jiti.import("./auth.ts");
const { NextRequest } = await jiti.import("next/server");

function requestWithAuth(headerValue) {
  const headers = headerValue ? { authorization: headerValue } : {};
  return new NextRequest("https://example.com/api/watchlist", { headers });
}

// ── resolveUserIdFromToken: the mocked-client unit tests the dispatch asked for ──

test("authenticated: getClaims resolves claims.sub → userId", async () => {
  const supabase = { auth: { async getClaims() { return { data: { claims: { sub: "user-123" } }, error: null }; } } };
  assert.equal(await resolveUserIdFromToken(supabase, "token"), "user-123");
});

test("unauthenticated: getClaims reports an error → null", async () => {
  const supabase = { auth: { async getClaims() { return { data: null, error: { message: "invalid token" } }; } } };
  assert.equal(await resolveUserIdFromToken(supabase, "bad-token"), null);
});

test("expired token: getClaims reports an AuthInvalidJwtError-shaped error → null", async () => {
  const supabase = {
    auth: {
      async getClaims() {
        return { data: null, error: { name: "AuthInvalidJwtError", message: "JWT expired" } };
      },
    },
  };
  assert.equal(await resolveUserIdFromToken(supabase, "expired-token"), null);
});

test("claims object with no sub → null (malformed, never throws)", async () => {
  const supabase = { auth: { async getClaims() { return { data: { claims: {} }, error: null }; } } };
  assert.equal(await resolveUserIdFromToken(supabase, "token"), null);
});

// The symmetric-secret fallback path (installed GoTrueClient.getClaims's `!signingKey` branch calls
// getUser(jwt) internally and returns ITS claims) is opaque to resolveUserIdFromToken: both the
// asymmetric-verified and the symmetric-fallback-verified cases return the identical
// { data: { claims }, error } shape, so one test stands in for both — this is the "wash, never a
// regression" case the proxy.ts header and this file's own header describe.
test("symmetric-secret fallback shape → resolves the same as the asymmetric path", async () => {
  const supabase = {
    auth: {
      async getClaims() {
        return { data: { claims: { sub: "user-456", role: "authenticated", email: "a@b.com" } }, error: null };
      },
    },
  };
  assert.equal(await resolveUserIdFromToken(supabase, "token"), "user-456");
});

test("getClaims rejecting propagates (requireAuth's own try/catch is what turns this into a 401)", async () => {
  const supabase = { auth: { async getClaims() { throw new Error("network unreachable"); } } };
  await assert.rejects(() => resolveUserIdFromToken(supabase, "token"), /network unreachable/);
});

// ── requireAuth end-to-end: the parts provable without a live Supabase Auth server ──

test("no Authorization header → 401 Authentication required, no client constructed", async () => {
  const result = await requireAuth(requestWithAuth(undefined));
  assert.ok(isAuthError(result));
  assert.equal(result.status, 401);
  const body = await result.json();
  assert.equal(body.error, "Authentication required");
});

test("Authorization header without Bearer prefix → 401 Authentication required", async () => {
  const result = await requireAuth(requestWithAuth("Basic dXNlcjpwYXNz"));
  assert.ok(isAuthError(result));
  assert.equal(result.status, 401);
});

// A malformed/garbage bearer token is NOT a network call: getClaims() calls decodeJWT() synchronously
// before any fetch, and decodeJWT() throws AuthInvalidJwtError on a string with no 3 "."-separated
// base64url segments (node_modules/@supabase/auth-js's lib/helpers.js decodeJWT). getClaims()'s own
// try/catch recognizes that as an AuthError (isAuthError()) and returns it as a normal
// `{ data: null, error }` result rather than rethrowing — so this exercises requireAuth's
// "Invalid or expired token" branch, not the outer catch. Deterministic, no network, exercises the
// real (non-mocked) code path end to end, and is itself the "malformed claims" case the dispatch asked
// to cover (a malformed JWT can never carry a usable claims.sub).
test("malformed bearer token (not a JWT) → 401 Invalid or expired token, no network reached", async () => {
  const result = await requireAuth(requestWithAuth("Bearer not-a-real-jwt"));
  assert.ok(isAuthError(result));
  assert.equal(result.status, 401);
  const body = await result.json();
  assert.equal(body.error, "Invalid or expired token");
});

test("isAuthError narrows correctly for a success shape", () => {
  assert.equal(isAuthError({ userId: "user-1" }), false);
});

// ── SEC-10 (2026-10-11, BACKLOG B-0005/B-0006): requireAuth hands back the bearer-bound client ──
//
// requireAuth already builds an anon client bound to the caller's bearer to verify the JWT; it used to throw
// it away, so a user route that needed RLS-scoped reads had to build a service-role client. It now returns
// it. A symmetric (HS256) token makes the installed getClaims() fall back to getUser(jwt), which is one
// fetch to /auth/v1/user; globalThis.fetch is replaced for the test so the REAL client and the REAL
// requireAuth run end to end with no network, and the fetch the client makes is observed to carry the
// caller's own bearer.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const hs256Jwt = (sub) =>
  [b64u({ alg: "HS256", typ: "JWT" }), b64u({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }), "c2ln"].join(".");

test("requireAuth resolves { userId, supabase }: a bearer-bound client with .from and .rpc", async () => {
  const jwt = hs256Jwt("user-789");
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    seen.push({ url: String(input instanceof Request ? input.url : input), authorization: headers.get("authorization") });
    return new Response(JSON.stringify({ id: "user-789", aud: "authenticated", role: "authenticated" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  let result;
  try {
    result = await requireAuth(requestWithAuth("Bearer " + jwt));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(isAuthError(result), false, "authenticated call is not a refusal");
  assert.equal(result.userId, "user-789");
  assert.ok(result.supabase, "the resolved object carries the client");
  assert.equal(typeof result.supabase.from, "function");
  assert.equal(typeof result.supabase.rpc, "function");
  assert.ok(seen.length >= 1 && seen.every((s) => s.authorization === "Bearer " + jwt), "the client is bound to the caller's bearer");
});

test("requireAuth: a refusal carries no client", async () => {
  const result = await requireAuth(requestWithAuth("Bearer not-a-real-jwt"));
  assert.ok(isAuthError(result));
  assert.equal(result.supabase, undefined);
});
