import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadRowsFile, RowsFileError, requireCitation, registerCitedSource, resolveEntityByName,
} from "./rows-file.mjs";

function tmpFile(content) {
  const dir = mkdtempSync(join(tmpdir(), "rows-file-test-"));
  const p = join(dir, "rows.json");
  writeFileSync(p, content);
  return p;
}

test("loadRowsFile: accepts a bare array", () => {
  const p = tmpFile(JSON.stringify([{ a: 1 }]));
  assert.deepEqual(loadRowsFile(p), [{ a: 1 }]);
});

test("loadRowsFile: accepts { rows: [...] }", () => {
  const p = tmpFile(JSON.stringify({ rows: [{ a: 1 }, { a: 2 }] }));
  assert.equal(loadRowsFile(p).length, 2);
});

test("loadRowsFile: empty rows[] throws RowsFileError", () => {
  const p = tmpFile(JSON.stringify({ rows: [] }));
  assert.throws(() => loadRowsFile(p), RowsFileError);
});

test("loadRowsFile: missing file throws RowsFileError (never a raw ENOENT)", () => {
  assert.throws(() => loadRowsFile("/nonexistent/path/rows.json"), RowsFileError);
});

test("loadRowsFile: invalid JSON throws RowsFileError", () => {
  const p = tmpFile("{not json");
  assert.throws(() => loadRowsFile(p), RowsFileError);
});

test("requireCitation: full citation passes and is returned", () => {
  const row = { citation: { url: "https://example.gov/report", title: "Report", retrieved_at: "2026-09-05", quote: "the figure is X" } };
  const c = requireCitation(row, 0, "test");
  assert.equal(c.url, "https://example.gov/report");
});

test("requireCitation: missing citation block throws", () => {
  assert.throws(() => requireCitation({}, 0, "test"), RowsFileError);
});

for (const field of ["url", "title", "retrieved_at", "quote"]) {
  test(`requireCitation: missing citation.${field} throws`, () => {
    const c = { url: "https://example.gov/x", title: "t", retrieved_at: "2026-01-01", quote: "q" };
    delete c[field];
    assert.throws(() => requireCitation({ citation: c }, 0, "test"), RowsFileError);
  });
}

test("requireCitation: non-URL citation.url throws", () => {
  const row = { citation: { url: "not-a-url", title: "t", retrieved_at: "2026-01-01", quote: "q" } };
  assert.throws(() => requireCitation(row, 0, "test"), RowsFileError);
});

test("registerCitedSource: gov.uk host classifies (tier 2) and registers via injected deps", async () => {
  let called = null;
  const deps = { registerSource: async (s) => { called = s; return { source_id: "src-1", created: true }; } };
  const res = await registerCitedSource({ url: "https://www.gov.uk/some-page", title: "GOV.UK page" }, deps);
  assert.equal(res.refused, false);
  assert.equal(res.source_id, "src-1");
  assert.equal(res.tier, 2);
  assert.equal(called.base_tier, 2);
});

test("registerCitedSource: eur-lex host classifies tier 1 (legal primary)", async () => {
  const deps = { registerSource: async (s) => ({ source_id: "src-2", created: false }) };
  const res = await registerCitedSource({ url: "https://eur-lex.europa.eu/legal-content", title: "EUR-Lex" }, deps);
  assert.equal(res.tier, 1);
});

test("registerCitedSource: ambiguous host (no codified class) is refused, never guessed a tier", async () => {
  const deps = { registerSource: async () => { throw new Error("must not be called"); } };
  const res = await registerCitedSource({ url: "https://some-random-vendor-blog.example.com/post", title: "x" }, deps);
  assert.equal(res.refused, true);
  assert.match(res.reason, /does not resolve to a codified class/);
});

test("registerCitedSource: no deps.registerSource (dry run) never calls the DB and reports the would-be tier", async () => {
  const res = await registerCitedSource({ url: "https://www.gov.uk/x", title: "x" }, {});
  assert.equal(res.refused, true);
  assert.equal(res.wouldRegisterTier, 2);
});

test("registerCitedSource: unresolvable host is refused", async () => {
  const res = await registerCitedSource({ url: "not-a-real-url-at-all", title: "x" }, {});
  assert.equal(res.refused, true);
});

test("resolveEntityByName: exact match found", () => {
  const list = [{ entity_id: "e1", canonical_name: "GB" }, { entity_id: "e2", canonical_name: "GB-WLS" }];
  assert.equal(resolveEntityByName(list, "GB"), "e1");
});

test("resolveEntityByName: no match returns null, never invents an id", () => {
  const list = [{ entity_id: "e1", canonical_name: "GB" }];
  assert.equal(resolveEntityByName(list, "FR"), null);
});

test("resolveEntityByName: non-array input treated as empty, never throws", () => {
  assert.equal(resolveEntityByName(null, "GB"), null);
});
