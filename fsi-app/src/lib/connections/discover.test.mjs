// Test for connection discovery (Pillar A1). Pure — runs in the no-npm suite via the
// src/lib/connections/*.test.mjs glob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreConnection, discoverConnections } from "./discover.mjs";

const reg = { id: "r1", item_type: "regulation", canonical_instrument_key: "32024R1610", source_id: "s1", compliance_object_tags: ["cbam-certificate"], operational_scenario_tags: ["ocean-import"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };

test("same instrument dominates and names the relationship", () => {
  const mkt = { id: "m1", item_type: "market_signal", canonical_instrument_key: "32024R1610", jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const r = scoreConnection(reg, mkt);
  assert.ok(r.score >= 0.9);
  assert.equal(r.relationship, "same_instrument");
  assert.equal(r.crossSurface, true); // regulation <-> market_signal
  assert.ok(r.basis.some((b) => b.signal === "same_instrument"));
});

test("shared compliance object + jurisdiction+topic accumulate, grounded in basis", () => {
  const research = { id: "res1", item_type: "research_finding", compliance_object_tags: ["cbam-certificate"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const r = scoreConnection(reg, research);
  assert.ok(r.score >= 0.18 + 0.2 - 1e-9);
  assert.ok(r.basis.some((b) => b.detail.includes("cbam-certificate")));
  assert.ok(r.basis.some((b) => b.signal === "shared_jurisdiction_topic"));
  assert.equal(r.crossSurface, true);
});

test("jurisdiction alone (no topic overlap) does NOT connect", () => {
  const other = { id: "x", item_type: "regulation", jurisdictions: ["eu"], topic_tags: ["noise"] };
  const r = scoreConnection(reg, other);
  assert.equal(r.basis.some((b) => b.signal === "shared_jurisdiction_topic"), false);
});

test("no shared basis → score 0, no invented link", () => {
  const unrelated = { id: "u", item_type: "regulation", jurisdictions: ["brazil"], topic_tags: ["labor"] };
  const r = scoreConnection(reg, unrelated);
  assert.equal(r.score, 0);
  assert.deepEqual(r.basis, []);
});

test("same item / missing ids never self-connect", () => {
  assert.equal(scoreConnection(reg, reg).score, 0);
  assert.equal(scoreConnection(reg, {}).score, 0);
});

test("discoverConnections ranks cross-surface first, respects threshold + limit", () => {
  const sameSurfaceStrong = { id: "r2", item_type: "regulation", canonical_instrument_key: "32024R1610" }; // same instrument, same surface
  const crossSurfaceWeaker = { id: "m2", item_type: "market_signal", compliance_object_tags: ["cbam-certificate"], jurisdictions: ["eu"], topic_tags: ["carbon-pricing"] };
  const noise = { id: "n", item_type: "regulation", jurisdictions: ["brazil"], topic_tags: ["labor"] };
  const out = discoverConnections(reg, [sameSurfaceStrong, crossSurfaceWeaker, noise], { threshold: 0.3, limit: 5 });
  assert.equal(out.length, 2); // noise excluded
  assert.equal(out[0].target, "m2"); // cross-surface ranked first despite lower raw score
  assert.equal(out.every((c) => c.basis.length > 0), true); // every emitted connection is grounded
});
