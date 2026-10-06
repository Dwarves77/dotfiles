// Tests for emit-live-smoke-artifact.mjs (lane GATES-2, 2026-10-05). Fixture reports only; node: builtins and
// relative imports only. Run: node --test scripts/turns/emit-live-smoke-artifact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateRunArtifact, readRunHistory } from "../lib/run-artifact.mjs";
import { readReport, buildArtifact, emit } from "./emit-live-smoke-artifact.mjs";

const REPORT = {
  baseUrl: "https://carosledge.com",
  pagesVisited: [
    { url: "https://carosledge.com/", viewport: 1440 },
    { url: "https://carosledge.com/market/x", viewport: 375 },
  ],
  findings: [
    { invariant: "internal-marker", url: "https://carosledge.com/market/x", viewport: 375, text: "<<<CLAIM_PROVENANCE_LEDGER", severity: "fail" },
    { invariant: "own-origin-4xx", url: "https://carosledge.com/", viewport: 1440, text: "404 /x.png", severity: "warn" },
  ],
};

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "live-smoke-artifact-test-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("readReport: a good report parses, a missing path or a bad file is an error, never a clean run", () => {
  assert.equal(readReport("x", () => JSON.stringify(REPORT)).report.baseUrl, "https://carosledge.com");
  assert.match(readReport(undefined).error, /LS_REPORT is not set/);
  assert.match(readReport("x", () => { throw new Error("ENOENT"); }).error, /could not read the report: ENOENT/);
  assert.match(readReport("x", () => "{}").error, /no findings or pagesVisited/);
});

test("buildArtifact: counts, per page outcome and one defect per failing invariant; validates", () => {
  const a = buildArtifact({ runId: "live-smoke-run-001", harnessVersion: "v", startedAt: "2026-10-05T00:00:00Z", url: "https://carosledge.com", report: REPORT, error: null });
  assert.deepEqual(validateRunArtifact(a, "live-smoke"), []);
  assert.equal(a.metrics.pages_visited, 2);
  assert.equal(a.metrics.failure_count, 1);
  assert.equal(a.metrics.warning_count, 1);
  assert.equal(a.metrics.failures_internal_marker, 1);
  assert.equal(a.metrics.failures_scroll_container_overflow, 0);
  assert.deepEqual(a.per_item.map((p) => p.outcome), ["clean", "failed"]);
  assert.equal(a.defects_found.length, 1);
  assert.match(a.defects_found[0].description, /^internal-marker: 1 failure\(s\) on 1 page\(s\)/);
});

test("ATTACK: no report is recorded as report_missing with null counts, never as zero failures", () => {
  const a = buildArtifact({ runId: "live-smoke-run-001", harnessVersion: "v", startedAt: "2026-10-05T00:00:00Z", url: null, report: null, error: "LS_REPORT is not set" });
  assert.deepEqual(validateRunArtifact(a, "live-smoke"), []);
  assert.equal(a.metrics.failure_count, null);
  assert.equal(a.metrics.pages_visited, null);
  assert.equal(a.per_item[0].outcome, "report_missing");
  assert.equal(a.defects_found[0].description, "live smoke produced no report");
});

test("emit: writes a schema-valid, numbered artifact into the family dir", () => {
  withTmp((dir) => {
    const reportPath = join(dir, "r.json");
    writeFileSync(reportPath, JSON.stringify(REPORT));
    const fam = join(dir, "live-smoke");
    const { outPath, artifact } = emit({ env: { LS_REPORT: reportPath, LS_STARTED_AT: "2026-10-05T00:00:00Z", LS_URL: "https://carosledge.com" }, familyDir: fam });
    assert.match(outPath, /live-smoke-run-001\.json$/);
    assert.equal(artifact.harness_family, "live-smoke");
    const { runs, invalid } = readRunHistory(fam);
    assert.equal(invalid.length, 0);
    assert.equal(runs.length, 1);
  });
});
