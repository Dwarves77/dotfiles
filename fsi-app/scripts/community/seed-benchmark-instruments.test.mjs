import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentPeriod,
  instrumentKeyFor,
  buildInstrumentRow,
  planSeeding,
  main,
  CALENDAR_TEMPLATES,
} from "./seed-benchmark-instruments.mjs";

// ── currentPeriod ───────────────────────────────────────────────────────────────────────────────
test("currentPeriod: quarterly resolves the calendar quarter", () => {
  const now = new Date("2026-08-15T00:00:00Z"); // Q3
  const p = currentPeriod("quarterly", now);
  assert.equal(p.label, "2026-q3");
  assert.equal(p.periodStart.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(p.periodEnd.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("currentPeriod: quarterly at a year boundary (Q1 January)", () => {
  const now = new Date("2026-01-05T00:00:00Z");
  const p = currentPeriod("quarterly", now);
  assert.equal(p.label, "2026-q1");
  assert.equal(p.periodStart.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("currentPeriod: monthly", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const p = currentPeriod("monthly", now);
  assert.equal(p.label, "2026-09");
  assert.equal(p.periodEnd.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("currentPeriod: annual", () => {
  const now = new Date("2026-09-03T00:00:00Z");
  const p = currentPeriod("annual", now);
  assert.equal(p.label, "2026");
  assert.equal(p.periodStart.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(p.periodEnd.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("currentPeriod: rejects an unrecognised cycle", () => {
  assert.throws(() => currentPeriod("weekly", new Date()));
});

// ── instrumentKeyFor / buildInstrumentRow ──────────────────────────────────────────────────────
test("instrumentKeyFor: stable, calendar-encoded key", () => {
  const template = { templateKey: "saf-premium-air" };
  const period = { label: "2026-q3" };
  assert.equal(instrumentKeyFor(template, period), "saf-premium-air-2026-q3");
});

test("buildInstrumentRow: shape matches migration 294's community_benchmark_instruments columns", () => {
  const template = CALENDAR_TEMPLATES[0];
  const period = currentPeriod(template.cycle, new Date("2026-08-15T00:00:00Z"));
  const row = buildInstrumentRow(template, period);
  assert.equal(row.key, "saf-premium-air-2026-q3");
  assert.equal(row.field_key, "saf_premium_pct");
  assert.equal(row.created_by, "house");
  assert.equal(row.status, "open");
  assert.equal(row.period_end, "2026-10-01");
  assert.ok(new Date(row.closes_at) > new Date(row.opens_at));
});

// ── planSeeding (pure, no I/O) ──────────────────────────────────────────────────────────────────
test("planSeeding: creates every template's current-period instrument when nothing exists yet", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const plan = planSeeding(CALENDAR_TEMPLATES, [], now);
  assert.equal(plan.toCreate.length, CALENDAR_TEMPLATES.length);
  assert.equal(plan.skipped.length, 0);
});

test("planSeeding: is idempotent — a key that already exists is skipped, not re-created", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const existing = ["saf-premium-air-2026-q3"];
  const plan = planSeeding(CALENDAR_TEMPLATES, existing, now);
  assert.equal(plan.toCreate.length, CALENDAR_TEMPLATES.length - 1);
  assert.ok(plan.skipped.includes("saf-premium-air-2026-q3"));
  assert.ok(!plan.toCreate.some((r) => r.key === "saf-premium-air-2026-q3"));
});

test("planSeeding: accepts a Set as well as an array for existingKeys", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  const plan = planSeeding(CALENDAR_TEMPLATES, new Set(["saf-premium-air-2026-q3"]), now);
  assert.equal(plan.skipped.length, 1);
});

test("planSeeding: a new quarter re-triggers creation (last quarter's key does not match this quarter's)", () => {
  const now = new Date("2026-08-15T00:00:00Z"); // Q3
  const existing = ["saf-premium-air-2026-q2"]; // last quarter, already superseded
  const plan = planSeeding(CALENDAR_TEMPLATES, existing, now);
  assert.ok(plan.toCreate.some((r) => r.key === "saf-premium-air-2026-q3"));
});

// ── main() — deps-injected, no database ────────────────────────────────────────────────────────
test("main: dry-run never calls guardedInsertMany", async () => {
  let inserted = false;
  const summary = await main(
    { apply: false, now: new Date("2026-08-15T00:00:00Z") },
    {
      listExistingKeys: async () => [],
      guardedInsertMany: async () => { inserted = true; return { inserted: 999 }; },
    }
  );
  assert.equal(inserted, false);
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.created, 0);
  assert.equal(summary.would_create, CALENDAR_TEMPLATES.length);
});

test("main: --apply calls guardedInsertMany with exactly the planned rows", async () => {
  let calledWith = null;
  const summary = await main(
    { apply: true, now: new Date("2026-08-15T00:00:00Z") },
    {
      listExistingKeys: async () => ["saf-premium-air-2026-q3"],
      guardedInsertMany: async (table, rows) => {
        calledWith = { table, rows };
        return { inserted: rows.length };
      },
    }
  );
  assert.equal(calledWith.table, "community_benchmark_instruments");
  assert.equal(calledWith.rows.length, CALENDAR_TEMPLATES.length - 1);
  assert.equal(summary.created, CALENDAR_TEMPLATES.length - 1);
});

test("main: --apply with nothing new to create never calls guardedInsertMany", async () => {
  let inserted = false;
  const allKeys = CALENDAR_TEMPLATES.map((t) => instrumentKeyFor(t, currentPeriod(t.cycle, new Date("2026-08-15T00:00:00Z"))));
  const summary = await main(
    { apply: true, now: new Date("2026-08-15T00:00:00Z") },
    {
      listExistingKeys: async () => allKeys,
      guardedInsertMany: async () => { inserted = true; return { inserted: 0 }; },
    }
  );
  assert.equal(inserted, false);
  assert.equal(summary.created, 0);
});

test("CALENDAR_TEMPLATES: every field_key is in the closed antitrust vocabulary", async () => {
  const { SENSITIVE_FIELDS } = await import("../../src/lib/community/antitrust.mjs");
  for (const t of CALENDAR_TEMPLATES) {
    assert.ok(SENSITIVE_FIELDS.includes(t.fieldKey), `${t.templateKey}: fieldKey "${t.fieldKey}" not in SENSITIVE_FIELDS`);
  }
});
