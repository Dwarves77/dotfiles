// Unit test for check-sources/route.ts's limit parameter and response-shape defects, found and fixed
// while building the change-detection runtime (lane CD, 2026-09-02 — "there is no small follow-up fix").
// Exercises the REAL exported functions this route calls (not a reimplementation) — same
// route.ts-exports-a-pure-function-for-testability pattern src/app/api/health/spend/route.npmtest.mjs and
// src/app/api/watchlist/route.npmtest.mjs already use: validateCheckLimit (the limit parse/validate
// contract), and buildResultEntry/buildErrorEntry/summarizeResults (the response-shape builders), the
// latter fed a REAL assessAndUpdateSource() call with injected render/classify + a fake supabase client
// (mirroring src/lib/sources/reconcile-pass.test.mjs's fakeSvc pattern) — proving the actual per-source
// fields (httpStatus, outcome, changeDetected, portalCandidates) that were computed all along but never
// reached the response body now do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(ROOT, "src") } });
const {
  DEFAULT_CHECK_LIMIT,
  MAX_CHECK_LIMIT,
  validateCheckLimit,
  assessAndUpdateSource,
  buildResultEntry,
  buildErrorEntry,
  summarizeResults,
} = await jiti.import("./route.ts");
const { BrowserlessError } = await jiti.import("@/lib/sources/browserless");

// ── validateCheckLimit ───────────────────────────────────────────────────────────────────────────

test("validateCheckLimit: not supplied (undefined/null/'') -> the UNCHANGED prior default (10)", () => {
  assert.equal(DEFAULT_CHECK_LIMIT, 10, "source-monitoring.yml's own no-body POST behaviour must not shift");
  for (const raw of [undefined, null, ""]) {
    const r = validateCheckLimit(raw);
    assert.equal(r.ok, true);
    assert.equal(r.limit, 10);
  }
});

test("validateCheckLimit: a valid string (query param) or number (JSON body) integer in range is accepted", () => {
  assert.deepEqual(validateCheckLimit("25"), { ok: true, limit: 25 });
  assert.deepEqual(validateCheckLimit(25), { ok: true, limit: 25 });
  assert.deepEqual(validateCheckLimit("1"), { ok: true, limit: 1 });
  assert.deepEqual(validateCheckLimit(String(MAX_CHECK_LIMIT)), { ok: true, limit: MAX_CHECK_LIMIT });
});

test("validateCheckLimit: hard cap — anything above MAX_CHECK_LIMIT (50) is rejected, not silently clamped", () => {
  assert.equal(MAX_CHECK_LIMIT, 50);
  const r = validateCheckLimit("51");
  assert.equal(r.ok, false);
  assert.match(r.error, /between 1 and 50/);
  assert.match(r.error, /"51"/, "the rejected value is named verbatim, never a bare 'invalid limit'");
  assert.equal(validateCheckLimit(2561).ok, false, "the full corpus size must not slip through as a limit");
});

test("validateCheckLimit: zero and negative are rejected", () => {
  assert.equal(validateCheckLimit("0").ok, false);
  assert.equal(validateCheckLimit(0).ok, false);
  assert.equal(validateCheckLimit("-1").ok, false);
  assert.equal(validateCheckLimit(-5).ok, false);
});

test("validateCheckLimit: fractional and non-numeric strings/numbers are rejected", () => {
  assert.equal(validateCheckLimit("3.5").ok, false);
  assert.equal(validateCheckLimit(3.5).ok, false);
  assert.equal(validateCheckLimit("abc").ok, false);
  assert.equal(validateCheckLimit("10abc").ok, false, "Number('10abc') is NaN — must not silently coerce a prefix match");
});

test("validateCheckLimit: a non-string/non-number shape is rejected BEFORE Number()-coercion gotchas can apply", () => {
  // Number([10]) === 10 and Number(true) === 1 in JS — both must still be refused, not silently accepted.
  assert.equal(validateCheckLimit({}).ok, false);
  assert.equal(validateCheckLimit([10]).ok, false);
  assert.equal(validateCheckLimit(true).ok, false);
});

test("validateCheckLimit: boundary values 1 and MAX_CHECK_LIMIT are both accepted (inclusive range)", () => {
  assert.equal(validateCheckLimit(1).ok, true);
  assert.equal(validateCheckLimit(MAX_CHECK_LIMIT).ok, true);
  assert.equal(validateCheckLimit(MAX_CHECK_LIMIT + 1).ok, false);
});

// ── buildResultEntry / buildErrorEntry / summarizeResults (response shape) ─────────────────────────

test("buildResultEntry: maps a real assessAndUpdateSource() outcome (injected render/classify) into the response entry shape", async () => {
  const updates = [];
  const inserts = [];
  const fakeSb = {
    from(table) {
      return {
        update(patch) {
          return { eq: async () => { updates.push({ table, patch }); return { error: null }; } };
        },
        insert: async (row) => { inserts.push({ table, row }); return { error: null }; },
      };
    },
  };
  // last_content_hash is a REAL prior fingerprint of different text (>=200 normalized chars — below that
  // floor contentFingerprint() returns null by design, see content-change.mjs) so this render's own
  // fingerprint genuinely differs and changeDetected is a real, non-fabricated signal.
  const priorText = "A".repeat(250);
  const { contentFingerprint } = await jiti.import("@/lib/sources/content-change.mjs");
  const source = {
    id: "src-1", name: "Test Source", url: "https://x.example/reg",
    last_content_hash: contentFingerprint(priorText),
    total_checks: 0, successful_checks: 0, consecutive_accessible: 0, status: "active",
  };
  const newText = "B".repeat(250);
  const render = async () => ({ status: 200, text: newText, html: `<html><body>${newText}</body></html>` });
  const classify = () => "reachable"; // REACH.REACHABLE — the real vocabulary decideSourceAssessment reads

  const assessed = await assessAndUpdateSource(fakeSb, source, { render, classify });
  const entry = buildResultEntry(source.name, assessed);

  assert.equal(entry.source, "Test Source");
  assert.equal(entry.status, "accessible");
  assert.equal(entry.httpStatus, 200);
  assert.equal(entry.outcome, "reachable");
  assert.equal(typeof entry.changeDetected, "boolean");
  assert.equal(entry.changeDetected, true, "a real prior hash differing from this render's own fingerprint IS a change");
  assert.equal(typeof entry.portalCandidates, "number");
  assert.equal("error" in entry, false, "a successful assessment never carries an error key");
});

test("buildResultEntry: a FIRST observation (no prior hash) never reads as a change — only seeds the hash", async () => {
  const fakeSb = {
    from() {
      return {
        update() { return { eq: async () => ({ error: null }) }; },
        insert: async () => ({ error: null }),
      };
    },
  };
  const source = { id: "src-1b", name: "New Source", url: "https://x.example/new", last_content_hash: null, total_checks: 0, successful_checks: 0, consecutive_accessible: 0, status: "active" };
  const text = "C".repeat(250);
  const render = async () => ({ status: 200, text, html: `<html><body>${text}</body></html>` });
  const classify = () => "reachable";

  const assessed = await assessAndUpdateSource(fakeSb, source, { render, classify });
  const entry = buildResultEntry(source.name, assessed);
  assert.equal(entry.changeDetected, false, "first observation seeds the hash — never reported as a change (content-change.mjs's own contract)");
});

test("buildResultEntry: a non-accessible outcome (e.g. rate-limited) still carries real httpStatus/outcome, not a placeholder", async () => {
  const fakeSb = {
    from() {
      return {
        update() { return { eq: async () => ({ error: null }) }; },
        insert: async () => ({ error: null }),
      };
    },
  };
  const source = { id: "src-2", name: "Flaky Source", url: "https://x.example/flaky", last_content_hash: "abc123", total_checks: 5, successful_checks: 3, consecutive_accessible: 2, status: "active" };
  const render = async () => { throw new BrowserlessError("Browserless HTTP 429", 429, 120); };
  const classify = () => "inconclusive"; // REACH.INCONCLUSIVE — a non-answer (429/5xx/timeout), per reachability.mjs

  const assessed = await assessAndUpdateSource(fakeSb, source, { render, classify });
  const entry = buildResultEntry(source.name, assessed);

  assert.equal(entry.status, "inconclusive");
  assert.equal(entry.httpStatus, 429);
  assert.equal(entry.outcome, "inconclusive");
  assert.equal(entry.changeDetected, false, "an inaccessible check never fingerprints — never a fabricated change");
  assert.equal(entry.portalCandidates, 0);
});

test("buildErrorEntry: a thrown assessment (not merely a bad outcome) is a distinct, honestly-labelled entry", () => {
  const entry = buildErrorEntry("Broken Source", "RLS denied");
  assert.equal(entry.source, "Broken Source");
  assert.equal(entry.status, "error");
  assert.equal(entry.httpStatus, 0);
  assert.equal(entry.outcome, "error");
  assert.equal(entry.changeDetected, false);
  assert.equal(entry.portalCandidates, 0);
  assert.equal(entry.error, "RLS denied");
});

test("summarizeResults: totals fold over the SAME entries the response returns — no second DB read", () => {
  const results = [
    { source: "A", status: "accessible", httpStatus: 200, outcome: "ok", changeDetected: true, portalCandidates: 3 },
    { source: "B", status: "accessible", httpStatus: 200, outcome: "ok", changeDetected: false, portalCandidates: 0 },
    { source: "C", status: "error", httpStatus: 0, outcome: "error", changeDetected: false, portalCandidates: 0, error: "boom" },
    { source: "D", status: "accessible", httpStatus: 200, outcome: "ok", changeDetected: true, portalCandidates: 5 },
  ];
  const totals = summarizeResults(results);
  assert.deepEqual(totals, { sourcesChecked: 4, changesDetected: 2, portalCandidates: 8 });
});

test("summarizeResults: empty batch is all zeros, never throws", () => {
  assert.deepEqual(summarizeResults([]), { sourcesChecked: 0, changesDetected: 0, portalCandidates: 0 });
});
