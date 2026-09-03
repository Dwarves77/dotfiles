// Proof for src/components/shell/bootstrap-seed.ts (PERF-4 lane, 2026-09-03). See that module's
// header for the full mechanism this logic exists to support.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveAuthSeed, shouldApplySeed } from "./bootstrap-seed.ts";

test("resolveAuthSeed: null bootstrap (signed out, or the RSC-nav skip placeholder) resolves to the anonymous seed", () => {
  assert.deepEqual(resolveAuthSeed(null), {
    user: null,
    orgId: null,
    orgName: "",
    role: null,
    sectors: [],
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
  const seed = resolveAuthSeed({
    user: { id: "u3" },
    orgId: null,
    orgName: "",
    role: null,
    sectors: [],
    workspaceSectors: [],
  });
  assert.deepEqual(seed, { user: { id: "u3" }, orgId: null, orgName: "", role: null, sectors: [] });
});

test("shouldApplySeed: true before anything has been seeded", () => {
  assert.equal(shouldApplySeed(false), true);
});

test("shouldApplySeed: false once already seeded — every later delivery (a real re-resolve, or the RSC-nav null placeholder) is discarded", () => {
  assert.equal(shouldApplySeed(true), false);
});
