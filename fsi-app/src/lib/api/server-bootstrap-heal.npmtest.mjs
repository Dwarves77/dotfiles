// server-bootstrap-heal.npmtest.mjs: lane AUTH-2 (2026-10-06). The server bootstrap heals a missing
// profile (profile only) for any signed-in session, by any sign-in path, and reports "no membership" as
// orgId null so the shell routes the user to onboarding. It never creates an organisation or membership.
//
// Run: node --test fsi-app/src/lib/api/server-bootstrap-heal.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { resolveServerBootstrapFromClient } = await jiti.import("./server-bootstrap.ts");

function fakeSupabase({ membership = null, profile = null }) {
  return {
    auth: {
      async getClaims() {
        return { data: { claims: { sub: "user-1", email: "u@example.com" } }, error: null };
      },
    },
    from(table) {
      const data = table === "org_memberships" ? membership : profile;
      return {
        select() {
          return {
            eq() {
              const tail = { maybeSingle: async () => ({ data, error: null }) };
              return { order: () => ({ limit: () => tail }), ...tail };
            },
          };
        },
      };
    },
  };
}

test("no profile and no membership: the profile is healed once, orgId stays null (so the shell routes to onboarding)", async () => {
  const calls = [];
  const b = await resolveServerBootstrapFromClient(fakeSupabase({}), async (id, email) => {
    calls.push([id, email]);
    return { exists: true };
  });
  assert.deepEqual(calls, [["user-1", "u@example.com"]]);
  assert.equal(b.orgId, null);
  assert.equal(b.user.id, "user-1");
  assert.equal(b.isPlatformAdmin, false);
});

test("an existing profile is never healed", async () => {
  let called = 0;
  await resolveServerBootstrapFromClient(
    fakeSupabase({ profile: { sector_overrides: [], is_platform_admin: true } }),
    async () => { called++; return { exists: true }; }
  );
  assert.equal(called, 0);
});

test("a member of another org with an existing profile gets no heal and keeps their org", async () => {
  let called = 0;
  const b = await resolveServerBootstrapFromClient(
    fakeSupabase({
      membership: { org_id: "org-9", role: "member", organizations: { id: "org-9", name: "Other", workspace_settings: [] } },
      profile: { sector_overrides: [], is_platform_admin: false },
    }),
    async () => { called++; return { exists: true }; }
  );
  assert.equal(called, 0);
  assert.equal(b.orgId, "org-9");
  assert.equal(b.role, "member");
});

test("a heal that fails or throws never breaks the bootstrap", async () => {
  const failed = await resolveServerBootstrapFromClient(fakeSupabase({}), async () => ({ exists: false }));
  assert.equal(failed.orgId, null);
  const thrown = await resolveServerBootstrapFromClient(fakeSupabase({}), async () => { throw new Error("boom"); });
  assert.equal(thrown.orgId, null);
  assert.equal(thrown.user.id, "user-1");
});

test("without a heal function (tests, callers without service credentials) nothing is written", async () => {
  const b = await resolveServerBootstrapFromClient(fakeSupabase({}));
  assert.equal(b.orgId, null);
});

// Coordinator ruling 2: a user with a profile and NO membership (for example a profile left by an older
// failed provisioning run, or a user removed from an organisation) is not a gap. The bootstrap does not
// heal them, reports orgId null, and the shell redirect routes them to onboarding, where they can create
// an organisation or accept an invitation.
test("profile present, no membership: no heal, orgId null, and the shell routes them to /workspace/new", async () => {
  const { computeNoWorkspaceRedirect } = await jiti.import("../../components/app-shell-banner.ts");
  let called = 0;
  const b = await resolveServerBootstrapFromClient(
    fakeSupabase({ profile: { sector_overrides: [], is_platform_admin: false } }),
    async () => { called++; return { exists: true }; }
  );
  assert.equal(called, 0);
  assert.equal(b.orgId, null);
  const redirect = computeNoWorkspaceRedirect({
    user: b.user, orgId: b.orgId, identityStatus: "resolved", pathname: "/", suppressRoutes: ["/workspace/new", "/onboarding"],
  });
  assert.equal(redirect, "/workspace/new");
});
