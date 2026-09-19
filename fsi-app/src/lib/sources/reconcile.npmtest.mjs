// node --test src/lib/sources/reconcile.selftest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDiff, classifyChange } from "./reconcile.ts";

test("computeDiff returns only changed fields", () => {
  assert.deepEqual(computeDiff({ a: 1, b: "x", c: [1, 2] }, { a: 1, b: "y", c: [1, 2] }), [{ field: "b", from: "x", to: "y" }]);
  assert.equal(computeDiff({ a: 1 }, { a: 1 }).length, 0);
});

test("classifyChange maps the moved field to the real CHECK vocabulary", () => {
  assert.deepEqual(classifyChange([{ field: "status", from: "proposed", to: "in_force" }]), { changeType: "status_change", severity: "critical" });
  assert.deepEqual(classifyChange([{ field: "compliance_deadline", from: "a", to: "b" }]), { changeType: "deadline_change", severity: "critical" });
  assert.deepEqual(classifyChange([{ field: "jurisdictions", from: [], to: ["EU"] }]), { changeType: "scope_change", severity: "significant" });
  assert.deepEqual(classifyChange([{ field: "full_brief", from: "a", to: "b" }]), { changeType: "provision_amended", severity: "significant" });
  assert.deepEqual(classifyChange([{ field: "title", from: "a", to: "b" }]), { changeType: "administrative", severity: "minor" });
  assert.deepEqual(classifyChange([{ field: "topic_tags", from: [], to: ["x"] }]), { changeType: "administrative", severity: "administrative" });
});

test("most-consequential field wins when several change", () => {
  assert.deepEqual(classifyChange([{ field: "summary", from: "a", to: "b" }, { field: "status", from: "p", to: "f" }]), { changeType: "status_change", severity: "critical" });
});
