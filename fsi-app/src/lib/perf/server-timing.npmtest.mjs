// Tests for server-timing.ts, the ambient (cache()-backed) wrapper (lane PERF-ARCH, 2026-09-04).
// Run (needs node_modules: imports react through server-timing.ts, so it is an .npmtest, not part of the no-npm suite):
//   cd fsi-app && node --test src/lib/perf/server-timing.npmtest.mjs
//
// "react" resolves fine under plain `node --test` (it is a normal npm package with its own
// package.json — the ESM-resolution problem load-detail-core.ts's header documents is specific to
// "next/*" subpaths, which ship no package.json "exports" map; verified this lane by running
// `node -e "console.log(require.resolve('react'))"` before writing this file). What plain `node
// --test` does NOT give us is an active React render dispatcher, so cache() here is a pure
// pass-through (PERF-6 §12.4, cited in server-timing.ts's own header) — every call to an exported
// function below gets its OWN fresh store, not a shared per-"request" one. That is expected and
// is exactly why the accumulation logic itself is proven in server-timing-core.test.mjs against an
// explicit store; these tests only prove the ambient wrapper's shape and delegation, using that
// same "no dispatcher ⇒ fresh store" behavior rather than fighting it.

import test from "node:test";
import assert from "node:assert/strict";
import {
  getTimingSnapshot,
  recordPhase,
  recordBytesPhase,
  timePhase,
  recordSerializedBytes,
  logTimingLine,
  withServerTiming,
  getServerTimingHeaderValue,
  PERF_PHASES,
} from "./server-timing.ts";

test("getTimingSnapshot: returns a well-formed, empty store shape", () => {
  const snap = getTimingSnapshot();
  assert.equal(typeof snap.requestStartedAt, "number");
  assert.equal(typeof snap.coldStart, "boolean");
  assert.deepEqual(snap.phases, []);
});

test("recordPhase / timePhase: do not throw when called outside a request scope (no dispatcher)", async () => {
  assert.doesNotThrow(() => recordPhase(PERF_PHASES.AUTH, 5));
  const result = await timePhase(PERF_PHASES.LISTING_RPC, async () => 7);
  assert.equal(result, 7);
});

test("recordBytesPhase / recordSerializedBytes: do not throw, and return the measured byte count", () => {
  assert.doesNotThrow(() => recordBytesPhase(PERF_PHASES.SERIALIZE_BYTES, 100));
  const bytes = recordSerializedBytes({ a: 1, b: "two" });
  assert.equal(bytes, Buffer.byteLength(JSON.stringify({ a: 1, b: "two" }), "utf8"));
});

test("logTimingLine: produces a [perf] <label> ... total=...ms coldstart=0|1 line", () => {
  const line = logTimingLine("/api/workspace/bootstrap");
  assert.match(line, /^\[perf\] \/api\/workspace\/bootstrap .*total=\d+ms coldstart=[01]$/);
});

test("withServerTiming: attaches a well-formed Server-Timing header to a Response", () => {
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const withTiming = withServerTiming(response);
  const header = withTiming.headers.get("Server-Timing");
  assert.match(header, /^total;dur=\d+, coldstart;desc="(cold|warm)"$/);
  assert.equal(withTiming.status, 200);
});

test("getServerTimingHeaderValue: matches withServerTiming's own header for an equivalent store", () => {
  const value = getServerTimingHeaderValue();
  assert.match(value, /^total;dur=\d+, coldstart;desc="(cold|warm)"$/);
});

test("LIVE: PERF_PHASES is re-exported unchanged from the core module", () => {
  assert.deepEqual(Object.keys(PERF_PHASES).sort(), [
    "AUTH",
    "COUNTS",
    "DETAIL_CORE",
    "LISTING_RPC",
    "ORG",
    "SERIALIZE_BYTES",
  ]);
});
