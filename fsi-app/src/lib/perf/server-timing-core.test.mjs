// Tests for server-timing-core.ts (lane PERF-ARCH, 2026-09-04).
// Run: node --test fsi-app/src/lib/perf/server-timing-core.test.mjs
//
// Pure module, no "react"/"next/*" import of any kind — portable under plain `node --test` (see
// this file's own module header for why the core/ambient split exists at all).

import test from "node:test";
import assert from "node:assert/strict";
import {
  createTimingStore,
  recordPhaseOnStore,
  recordBytesOnStore,
  timePhaseOnStore,
  measureJsonBytes,
  sanitizeTimingName,
  toServerTimingHeader,
  toPerfLogLine,
  applyServerTimingHeader,
  COLD_START_UPTIME_SECONDS,
  PERF_PHASES,
} from "./server-timing-core.ts";

test("createTimingStore: coldStart true when process uptime is under the 5s threshold", () => {
  const store = createTimingStore(1000, 4.9);
  assert.equal(store.coldStart, true);
  assert.equal(store.requestStartedAt, 1000);
  assert.deepEqual(store.phases, []);
});

test("createTimingStore: coldStart false at and above the threshold (boundary, not <=)", () => {
  assert.equal(createTimingStore(0, COLD_START_UPTIME_SECONDS).coldStart, false);
  assert.equal(createTimingStore(0, COLD_START_UPTIME_SECONDS + 0.001).coldStart, false);
  assert.equal(createTimingStore(0, COLD_START_UPTIME_SECONDS - 0.001).coldStart, true);
});

test("createTimingStore: default uptime (omitted) never flags cold — a caller with no signal must not fabricate coldstart=true", () => {
  assert.equal(createTimingStore(0).coldStart, false);
});

test("recordPhaseOnStore: accumulates onto the SAME store across multiple calls (the ambient wrapper's whole reason to exist)", () => {
  const store = createTimingStore(0, 100);
  recordPhaseOnStore(store, "auth", 12.4);
  recordPhaseOnStore(store, "org", 3.6);
  assert.deepEqual(store.phases, [
    { name: "auth", durationMs: 12 },
    { name: "org", durationMs: 4 },
  ]);
});

test("recordPhaseOnStore: negative duration clamps to 0, never a negative dur= in the eventual header", () => {
  const store = createTimingStore(0, 100);
  recordPhaseOnStore(store, "clock-skew", -5);
  assert.equal(store.phases[0].durationMs, 0);
});

test("recordBytesOnStore: records a bytes field, not a durationMs field", () => {
  const store = createTimingStore(0, 100);
  recordBytesOnStore(store, PERF_PHASES.SERIALIZE_BYTES, 4096);
  assert.deepEqual(store.phases, [{ name: "serialize_bytes", bytes: 4096 }]);
});

test("timePhaseOnStore: measures a real async delay and returns the wrapped value", async () => {
  const store = createTimingStore(0, 100);
  const result = await timePhaseOnStore(store, "listing_rpc", async () => {
    await new Promise((r) => setTimeout(r, 15));
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(store.phases.length, 1);
  assert.equal(store.phases[0].name, "listing_rpc");
  assert.ok(store.phases[0].durationMs >= 10, `expected >=10ms, got ${store.phases[0].durationMs}`);
});

test("timePhaseOnStore: RED then GREEN — records the phase even when fn throws, and the throw still propagates", async () => {
  const store = createTimingStore(0, 100);
  await assert.rejects(
    () => timePhaseOnStore(store, "counts", async () => { throw new Error("db down"); }),
    /db down/
  );
  assert.equal(store.phases.length, 1, "a failed phase is still evidence, not a silent hole in the trace");
  assert.equal(store.phases[0].name, "counts");
});

test("measureJsonBytes: matches a hand-computed UTF-8 byte count, including multi-byte characters", () => {
  assert.equal(measureJsonBytes({ a: 1 }), Buffer.byteLength('{"a":1}', "utf8"));
  // "é" (U+00E9) is 2 bytes in UTF-8; JSON.stringify keeps it literal (no \u escape) by default.
  const withAccent = { name: "café" };
  const expected = Buffer.byteLength(JSON.stringify(withAccent), "utf8");
  assert.equal(measureJsonBytes(withAccent), expected);
  assert.ok(expected > JSON.stringify(withAccent).length - 1, "sanity: the accented char actually costs an extra byte");
});

test("measureJsonBytes: an unserializable value (BigInt) degrades to 0, never throws", () => {
  assert.equal(measureJsonBytes({ big: 10n }), 0);
});

test("measureJsonBytes: undefined (JSON.stringify(undefined) === undefined) is 0 bytes, not NaN", () => {
  assert.equal(measureJsonBytes(undefined), 0);
});

test("sanitizeTimingName: strips characters an HTTP token forbids", () => {
  assert.equal(sanitizeTimingName("listing rpc"), "listing_rpc");
  assert.equal(sanitizeTimingName('weird"name;here'), "weird_name_here");
  assert.equal(sanitizeTimingName("clean_name-1"), "clean_name-1");
});

test("sanitizeTimingName: every forbidden char maps to _, so a punctuation-only name is still a valid non-empty token", () => {
  assert.equal(sanitizeTimingName(";;;"), "___");
});

test("sanitizeTimingName: a genuinely empty name falls back to the literal 'phase' rather than an empty token", () => {
  assert.equal(sanitizeTimingName(""), "phase");
});

test("toServerTimingHeader: renders duration phases with dur=, byte phases with desc=\"NB\", then total and coldstart last", () => {
  const store = createTimingStore(1000, 2); // cold
  recordPhaseOnStore(store, "auth", 10);
  recordBytesOnStore(store, "serialize_bytes", 512);
  const header = toServerTimingHeader(store, 1100);
  assert.equal(header, 'auth;dur=10, serialize_bytes;desc="512B", total;dur=100, coldstart;desc="cold"');
});

test("toServerTimingHeader: warm request states desc=\"warm\" explicitly — never omitted, a reader must not have to infer it", () => {
  const store = createTimingStore(1000, 999);
  const header = toServerTimingHeader(store, 1050);
  assert.match(header, /coldstart;desc="warm"$/);
});

test("toServerTimingHeader: an empty store still yields a well-formed header (total + coldstart only)", () => {
  const store = createTimingStore(0, 100);
  assert.equal(toServerTimingHeader(store, 30), 'total;dur=30, coldstart;desc="warm"');
});

test("toServerTimingHeader: a bad phase name is sanitized in the header, never breaks the token grammar", () => {
  const store = createTimingStore(0, 100);
  recordPhaseOnStore(store, "bad name;here", 5);
  assert.equal(toServerTimingHeader(store, 5), 'bad_name_here;dur=5, total;dur=5, coldstart;desc="warm"');
});

test("toPerfLogLine: matches the repo's existing [perf] convention, with a per-phase breakdown", () => {
  const store = createTimingStore(1000, 1); // cold
  recordPhaseOnStore(store, "auth", 12);
  recordBytesOnStore(store, "serialize_bytes", 900);
  const line = toPerfLogLine("/regulations/g14", store, 1100);
  assert.equal(line, "[perf] /regulations/g14 auth=12ms serialize_bytes=900bytes total=100ms coldstart=1");
});

test("applyServerTimingHeader: adds Server-Timing to a Response without disturbing status/body", async () => {
  const store = createTimingStore(0, 100);
  recordPhaseOnStore(store, "auth", 7);
  const original = new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
  const withTiming = applyServerTimingHeader(original, store, 20);
  assert.equal(withTiming.status, 201);
  assert.equal(withTiming.headers.get("Content-Type"), "application/json");
  assert.equal(withTiming.headers.get("Server-Timing"), 'auth;dur=7, total;dur=20, coldstart;desc="warm"');
  const body = await withTiming.json();
  assert.deepEqual(body, { ok: true });
});

test("applyServerTimingHeader: appends rather than clobbers a pre-existing Server-Timing header", () => {
  const store = createTimingStore(0, 100);
  const original = new Response(null, { headers: { "Server-Timing": "upstream;dur=5" } });
  const withTiming = applyServerTimingHeader(original, store, 10);
  assert.equal(withTiming.headers.get("Server-Timing"), 'upstream;dur=5, total;dur=10, coldstart;desc="warm"');
});

test("LIVE: PERF_PHASES names the dispatch's own vocabulary and every value is header-token-safe as-is", () => {
  for (const name of Object.values(PERF_PHASES)) {
    assert.equal(sanitizeTimingName(name), name, `${name} should already be a safe token`);
  }
  assert.deepEqual(Object.values(PERF_PHASES).sort(), [
    "auth",
    "counts",
    "detail_core",
    "listing_rpc",
    "org",
    "serialize_bytes",
  ]);
});
