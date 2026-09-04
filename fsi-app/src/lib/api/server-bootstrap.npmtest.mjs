// @ts-check
// PERF-7 (2026-09-04, docs/audits/perf-load-times-2026-09-03.md §13): pins
// resolveServerBootstrapFromClient's getClaims()-based contract —
// authenticated, unauthenticated, expired token, malformed claims, and the
// symmetric-secret fallback path all resolve the bootstrap the same way
// getUser()-based code used to, using only claims.sub/claims.email. jiti
// (@/ alias resolution) needed because server-bootstrap.ts imports
// @/lib/supabase-server-client, which value-imports next/headers — same
// reason org.npmtest.mjs uses it. Runs via the CI "App unit tests requiring
// npm deps" step's *.npmtest.mjs glob (git ls-files
// 'fsi-app/src/**/*.npmtest.mjs') — no run-test-suite.sh edit needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { resolveServerBootstrapFromClient, resolveServerBootstrap } = await jiti.import("./server-bootstrap.ts");

/** Minimal fake Supabase client covering exactly the calls
 *  resolveServerBootstrapFromClient issues: auth.getClaims(), then
 *  .from("org_memberships")...maybeSingle(), .from("profiles")...maybeSingle(), and — only when a
 *  membership resolves an org_id — .from("workspace_settings")...maybeSingle(). */
function fakeSupabase({
  claimsData = null,
  claimsError = null,
  membershipData = null,
  profileData = null,
  workspaceData = null,
} = {}) {
  return {
    auth: {
      async getClaims() {
        return { data: claimsData, error: claimsError };
      },
    },
    from(table) {
      if (table === "org_memberships") {
        return {
          select(cols) {
            assert.match(cols, /org_id/);
            return {
              eq(col) {
                assert.equal(col, "user_id");
                return {
                  order() {
                    return { limit() { return { maybeSingle: async () => ({ data: membershipData, error: null }) }; } };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select(cols) {
            assert.match(cols, /sector_overrides/);
            return { eq(col) { assert.equal(col, "id"); return { maybeSingle: async () => ({ data: profileData, error: null }) }; } };
          },
        };
      }
      if (table === "workspace_settings") {
        return {
          select(cols) {
            assert.match(cols, /sector_profile/);
            return { eq(col) { assert.equal(col, "org_id"); return { maybeSingle: async () => ({ data: workspaceData, error: null }) }; } };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// ── authenticated: claims carry sub + email, membership/profile/workspace all resolve ──
test("authenticated: getClaims returns claims.sub + claims.email, full bootstrap resolves", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-123", email: "jane@acme.example", role: "authenticated" } },
    membershipData: { org_id: "org-abc", role: "member", organizations: { id: "org-abc", name: "Acme Freight" } },
    profileData: { sector_overrides: ["ocean"] },
    workspaceData: { sector_profile: ["ocean", "air"] },
  });
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.deepEqual(bootstrap, {
    user: { id: "user-123", email: "jane@acme.example" },
    orgId: "org-abc",
    orgName: "Acme Freight",
    role: "member",
    sectors: ["ocean"],
    workspaceSectors: ["ocean", "air"],
  });
});

// ── authenticated but claims carry no email (e.g. phone-only signup) — user.email is null, not "" or absent ──
test("authenticated, no email claim → user.email is null (matches the prior optional User.email contract)", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-777", role: "authenticated" } },
    membershipData: null,
    profileData: null,
  });
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.deepEqual(bootstrap.user, { id: "user-777", email: null });
  assert.equal(bootstrap.orgId, null);
});

// ── authenticated, no membership row → EMPTY-shaped org fields, user still populated, no workspace query ──
test("authenticated but no membership → orgId null, workspaceSectors empty, workspace_settings never queried", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: { claims: { sub: "user-1" } }, error: null }; } },
    from(table) {
      if (table === "org_memberships") return { select() { return { eq() { return { order() { return { limit() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } }; } }; } };
      if (table === "profiles") return { select() { return { eq() { return { maybeSingle: async () => ({ data: null, error: null }) }; } }; } };
      throw new Error(`must not query ${table} when there is no org membership`);
    },
  };
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.equal(bootstrap.orgId, null);
  assert.deepEqual(bootstrap.workspaceSectors, []);
  assert.equal(bootstrap.user?.id, "user-1");
});

// ── unauthenticated: getClaims reports an error (no session) — returns EMPTY, no queries issued ──
test("unauthenticated: getClaims error → EMPTY bootstrap, org_memberships/profiles never queried", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: null, error: { message: "no session" } }; } },
    from(table) { throw new Error(`must not query ${table} when unauthenticated`); },
  };
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.equal(bootstrap.user, null);
  assert.equal(bootstrap.orgId, null);
  assert.deepEqual(bootstrap.sectors, []);
});

// ── expired token: getClaims surfaces an AuthInvalidJwtError-shaped error, same branch as unauthenticated ──
test("expired token: getClaims error (expired) → EMPTY bootstrap, no queries", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: null, error: { message: "JWT expired", name: "AuthInvalidJwtError" } }; } },
    from(table) { throw new Error(`must not query ${table} when the token is expired`); },
  };
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.equal(bootstrap.user, null);
});

// ── claims present but malformed (no sub) — degrades to EMPTY, never throws on a bad shape ──
test("claims object with no sub → EMPTY bootstrap, no queries", async () => {
  const supabase = {
    auth: { async getClaims() { return { data: { claims: {} }, error: null }; } },
    from(table) { throw new Error(`must not query ${table} with no sub`); },
  };
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.equal(bootstrap.user, null);
});

// ── the symmetric-secret fallback path (getClaims() internally calls getUser() and returns the JWT's
// own payload as claims — see node_modules/@supabase/auth-js's GoTrueClient.getClaims, the `!signingKey`
// branch) is opaque to this function: it only ever sees the same { data: { claims }, error } shape
// getClaims() returns in EITHER case, so the fallback needs no separate code path — this test proves
// that by feeding exactly what the fallback branch would produce. ──
test("symmetric-secret fallback shape (claims sourced from getUser() internally by getClaims) → resolves the same as the asymmetric path", async () => {
  const supabase = fakeSupabase({
    claimsData: { claims: { sub: "user-456", role: "authenticated", email: "b@example.com" } },
    membershipData: { org_id: "org-xyz", role: "owner", organizations: { id: "org-xyz", name: "Beta Logistics" } },
    profileData: null,
  });
  const bootstrap = await resolveServerBootstrapFromClient(supabase);
  assert.equal(bootstrap.user?.id, "user-456");
  assert.equal(bootstrap.user?.email, "b@example.com");
  assert.equal(bootstrap.orgId, "org-xyz");
  assert.equal(bootstrap.role, "owner");
});

// ── getClaims rejecting propagates out of the pure core (resolveServerBootstrap's own try/catch is
// what turns this into the EMPTY fallback — matches requireAuth's identical contract in auth.ts). ──
test("getClaims rejecting propagates out of resolveServerBootstrapFromClient", async () => {
  const supabase = { auth: { async getClaims() { throw new Error("network unreachable"); } } };
  await assert.rejects(() => resolveServerBootstrapFromClient(supabase), /network unreachable/);
});

// ── resolveServerBootstrap (the cache()-wrapped, cookie-driven wrapper): outside a Next.js request
// context (plain node --test), next/headers' cookies() throws (no request scope) — same realistic
// failure mode org.npmtest.mjs's resolveOrgIdFromCookies test exercises. Proves the try/catch (and the
// cache() wrapper around it) fails soft to EMPTY, never throws — this IS the "no network" case: no
// Supabase client is ever constructed, let alone dialed. ──
test("resolveServerBootstrap outside a request context → fails soft to EMPTY, never throws", async () => {
  const bootstrap = await resolveServerBootstrap();
  assert.deepEqual(bootstrap, {
    user: null,
    orgId: null,
    orgName: "",
    role: null,
    sectors: [],
    workspaceSectors: [],
  });
});
