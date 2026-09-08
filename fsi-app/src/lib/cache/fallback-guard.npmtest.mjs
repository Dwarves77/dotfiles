// fallback-guard proof (lane rsc503, 2026-09-08).
//
// THE DEFECT THIS TEST WOULD HAVE CAUGHT, stated as the audit measured it on production
// (CLICKTHROUGH-2026-09-08, "Blocking finding"): on two of three cold loads of `/`, the dashboard
// rendered `DUE NEXT · 0 ITEMS` + `no detection pass on record` + `Data temporarily unavailable.
// Refresh to retry.` together, and was still in that state 79 seconds later.
//
// Those three strings are the three surfaces of ONE payload: `fetchDashboardData`'s `emptyFallback`
// (`resources: []`, `auditDate: ""`, `_error: SEED_FALLBACK_ERROR`). That payload is RESOLVED, not
// thrown, and `lib/data.ts` hands the fetcher to `unstable_cache`, which stores whatever the
// callback resolves to. One transient Supabase timeout therefore poisoned the org's cache entry and
// every subsequent request was answered from it without touching the database, which is also why
// "Refresh to retry" could not retry.
//
// Test 1 reproduces that with a stand-in cache whose store-on-resolve semantics are taken from
// next@16.1.6's own `dist/server/web/spec-extension/unstable-cache.js` (`const result = await
// ...run(innerCacheStore, cb, ...args)` followed by an unconditional `cacheNewResult(result, ...)`,
// which is skipped entirely when the callback rejects). It asserts BOTH directions: unguarded, the
// failure is cached and the recovered fetcher is never reached; guarded, it is not cached and the
// very next call returns live data.
//
// Test 4 is the structural half: every `unstable_cache` wrapper in lib/data.ts over an
// `_error`-capable fetcher carries the guard, and every reader unwraps it. Without it a sixth
// cached fetcher could reintroduce the class silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const {
  isFallbackPayload,
  refuseToCacheFallback,
  readThroughFallbackGuard,
  FallbackNotCacheableError,
} = await jiti.import("./fallback-guard.ts");

/**
 * Stand-in for `unstable_cache`, carrying only the property under test: the callback's RESOLVED
 * value is stored under the key and served to every later call; a REJECTED callback stores nothing.
 * Both halves are what next@16.1.6's implementation does.
 */
function fakeUnstableCache(cb, key) {
  const store = new Map();
  return async (...args) => {
    const k = key + "|" + JSON.stringify(args);
    if (store.has(k)) return store.get(k);
    const result = await cb(...args); // a rejection here skips the set below, exactly as Next does
    store.set(k, result);
    return result;
  };
}

const FALLBACK = { resources: [], auditDate: "", _error: "Data temporarily unavailable. Refresh to retry." };
const LIVE = { resources: [{ id: "r1" }], auditDate: "2026-09-08" };

/** A fetcher that fails once (a transient Supabase timeout) and is healthy afterwards. */
function flakyFetcher() {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return calls === 1 ? FALLBACK : LIVE;
  };
  fn.calls = () => calls;
  return fn;
}

test("unguarded: one transient failure is cached and never recovers (the production defect)", async () => {
  const fetcher = flakyFetcher();
  const cached = fakeUnstableCache(fetcher, "app-data");

  assert.equal((await cached("org-1"))._error, FALLBACK._error, "first read fails, as it did in production");
  const second = await cached("org-1");

  // This is the defect: the second read is served the FAILURE from cache, and the healthy fetcher
  // that would have answered it is never called. "Refresh to retry" cannot retry.
  assert.equal(second._error, FALLBACK._error);
  assert.deepEqual(second.resources, []);
  assert.equal(fetcher.calls(), 1, "the recovered read never ran");
});

test("guarded: the failure is not cached, and the next read is live data", async () => {
  const fetcher = flakyFetcher();
  const cached = fakeUnstableCache(refuseToCacheFallback(fetcher), "app-data");

  const first = await readThroughFallbackGuard(() => cached("org-1"));
  // The caller still sees the same fallback payload it always saw, byte for byte, sentinel included.
  assert.deepEqual(first, FALLBACK);

  const second = await readThroughFallbackGuard(() => cached("org-1"));
  assert.equal(second._error, undefined, "the poisoned entry was never written");
  assert.deepEqual(second.resources, LIVE.resources);
  assert.equal(fetcher.calls(), 2, "the second read really re-ran the fetcher");

  // And a healthy payload is still cached, so the fix costs nothing on the happy path.
  await readThroughFallbackGuard(() => cached("org-1"));
  assert.equal(fetcher.calls(), 2, "healthy payloads are still served from cache");
});

test("the guard only intercepts its own rejection; real errors keep propagating", async () => {
  const boom = new Error("supabase exploded");
  await assert.rejects(
    () => readThroughFallbackGuard(async () => { throw boom; }),
    (e) => e === boom,
  );
  const err = new FallbackNotCacheableError(FALLBACK);
  assert.deepEqual(await readThroughFallbackGuard(async () => { throw err; }), FALLBACK);
});

test("isFallbackPayload reads the sentinel, not the emptiness", () => {
  assert.equal(isFallbackPayload(FALLBACK), true);
  assert.equal(isFallbackPayload(LIVE), false);
  // An honestly empty workspace is NOT a fallback and must stay cacheable, or a new workspace
  // would re-run the full read on every request forever.
  assert.equal(isFallbackPayload({ resources: [], auditDate: "2026-09-08" }), false);
  assert.equal(isFallbackPayload({ _error: "" }), false);
  assert.equal(isFallbackPayload(null), false);
  assert.equal(isFallbackPayload(undefined), false);
  assert.equal(isFallbackPayload([]), false);
});

test("every _error-capable cached fetcher in lib/data.ts carries the guard", () => {
  const src = readFileSync(resolve(ROOT, "src/lib/data.ts"), "utf8");

  // The five fetchers whose own bodies return `{ ..._error: SEED_FALLBACK_ERROR }`
  // (supabase-server.ts) AND which lib/data.ts wraps in unstable_cache.
  const guarded = [
    "fetchDashboardData",
    "fetchResourcesOnly",
    "fetchListingsOnly",
    "fetchPublicResourcesOnly",
    "fetchPublicListingsOnly",
  ];

  // Slice each `unstable_cache(` call and require the guard inside whichever slice names the fetcher.
  const blocks = src.split("unstable_cache(").slice(1);
  for (const name of guarded) {
    const owning = blocks.filter((b) => b.slice(0, b.indexOf("\n);")).includes(name));
    assert.equal(owning.length, 1, `${name} should be wrapped by exactly one unstable_cache call`);
    assert.ok(
      owning[0].includes("refuseToCacheFallback"),
      `the unstable_cache wrapper over ${name} must use refuseToCacheFallback, or one transient failure is cached`,
    );
  }

  // And every read of those five caches unwraps the guard, or the rejection reaches the caller's
  // catch and is misreported as an exception.
  const readers = [
    "cachedAppData",
    "cachedResourcesOnly",
    "cachedListingsOnly",
    "cachedPublicResourcesOnly",
    "cachedPublicListingsOnly",
  ];
  for (const reader of readers) {
    const callSites = [...src.matchAll(new RegExp(`[^a-zA-Z]${reader}\\(`, "g"))];
    assert.ok(callSites.length >= 1, `${reader} should be called`);
    for (const m of callSites) {
      const window = src.slice(Math.max(0, m.index - 260), m.index + 60);
      assert.ok(
        window.includes("readThroughFallbackGuard"),
        `the read of ${reader} must go through readThroughFallbackGuard`,
      );
    }
  }
});
