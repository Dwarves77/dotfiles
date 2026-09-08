// Behavioural test for the injected instant added to relative-time.ts (lane community60,
// 2026-09-08). Artboard 12's LAST ACTIVITY column is relative time rendered inside a
// `"use client"` component, so both formatters now take the server-decided instant
// (src/lib/render-now.ts) rather than reading the host clock during render. This test runs the
// real functions rather than grepping the source: the whole point of the parameter is the VALUE
// it produces, and a text scan cannot see that.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { formatRelative, formatRelativeCompact } = await jiti.import("./relative-time.ts");

const NOW = new Date("2026-09-06T16:00:00Z");

test("the same input and instant always produce the same string (SSR and hydration agree)", () => {
  const at = new Date("2026-09-06T14:00:00Z");
  assert.equal(formatRelative(at, NOW), formatRelative(at, NOW));
  assert.equal(formatRelative(at, NOW), "2 hr ago");
});

test("a Date and its epoch milliseconds are interchangeable as the instant", () => {
  const at = new Date("2026-09-02T16:00:00Z");
  assert.equal(formatRelative(at, NOW), formatRelative(at, NOW.getTime()));
  assert.equal(formatRelative(at, NOW), "4 days ago");
});

test("the compact formatter takes the same instant", () => {
  assert.equal(formatRelativeCompact("2026-09-06T14:00:00Z", NOW), "2h ago");
  assert.equal(formatRelativeCompact("2026-09-04T16:00:00Z", NOW), "2d ago");
});

test("omitting the instant keeps every pre-existing caller's behaviour (reads the host clock)", () => {
  const justNow = new Date();
  assert.equal(formatRelative(justNow), "just now");
  assert.equal(formatRelativeCompact(justNow), "just now");
});

test("an absent or unparseable input is still the empty string, never a fabricated time", () => {
  assert.equal(formatRelativeCompact(null, NOW), "");
  assert.equal(formatRelativeCompact("not a date", NOW), "");
});
