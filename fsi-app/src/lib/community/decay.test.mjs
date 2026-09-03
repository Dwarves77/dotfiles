import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceAge } from "./decay.mjs";

test("evidenceAge: 0-12 months old carries full weight", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evidenceAge({ assertedAt: "2026-06-01" }, now);
  assert.equal(r.weight, 1);
});

test("evidenceAge: 12-24 months old is halved to 50%", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evidenceAge({ assertedAt: "2025-06-01" }, now); // ~15 months
  assert.equal(r.weight, 0.5);
});

test("evidenceAge: 24-36 months old is quartered to 25% (spec 05 §4's own named figure)", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evidenceAge({ assertedAt: "2024-06-01" }, now); // ~27 months
  assert.equal(r.weight, 0.25);
});

test("evidenceAge: keeps halving beyond 36 months rather than flooring or dropping to zero", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evidenceAge({ assertedAt: "2022-06-01" }, now); // ~51 months -> 4 full periods
  assert.equal(r.weight, 0.0625);
  assert.ok(r.weight > 0);
});

test("evidenceAge: exactly at a 12-month boundary rolls into the next weight band", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const r = evidenceAge({ assertedAt: "2025-09-03" }, now); // exactly 12 months
  assert.equal(r.ageMonths, 12);
  assert.equal(r.weight, 0.5);
});

test("evidenceAge: missing/unparseable date fails closed to zero weight, never invents a date", () => {
  assert.equal(evidenceAge({ assertedAt: null }).weight, 0);
  assert.equal(evidenceAge({}).weight, 0);
  assert.equal(evidenceAge({ assertedAt: "not-a-date" }).weight, 0);
});

test("evidenceAge: chip text distinguishes recent from aged evidence", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  assert.match(evidenceAge({ assertedAt: "2026-08-20" }, now).chip, /this month/);
  assert.match(evidenceAge({ assertedAt: "2026-03-03" }, now).chip, /mo old/);
  assert.match(evidenceAge({ assertedAt: "2023-01-01" }, now).chip, /y old/);
});
