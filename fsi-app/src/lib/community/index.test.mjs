// index.test.mjs — proves the interface contract (docs/plans/wave3-lanes-2026-09-03.md, COMMUNITY-A /
// COMMUNITY-B interface contract) resolves and matches the named shape, so a rename inside a module
// breaks THIS test rather than silently breaking COMMUNITY-B's import.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as community from "./index.mjs";

test("interface contract: every named export exists and is a function", () => {
  for (const name of [
    "evaluateAntitrustGuard",
    "projectAuthorIdentity",
  ]) {
    assert.equal(typeof community[name], "function", `${name} must be exported as a function`);
  }
});

test("interface contract: evaluateAntitrustGuard(post) -> { allowed, reason, aggregateRoute }", () => {
  const r = community.evaluateAntitrustGuard({ sensitivityField: null });
  assert.ok("allowed" in r && "reason" in r && "aggregateRoute" in r);
});

test("interface contract: projectAuthorIdentity(profile) -> { orgType, role, sector, region, verified, name, company, anonymous } (R8.7, migration 336)", () => {
  const r = community.projectAuthorIdentity({ org_type: "carrier", role: "Ops", sector: "pharma", region: "US", verified: true });
  assert.deepEqual(
    Object.keys(r).sort(),
    ["anonymous", "company", "name", "orgType", "region", "role", "sector", "verified"]
  );
});

test("interface contract: resolveEffectiveAnonymous({postAnonymous, profileDefaultAnonymous}) -> boolean (R8.7, migration 336)", () => {
  assert.equal(typeof community.resolveEffectiveAnonymous, "function");
  assert.equal(community.resolveEffectiveAnonymous({ postAnonymous: true, profileDefaultAnonymous: false }), true);
});
