// @ts-check
// PERF-6 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §10): pins
// resolveOrgIdFromAuthenticatedClient's getClaims()-based contract —
// authenticated, unauthenticated, expired-token, and the symmetric-secret
// fallback path all resolve org_id the same way getUser()-based code used
// to, using only claims.sub. jiti (@/ alias resolution) needed because
// org.ts imports @/lib/supabase-server-client, which value-imports
// next/headers — same reason viewer-relevance.npmtest.mjs uses it. Runs via
// the CI "App unit tests requiring npm deps" step's *.npmtest.mjs glob (git
// ls-files 'fsi-app/src/**/*.npmtest.mjs') — no run-test-suite.sh edit
// needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const {
  resolveOrgIdFromAuthenticatedClient,
  resolveOrgIdFromCookies,
  resolveViewerIdentityFromAuthenticatedClient,
  resolveViewerIdentityFromCookies,
} = await jiti.import("./org.ts");

/** Minimal fake Supabase client covering exactly the calls
 *  resolveOrgIdFromAuthenticatedClient issues: auth.getClaims(), then
 *  .from("org_memberships").select(...).eq(...).order(...).limit(...).maybeSingle(). */
function fakeSupabase({ claimsData = null, claimsError = null, membershipData = null, membershipError = null } = {}) {
  return {
    auth: {
      async getClaims() {
        return { data: claimsData, error: claimsError };
      },
    },
    from(table) {
      assert.equal(table, "org_memberships");
      return {
        select(cols) {
          assert.match(cols, /org_id/);
          return {
            eq(col, userId) {
              assert.equal(col, "user_id");
              return {
                order() {
                  return {
                    limit() {
                      return { maybeSingle: async () => ({ data: membershipData, error: membershipError }) };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

// ── authenticated: claims carry sub, membership row exists → org_id ──
test("authenticated: getClaims returns claims.sub, membership found → resolves org_id", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-123", role: "authenticated" } },
    membershipData: { org_id: "org-abc" },
  });
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, "org-abc");
});

test("authenticated but no membership row → null (caller 403s, not a crash)", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-123", role: "authenticated" } },
    membershipData: null,
  });
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, null);
});

// ── unauthenticated: getClaims reports an error (no session) ──
test("unauthenticated: getClaims error → null, org_memberships never queried", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: null, error: { message: "no session" } }; } },
    from() { throw new Error("must not query org_memberships when unauthenticated"); },
  };
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, null);
});

// ── expired token: getClaims surfaces an AuthInvalidJwtError-shaped error, same branch as unauthenticated ──
test("expired token: getClaims error (expired) → null, no membership query", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: null, error: { message: "JWT expired", name: "AuthInvalidJwtError" } }; } },
    from() { throw new Error("must not query org_memberships when the token is expired"); },
  };
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, null);
});

// ── claims present but malformed (no sub) — degrades to null, never throws on a bad shape ──
test("claims object with no sub → null, no membership query", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: { claims: {} }, error: null }; } },
    from() { throw new Error("must not query org_memberships with no sub"); },
  };
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, null);
});

// ── the symmetric-secret fallback path (getClaims() internally calls getUser() and returns the JWT's
// own payload as claims — see node_modules/@supabase/auth-js's GoTrueClient.getClaims, the `!signingKey`
// branch) is opaque to this function: it only ever sees the same { data: { claims }, error } shape
// getClaims() returns in EITHER case (asymmetric-verified or symmetric-fallback-verified), so the fallback
// needs no separate code path here — this test proves that by feeding exactly what the fallback branch
// would produce (claims.sub populated from getUser()'s validated token) and confirming identical behavior.
test("symmetric-secret fallback shape (claims sourced from getUser() internally by getClaims) → resolves the same as the asymmetric path", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-456", role: "authenticated", email: "a@b.com" } },
    membershipData: { org_id: "org-xyz" },
  });
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, "org-xyz");
});

// ── the query-error branch (membership lookup itself fails) — resolveOrgIdFromAuthenticatedClient does
// not check membershipError explicitly (mirrors the pre-existing resolveOrgIdFromCookies contract: a
// failed read degrades to "no membership", the caller renders the public/seed view) ──
test("membership query error → null (fail-soft, matches pre-existing contract)", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-789" } },
    membershipData: null,
    membershipError: { message: "connection reset" },
  });
  const orgId = await resolveOrgIdFromAuthenticatedClient(supabase);
  assert.equal(orgId, null);
});

// ── resolveOrgIdFromCookies (the cache()-wrapped, cookie-driven wrapper): outside a Next.js request
// context (plain node --test), next/headers' cookies() throws (no request scope) — same realistic
// failure mode viewer-relevance.npmtest.mjs exercises for getViewerRelevanceForItem. This is the
// end-to-end proof the try/catch (and the cache() wrapper around it) still fails soft to null. ──
test("resolveOrgIdFromCookies outside a request context → fails soft to null, never throws", async () => {
  const orgId = await resolveOrgIdFromCookies();
  assert.equal(orgId, null);
});

// ── PERF-9 (2026-09-04, item 4, ADR-026 §3): resolveViewerIdentityFromAuthenticatedClient / Cookies —
// the two-stage (getClaims → org_memberships) alternative to resolveServerBootstrap's three-stage read,
// used by the four detail pages' watchMembershipPromise. Same fakeSupabase() shape as the
// resolveOrgIdFromAuthenticatedClient tests above; this function additionally returns userId. ──

test("viewer identity: authenticated, membership found → { userId, orgId }", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-123", role: "authenticated" } },
    membershipData: { org_id: "org-abc" },
  });
  const identity = await resolveViewerIdentityFromAuthenticatedClient(supabase);
  assert.deepEqual(identity, { userId: "user-123", orgId: "org-abc" });
});

test("viewer identity: authenticated, no membership row → { userId, orgId: null }", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-123", role: "authenticated" } },
    membershipData: null,
  });
  const identity = await resolveViewerIdentityFromAuthenticatedClient(supabase);
  assert.deepEqual(identity, { userId: "user-123", orgId: null });
});

test("viewer identity: unauthenticated (getClaims error) → { userId: null, orgId: null }, org_memberships never queried", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: null, error: { message: "no session" } }; } },
    from() { throw new Error("must not query org_memberships when unauthenticated"); },
  };
  const identity = await resolveViewerIdentityFromAuthenticatedClient(supabase);
  assert.deepEqual(identity, { userId: null, orgId: null });
});

test("viewer identity: claims with no sub → { userId: null, orgId: null }, no membership query", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: { claims: {} }, error: null }; } },
    from() { throw new Error("must not query org_memberships with no sub"); },
  };
  const identity = await resolveViewerIdentityFromAuthenticatedClient(supabase);
  assert.deepEqual(identity, { userId: null, orgId: null });
});

test("viewer identity: membership query error → { userId, orgId: null } (fail-soft, matches resolveOrgIdFromAuthenticatedClient's contract)", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-789" } },
    membershipData: null,
    membershipError: { message: "connection reset" },
  });
  const identity = await resolveViewerIdentityFromAuthenticatedClient(supabase);
  assert.deepEqual(identity, { userId: "user-789", orgId: null });
});

test("resolveViewerIdentityFromCookies outside a request context → fails soft to { userId: null, orgId: null }, never throws", async () => {
  const identity = await resolveViewerIdentityFromCookies();
  assert.deepEqual(identity, { userId: null, orgId: null });
});
