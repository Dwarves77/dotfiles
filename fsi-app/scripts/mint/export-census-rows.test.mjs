// Tests for export-census-rows.mjs (Lane POP, 2026-09-02). node:test + node:assert/strict. No network,
// no DB: every DB-shaped input is passed in directly (censusRows/sourcesById/existingCaptureByUrl); the
// one network path (captureDocument/makePoliteCapture) is exercised only with an injected fetchImpl stub.
// Run: node --test scripts/mint/export-census-rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyItemTypeFromCelexKey,
  stripHtmlToText,
  extractTitleFromHtml,
  selectCensusRows,
  partitionExcludeHeld,
  buildExportRow,
  buildRows,
  captureDocument,
  makePoliteCapture,
  summarize,
} from "./export-census-rows.mjs";

// ── classifyItemTypeFromCelexKey ────────────────────────────────────────────────────────────────────

test("classifyItemTypeFromCelexKey: R -> regulation, L -> directive, D -> initiative (not 'decision')", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey("32014R0788"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyItemTypeFromCelexKey("32011L0037"), { itemType: "directive", hold: null });
  assert.deepEqual(classifyItemTypeFromCelexKey("32009D0320"), { itemType: "initiative", hold: null });
});

test("classifyItemTypeFromCelexKey: an OJ-sequence-suffixed key ('(NN)') still classifies by its letter", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey("32008A0221(01)"), { itemType: null, hold: "item_type_unmapped" });
  // 'A' (international agreement) is a real CELEX sector-3 letter this repo's item_type enum has no home
  // for -- held, never guessed.
});

test("classifyItemTypeFromCelexKey RED: null/unresolved key -> canonical_key_unresolved", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey(null), { itemType: null, hold: "canonical_key_unresolved" });
  assert.deepEqual(classifyItemTypeFromCelexKey("not-a-celex-key"), { itemType: null, hold: "canonical_key_unresolved" });
});

// ── stripHtmlToText / extractTitleFromHtml ──────────────────────────────────────────────────────────

test("stripHtmlToText: drops script/style, collapses whitespace, decodes common entities", () => {
  const html = "<html><head><style>.x{color:red}</style></head><body><script>evil()</script><p>Fish &amp; chips &nbsp; ok</p></body></html>";
  assert.equal(stripHtmlToText(html), "Fish & chips ok");
});

test("extractTitleFromHtml: prefers <title>, falls back to first <h1>, null when neither present", () => {
  assert.deepEqual(extractTitleFromHtml("<html><head><title>Regulation (EU) 2024/1610</title></head></html>"), {
    title: "Regulation (EU) 2024/1610",
    origin: "captured_title",
  });
  assert.deepEqual(extractTitleFromHtml("<html><body><h1>Commission Decision 2009/320/EC</h1></body></html>"), {
    title: "Commission Decision 2009/320/EC",
    origin: "captured_heading",
  });
  assert.equal(extractTitleFromHtml("<html><body><p>no title here</p></body></html>"), null);
  assert.equal(extractTitleFromHtml(""), null);
});

// ── selectCensusRows / partitionExcludeHeld ─────────────────────────────────────────────────────────

const ROWS = [
  { id: "r1", source_id: "s1", document_url: "https://eur-lex.europa.eu/a", dryrun_disposition: "would_mint", instrument_identifier: "32024R0001" },
  { id: "r2", source_id: "s2", document_url: "https://eur-lex.europa.eu/b", dryrun_disposition: "would_mint", instrument_identifier: "32023L0002" },
  { id: "r3", source_id: "s1", document_url: "https://eur-lex.europa.eu/c", dryrun_disposition: "hold", instrument_identifier: "32024R0003" },
  { id: "r4", source_id: "s1", document_url: "https://eur-lex.europa.eu/d", dryrun_disposition: "would_mint", instrument_identifier: "32024R0004" },
];

test("selectCensusRows: filters to would_mint, applies source-id/celex-prefix/limit", () => {
  assert.deepEqual(selectCensusRows(ROWS, {}).map((r) => r.id), ["r1", "r2", "r4"]);
  assert.deepEqual(selectCensusRows(ROWS, { sourceId: "s1" }).map((r) => r.id), ["r1", "r4"]);
  assert.deepEqual(selectCensusRows(ROWS, { celexPrefix: "32024" }).map((r) => r.id), ["r1", "r4"]);
  assert.deepEqual(selectCensusRows(ROWS, { limit: 1 }).map((r) => r.id), ["r1"]);
});

test("partitionExcludeHeld: default excludes rows whose document_url already has an intelligence_items row", () => {
  const held = new Set(["https://eur-lex.europa.eu/b"]);
  const { kept, excludedHeld } = partitionExcludeHeld(ROWS.slice(0, 2), held, true);
  assert.deepEqual(kept.map((r) => r.id), ["r1"]);
  assert.deepEqual(excludedHeld.map((r) => r.id), ["r2"]);
});

test("partitionExcludeHeld: excludeHeld=false keeps everything, excludes nothing", () => {
  const held = new Set(["https://eur-lex.europa.eu/b"]);
  const { kept, excludedHeld } = partitionExcludeHeld(ROWS.slice(0, 2), held, false);
  assert.equal(kept.length, 2);
  assert.equal(excludedHeld.length, 0);
});

// ── buildExportRow ───────────────────────────────────────────────────────────────────────────────────

const SOURCE = { id: "src-1", url: "https://eur-lex.europa.eu", name: "EUR-Lex Official Journal", base_tier: 1, tier_override: null, status: "active", institution_id: null, category: "regulatory" };

test("buildExportRow: a regulation row with an existing plain-text capture -> row, title_origin source_name_fallback (no HTML to read a title from)", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  const capture = { text: "x".repeat(500), html: null };
  const { row, hold } = buildExportRow(censusRow, SOURCE, capture);
  assert.equal(hold, undefined);
  assert.equal(row.item_type, "regulation");
  assert.equal(row.canonical_instrument_key, "32024R0001");
  assert.equal(row.jurisdiction_iso, "EU");
  assert.equal(row.title_origin, "source_name_fallback");
  assert.match(row.title, /32024R0001/);
  assert.equal(row.fetched_length, 500);
  assert.equal(row.source.id, "src-1");
});

test("buildExportRow: a freshly-captured row with HTML carries its own <title> and title_origin captured_title", () => {
  const censusRow = { id: "r2", document_url: "https://eur-lex.europa.eu/32023L0002", instrument_identifier: "32023L0002" };
  const html = `<html><head><title>Directive on Vehicle Emissions</title></head><body>${"body text ".repeat(30)}</body></html>`;
  const capture = { text: stripHtmlToTextLocal(html), html };
  const { row } = buildExportRow(censusRow, SOURCE, capture);
  assert.equal(row.item_type, "directive");
  assert.equal(row.title, "Directive on Vehicle Emissions");
  assert.equal(row.title_origin, "captured_title");
});
function stripHtmlToTextLocal(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().repeat(1) + " ".repeat(200); // pad past 200 chars
}

test("buildExportRow RED: no source -> hold source_not_found", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold, row } = buildExportRow(censusRow, null, { text: "x".repeat(500), html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "source_not_found");
});

test("buildExportRow RED: unmappable item_type -> hold item_type_unmapped, not silently defaulted", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32014A0788" }; // 'A' sector letter
  const { hold, row } = buildExportRow(censusRow, SOURCE, { text: "x".repeat(500), html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "item_type_unmapped");
});

test("buildExportRow RED: captured_text <= 200 chars -> hold capture_too_short", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold, row } = buildExportRow(censusRow, SOURCE, { text: "short", html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "capture_too_short");
});

test("buildExportRow RED: no captured text at all -> hold capture_too_short with fetched_length 0", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold } = buildExportRow(censusRow, SOURCE, { text: null, html: null });
  assert.equal(hold.reason, "capture_too_short");
  assert.equal(hold.fetched_length, 0);
});

// ── buildRows (the --capture branch, injected resolveCapture — no network) ─────────────────────────

test("buildRows: rows with an existing capture build directly; rows with none and --capture off hold no_capture", async () => {
  const kept = [
    { id: "r1", source_id: "s1", document_url: "https://x/has-capture", instrument_identifier: "32024R0001" },
    { id: "r2", source_id: "s1", document_url: "https://x/no-capture", instrument_identifier: "32024L0002" },
  ];
  const sourcesById = new Map([["s1", SOURCE]]);
  const existingCaptureByUrl = new Map([["https://x/has-capture", { text: "y".repeat(300), html: null }]]);
  const { rows, held, captured, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl, capture: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row_id, "r1");
  assert.equal(held.length, 1);
  assert.equal(held[0].reason, "no_capture");
  assert.equal(captured, 0);
  assert.equal(captureFailed, 0);
});

test("buildRows: --capture on fetches missing rows via the injected resolveCapture", async () => {
  const kept = [{ id: "r2", source_id: "s1", document_url: "https://x/no-capture", instrument_identifier: "32024L0002" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const existingCaptureByUrl = new Map();
  const resolveCapture = async (url) => ({ ok: true, status: 200, text: "z".repeat(400), html: `<title>t</title>${"z".repeat(400)}` });
  const { rows, held, captured } = await buildRows(kept, { sourcesById, existingCaptureByUrl, capture: true, resolveCapture });
  assert.equal(rows.length, 1);
  assert.equal(held.length, 0);
  assert.equal(captured, 1);
});

test("buildRows: a failed fetch under --capture holds capture_failed, never throws", async () => {
  const kept = [{ id: "r2", source_id: "s1", document_url: "https://x/no-capture", instrument_identifier: "32024L0002" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const existingCaptureByUrl = new Map();
  const resolveCapture = async () => ({ ok: false, status: 500, text: null, html: null, error: "HTTP 500" });
  const { rows, held, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl, capture: true, resolveCapture });
  assert.equal(rows.length, 0);
  assert.equal(held.length, 1);
  assert.equal(held[0].reason, "capture_failed");
  assert.equal(captureFailed, 1);
});

// ── captureDocument / makePoliteCapture (network fully stubbed) ────────────────────────────────────

test("captureDocument: strips the fetched HTML to text and reports status", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "<html><body><p>Hello world</p></body></html>" });
  const result = await captureDocument("https://x/y", { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.text, "Hello world");
  assert.equal(result.html, "<html><body><p>Hello world</p></body></html>");
});

test("captureDocument: a thrown fetch (network error/timeout) resolves ok:false, never throws", async () => {
  const fetchImpl = async () => { throw new Error("network boom"); };
  const result = await captureDocument("https://x/y", { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.error, "network boom");
});

test("makePoliteCapture: enforces the politeness gap between successive fetches", async () => {
  const calls = [];
  const fetchImpl = async () => { calls.push(Date.now()); return { ok: true, status: 200, text: async () => "<p>ok</p>" }; };
  const capture = makePoliteCapture({ gapMs: 30, fetchImpl });
  await capture("https://x/1");
  await capture("https://x/2");
  assert.ok(calls.length === 2 && calls[1] - calls[0] >= 25, `expected >=25ms gap, got ${calls[1] - calls[0]}ms`);
});

// ── summarize ────────────────────────────────────────────────────────────────────────────────────────

test("summarize: reports eligible/excluded/exported/held-by-reason/captured counts", () => {
  const text = summarize({
    eligibleCount: 10,
    excludedHeldCount: 2,
    rows: [{}, {}],
    held: [{ reason: "no_capture" }, { reason: "no_capture" }, { reason: "item_type_unmapped" }],
    captured: 1,
    captureFailed: 0,
  });
  assert.match(text, /eligible \(post filters\/limit\)=10/);
  assert.match(text, /excluded_held.*=2/);
  assert.match(text, /exported=2/);
  assert.match(text, /held=3/);
  assert.match(text, /no_capture=2/);
  assert.match(text, /item_type_unmapped=1/);
  assert.match(text, /captured=1 capture_failed=0/);
});
