// app-shell-redirect.npmtest.mjs: lane AUTH-2 (2026-10-06). A signed-in user with a RESOLVED "no
// membership" answer is routed to onboarding (/workspace/new). The redirect shares the banner's predicate,
// so it never fires for a pending or failed lookup, an anonymous viewer, or a setup route (no loop).
//
// Run: node --test fsi-app/src/components/app-shell-redirect.npmtest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const { computeNoWorkspaceRedirect } = await jiti.import("./app-shell-banner.ts");

const SUPPRESS = ["/workspace/new", "/invitations/", "/onboarding", "/login", "/auth", "/signup"];
const base = { user: { id: "u1" }, orgId: null, identityStatus: "resolved", pathname: "/", suppressRoutes: SUPPRESS };

test("signed in, resolved, no membership: routed to onboarding", () => {
  assert.equal(computeNoWorkspaceRedirect(base), "/workspace/new");
  assert.equal(computeNoWorkspaceRedirect({ ...base, pathname: "/regulations" }), "/workspace/new");
});

test("never for a member, a pending or failed lookup, or an anonymous viewer", () => {
  assert.equal(computeNoWorkspaceRedirect({ ...base, orgId: "org-1" }), null);
  assert.equal(computeNoWorkspaceRedirect({ ...base, orgId: undefined, identityStatus: "pending" }), null);
  assert.equal(computeNoWorkspaceRedirect({ ...base, identityStatus: "error" }), null);
  assert.equal(computeNoWorkspaceRedirect({ ...base, user: null }), null);
});

test("never on a setup route (no redirect loop, invitation pages stay reachable)", () => {
  for (const pathname of ["/workspace/new", "/onboarding", "/invitations/abc", "/login", "/signup", "/auth/callback"]) {
    assert.equal(computeNoWorkspaceRedirect({ ...base, pathname }), null, pathname);
  }
});
