// Unit tests for the one urgency vocabulary (src/lib/urgency/bands.ts).
// UI system handoff 2026-09-06, README §0.2: four bands, one vocabulary
// everywhere, replacing the five competing vocabularies the audit found
// (docs/design/audit-2026-09-06/ASSESSMENT.md §4).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BAND_ORDER,
  band,
  bandFromPriority,
  classifyByDays,
  daysUntil,
} from "./bands.ts";

test("BAND_ORDER carries exactly the four README bands, hot to cool, with the exact words/hex/tint", () => {
  assert.equal(BAND_ORDER.length, 4);
  assert.deepEqual(
    BAND_ORDER.map((b) => b.key),
    ["immediate", "action", "monitor", "awareness"],
  );
  assert.deepEqual(
    BAND_ORDER.map((b) => b.label),
    ["Immediate", "Action", "Monitor", "Awareness"],
  );
  assert.deepEqual(
    BAND_ORDER.map((b) => b.hex),
    ["#DC2626", "#F97316", "#2563EB", "#16A34A"],
  );
  assert.deepEqual(
    BAND_ORDER.map((b) => b.tint),
    ["#FEF2F2", "#FFF7ED", "#EFF6FF", "#F0FDF4"],
  );
});

test("band() looks up by key", () => {
  assert.equal(band("immediate").label, "Immediate");
  assert.equal(band("awareness").hex, "#16A34A");
});

test("bandFromPriority maps every platform priority value 1:1 onto a band", () => {
  assert.equal(bandFromPriority("CRITICAL").key, "immediate");
  assert.equal(bandFromPriority("HIGH").key, "action");
  assert.equal(bandFromPriority("MODERATE").key, "monitor");
  assert.equal(bandFromPriority("LOW").key, "awareness");
});

test("bandFromPriority falls back to awareness (never throws) on unknown/missing priority", () => {
  assert.equal(bandFromPriority(undefined).key, "awareness");
  assert.equal(bandFromPriority(null).key, "awareness");
  assert.equal(bandFromPriority("NOT_A_REAL_VALUE").key, "awareness");
});

test("classifyByDays matches the README windows at the boundaries", () => {
  assert.equal(classifyByDays(0).key, "immediate");
  assert.equal(classifyByDays(90).key, "immediate");
  assert.equal(classifyByDays(91).key, "action");
  assert.equal(classifyByDays(182).key, "action");
  assert.equal(classifyByDays(183).key, "monitor");
  assert.equal(classifyByDays(365).key, "monitor");
  assert.equal(classifyByDays(366).key, "awareness");
  assert.equal(classifyByDays(null).key, "awareness");
  assert.equal(classifyByDays(undefined).key, "awareness");
});

test("daysUntil computes whole-day differences", () => {
  const from = new Date("2026-09-06T00:00:00Z");
  assert.equal(daysUntil("2026-09-06T00:00:00Z", from), 0);
  assert.equal(daysUntil("2026-12-05T00:00:00Z", from), 90);
  assert.equal(daysUntil("2026-09-01T00:00:00Z", from), -5);
});
