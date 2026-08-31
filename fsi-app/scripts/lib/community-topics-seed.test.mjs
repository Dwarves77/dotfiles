// Tests for the community-topics-seed taxonomy SHAPE + link-planning logic (S2, ship-wires II).
// No DB: only the pure exports (TOPICS, CANONICAL_ROOM_SLUGS, planTopicLinks) are exercised.
// Importing the module under test is side-effect-free — main() runs only when the file is
// executed directly (guarded at its bottom), never on import — so this test lives in the no-npm
// suite (run-test-suite.sh globs fsi-app/scripts/lib/*.test.mjs) even though the module it tests
// sits in scripts/seed/ (no glob covers that directory; putting the test here is what wires it
// into the suite instead of leaving it an orphaned proof).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOPICS, CANONICAL_ROOM_SLUGS, planTopicLinks } from "../seed/community-topics-seed.mjs";

test("taxonomy: exactly the 7 operator-directed topics, in order, each with a non-empty label", () => {
  assert.equal(TOPICS.length, 7);
  const labels = TOPICS.map((t) => t.label);
  assert.deepEqual(labels, [
    "ETS & FuelEU Maritime",
    "SAF & CORSIA",
    "CBAM & customs carbon",
    "ESG disclosure (CSRD/ISSB)",
    "Fleet & fuels technology",
    "Fine art & live-events logistics",
    "Regional operating costs",
  ]);
  assert.equal(new Set(labels).size, 7, "no duplicate labels");
  for (const t of TOPICS) {
    assert.ok(typeof t.label === "string" && t.label.trim().length > 0, "label must be non-empty");
    assert.ok(typeof t.rationale === "string" && t.rationale.trim().length > 0, `${t.label} has no rationale`);
  }
});

test("CANONICAL_ROOM_SLUGS: exactly the 7 slugs seed-community-regional-rooms.mjs seeds", () => {
  assert.deepEqual(CANONICAL_ROOM_SLUGS, [
    "room-global", "room-eu", "room-us", "room-uk", "room-apac", "room-latam", "room-meaf",
  ]);
});

test("taxonomy: every topic maps to at least one room, only to canonical slugs, no duplicates within a topic", () => {
  const canon = new Set(CANONICAL_ROOM_SLUGS);
  for (const t of TOPICS) {
    assert.ok(t.rooms.length >= 1, `${t.label} maps to no room`);
    for (const slug of t.rooms) assert.ok(canon.has(slug), `${t.label} maps to unknown room slug "${slug}"`);
    assert.equal(new Set(t.rooms).size, t.rooms.length, `${t.label} lists a room more than once`);
  }
});

test("taxonomy: every canonical room is reachable from at least 2 topics (no orphan room)", () => {
  const countBySlug = new Map(CANONICAL_ROOM_SLUGS.map((s) => [s, 0]));
  for (const t of TOPICS) for (const slug of t.rooms) countBySlug.set(slug, countBySlug.get(slug) + 1);
  for (const [slug, count] of countBySlug) assert.ok(count >= 2, `room ${slug} is linked from only ${count} topic(s)`);
});

test("taxonomy: 'Regional operating costs' spans all 7 rooms (by definition); no other topic is maximal", () => {
  const regional = TOPICS.find((t) => t.label === "Regional operating costs");
  assert.deepEqual([...regional.rooms].sort(), [...CANONICAL_ROOM_SLUGS].sort());
  const others = TOPICS.filter((t) => t.label !== "Regional operating costs");
  for (const t of others) {
    assert.ok(t.rooms.length < CANONICAL_ROOM_SLUGS.length, `${t.label} maps to every room — taxonomy should be grounded, not maximal`);
  }
});

test("planTopicLinks: resolves rooms that exist, NAMES rooms that don't — never throws, never guesses", () => {
  const roomIdBySlug = new Map([
    ["room-eu", "id-eu"],
    ["room-global", "id-global"],
    // room-us, room-uk, room-apac, room-latam, room-meaf deliberately absent (rooms seed partial)
  ]);
  const plan = planTopicLinks(TOPICS, roomIdBySlug);
  assert.equal(plan.length, 7);

  const saf = plan.find((p) => p.label === "SAF & CORSIA");
  assert.deepEqual(saf.resolved.map((r) => r.slug).sort(), ["room-eu", "room-global"]);
  assert.deepEqual(saf.missing, ["room-us"]);

  const regionalCosts = plan.find((p) => p.label === "Regional operating costs");
  assert.equal(regionalCosts.resolved.length, 2);
  assert.equal(regionalCosts.missing.length, 5);
  assert.deepEqual([...regionalCosts.resolved.map((r) => r.slug), ...regionalCosts.missing].sort(), [...CANONICAL_ROOM_SLUGS].sort());
});

test("planTopicLinks: resolved entries carry the room's real group_id (for the junction insert), not the slug", () => {
  const roomIdBySlug = new Map([["room-eu", "group-uuid-eu"], ["room-global", "group-uuid-global"]]);
  const plan = planTopicLinks([TOPICS[0]], roomIdBySlug); // "ETS & FuelEU Maritime" -> eu, global
  assert.deepEqual(plan[0].resolved.sort((a, b) => a.slug.localeCompare(b.slug)), [
    { slug: "room-eu", group_id: "group-uuid-eu" },
    { slug: "room-global", group_id: "group-uuid-global" },
  ]);
});

test("planTopicLinks: full room coverage resolves every mapped room for every topic, nothing missing", () => {
  const roomIdBySlug = new Map(CANONICAL_ROOM_SLUGS.map((s, i) => [s, `id-${i}`]));
  const plan = planTopicLinks(TOPICS, roomIdBySlug);
  for (const p of plan) assert.equal(p.missing.length, 0, `${p.label} should have no missing rooms once every room is seeded`);
});

test("planTopicLinks: zero rooms seeded -> every topic fully missing, nothing resolved (never throws)", () => {
  const plan = planTopicLinks(TOPICS, new Map());
  for (const p of plan) {
    assert.equal(p.resolved.length, 0);
    assert.equal(p.missing.length, TOPICS.find((t) => t.label === p.label).rooms.length);
  }
});

test("importing the seed module is side-effect-free (no APPLY, no thrown error) under a plain node --test run", () => {
  // If main() had fired on import (the guard broken), this test file itself would already have
  // crashed or hung on a DB call before reaching here. Reaching this assertion IS the proof.
  assert.equal(typeof planTopicLinks, "function");
});
