// Proof for src/lib/bootstrap/rsc-navigation.ts (PERF-3 lane, 2026-09-03). See that module's
// header for the full mechanism this predicate exists to detect.
import test from "node:test";
import assert from "node:assert/strict";
import { isRscNavigation } from "./rsc-navigation.ts";

function headersOf(entries) {
  return { get: (k) => entries[k.toLowerCase()] ?? null };
}

test("isRscNavigation: true when the request carries Next's own rsc:1 flight header", () => {
  assert.equal(isRscNavigation(headersOf({ rsc: "1" })), true);
});

test("isRscNavigation: false on a cold/full document request (no rsc header)", () => {
  assert.equal(isRscNavigation(headersOf({})), false);
});

test("isRscNavigation: false when some other header is present but not rsc", () => {
  assert.equal(isRscNavigation(headersOf({ "next-url": "/market" })), false);
});

test("isRscNavigation: exact value match only — a truthy-but-wrong value is not a flight request", () => {
  assert.equal(isRscNavigation(headersOf({ rsc: "true" })), false);
});
