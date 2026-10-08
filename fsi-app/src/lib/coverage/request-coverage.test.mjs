// Proof for request-coverage.mjs (lane COV-1, 2026-10-08): the request-coverage action writes ONE coverage_gap
// integrity_flags row through the service client, validates what a reader may send, and does not duplicate.
// Run: node --test fsi-app/src/lib/coverage/request-coverage.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCoverageRequest, buildCoverageGapFlag, recordCoverageRequest,
  COVERAGE_REQUEST_CREATED_BY, COVERAGE_REQUEST_CATEGORY,
} from "./request-coverage.mjs";

// A chainable stub of the service client's integrity_flags surface: select-chain for the existence check,
// insert for the write. It records every call so the test can assert the exact query and the exact row.
function stubClient({ existing = [], readError = null, writeError = null } = {}) {
  const calls = { filters: [], inserted: [], tables: [] };
  const builder = {
    select() { return builder; },
    eq(col, val) { calls.filters.push(["eq", col, val]); return builder; },
    in(col, vals) { calls.filters.push(["in", col, vals]); return builder; },
    limit() { return Promise.resolve({ data: existing, error: readError }); },
    insert(row) { calls.inserted.push(row); return Promise.resolve({ error: writeError }); },
  };
  return { calls, from(table) { calls.tables.push(table); return builder; } };
}

test("a valid request is a route path and a short label", () => {
  const r = validateCoverageRequest({ subjectRef: "/dashboard/coverage?data_class=research&geography=EU", label: "  Research   in the EU " });
  assert.deepEqual(r, { ok: true, value: { subjectRef: "/dashboard/coverage?data_class=research&geography=EU", label: "Research in the EU" } });
  assert.equal(validateCoverageRequest({ subjectRef: "/market#oem-roadmap", label: "OEM roadmap" }).ok, true);
});

test("a request that is not a path on this site, or has no label, is refused with a plain message", () => {
  for (const bad of [null, "x", 5, {}]) assert.equal(validateCoverageRequest(bad).ok, false);
  for (const ref of ["https://evil.example/x", "//evil.example", "/a/../b", "javascript:alert(1)", "relative/path", "/has space", `/${"a".repeat(220)}`]) {
    const r = validateCoverageRequest({ subjectRef: ref, label: "ok" });
    assert.equal(r.ok, false, ref);
    assert.match(r.error, /subjectRef/);
  }
  assert.match(validateCoverageRequest({ subjectRef: "/ok", label: "   " }).error, /label is required/);
  assert.match(validateCoverageRequest({ subjectRef: "/ok", label: "x".repeat(121) }).error, /120 characters/);
  assert.equal(validateCoverageRequest({ subjectRef: "/ok", label: "a\u0000b\nc" }).value.label, "a b c");
});

test("the flag row uses the existing platform-flag contract: coverage_gap, surface, open, route path as subject_ref", () => {
  const row = buildCoverageGapFlag({ subjectRef: "/dashboard/coverage?data_class=research", label: "Research" });
  assert.equal(row.category, COVERAGE_REQUEST_CATEGORY);
  assert.equal(row.category, "coverage_gap");
  assert.equal(row.subject_type, "surface");
  assert.equal(row.subject_ref, "/dashboard/coverage?data_class=research");
  assert.equal(row.status, "open");
  assert.equal(row.created_by, COVERAGE_REQUEST_CREATED_BY);
  assert.ok(Array.isArray(row.recommended_actions) && row.recommended_actions.length === 1);
  assert.deepEqual(Object.keys(row[ "recommended_actions"][0]).sort(), ["action", "rationale"]);
  assert.match(row.description, /Coverage requested for "Research"/);
  assert.doesNotMatch(JSON.stringify(row), /[\u2013\u2014\u00a7]/);
});

test("recording writes one row through the service client, after checking for an open flag on the same subject", async () => {
  const sb = stubClient();
  const out = await recordCoverageRequest(sb, { subjectRef: "/market#oem-roadmap", label: "OEM roadmap" });
  assert.deepEqual(out, { ok: true, already: false });
  assert.deepEqual(sb.calls.tables, ["integrity_flags", "integrity_flags"]);
  assert.deepEqual(sb.calls.filters, [
    ["eq", "category", "coverage_gap"], ["eq", "subject_type", "surface"], ["eq", "subject_ref", "/market#oem-roadmap"], ["in", "status", ["open", "in_review"]],
  ]);
  assert.equal(sb.calls.inserted.length, 1);
  assert.equal(sb.calls.inserted[0].subject_ref, "/market#oem-roadmap");
});

test("a repeat request for a subject that already has an open flag writes nothing and still answers ok", async () => {
  const sb = stubClient({ existing: [{ id: "f1" }] });
  const out = await recordCoverageRequest(sb, { subjectRef: "/market#oem-roadmap", label: "OEM roadmap" });
  assert.deepEqual(out, { ok: true, already: true });
  assert.equal(sb.calls.inserted.length, 0);
});

test("a failed read or write is an honest failure, never a silent success", async () => {
  const readFail = await recordCoverageRequest(stubClient({ readError: { message: "db" } }), { subjectRef: "/x", label: "x" });
  assert.equal(readFail.ok, false);
  const sb = stubClient({ writeError: { message: "rls" } });
  const writeFail = await recordCoverageRequest(sb, { subjectRef: "/x", label: "x" });
  assert.equal(writeFail.ok, false);
  assert.match(writeFail.error, /Could not record/);
  assert.equal(sb.calls.inserted.length, 1, "the write was attempted");
});
