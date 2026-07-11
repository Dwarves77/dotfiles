// @ts-check
// Red-then-green for the transport unit (item 6). THE HOLD, first: while engaged the fetch primitive THROWS
// (no fetch runs) — the mechanical "scrape hold LIVE, zero fetches" guarantee; lifted, it fetches. Plus the
// canonical-URL cache (url-canon single home) + TTL-per-source + per-run telemetry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdEngaged, assertFetchAllowed, FetchHoldError, isAuthorizedHoldCaller, AUTHORIZED_HOLD_CALLERS, fetchCacheKey, isFresh, ttlForUrl, cacheGet, cachePut, makeFetchTelemetry, transportFetch, DEFAULT_TTL_MS } from "./fetch-hold.mjs";

// ── THE HOLD ──
test("RED: hold ENGAGED → assertFetchAllowed THROWS FetchHoldError (no fetch runs)", () => {
  assert.equal(holdEngaged({ SCRAPE_HOLD: "1" }), true);
  assert.equal(holdEngaged({ SCRAPE_HOLD: "on" }), true);
  assert.throws(() => assertFetchAllowed("https://eur-lex.europa.eu/x", { SCRAPE_HOLD: "engaged" }), FetchHoldError);
});

test("GREEN: hold LIFTED (off / unset) → assertFetchAllowed passes (prod-preserving default)", () => {
  assert.equal(holdEngaged({ SCRAPE_HOLD: "off" }), false);
  assert.equal(holdEngaged({}), false);                 // unset default = lifted
  assert.equal(holdEngaged({ SCRAPE_HOLD: "garbage" }), false); // unknown → lifted, do not block prod on a typo
  assert.doesNotThrow(() => assertFetchAllowed("https://x", { SCRAPE_HOLD: "off" }));
});

// ── F16 TWO-CALLER SIGNED-EXCEPTION (ADR-012 / Unit 0b): one mechanism, exactly two signed callers, no third door ──
test("MANIFEST: exactly two authorized callers (manual-intake-run, unit3-remediation), nothing else", () => {
  assert.equal(AUTHORIZED_HOLD_CALLERS.size, 2);
  assert.ok(isAuthorizedHoldCaller("manual-intake-run"));
  assert.ok(isAuthorizedHoldCaller("unit3-remediation"));
  // NO THIRD DOOR: arbitrary strings, the scheduled worker's name, empty, and non-strings all fail.
  for (const bad of ["scheduled-worker", "loop", "seek-more", "", "MANUAL-INTAKE-RUN", null, undefined, 0, {}]) {
    assert.equal(isAuthorizedHoldCaller(bad), false, `must reject ${JSON.stringify(bad)}`);
  }
});

test("GREEN(exception): an ENGAGED hold PASSES for a signed authorized caller", () => {
  const env = { SCRAPE_HOLD: "engaged" };
  assert.doesNotThrow(() => assertFetchAllowed("https://x", env, "manual-intake-run"));
  assert.doesNotThrow(() => assertFetchAllowed("https://x", env, "unit3-remediation"));
});

test("RED(no bypass): an ENGAGED hold BLOCKS no-caller (scheduled path) and any unauthorized caller", () => {
  const env = { SCRAPE_HOLD: "engaged" };
  assert.throws(() => assertFetchAllowed("https://x", env), FetchHoldError);                 // scheduled/pipeline (no caller)
  assert.throws(() => assertFetchAllowed("https://x", env, null), FetchHoldError);
  assert.throws(() => assertFetchAllowed("https://x", env, "scheduled-worker"), FetchHoldError);
  assert.throws(() => assertFetchAllowed("https://x", env, "loop"), FetchHoldError);
});

test("transportFetch: ENGAGED + authorized caller → fetch runs + a 'hold-exception' telemetry row (auditable)", async () => {
  const tel = makeFetchTelemetry();
  let called = 0;
  const payload = await transportFetch("https://x", {}, {
    fetchImpl: async () => { called++; return { text: "ok" }; },
    now: () => 1000, env: { SCRAPE_HOLD: "engaged" }, telemetry: tel, caller: "manual-intake-run",
  });
  assert.equal(called, 1);
  assert.equal(payload.text, "ok");
  assert.equal(tel.records.some((r) => r.outcome === "hold-exception"), true);
});

test("transportFetch: ENGAGED + no caller → hold-blocked, fetchImpl NEVER called (scheduled path stays gated)", async () => {
  const tel = makeFetchTelemetry();
  let called = 0;
  await assert.rejects(() => transportFetch("https://x", {}, {
    fetchImpl: async () => { called++; return { text: "no" }; },
    now: () => 1000, env: { SCRAPE_HOLD: "engaged" }, telemetry: tel,
  }), FetchHoldError);
  assert.equal(called, 0);
  assert.equal(tel.records.some((r) => r.outcome === "hold-blocked"), true);
});

// ── canonical cache key (url-canon single home) ──
test("fetchCacheKey collapses www./case/trailing-slash so equivalent URLs share one entry", () => {
  assert.equal(fetchCacheKey("https://www.EUR-Lex.europa.eu/eli/reg/2023/1804/oj/eng/"), fetchCacheKey("https://eur-lex.europa.eu/eli/reg/2023/1804/oj/eng"));
});

// ── TTL per source ──
test("ttlForUrl: legal-text host long TTL; news host short; unknown host default", () => {
  assert.ok(ttlForUrl("https://eur-lex.europa.eu/x") > ttlForUrl("https://reuters.com/y"));
  assert.equal(ttlForUrl("https://some-unknown-host.example/z"), DEFAULT_TTL_MS);
});

test("isFresh honors ttl window", () => {
  assert.equal(isFresh({ fetchedAtMs: 1000 }, 1000 + 500, 1000), true);
  assert.equal(isFresh({ fetchedAtMs: 1000 }, 1000 + 1500, 1000), false);
  assert.equal(isFresh(null, 0, 1000), false);
});

test("cacheGet returns a fresh entry, null once stale", () => {
  const store = new Map();
  const url = "https://eur-lex.europa.eu/x";
  cachePut(store, url, { text: "hi" }, 1000);
  assert.ok(cacheGet(store, url, 1000 + 60_000)); // well within eur-lex 30d TTL
  assert.equal(cacheGet(store, url, 1000 + 40 * 24 * 3600 * 1000), null); // past 30d
});

// ── transportFetch orchestration: hold → cache → fetch → telemetry ──
test("transportFetch: hold engaged → FetchHoldError + a hold-blocked telemetry row (fetchImpl NEVER called)", async () => {
  let called = 0;
  const tel = makeFetchTelemetry();
  await assert.rejects(
    transportFetch("https://x/1", {}, { fetchImpl: async () => { called++; return { text: "" }; }, now: () => 1, env: { SCRAPE_HOLD: "1" }, telemetry: tel }),
    FetchHoldError,
  );
  assert.equal(called, 0);
  assert.equal(tel.summary().holdBlocked, 1);
});

test("transportFetch: lifted → MISS calls fetchImpl once; a second call is a canonical-URL cache HIT (no refetch)", async () => {
  let called = 0;
  const store = new Map();
  const tel = makeFetchTelemetry();
  const deps = { fetchImpl: async () => { called++; return { text: "PAYLOAD" }; }, store, now: () => 5000, env: { SCRAPE_HOLD: "off" }, telemetry: tel };
  const a = await transportFetch("https://www.EUR-Lex.europa.eu/doc/", {}, deps);
  const b = await transportFetch("https://eur-lex.europa.eu/doc", {}, deps); // canonically identical
  assert.equal(a.text, "PAYLOAD");
  assert.equal(b.text, "PAYLOAD");
  assert.equal(called, 1, "second (canonically-equal) URL served from cache — fetchImpl called once");
  const s = tel.summary();
  assert.equal(s.misses, 1); assert.equal(s.hits, 1); assert.equal(s.total, 2);
});
