// Proof for src/components/shell/bootstrap-seed.ts (PERF-4 lane, 2026-09-03; lane AUTH-IDENTITY,
// 2026-09-24). See that module's header for the full mechanism this logic exists to support.
import test from "node:test";
import assert from "node:assert/strict";
import {
  IDENTITY_ATTEMPTS_PER_ROUND,
  IDENTITY_ERROR_SEED,
  nextIdentityRetryDelay,
  noWorkspaceLabel,
  resolveAuthSeed,
  shouldApplySeed,
  shouldShowAdminNav,
} from "./bootstrap-seed.ts";

const REAL_NO_ORG = {
  user: { id: "u3", email: "x@example.com" },
  orgId: null,
  orgName: "",
  role: null,
  sectors: [],
  workspaceSectors: [],
};

// ── Lane AUTH-IDENTITY failing-first proofs. On origin/master (44187dfa) resolveAuthSeed(null), the
// seed AuthProvider applied for ANY failed identity fetch, returned `orgId: null`: the resolved-no-org
// value. These two tests fail there and pass here. ──
test("AUTH-IDENTITY failing-first: a failed identity lookup (null bootstrap) is a state DISTINCT from a real resolved-no-org bootstrap", () => {
  const failed = resolveAuthSeed(null);
  const noOrg = resolveAuthSeed(REAL_NO_ORG);
  assert.equal(noOrg.orgId, null, "a real user with no membership resolves to orgId null");
  assert.notEqual(failed.orgId, null, "a failed lookup must never carry the resolved-no-org value");
  assert.equal(failed.orgId, undefined, "a failed lookup's org is UNKNOWN");
  assert.equal(failed.status, "error");
  assert.equal(noOrg.status, "resolved");
});

test("AUTH-IDENTITY failing-first: an error seed never overwrites a resolved one, and a later success replaces an error", () => {
  assert.equal(shouldApplySeed("resolved", "error"), false);
  assert.equal(shouldApplySeed("resolved", "resolved"), false);
  assert.equal(shouldApplySeed("error", "resolved"), true);
  assert.equal(shouldApplySeed("pending", "error"), true);
  assert.equal(shouldApplySeed("pending", "resolved"), true);
});

test("resolveAuthSeed: a signed-out answer (200, user null) resolves, with the org UNKNOWN rather than 'none'", () => {
  const seed = resolveAuthSeed({ user: null, orgId: null, orgName: "", role: null, sectors: [], workspaceSectors: [] });
  assert.equal(seed.status, "resolved");
  assert.equal(seed.user, null);
  assert.equal(seed.orgId, undefined);
  assert.equal(seed.isPlatformAdmin, false);
});

test("IDENTITY_ERROR_SEED is frozen, so no consumer can turn a failure into a fact by mutating it", () => {
  assert.ok(Object.isFrozen(IDENTITY_ERROR_SEED));
  assert.deepEqual({ ...IDENTITY_ERROR_SEED }, {
    status: "error",
    user: null,
    orgId: undefined,
    orgName: "",
    role: null,
    sectors: [],
    isPlatformAdmin: false,
  });
});

test("resolveAuthSeed: per-user sector override wins when non-empty (HYG-2 regression guard)", () => {
  const seed = resolveAuthSeed({
    user: { id: "u1" },
    orgId: "org1",
    orgName: "Acme Freight",
    role: "member",
    sectors: ["ocean"],
    workspaceSectors: ["ocean", "air", "road"],
  });
  assert.deepEqual(seed.sectors, ["ocean"]);
});

test("resolveAuthSeed: falls back to workspace sectors when the per-user override is empty (the HYG-2 bug this composition fixed)", () => {
  const seed = resolveAuthSeed({
    user: { id: "u1" },
    orgId: "org1",
    orgName: "Acme Freight",
    role: "owner",
    sectors: [],
    workspaceSectors: ["ocean", "air"],
  });
  assert.deepEqual(seed.sectors, ["ocean", "air"]);
});

test("resolveAuthSeed: passes user/orgId/orgName/role through unchanged", () => {
  const bootstrap = {
    user: { id: "u2", email: "a@b.com" },
    orgId: "org9",
    orgName: "Beta Logistics",
    role: "admin",
    sectors: [],
    workspaceSectors: [],
  };
  const seed = resolveAuthSeed(bootstrap);
  assert.equal(seed.user, bootstrap.user);
  assert.equal(seed.orgId, "org9");
  assert.equal(seed.orgName, "Beta Logistics");
  assert.equal(seed.role, "admin");
});

test("resolveAuthSeed: no workspace resolved (orgId null) still carries user + empty sectors honestly", () => {
  assert.deepEqual(resolveAuthSeed(REAL_NO_ORG), {
    status: "resolved",
    user: { id: "u3", email: "x@example.com" },
    orgId: null,
    orgName: "",
    role: null,
    sectors: [],
    isPlatformAdmin: false,
  });
});

test("resolveAuthSeed: isPlatformAdmin passes through only as a literal true for a known user", () => {
  assert.equal(resolveAuthSeed({ ...REAL_NO_ORG, isPlatformAdmin: true }).isPlatformAdmin, true);
  assert.equal(resolveAuthSeed({ ...REAL_NO_ORG, isPlatformAdmin: "true" }).isPlatformAdmin, false);
  assert.equal(resolveAuthSeed({ ...REAL_NO_ORG, user: null, isPlatformAdmin: true }).isPlatformAdmin, false);
});

test("shouldShowAdminNav: only a RESOLVED platform-admin answer shows the Admin row", () => {
  assert.equal(shouldShowAdminNav({ status: "resolved", isPlatformAdmin: true }), true);
  assert.equal(shouldShowAdminNav({ status: "resolved", isPlatformAdmin: false }), false);
  assert.equal(shouldShowAdminNav({ status: "error", isPlatformAdmin: true }), false);
  assert.equal(shouldShowAdminNav({ status: "pending", isPlatformAdmin: true }), false);
});

test("retry schedule: 3 attempts per round, the first immediate, then two bounded delays, then exhausted", () => {
  assert.equal(IDENTITY_ATTEMPTS_PER_ROUND, 3);
  const d1 = nextIdentityRetryDelay(1);
  const d2 = nextIdentityRetryDelay(2);
  assert.ok(typeof d1 === "number" && d1 > 0);
  assert.ok(typeof d2 === "number" && d2 > d1, "backoff grows");
  assert.equal(nextIdentityRetryDelay(3), null);
  assert.equal(nextIdentityRetryDelay(0), null);
});

test("noWorkspaceLabel: only a resolved lookup may say 'no workspace'", () => {
  assert.equal(noWorkspaceLabel("resolved", "No workspace"), "No workspace");
  assert.equal(noWorkspaceLabel("error", "No workspace"), "Workspace unavailable");
  assert.equal(noWorkspaceLabel("pending", "No workspace"), "Loading workspace");
});
