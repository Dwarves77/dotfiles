// @ts-check
// TRANSPORT HOLD + CACHE WIRING (Wave-α C5). The pure hold/cache core is proven in fetch-hold.test.mjs;
// THIS proves the LIVE transports honor it: (1) hold engaged blocks each transport (rssFetch + apiFetch
// throw FetchHoldError; the pipeline's direct/API-ladder closures do NO network fetch); (2) a successful
// fetch through buildLiveTransports caches the result so a cacheGet HIT prevents a duplicate fetch.
// jiti imports the TS/@-aliased modules (mint-domain-guard.npmtest.mjs pattern).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });

const { rssFetch } = await jiti.import("./rss-fetch.ts");
const { apiFetch } = await jiti.import("./api-fetch.ts");
const { FetchHoldError } = await jiti.import("./fetch-hold.mjs");
const { buildLiveTransports, __clearFetchCacheForTest } = await jiti.import("../agent/canonical-pipeline.ts");

function withHold(v, fn) {
  const prev = process.env.SCRAPE_HOLD;
  process.env.SCRAPE_HOLD = v;
  return Promise.resolve()
    .then(fn)
    .finally(() => { if (prev === undefined) delete process.env.SCRAPE_HOLD; else process.env.SCRAPE_HOLD = prev; });
}

test("hold ENGAGED: rssFetch throws FetchHoldError, no network fetch", async () => {
  await withHold("1", async () => {
    let fetched = false;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { fetched = true; return { ok: true, status: 200, text: async () => "" }; };
    try {
      await assert.rejects(() => rssFetch({ url: "https://example.gov/feed.xml" }), (e) => e instanceof FetchHoldError);
      assert.equal(fetched, false, "no network fetch may happen while the hold is engaged");
    } finally { globalThis.fetch = orig; }
  });
});

test("hold ENGAGED: apiFetch throws FetchHoldError, no network fetch", async () => {
  await withHold("on", async () => {
    let fetched = false;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { fetched = true; return { ok: true, status: 200, text: async () => "{}" }; };
    try {
      await assert.rejects(() => apiFetch({ url: "https://api.example.gov/v1/doc" }), (e) => e instanceof FetchHoldError);
      assert.equal(fetched, false);
    } finally { globalThis.fetch = orig; }
  });
});

test("hold ENGAGED: buildLiveTransports.directFetch performs NO network fetch (blocked at the gate)", async () => {
  await withHold("engaged", async () => {
    let fetched = false;
    const orig = globalThis.fetch;
    globalThis.fetch = async () => { fetched = true; throw new Error("should not be reached"); };
    try {
      const t = buildLiveTransports(50000);
      const r = await t.directFetch("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=X");
      assert.equal(fetched, false, "the direct-HTTP transport must not fetch while the hold is engaged");
      assert.equal(r.text, "", "a held direct fetch yields empty content, never a network read");
    } finally { globalThis.fetch = orig; }
  });
});

test("cache HIT prevents a duplicate fetch: a second read is served from the cache", async () => {
  await withHold("off", async () => {
    __clearFetchCacheForTest();
    let calls = 0;
    const orig = globalThis.fetch;
    const html = "<html><body>" + "abcdefghij".repeat(40) + "</body></html>"; // >200ch stripped
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true, status: 200,
        headers: { get: (k) => (k === "content-type" ? "text/html" : null) },
        arrayBuffer: async () => new TextEncoder().encode(html).buffer,
      };
    };
    try {
      const t = buildLiveTransports(50000);
      const url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32020R0852";
      const first = await t.directFetch(url);
      assert.ok(first.text.length > 200, "first fetch returns real content");
      assert.equal(calls, 1, "exactly one network fetch so far");
      // The cache seam escalateFetch checks first: a fresh hit returns the payload with ZERO extra fetch.
      const hit = t.cacheGet(url);
      assert.ok(hit && typeof hit.text === "string" && hit.text.length > 200, "cacheGet returns the stored payload");
      assert.equal(calls, 1, "a cache hit must NOT trigger a second network fetch (duplicate-fetch prevented)");
      // canonical-URL equivalence: a case/trailing-slash variant hits the SAME entry.
      const hit2 = t.cacheGet(url.replace("https://", "https://") + "/");
      assert.ok(hit2, "a canonical-equivalent URL shares the cache entry");
      assert.equal(calls, 1);
    } finally { globalThis.fetch = orig; }
  });
});
