// Proof for src/lib/tint.ts (lane R12-13, 2026-10-01, CF-BROKEN-2 / A6): the shared helper that
// replaces the 24-site `"var(--token)" + "NN"` string-concatenation defect with a real CSS value.

import test from "node:test";
import assert from "node:assert/strict";
import { tint } from "./tint.ts";

test("tint: builds a color-mix() value, never a bare concatenation", () => {
  assert.equal(
    tint("var(--color-error)", 15),
    "color-mix(in srgb, var(--color-error) 15%, transparent)",
  );
});

test("tint: never produces the old defect shape (a var() reference immediately followed by digits)", () => {
  const result = tint("var(--color-primary)", 20);
  assert.doesNotMatch(result, /var\([^)]+\)\d/, "must not concatenate digits directly after var(...)");
  assert.match(result, /^color-mix\(in srgb, .+ \d+%, transparent\)$/);
});

test("tint: percent is interpolated numerically, not stringified with extra characters", () => {
  assert.equal(tint("var(--color-warning)", 50), "color-mix(in srgb, var(--color-warning) 50%, transparent)");
  assert.equal(tint("var(--color-success)", 10), "color-mix(in srgb, var(--color-success) 10%, transparent)");
});
