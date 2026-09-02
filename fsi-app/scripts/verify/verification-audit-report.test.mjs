// verification-audit-report.test.mjs — pure-function proof (population-report.test.mjs's own
// pattern: fakeClient-injected DB reads, pure aggregators tested directly against constructed rows).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProvenanceMatrix,
  buildClaimsCitationStats,
  findSectionsMissingSpan,
  collectHarnessMarkers,
  fetchProvenanceRows,
  fetchClaimRows,
  collect,
  renderMarkdown,
  writeReportFiles,
} from "./verification-audit-report.mjs";

// ── buildProvenanceMatrix ────────────────────────────────────────────────────────────────────────

test("buildProvenanceMatrix: groups by (grade, status, item_type) and counts", () => {
  const rows = [
    { item_grade: "brief", provenance_status: "verified", item_type: "regulation" },
    { item_grade: "brief", provenance_status: "verified", item_type: "regulation" },
    { item_grade: "record", provenance_status: "unverified", item_type: "regulation" },
  ];
  const matrix = buildProvenanceMatrix(rows);
  assert.deepEqual(matrix, [
    { grade: "brief", status: "verified", item_type: "regulation", count: 2 },
    { grade: "record", status: "unverified", item_type: "regulation", count: 1 },
  ]);
});

test("buildProvenanceMatrix: a null field renders as the literal \"(null)\" bucket, never dropped", () => {
  const matrix = buildProvenanceMatrix([{ item_grade: null, provenance_status: "verified", item_type: null }]);
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].grade, "(null)");
  assert.equal(matrix[0].item_type, "(null)");
});

test("buildProvenanceMatrix: empty input is an empty matrix, not a thrown error", () => {
  assert.deepEqual(buildProvenanceMatrix([]), []);
});

// ── buildClaimsCitationStats ─────────────────────────────────────────────────────────────────────

test("buildClaimsCitationStats: a FACT claim with source_id + non-empty source_span counts as cited", () => {
  const { byKind, totals } = buildClaimsCitationStats([
    { claim_kind: "FACT", source_id: "s1", source_span: "the exact quoted text" },
  ]);
  assert.deepEqual(byKind, [{ claim_kind: "FACT", withCitation: 1, withoutCitation: 0, total: 1 }]);
  assert.deepEqual(totals, { withCitation: 1, withoutCitation: 0 });
});

test("buildClaimsCitationStats: missing source_id, missing source_span, and a blank source_span all count as uncited", () => {
  const { totals } = buildClaimsCitationStats([
    { claim_kind: "FACT", source_id: null, source_span: "text" },
    { claim_kind: "FACT", source_id: "s1", source_span: null },
    { claim_kind: "FACT", source_id: "s1", source_span: "   " },
  ]);
  assert.deepEqual(totals, { withCitation: 0, withoutCitation: 3 });
});

test("buildClaimsCitationStats: ANALYSIS/LEGAL/GAP claims are tallied separately, never merged with FACT", () => {
  const { byKind } = buildClaimsCitationStats([
    { claim_kind: "FACT", source_id: "s1", source_span: "x" },
    { claim_kind: "ANALYSIS", source_id: null, source_span: null },
    { claim_kind: "LEGAL", source_id: null, source_span: null },
  ]);
  const kinds = byKind.map((r) => r.claim_kind).sort();
  assert.deepEqual(kinds, ["ANALYSIS", "FACT", "LEGAL"]);
});

// ── findSectionsMissingSpan ──────────────────────────────────────────────────────────────────────

test("findSectionsMissingSpan: counts DISTINCT sections, not claims — two gap claims in one section count once", () => {
  const { sectionCount, claimCount } = findSectionsMissingSpan([
    { claim_kind: "FACT", section_row_id: "sec-1", source_span: null },
    { claim_kind: "FACT", section_row_id: "sec-1", source_span: "" },
    { claim_kind: "FACT", section_row_id: "sec-2", source_span: null },
  ]);
  assert.equal(sectionCount, 2);
  assert.equal(claimCount, 3);
});

test("findSectionsMissingSpan: ANALYSIS/LEGAL/GAP claims never count, even with no source_span (not citation-bearing by design)", () => {
  const { sectionCount, claimCount } = findSectionsMissingSpan([
    { claim_kind: "ANALYSIS", section_row_id: "sec-1", source_span: null },
    { claim_kind: "GAP", section_row_id: "sec-2", source_span: null },
  ]);
  assert.equal(sectionCount, 0);
  assert.equal(claimCount, 0);
});

test("findSectionsMissingSpan: a FACT claim WITH a real source_span is not counted", () => {
  const { sectionCount, claimCount } = findSectionsMissingSpan([
    { claim_kind: "FACT", section_row_id: "sec-1", source_span: "a real quote" },
  ]);
  assert.equal(sectionCount, 0);
  assert.equal(claimCount, 0);
});

// ── collectHarnessMarkers ────────────────────────────────────────────────────────────────────────

function fakeHistoryReader(byDir) {
  return (dir) => byDir[dir] ?? { runs: [], invalid: [] };
}

test("collectHarnessMarkers: a family with run history reports its latest run", () => {
  const root = "/fake/harness-runs";
  const rows = collectHarnessMarkers({
    families: ["mint"],
    root,
    historyReader: fakeHistoryReader({
      "/fake/harness-runs/mint": {
        runs: [
          { run_id: "mint-run-001", started_at: "2026-09-01T00:00:00Z", defects_found: [] },
          { run_id: "mint-run-002", started_at: "2026-09-02T00:00:00Z", defects_found: [{ description: "x" }] },
        ],
        invalid: [],
      },
    }),
    fileExists: () => false,
  });
  assert.deepEqual(rows, [
    {
      family: "mint",
      runCount: 2,
      invalidCount: 0,
      latestRunId: "mint-run-002",
      latestStartedAt: "2026-09-02T00:00:00Z",
      latestDefectCount: 1,
      pendingMarker: false,
    },
  ]);
});

test("collectHarnessMarkers: a zero-run family with no PENDING-RUN.md reports honestly (F28 rule (b) gap)", () => {
  const rows = collectHarnessMarkers({
    families: ["source-sweep"],
    root: "/fake/harness-runs",
    historyReader: fakeHistoryReader({}),
    fileExists: () => false,
  });
  assert.equal(rows[0].runCount, 0);
  assert.equal(rows[0].latestRunId, null);
  assert.equal(rows[0].pendingMarker, false);
});

test("collectHarnessMarkers: a zero-run family WITH a PENDING-RUN.md is marked, not flagged as a bare gap", () => {
  const rows = collectHarnessMarkers({
    families: ["propagation"],
    root: "/fake/harness-runs",
    historyReader: fakeHistoryReader({}),
    fileExists: (p) => p.endsWith("propagation/PENDING-RUN.md"),
  });
  assert.equal(rows[0].pendingMarker, true);
});

test("collectHarnessMarkers: rows are sorted by family name", () => {
  const rows = collectHarnessMarkers({
    families: ["screen", "mint"],
    root: "/fake/harness-runs",
    historyReader: fakeHistoryReader({}),
    fileExists: () => false,
  });
  assert.deepEqual(rows.map((r) => r.family), ["mint", "screen"]);
});

// ── renderMarkdown ───────────────────────────────────────────────────────────────────────────────

test("renderMarkdown: every section header is present", () => {
  const md = renderMarkdown({
    generatedAt: "2026-09-02T00:00:00Z",
    provenanceMatrix: [],
    provenanceRowCount: 0,
    claims: { byKind: [], totals: { withCitation: 0, withoutCitation: 0 } },
    claimRowCount: 0,
    missingSpan: { sectionCount: 0, claimCount: 0 },
    harnessMarkers: [],
  }).join("\n");
  assert.match(md, /## 1\. intelligence_items provenance/);
  assert.match(md, /## 2\. Claims — citation status/);
  assert.match(md, /## 3\. Sections with a FACT claim missing source_span/);
  assert.match(md, /## 4\. F28 harness-run markers/);
});

test("renderMarkdown: names every family missing both a run and a PENDING-RUN.md marker", () => {
  const md = renderMarkdown({
    generatedAt: "2026-09-02T00:00:00Z",
    provenanceMatrix: [],
    provenanceRowCount: 0,
    claims: { byKind: [], totals: { withCitation: 0, withoutCitation: 0 } },
    claimRowCount: 0,
    missingSpan: { sectionCount: 0, claimCount: 0 },
    harnessMarkers: [
      { family: "ghost-family", runCount: 0, invalidCount: 0, latestRunId: null, latestStartedAt: null, latestDefectCount: null, pendingMarker: false },
    ],
  }).join("\n");
  assert.match(md, /1 family with zero runs and no PENDING-RUN\.md marker.*ghost-family/s);
});

test("renderMarkdown: says so plainly when every family is covered", () => {
  const md = renderMarkdown({
    generatedAt: "2026-09-02T00:00:00Z",
    provenanceMatrix: [],
    provenanceRowCount: 0,
    claims: { byKind: [], totals: { withCitation: 0, withoutCitation: 0 } },
    claimRowCount: 0,
    missingSpan: { sectionCount: 0, claimCount: 0 },
    harnessMarkers: [
      { family: "mint", runCount: 3, invalidCount: 0, latestRunId: "mint-run-003", latestStartedAt: "x", latestDefectCount: 0, pendingMarker: false },
    ],
  }).join("\n");
  assert.match(md, /Every registered family has either run history or an honest PENDING-RUN\.md marker\./);
});

// ── writeReportFiles ─────────────────────────────────────────────────────────────────────────────

test("writeReportFiles: writes markdown to --out and a JSON twin at the same path with .json", () => {
  const written = {};
  const fakeWrite = (path, content) => { written[path] = content; };
  const report = {
    generatedAt: "x",
    provenanceMatrix: [],
    provenanceRowCount: 0,
    claims: { byKind: [], totals: { withCitation: 0, withoutCitation: 0 } },
    claimRowCount: 0,
    missingSpan: { sectionCount: 0, claimCount: 0 },
    harnessMarkers: [],
  };
  const { markdownPath, jsonPath } = writeReportFiles(report, "/tmp/out/report.md", fakeWrite);
  assert.equal(markdownPath, "/tmp/out/report.md");
  assert.equal(jsonPath, "/tmp/out/report.json");
  assert.match(written["/tmp/out/report.md"], /# Verification audit report/);
  assert.deepEqual(JSON.parse(written["/tmp/out/report.json"]), report);
});

test("writeReportFiles: a non-.md --out path gets .json appended, not extension-swapped", () => {
  const written = {};
  const { jsonPath } = writeReportFiles(
    { generatedAt: "x", provenanceMatrix: [], provenanceRowCount: 0, claims: { byKind: [], totals: { withCitation: 0, withoutCitation: 0 } }, claimRowCount: 0, missingSpan: { sectionCount: 0, claimCount: 0 }, harnessMarkers: [] },
    "/tmp/out/report",
    (p, c) => { written[p] = c; },
  );
  assert.equal(jsonPath, "/tmp/out/report.json");
});

// ── injected-client tests: exercise the DB read path with no database (population-report.test.mjs's own idiom) ──

function fakeSelectClient(byTable) {
  return {
    from(table) {
      return { select: () => Promise.resolve(byTable[table] ?? { data: [], error: null }) };
    },
  };
}

test("fetchProvenanceRows reads intelligence_items with the three matrix columns", async () => {
  const sb = fakeSelectClient({
    intelligence_items: { data: [{ item_grade: "brief", provenance_status: "verified", item_type: "regulation" }], error: null },
  });
  const rows = await fetchProvenanceRows(sb);
  assert.deepEqual(rows, [{ item_grade: "brief", provenance_status: "verified", item_type: "regulation" }]);
});

test("fetchProvenanceRows surfaces a read error instead of reporting a false empty result", async () => {
  const sb = fakeSelectClient({ intelligence_items: { data: null, error: { message: "boom" } } });
  await assert.rejects(() => fetchProvenanceRows(sb), /intelligence_items: boom/);
});

test("fetchClaimRows reads section_claim_provenance with the four columns this report needs", async () => {
  const sb = fakeSelectClient({
    section_claim_provenance: { data: [{ section_row_id: "s1", claim_kind: "FACT", source_id: "src1", source_span: "x" }], error: null },
  });
  const rows = await fetchClaimRows(sb);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].claim_kind, "FACT");
});

test("collect() assembles all four sections from one injected client", async () => {
  const sb = fakeSelectClient({
    intelligence_items: { data: [{ item_grade: "record", provenance_status: "verified", item_type: "regulation" }], error: null },
    section_claim_provenance: { data: [{ section_row_id: "s1", claim_kind: "FACT", source_id: "src1", source_span: "x" }], error: null },
  });
  const report = await collect(sb, { harnessRoot: "/fake/harness-runs" });
  assert.equal(report.provenanceRowCount, 1);
  assert.equal(report.claimRowCount, 1);
  assert.ok(Array.isArray(report.harnessMarkers) && report.harnessMarkers.length > 0, "harness markers should cover every F28-registered family");
  assert.ok(report.generatedAt);
});
