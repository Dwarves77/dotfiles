// candidate-dwell-audit.test.mjs -- proves the PURE helpers (namedCandidateIds, classifyDwellCandidates)
// without a DB (the live main() body is DB-only and untested here -- see quarantine-disposition-audit.mjs's
// own precedent, which has no test file at all for the identical reason: a top-level db.mjs import would
// break glob-portability's transitive check for this no-npm-ci suite; this file's DB import is dynamic,
// inside main(), so importing this module for its pure exports never touches @supabase/supabase-js).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { namedCandidateIds, classifyDwellCandidates, DWELL_BOUND_DAYS } from "./candidate-dwell-audit.mjs";

// ── namedCandidateIds ────────────────────────────────────────────────────────────────────────────────

test("namedCandidateIds: collects candidate_id across every committed batch, de-duped, ignoring non-batch files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-verdicts-"));
  try {
    writeFileSync(join(dir, "ledger-verdicts-001.json"), JSON.stringify({ entries: [{ candidate_id: "a" }, { candidate_id: "b" }] }));
    writeFileSync(join(dir, "ledger-verdicts-002.json"), JSON.stringify({ entries: [{ candidate_id: "b" }, { candidate_id: "c" }] }));
    writeFileSync(join(dir, "README.md"), "not a batch");
    writeFileSync(join(dir, "schema.json"), "{}");
    const ids = namedCandidateIds(dir);
    assert.deepEqual([...ids].sort(), ["a", "b", "c"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("namedCandidateIds: a malformed batch is skipped, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-verdicts-"));
  try {
    writeFileSync(join(dir, "ledger-verdicts-001.json"), "{not json");
    assert.doesNotThrow(() => namedCandidateIds(dir));
    assert.equal(namedCandidateIds(dir).size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("namedCandidateIds: a batch with entries missing candidate_id is skipped per-entry, not thrown", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-verdicts-"));
  try {
    writeFileSync(join(dir, "ledger-verdicts-001.json"), JSON.stringify({ entries: [{ url: "https://x" }, { candidate_id: "z" }] }));
    assert.deepEqual([...namedCandidateIds(dir)], ["z"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("namedCandidateIds: an empty/nonexistent directory yields an empty set, never throws", () => {
  const ids = namedCandidateIds("/nonexistent/path/xyz-does-not-exist");
  assert.equal(ids.size, 0);
});

// ── classifyDwellCandidates ──────────────────────────────────────────────────────────────────────────

test("classifyDwellCandidates: a within-bound row is never counted past-bound, regardless of naming", () => {
  const now = Date.parse("2026-09-13T00:00:00.000Z");
  const rows = [{ id: "p1", url: "https://x/1", first_seen_at: "2026-09-10T00:00:00.000Z" }];
  const { withinBound, pastBoundNamed, pastBoundUnnamed } = classifyDwellCandidates(rows, new Set(), { nowMs: () => now });
  assert.equal(withinBound.length, 1);
  assert.equal(pastBoundNamed.length, 0);
  assert.equal(pastBoundUnnamed.length, 0);
});

test(`classifyDwellCandidates: a row past ${DWELL_BOUND_DAYS}d with NO named verdict is the hard tripwire`, () => {
  const now = Date.parse("2026-09-13T00:00:00.000Z");
  const rows = [{ id: "p1", url: "https://x/1", first_seen_at: "2026-08-01T00:00:00.000Z" }];
  const { pastBoundUnnamed, pastBoundNamed } = classifyDwellCandidates(rows, new Set(), { nowMs: () => now });
  assert.equal(pastBoundUnnamed.length, 1);
  assert.equal(pastBoundUnnamed[0].id, "p1");
  assert.ok(pastBoundUnnamed[0].ageDays >= DWELL_BOUND_DAYS);
  assert.equal(pastBoundNamed.length, 0);
});

test("classifyDwellCandidates: a row past the bound but NAMED in a verdict batch is standing, not the tripwire", () => {
  const now = Date.parse("2026-09-13T00:00:00.000Z");
  const rows = [{ id: "p1", url: "https://x/1", first_seen_at: "2026-08-01T00:00:00.000Z" }];
  const { pastBoundUnnamed, pastBoundNamed } = classifyDwellCandidates(rows, new Set(["p1"]), { nowMs: () => now });
  assert.equal(pastBoundUnnamed.length, 0);
  assert.equal(pastBoundNamed.length, 1);
  assert.equal(pastBoundNamed[0].id, "p1");
});

test("classifyDwellCandidates: an unparseable first_seen_at is treated as age 0 (within bound), never thrown", () => {
  const rows = [{ id: "p1", url: "https://x/1", first_seen_at: "not-a-date" }];
  assert.doesNotThrow(() => classifyDwellCandidates(rows, new Set()));
  const { withinBound } = classifyDwellCandidates(rows, new Set());
  assert.equal(withinBound.length, 1);
});

test("classifyDwellCandidates: empty rows -> all three buckets empty", () => {
  const { withinBound, pastBoundNamed, pastBoundUnnamed } = classifyDwellCandidates([], new Set());
  assert.equal(withinBound.length, 0);
  assert.equal(pastBoundNamed.length, 0);
  assert.equal(pastBoundUnnamed.length, 0);
});
