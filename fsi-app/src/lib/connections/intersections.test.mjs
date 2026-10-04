// intersections.test.mjs: proofs for the intersection detector (lane S3-A). Pure; runs in the no-npm
// suite via the src/lib/connections/*.test.mjs glob. Every strength below is hand-computed from the skill's
// arithmetic (+3 per shared scenario, +2 per shared non-role compliance object, +5 explicit related_items,
// +2 both CRITICAL or HIGH), never read back from the code under test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntersections, strengthToScore, tierOf, buildIntersectionEntry, isIntersectionEntry, isCrossSurface, INTERSECTION_SIGNAL } from "./intersections.mjs";
import { bandOf } from "./pair-view.mjs";

const item = (id, extra = {}) => ({
  id, item_type: "regulation", domain: 1, priority: "MODERATE",
  operational_scenario_tags: [], compliance_object_tags: [], related_items: [], ...extra,
});

test("a regulation and a market signal sharing one scenario and one non-role object intersect, cross_surface", () => {
  const reg = item("a", { item_type: "regulation", domain: 1, operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: ["customs-broker"] });
  const mkt = item("b", { item_type: "market_signal", domain: 4, operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: ["customs-broker"] });
  const out = detectIntersections([mkt, reg]);
  assert.equal(out.length, 1);
  const p = out[0];
  assert.deepEqual([p.a, p.b], ["a", "b"], "canonical ordering by id regardless of input order");
  assert.deepEqual(p.shared_scenarios, ["ocean-bunkering"]);
  assert.deepEqual(p.shared_objects, ["customs-broker"]);
  assert.equal(p.strength, 5); // 3 + 2
  assert.equal(p.tier, "weak");
  assert.equal(p.cross_surface, true);
});

test("same-surface pair is not cross_surface; uncategorized is a defect signal, not a surface", () => {
  const a = item("a", { operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const b = item("b", { item_type: "directive", operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  assert.equal(detectIntersections([a, b])[0].cross_surface, false);
  const u = item("c", { item_type: "mystery", domain: null, operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  assert.equal(detectIntersections([a, u])[0].cross_surface, false);
  assert.equal(isCrossSurface({ item_type: "regulation" }, { item_type: "research_finding" }), true);
  assert.equal(isCrossSurface({ item_type: "regulation" }, {}), null, "no item_type on one side: unknown, never guessed");
});

test("domain is passed to surfaceOf the way the page routers pass it", () => {
  const a = item("a", { item_type: "technology", domain: 7, operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const b = item("b", { item_type: "technology", domain: 2, operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  assert.equal(detectIntersections([a, b])[0].cross_surface, true, "domain 7 is research, domain 2 is market");
});

test("a shared role tag plus a shared scenario does NOT intersect (ADR-021)", () => {
  const a = item("a", { operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: ["freight-forwarder", "shipper"] });
  const b = item("b", { operational_scenario_tags: ["ocean-bunkering"], compliance_object_tags: ["freight-forwarder", "shipper"] });
  assert.deepEqual(detectIntersections([a, b]), []);
});

test("a shared role tag does not count toward strength when a real object is also shared", () => {
  const a = item("a", { operational_scenario_tags: ["s"], compliance_object_tags: ["freight-forwarder", "customs-broker"] });
  const b = item("b", { operational_scenario_tags: ["s"], compliance_object_tags: ["freight-forwarder", "customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.deepEqual(p.shared_objects, ["customs-broker"]);
  assert.equal(p.strength, 5);
});

test("sharing only a topic tag, or only a scenario, or only an object: no intersection", () => {
  const a = item("a", { topic_tags: ["emissions"], operational_scenario_tags: ["x"], compliance_object_tags: ["customs-broker"] });
  const topicOnly = item("b", { topic_tags: ["emissions"], operational_scenario_tags: ["y"], compliance_object_tags: ["distributor"] });
  const scenarioOnly = item("c", { operational_scenario_tags: ["x"], compliance_object_tags: ["distributor"] });
  const objectOnly = item("d", { operational_scenario_tags: ["z"], compliance_object_tags: ["customs-broker"] });
  assert.deepEqual(detectIntersections([a, topicOnly, scenarioOnly, objectOnly]), []);
});

test("archived and non-verified items are excluded", () => {
  const a = item("a", { operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const arch = item("b", { is_archived: true, operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const unver = item("c", { provenance_status: "unverified", operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const ok = item("d", { provenance_status: "verified", is_archived: false, operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const out = detectIntersections([a, arch, unver, ok]);
  assert.deepEqual(out.map((p) => `${p.a}|${p.b}`), ["a|d"]);
});

test("hand-computed fixture 1: 2 scenarios + 1 object, no bonus = 8, medium", () => {
  const a = item("a", { operational_scenario_tags: ["s1", "s2"], compliance_object_tags: ["customs-broker"] });
  const b = item("b", { operational_scenario_tags: ["s2", "s1", "s3"], compliance_object_tags: ["customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.equal(p.strength, 8); // 3*2 + 2*1
  assert.equal(p.tier, "medium");
});

test("hand-computed fixture 2: 1 scenario + 1 object + both HIGH/CRITICAL = 7, weak", () => {
  const a = item("a", { priority: "CRITICAL", operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const b = item("b", { priority: "HIGH", operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.equal(p.strength, 7); // 3 + 2 + 2
  assert.equal(p.tier, "weak");
  const lowOne = detectIntersections([a, item("c", { priority: "MODERATE", operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] })]);
  assert.equal(lowOne[0].strength, 5, "the priority bonus needs BOTH items CRITICAL or HIGH");
});

test("hand-computed fixture 3: 3 scenarios + 2 objects + explicit link + both HIGH = 20, strong", () => {
  const a = item("a", { priority: "HIGH", related_items: ["b"], operational_scenario_tags: ["s1", "s2", "s3"], compliance_object_tags: ["customs-broker", "distributor"] });
  const b = item("b", { priority: "HIGH", operational_scenario_tags: ["s1", "s2", "s3"], compliance_object_tags: ["distributor", "customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.equal(p.strength, 20); // 9 + 4 + 5 + 2
  assert.equal(p.tier, "strong");
});

test("the +5 explicit link counts from either side, and tier boundaries land correctly", () => {
  const a = item("a", { operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const b = item("b", { related_items: ["a"], operational_scenario_tags: ["s"], compliance_object_tags: ["customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.equal(p.strength, 10); // 3 + 2 + 5
  assert.equal(p.tier, "medium");
  assert.equal(tierOf(12), "strong");
  assert.equal(tierOf(11), "medium");
  assert.equal(tierOf(8), "medium");
  assert.equal(tierOf(7), "weak");
});

test("scenario and object matching is case-insensitive, output is normalized lowercase", () => {
  const a = item("a", { operational_scenario_tags: ["Emissions-Reporting-Scope3"], compliance_object_tags: ["Customs-Broker"] });
  const b = item("b", { operational_scenario_tags: ["emissions-reporting-scope3"], compliance_object_tags: ["customs-broker"] });
  const [p] = detectIntersections([a, b]);
  assert.deepEqual(p.shared_scenarios, ["emissions-reporting-scope3"]);
});

test("each pair appears once; ranking is strength desc then ids; duplicate ids are collapsed", () => {
  const mk = (id, scn) => item(id, { operational_scenario_tags: scn, compliance_object_tags: ["customs-broker"] });
  const items = [mk("c", ["s1"]), mk("a", ["s1", "s2"]), mk("b", ["s1", "s2"]), mk("a", ["s1", "s2"])];
  const out = detectIntersections(items);
  assert.deepEqual(out.map((p) => `${p.a}|${p.b}:${p.strength}`), ["a|b:8", "a|c:5", "b|c:5"]);
});

test("bounded: 600 items, 60 scenarios, only within-scenario pairs are formed", () => {
  const items = [];
  for (let i = 0; i < 600; i++) {
    items.push(item(`i${String(i).padStart(4, "0")}`, { operational_scenario_tags: [`scn-${i % 60}`], compliance_object_tags: ["customs-broker"] }));
  }
  const t0 = Date.now();
  const out = detectIntersections(items);
  assert.equal(out.length, 60 * 45); // 60 groups of 10 -> C(10,2) = 45 each
  assert.ok(Date.now() - t0 < 2000, "indexed pass, not all-pairs");
});

test("strengthToScore: piecewise on the 0..1 scale, tiers map onto pair-view bands, floor 0.3", () => {
  assert.equal(strengthToScore(5), 0.3);
  assert.equal(strengthToScore(7), 0.4333);
  assert.equal(strengthToScore(8), 0.5);
  assert.equal(strengthToScore(11), 0.8);
  assert.equal(strengthToScore(12), 0.9);
  assert.equal(strengthToScore(16), 1);
  assert.equal(strengthToScore(40), 1, "capped at 1");
  assert.equal(strengthToScore(2), 0.3, "below the minimum a real pair can have still clamps to the discovery floor");
  for (let s = 5; s <= 20; s++) {
    assert.equal(bandOf(strengthToScore(s)), tierOf(s), `strength ${s}: tier and pair-view band agree`);
    if (s > 5) assert.ok(strengthToScore(s) >= strengthToScore(s - 1), "monotonic");
  }
});

test("buildIntersectionEntry: the stored basis shape", () => {
  const [p] = detectIntersections([
    item("a", { operational_scenario_tags: ["s2", "s1"], compliance_object_tags: ["customs-broker"] }),
    item("b", { operational_scenario_tags: ["s1", "s2"], compliance_object_tags: ["customs-broker"] }),
  ]);
  const e = buildIntersectionEntry(p);
  assert.equal(e.signal, INTERSECTION_SIGNAL);
  assert.deepEqual(e.detail, { scenarios: ["s1", "s2"], objects: ["customs-broker"], strength: 8, tier: "medium" });
  assert.equal(e.weight, 0.5);
  assert.equal(isIntersectionEntry(e), true);
  assert.equal(isIntersectionEntry({ signal: "shared_scenario" }), false);
  assert.equal(isIntersectionEntry(null), false);
});
