// api-client.test.mjs — proves the typed client against A's Community API contract (wave3 plan
// "Interface contract with COMMUNITY-B"): entity-binding is required client-side before the network
// call, a 403 guard refusal surfaces its aggregate_route, and every wrapper fails soft (returns
// null / a typed failure) rather than throwing on a network error or a malformed response.

import test from "node:test";
import assert from "node:assert/strict";
import {
  createCommunityPost,
  getThreadCorroboration,
  getEntityThreads,
  getCurrentBenchmarks,
  fixtures,
} from "./api-client.ts";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("createCommunityPost refuses client-side with zero entity_ids and never calls fetch", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse(200, { post: {} });
  };
  const result = await createCommunityPost(
    { group_id: "g1", body: "hello", entity_ids: [] },
    fetchImpl
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 0);
    assert.match(result.error, /spine entity/);
  }
  assert.equal(called, false, "no network call for an unbound post");
});

test("createCommunityPost posts entity_ids and returns the created post on 2xx", async () => {
  let sentBody = null;
  const fetchImpl = async (url, init) => {
    assert.equal(url, "/api/community/posts");
    sentBody = JSON.parse(init.body);
    return jsonResponse(200, { post: { id: "p1" } });
  };
  const result = await createCommunityPost(
    { group_id: "g1", body: "hello", entity_ids: ["cl:corridor:abc"] },
    fetchImpl
  );
  assert.deepEqual(sentBody.entity_ids, ["cl:corridor:abc"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.post, { id: "p1" });
});

test("createCommunityPost surfaces the guard's aggregate_route on a 403 refusal", async () => {
  const fetchImpl = async () => jsonResponse(403, fixtures.guardRefusal);
  const result = await createCommunityPost(
    { group_id: "g1", body: "SAF premium is $2.10/kg", entity_ids: ["cl:corridor:abc"] },
    fetchImpl
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 403);
    assert.equal(result.error, fixtures.guardRefusal.error);
    assert.deepEqual(result.aggregateRoute, fixtures.guardRefusal.aggregate_route);
  }
});

test("createCommunityPost does not surface aggregate_route on a non-403 4xx", async () => {
  const fetchImpl = async () => jsonResponse(400, { error: "body is required" });
  const result = await createCommunityPost(
    { group_id: "g1", body: "", entity_ids: ["cl:corridor:abc"] },
    fetchImpl
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.equal(result.aggregateRoute, undefined);
  }
});

test("createCommunityPost fails soft (status 0) on a network error", async () => {
  const fetchImpl = async () => {
    throw new Error("fetch failed");
  };
  const result = await createCommunityPost(
    { group_id: "g1", body: "hi", entity_ids: ["cl:corridor:abc"] },
    fetchImpl
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 0);
});

test("getThreadCorroboration returns null on a non-2xx instead of throwing", async () => {
  const fetchImpl = async () => jsonResponse(404, { error: "not found" });
  const result = await getThreadCorroboration("t1", fetchImpl);
  assert.equal(result, null);
});

test("getThreadCorroboration returns the parsed body on success", async () => {
  const body = { thread_id: "t1", organisations: 4, posts: 6, consistent: true };
  const fetchImpl = async (url) => {
    assert.equal(url, "/api/community/threads/t1/corroboration");
    return jsonResponse(200, body);
  };
  const result = await getThreadCorroboration("t1", fetchImpl);
  assert.deepEqual(result, body);
});

test("getEntityThreads encodes the entity id and forwards limit/before", async () => {
  const fetchImpl = async (url) => {
    assert.equal(
      url,
      "/api/community/entities/cl%3Acorridor%3Aabc/threads?limit=5&before=2026-08-01"
    );
    return jsonResponse(200, fixtures.entityThreads);
  };
  const result = await getEntityThreads(
    "cl:corridor:abc",
    { limit: 5, before: "2026-08-01" },
    fetchImpl
  );
  assert.deepEqual(result, fixtures.entityThreads);
});

test("getEntityThreads fails soft to null on a network error", async () => {
  const fetchImpl = async () => {
    throw new Error("boom");
  };
  const result = await getEntityThreads("cl:corridor:abc", {}, fetchImpl);
  assert.equal(result, null);
});

test("getCurrentBenchmarks returns [] when the route responds with no benchmarks key", async () => {
  const fetchImpl = async () => jsonResponse(200, {});
  const result = await getCurrentBenchmarks(fetchImpl);
  assert.deepEqual(result, []);
});

test("getCurrentBenchmarks passes through an unpublishable aggregate's reason, never a fabricated value", async () => {
  const fetchImpl = async () => jsonResponse(200, { benchmarks: fixtures.benchmarks });
  const result = await getCurrentBenchmarks(fetchImpl);
  assert.equal(result[0].aggregate.publishable, false);
  assert.equal(result[0].aggregate.value, null);
  assert.match(result[0].aggregate.reason, /5 distinct/);
});
