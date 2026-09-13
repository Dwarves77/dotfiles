// coverage-reflection.test.mjs -- pure, no I/O, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildResolvedReflectionRow,
  planResolvedReflectionInserts,
  RESOLVED_REFLECTION_NOTE,
} from "./coverage-reflection.mjs";

test("buildResolvedReflectionRow: status resolved, resolution_note fixed, fields passed through", () => {
  const finding = {
    category: "coverage_gap",
    subject_type: "system",
    subject_ref: "jurisdiction_span_gap:EU",
    description: "A gap.",
    recommended_actions: ["do something"],
    created_by: "flywheel-gap:jurisdiction_span_gap",
  };
  const row = buildResolvedReflectionRow(finding, "analyze-corpus.mjs", "2026-09-12T00:00:00.000Z");
  assert.equal(row.status, "resolved");
  assert.equal(row.resolved_by, "analyze-corpus.mjs");
  assert.equal(row.resolved_at, "2026-09-12T00:00:00.000Z");
  assert.equal(row.resolution_note, RESOLVED_REFLECTION_NOTE);
  assert.equal(row.category, "coverage_gap");
  assert.equal(row.subject_ref, "jurisdiction_span_gap:EU");
  assert.equal(row.created_by, "flywheel-gap:jurisdiction_span_gap");
  assert.deepEqual(row.recommended_actions, ["do something"]);
});

test("planResolvedReflectionInserts: a fresh finding with no existing row (any status) is new", () => {
  const { newRows, unchanged } = planResolvedReflectionInserts([], [
    { subjectRef: "a", row: { created_by: "flywheel-gap:x" } },
  ]);
  assert.equal(newRows.length, 1);
  assert.equal(unchanged, 0);
});

test("planResolvedReflectionInserts: dedups against an existing RESOLVED row (the exact bug this fixes)", () => {
  const existing = [{ subject_ref: "a", created_by: "flywheel-gap:x" }]; // status irrelevant, never read
  const { newRows, unchanged } = planResolvedReflectionInserts(existing, [
    { subjectRef: "a", row: { created_by: "flywheel-gap:x" } },
  ]);
  assert.equal(newRows.length, 0, "an already-resolved row must never be re-inserted as a duplicate");
  assert.equal(unchanged, 1);
});

test("planResolvedReflectionInserts: a different created_by for the same subject_ref is still new", () => {
  const existing = [{ subject_ref: "a", created_by: "flywheel-gap:x" }];
  const { newRows } = planResolvedReflectionInserts(existing, [
    { subjectRef: "a", row: { created_by: "flywheel-gap:y" } },
  ]);
  assert.equal(newRows.length, 1);
});

test("planResolvedReflectionInserts: empty inputs are safe", () => {
  assert.deepEqual(planResolvedReflectionInserts(undefined, undefined), { newRows: [], unchanged: 0 });
  assert.deepEqual(planResolvedReflectionInserts([], []), { newRows: [], unchanged: 0 });
});
