// Run: node --test scripts/maintenance/community-topics-seed.test.mjs — no DB, deps injected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, resolveOwner, CITE } from "./community-topics-seed.mjs";
import { CANONICAL_ROOM_SLUGS } from "../seed/community-topics-seed.mjs";

const ROOMS = CANONICAL_ROOM_SLUGS.map((slug, i) => ({ id: `room-${i}`, slug }));

function baseDeps({ existingTopics = [], existingLinksByTopic = {}, admin = { id: "owner-1", is_platform_admin: true } } = {}) {
  const calls = [];
  return {
    calls,
    readAll: async (table, cols, opts) => {
      calls.push(["readAll", table]);
      if (table === "profiles") return admin ? [admin] : [];
      if (table === "community_groups") return ROOMS;
      if (table === "community_topics") return existingTopics;
      if (table === "community_topic_groups") {
        // opts.match filters by topic_id via a fake query-builder capture — tests below only ever have
        // zero or one topic pre-existing, so a flat lookup by the captured topic_id is enough here.
        let topicId;
        opts.match({ eq: (col, val) => { topicId = val; return { eq: () => {} }; } });
        return existingLinksByTopic[topicId] || [];
      }
      throw new Error(`unexpected table ${table}`);
    },
    readClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ data: admin ? [{ id: admin.id }] : [] }) }) }) }),
    guardedInsert: async (table, row, opts) => {
      calls.push(["guardedInsert", table, row, opts]);
      if (table === "community_topics") return { inserted: { id: `topic-${row.label}` }, snapshot: "snap" };
      return { inserted: { topic_id: row.topic_id, group_id: row.group_id }, snapshot: "snap" };
    },
  };
}

test("dry run: plans topics/links, writes nothing", async () => {
  const deps = baseDeps();
  const r = await main({ mode: "dry" }, deps);
  assert.equal(r.mode, "dry");
  assert.equal(r.applied, 0);
  assert.ok(r.counts.topics_would_create > 0);
  assert.ok(!deps.calls.some((c) => c[0] === "guardedInsert"));
  assert.equal(r.exitCode, 0);
});

test("apply: creates topics + links through guardedInsert with the CITE, reads back", async () => {
  const deps = baseDeps();
  const r = await main({ mode: "apply" }, deps);
  assert.ok(r.applied > 0);
  const topicWrites = deps.calls.filter((c) => c[0] === "guardedInsert" && c[1] === "community_topics");
  assert.equal(topicWrites.length, 7); // 7-topic taxonomy, none existing
  for (const w of topicWrites) assert.equal(w[3].cite, CITE);
  assert.ok(r.read_back.topics_live_for_owner >= 0);
});

test("apply: an already-existing topic (by label) is skipped, not re-created", async () => {
  const deps = baseDeps({ existingTopics: [{ id: "topic-existing", owner_user_id: "owner-1", label: "ETS & FuelEU Maritime" }] });
  const r = await main({ mode: "apply" }, deps);
  const topicWrites = deps.calls.filter((c) => c[0] === "guardedInsert" && c[1] === "community_topics");
  assert.equal(topicWrites.length, 6); // 7 minus the 1 pre-existing
  assert.equal(r.counts.topics_existing, 1);
});

test("no profiles row to own the topics: refuses cleanly, no writes, apply exits 2", async () => {
  const deps = baseDeps({ admin: null });
  const dry = await main({ mode: "dry" }, deps);
  assert.equal(dry.counts.owner_resolved, false);
  assert.equal(dry.exitCode, 0);
  const apply = await main({ mode: "apply" }, deps);
  assert.equal(apply.applied, 0);
  assert.equal(apply.exitCode, 2);
  assert.ok(!deps.calls.some((c) => c[0] === "guardedInsert"));
});

test("resolveOwner: prefers a platform admin, falls back to first profile, else null", async () => {
  assert.equal(await resolveOwner(baseDeps({ admin: { id: "a1", is_platform_admin: true } })), "a1");
  const noneDeps = baseDeps({ admin: null });
  assert.equal(await resolveOwner(noneDeps), null);
});
