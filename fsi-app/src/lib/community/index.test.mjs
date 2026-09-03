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
    "corroborationCount",
    "promotionState",
    "evidenceAge",
  ]) {
    assert.equal(typeof community[name], "function", `${name} must be exported as a function`);
  }
});

test("interface contract: evaluateAntitrustGuard(post) -> { allowed, reason, aggregateRoute }", () => {
  const r = community.evaluateAntitrustGuard({ sensitivityField: null });
  assert.ok("allowed" in r && "reason" in r && "aggregateRoute" in r);
});

test("interface contract: projectAuthorIdentity(profile) -> { orgType, role, sector, region, verified }", () => {
  const r = community.projectAuthorIdentity({ org_type: "carrier", role: "Ops", sector: "pharma", region: "US", verified: true });
  assert.deepEqual(Object.keys(r).sort(), ["orgType", "region", "role", "sector", "verified"]);
});

test("interface contract: corroborationCount(thread) -> includes { organisations, posts }", () => {
  const r = community.corroborationCount({ posts: [] });
  assert.ok("organisations" in r && "posts" in r);
});

test("interface contract: promotionState(thread) -> { state, transitions[] }", () => {
  const r = community.promotionState({ transitions: [] });
  assert.ok("state" in r && Array.isArray(r.transitions));
});

test("interface contract: evidenceAge(evidence, now) -> { ageDays, weight, chip }", () => {
  const r = community.evidenceAge({ assertedAt: "2026-01-01" }, new Date("2026-09-03"));
  assert.ok("ageDays" in r && "weight" in r && "chip" in r);
});
