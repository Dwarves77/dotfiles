// Proof for scripts/lib/revalidate.mjs (perf lane, 2026-09-03). No network, no npm deps — a fake
// `fetchImpl` stands in for the real fetch call.
import test from "node:test";
import assert from "node:assert/strict";
import { revalidateTags, itemTag, surfaceDetailTag } from "./revalidate.mjs";

test("itemTag/surfaceDetailTag mirror src/lib/cache/revalidate-item.ts's format exactly", () => {
  assert.equal(itemTag("g14"), "item:g14");
  assert.equal(surfaceDetailTag("regulations"), "regulations-detail");
  assert.equal(surfaceDetailTag("market"), "market-detail");
});

test("dry by default: no fetch call, applied:false, reason 'dry'", async () => {
  let calls = 0;
  const result = await revalidateTags([itemTag("g14")], {
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(calls, 0, "revalidateTags must not call fetch unless apply:true");
  assert.deepEqual(result, { applied: false, tags: ["item:g14"], reason: "dry" });
});

test("apply:true POSTs the tags with the worker-secret header to <appUrl>/api/revalidate", async () => {
  const requests = [];
  const result = await revalidateTags([itemTag("g14"), surfaceDetailTag("regulations")], {
    apply: true,
    appUrl: "https://example.test/",
    workerSecret: "s3cret",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.test/api/revalidate", "trailing slash on appUrl must be stripped");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers["x-worker-secret"], "s3cret");
  assert.deepEqual(JSON.parse(requests[0].init.body), { tags: ["item:g14", "regulations-detail"] });
  assert.deepEqual(result, { applied: true, tags: ["item:g14", "regulations-detail"], status: 200 });
});

test("apply:true with no APP_URL/WORKER_SECRET skips (best-effort, never throws)", async () => {
  let calls = 0;
  const result = await revalidateTags([itemTag("g14")], {
    apply: true,
    appUrl: undefined,
    workerSecret: undefined,
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no APP_URL/WORKER_SECRET");
});

test("a non-2xx response is reported, not thrown", async () => {
  const result = await revalidateTags([itemTag("g14")], {
    apply: true,
    appUrl: "https://example.test",
    workerSecret: "s3cret",
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  assert.equal(result.applied, false);
  assert.equal(result.status, 401);
});

test("a network error is caught and reported, not thrown", async () => {
  const result = await revalidateTags([itemTag("g14")], {
    apply: true,
    appUrl: "https://example.test",
    workerSecret: "s3cret",
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    },
  });
  assert.equal(result.applied, false);
  assert.match(result.reason, /ECONNRESET/);
});

test("empty tag list is a no-op, never calls fetch even with apply:true", async () => {
  let calls = 0;
  const result = await revalidateTags([], {
    apply: true,
    appUrl: "https://example.test",
    workerSecret: "s3cret",
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200 };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "no tags given");
});

test("duplicate tags are deduplicated", async () => {
  const requests = [];
  await revalidateTags([itemTag("g14"), itemTag("g14")], {
    apply: true,
    appUrl: "https://example.test",
    workerSecret: "s3cret",
    fetchImpl: async (url, init) => {
      requests.push(init);
      return { ok: true, status: 200 };
    },
  });
  assert.deepEqual(JSON.parse(requests[0].body), { tags: ["item:g14"] });
});
