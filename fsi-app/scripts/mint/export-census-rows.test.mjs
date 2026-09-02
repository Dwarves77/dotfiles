// Tests for export-census-rows.mjs (Lane POP, 2026-09-02; Lane POP2, 2026-09-02 per-family rewrite).
// node:test + node:assert/strict. No network, no DB: every DB-shaped input is passed in directly
// (censusRows/sourcesById/existingCaptureByUrl); every network path (captureDocument/resolveRowCapture/
// fetchFrDocumentMeta/makePoliteFetch) is exercised only with an injected fetchImpl stub.
// Run: node --test scripts/mint/export-census-rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fetchRowsIn,
  fetchColumnIn,
  classifyItemTypeFromCelexKey,
  classifyUkLegislationType,
  classifyFrDocType,
  extractFrDocumentNumber,
  getHostname,
  classifyHost,
  resolveIdentity,
  stripHtmlToText,
  extractTitleFromHtml,
  extractEurlexTitle,
  selectCensusRows,
  partitionExcludeHeld,
  buildExportRow,
  buildRows,
  captureDocument,
  makePoliteFetch,
  fetchFrDocumentMeta,
  resolveRowCapture,
  summarize,
} from "./export-census-rows.mjs";

// ── classifyItemTypeFromCelexKey ────────────────────────────────────────────────────────────────────

test("classifyItemTypeFromCelexKey: R -> regulation, L -> directive, D -> initiative, H -> guidance, A -> framework", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey("32014R0788"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyItemTypeFromCelexKey("32011L0037"), { itemType: "directive", hold: null });
  assert.deepEqual(classifyItemTypeFromCelexKey("32009D0320"), { itemType: "initiative", hold: null });
  assert.deepEqual(classifyItemTypeFromCelexKey("31978H0072"), { itemType: "guidance", hold: null }); // live hold, 2026-09-02 run
  assert.deepEqual(classifyItemTypeFromCelexKey("31978A0311"), { itemType: "framework", hold: null }); // live hold, 2026-09-02 run
});

test("classifyItemTypeFromCelexKey: an OJ-sequence-suffixed key ('(NN)') still classifies by its letter", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey("32008A0221(01)"), { itemType: "framework", hold: null });
});

test("classifyItemTypeFromCelexKey RED: an unmapped sector-3 letter (C, other acts) still holds, never guessed", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey("32014C0788"), { itemType: null, hold: "item_type_unmapped" });
});

test("classifyItemTypeFromCelexKey RED: null/unresolved key -> canonical_key_unresolved", () => {
  assert.deepEqual(classifyItemTypeFromCelexKey(null), { itemType: null, hold: "canonical_key_unresolved" });
  assert.deepEqual(classifyItemTypeFromCelexKey("not-a-celex-key"), { itemType: null, hold: "canonical_key_unresolved" });
});

// ── classifyUkLegislationType / extractFrDocumentNumber / classifyFrDocType ────────────────────────────

test("classifyUkLegislationType: uksi/ukpga/wsi/ssi/nisr -> regulation; anything else -> null (held, not guessed)", () => {
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/uksi/2021/1095/made"), "regulation");
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/wsi/2025/1268/made"), "regulation");
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/ukpga/2021/1/contents"), "regulation");
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/ssi/2024/1/contents"), "regulation");
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/nisr/2024/1/made"), "regulation");
  assert.equal(classifyUkLegislationType("https://www.legislation.gov.uk/eur/2021/1/contents"), null);
});

test("extractFrDocumentNumber: pulls the docnum out of a /documents/YYYY/MM/DD/<docnum>/ path", () => {
  assert.equal(extractFrDocumentNumber("https://www.federalregister.gov/documents/2024/01/05/2024-00001/some-title-slug"), "2024-00001");
  assert.equal(extractFrDocumentNumber("https://www.federalregister.gov/d/2024-00001"), null); // short-link shape, held not guessed
});

test("classifyFrDocType: the API's ACTUAL field value ('Rule', case-insensitive) -> regulation; every other FR type holds, naming itself", () => {
  assert.deepEqual(classifyFrDocType("Rule"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyFrDocType("rule"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyFrDocType("Proposed Rule"), { itemType: null, hold: "item_type_unmapped" });
  assert.deepEqual(classifyFrDocType("Notice"), { itemType: null, hold: "item_type_unmapped" });
  assert.deepEqual(classifyFrDocType("Presidential Document"), { itemType: null, hold: "item_type_unmapped" });
  assert.deepEqual(classifyFrDocType(null), { itemType: null, hold: "item_type_unmapped" });
});

// ── getHostname / classifyHost / resolveIdentity ────────────────────────────────────────────────────

test("getHostname / classifyHost: family routing by document_url host, lowercased, null for unparseable", () => {
  assert.equal(getHostname("https://EUR-Lex.europa.eu/x"), "eur-lex.europa.eu");
  assert.equal(getHostname("not a url"), null);
  assert.equal(classifyHost("https://eur-lex.europa.eu/legal-content/x"), "eurlex");
  assert.equal(classifyHost("https://www.legislation.gov.uk/uksi/2021/1"), "uk_legislation");
  assert.equal(classifyHost("https://www.federalregister.gov/documents/2024/01/05/2024-00001/x"), "federal_register");
  assert.equal(classifyHost("https://mlit.go.jp/x"), null);
  assert.equal(classifyHost("not a url"), null);
});

const SOURCE_EURLEX = { id: "src-eu", url: "https://eur-lex.europa.eu", name: "EUR-Lex Official Journal", base_tier: 1, status: "active" };
const SOURCE_UK = { id: "src-uk", url: "https://www.legislation.gov.uk", name: "legislation.gov.uk", base_tier: 1, status: "active" };
const SOURCE_FR = { id: "src-fr", url: "https://www.federalregister.gov", name: "Federal Register", base_tier: 1, status: "active" };

test("resolveIdentity: EUR-Lex row resolves scheme/canonicalKey/itemType/jurisdiction the same as before", () => {
  const row = { document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  assert.deepEqual(resolveIdentity(row, SOURCE_EURLEX), {
    scheme: "celex", canonicalKey: "32024R0001", itemType: "regulation", jurisdictionIso: "EU", hold: null, host: "eur-lex.europa.eu",
  });
});

test("resolveIdentity: EUR-Lex row with an undecodable CELEX -> canonical_key_unresolved, never guessed", () => {
  const row = { document_url: "https://eur-lex.europa.eu/some-portal-page", instrument_identifier: null };
  const id = resolveIdentity(row, SOURCE_EURLEX);
  assert.equal(id.hold, "canonical_key_unresolved");
  assert.equal(id.canonicalKey, null);
});

test("resolveIdentity: legislation.gov.uk -> canonicalKey ALWAYS null (no scheme exists, never invented), jurisdiction GB", () => {
  const row = { document_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1095" };
  assert.deepEqual(resolveIdentity(row, SOURCE_UK), {
    scheme: "uk_legislation", canonicalKey: null, itemType: "regulation", jurisdictionIso: "GB", hold: null, host: "www.legislation.gov.uk",
  });
});

test("resolveIdentity: legislation.gov.uk path with no mapped instrument-type segment -> item_type_unmapped", () => {
  const row = { document_url: "https://www.legislation.gov.uk/eur/2021/1/contents", instrument_identifier: null };
  const id = resolveIdentity(row, SOURCE_UK);
  assert.equal(id.hold, "item_type_unmapped");
  assert.equal(id.canonicalKey, null);
});

test("resolveIdentity: federalregister.gov with NO frDocType supplied yet -> needsFrLookup, not a guess", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug", instrument_identifier: null };
  const id = resolveIdentity(row, SOURCE_FR);
  assert.equal(id.scheme, "federal_register");
  assert.equal(id.canonicalKey, null);
  assert.equal(id.itemType, null);
  assert.equal(id.jurisdictionIso, "US");
  assert.equal(id.hold, null);
  assert.equal(id.needsFrLookup, true);
  assert.equal(id.frDocumentNumber, "2024-00001");
});

test("resolveIdentity: federalregister.gov WITH frDocType 'Rule' supplied -> regulation, no hold", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug" };
  const id = resolveIdentity(row, SOURCE_FR, { frDocType: "Rule" });
  assert.deepEqual(id, {
    scheme: "federal_register", canonicalKey: null, itemType: "regulation", jurisdictionIso: "US",
    hold: null, host: "www.federalregister.gov", frType: "Rule", frDocumentNumber: "2024-00001",
  });
});

test("resolveIdentity: federalregister.gov WITH frDocType 'Notice' supplied -> item_type_unmapped, frType named", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug" };
  const id = resolveIdentity(row, SOURCE_FR, { frDocType: "Notice" });
  assert.equal(id.hold, "item_type_unmapped");
  assert.equal(id.frType, "Notice");
});

test("resolveIdentity: federalregister.gov URL with no /documents/YYYY/MM/DD/<docnum>/ shape -> fr_document_number_unresolved", () => {
  const row = { document_url: "https://www.federalregister.gov/d/2024-00001" };
  assert.deepEqual(resolveIdentity(row, SOURCE_FR), {
    scheme: "federal_register", canonicalKey: null, itemType: null, jurisdictionIso: "US", hold: "fr_document_number_unresolved", host: "www.federalregister.gov",
  });
});

test("resolveIdentity: an unmapped host holds identity_unmapped_source, host recorded, never guessed", () => {
  const row = { document_url: "https://mlit.go.jp/some/page" };
  assert.deepEqual(resolveIdentity(row, { url: "https://mlit.go.jp" }), {
    scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host: "mlit.go.jp",
  });
});

// ── stripHtmlToText / extractTitleFromHtml / extractEurlexTitle ────────────────────────────────────────

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

test("extractEurlexTitle: prefers <title>/<h1> when present, else the first ~300 chars of body-lead text", () => {
  assert.deepEqual(extractEurlexTitle("<html><head><title>Council Decision 2004/320</title></head></html>"), {
    title: "Council Decision 2004/320",
    origin: "captured_title",
  });
  const bodyOnly = "<html><body><p>COUNCIL DECISION of 14 October 2004 concerning the position to be taken.</p></body></html>";
  const t = extractEurlexTitle(bodyOnly);
  assert.equal(t.origin, "captured_body_lead");
  assert.match(t.title, /^COUNCIL DECISION of 14 October 2004/);
  assert.equal(extractEurlexTitle(""), null);
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

test("selectCensusRows with limit null returns every eligible row", () => {
  const rows = Array.from({ length: 70 }, (_, i) => ({ dryrun_disposition: "would_mint", source_id: "s", document_url: `u${i}`, instrument_identifier: "3" }));
  assert.equal(selectCensusRows(rows, { limit: null }).length, 70);
  assert.equal(selectCensusRows(rows, { limit: 10 }).length, 10);
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
const EURLEX_IDENTITY = { scheme: "celex", canonicalKey: "32024R0001", itemType: "regulation", jurisdictionIso: "EU", hold: null, host: "eur-lex.europa.eu" };

test("buildExportRow: an existing plain-text capture -> row, title_origin source_name_fallback (no title supplied, no HTML to read one from)", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  const capture = { text: "x".repeat(500), html: null };
  const { row, hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, capture);
  assert.equal(hold, undefined);
  assert.equal(row.item_type, "regulation");
  assert.equal(row.canonical_instrument_key, "32024R0001");
  assert.equal(row.jurisdiction_iso, "EU");
  assert.equal(row.title_origin, "source_name_fallback");
  assert.match(row.title, /32024R0001/);
  assert.equal(row.fetched_length, 500);
  assert.equal(row.source.id, "src-1");
});

test("buildExportRow: a capture envelope with a pre-resolved title (FR API / EUR-Lex body-lead) is used as-is, never re-derived", () => {
  const censusRow = { id: "r2", document_url: "https://eur-lex.europa.eu/32023L0002", instrument_identifier: "32023L0002" };
  const identity = { ...EURLEX_IDENTITY, canonicalKey: "32023L0002", itemType: "directive" };
  const capture = { text: "x".repeat(500), html: "<title>should not be read</title>", title: "Directive on Vehicle Emissions", titleOrigin: "captured_body_lead" };
  const { row } = buildExportRow(censusRow, SOURCE, identity, capture);
  assert.equal(row.item_type, "directive");
  assert.equal(row.title, "Directive on Vehicle Emissions");
  assert.equal(row.title_origin, "captured_body_lead");
});

test("buildExportRow: no pre-resolved title falls back to extractTitleFromHtml, then source-name", () => {
  const censusRow = { id: "r2", document_url: "https://eur-lex.europa.eu/32023L0002", instrument_identifier: "32023L0002" };
  const identity = { ...EURLEX_IDENTITY, canonicalKey: "32023L0002", itemType: "directive" };
  const html = `<html><head><title>Directive on Vehicle Emissions</title></head><body>${"body text ".repeat(30)}</body></html>`;
  const capture = { text: "x".repeat(500), html };
  const { row } = buildExportRow(censusRow, SOURCE, identity, capture);
  assert.equal(row.title, "Directive on Vehicle Emissions");
  assert.equal(row.title_origin, "captured_title");
});

test("buildExportRow RED: no source -> hold source_not_found", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold, row } = buildExportRow(censusRow, null, EURLEX_IDENTITY, { text: "x".repeat(500), html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "source_not_found");
});

test("buildExportRow RED: an identity hold short-circuits before any capture check, carries scheme/host evidence", () => {
  const censusRow = { id: "r1", document_url: "https://mlit.go.jp/x", instrument_identifier: null };
  const identity = { scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host: "mlit.go.jp" };
  const { hold, row } = buildExportRow(censusRow, SOURCE, identity, { text: "x".repeat(500), html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "identity_unmapped_source");
  assert.equal(hold.host, "mlit.go.jp");
});

test("buildExportRow RED: an FR item_type_unmapped hold names the FR type verbatim", () => {
  const censusRow = { id: "r1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" };
  const identity = { scheme: "federal_register", canonicalKey: null, itemType: null, jurisdictionIso: "US", hold: "item_type_unmapped", host: "www.federalregister.gov", frType: "Notice" };
  const { hold } = buildExportRow(censusRow, SOURCE, identity, { text: "x".repeat(500), html: null });
  assert.equal(hold.reason, "item_type_unmapped");
  assert.equal(hold.fr_type, "Notice");
});

test("buildExportRow RED: captured_text <= 200 chars -> hold capture_too_short", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold, row } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, { text: "short", html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "capture_too_short");
});

test("buildExportRow RED: no captured text at all -> hold capture_too_short with fetched_length 0", () => {
  const censusRow = { id: "r1", document_url: "https://x/y", instrument_identifier: "32024R0001" };
  const { hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, { text: null, html: null });
  assert.equal(hold.reason, "capture_too_short");
  assert.equal(hold.fetched_length, 0);
});

test("buildExportRow: a UK/FR row's null canonical_instrument_key is exported as null, never invented", () => {
  const censusRow = { id: "r1", document_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: "UK uksi 2021/1095" };
  const identity = { scheme: "uk_legislation", canonicalKey: null, itemType: "regulation", jurisdictionIso: "GB", hold: null, host: "www.legislation.gov.uk" };
  const { row } = buildExportRow(censusRow, { ...SOURCE, id: "src-uk" }, identity, { text: "x".repeat(500), html: null });
  assert.equal(row.canonical_instrument_key, null);
  assert.equal(row.jurisdiction_iso, "GB");
  assert.equal(row.item_type, "regulation");
});

// ── captureDocument / makePoliteFetch (network fully stubbed) ──────────────────────────────────────────

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

test("makePoliteFetch: enforces the politeness gap between successive fetches, fetch-shaped (url, opts)", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push({ url, t: Date.now() }); return { ok: true, status: 200, text: async () => "<p>ok</p>" }; };
  const politeFetch = makePoliteFetch({ gapMs: 30, fetchImpl });
  await politeFetch("https://x/1");
  await politeFetch("https://x/2");
  assert.ok(calls.length === 2 && calls[1].t - calls[0].t >= 25, `expected >=25ms gap, got ${calls[1].t - calls[0].t}ms`);
  assert.deepEqual(calls.map((c) => c.url), ["https://x/1", "https://x/2"]);
});

// ── EUR-Lex capture: the endpoint rewrite (the root cause of all 24 canonical-key holds) ───────────────

test("resolveRowCapture EUR-Lex: fetches the /TXT/HTML/?uri=CELEX:<key> clean-text endpoint, never /TXT/?uri=", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => "<html><body>COUNCIL DECISION of 14 October 2004 concerning the position.</body></html>".padEnd(300, " x") };
  };
  const identity = { scheme: "celex", canonicalKey: "32009D0320" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0320" }, identity, { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009D0320");
  assert.doesNotMatch(calls[0], /\/TXT\/\?uri=/);
  assert.equal(env.usable, true);
  assert.match(env.title, /^COUNCIL DECISION of 14 October 2004/);
});

test("resolveRowCapture EUR-Lex: a 157-byte WAF-interstitial-shaped response is NOT usable (reproduces the live hold)", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "x".repeat(157) });
  const identity = { scheme: "celex", canonicalKey: "32009D0320" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/x" }, identity, { fetchImpl });
  assert.equal(env.usable, false);
  assert.equal(env.bytes, 157);
});

// ── UK legislation capture: data.htm first, page as fallback ───────────────────────────────────────────

test("resolveRowCapture UK: tries <url>/data.htm first and uses it when usable", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => `<html><head><title>UKSI 2021/1095</title></head><body>${"text ".repeat(60)}</body></html>` };
  };
  const identity = { scheme: "uk_legislation" };
  const env = await resolveRowCapture({ document_url: "https://www.legislation.gov.uk/uksi/2021/1095/made" }, identity, { fetchImpl });
  assert.deepEqual(calls, ["https://www.legislation.gov.uk/uksi/2021/1095/made/data.htm"]);
  assert.equal(env.usable, true);
  assert.equal(env.title, "UKSI 2021/1095");
});

test("resolveRowCapture UK: data.htm blocked/short falls back to the page itself, recording fallbackFrom", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("/data.htm")) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => `<html><head><title>UKSI 2021/1095</title></head><body>${"text ".repeat(60)}</body></html>` };
  };
  const identity = { scheme: "uk_legislation" };
  const env = await resolveRowCapture({ document_url: "https://www.legislation.gov.uk/uksi/2021/1095/made" }, identity, { fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(env.usable, true);
  assert.equal(env.fallbackFrom, "https://www.legislation.gov.uk/uksi/2021/1095/made/data.htm");
  assert.equal(env.endpoint, "https://www.legislation.gov.uk/uksi/2021/1095/made");
});

// ── Federal Register: API JSON mapping (fixture) + raw_text_url capture ─────────────────────────────────

const FR_FIXTURE_JSON = {
  document_number: "2024-00001",
  type: "Rule",
  title: "Privacy Act of 1974; System of Records",
  raw_text_url: "https://www.federalregister.gov/documents/full_text/text/2024/01/05/2024-00001.txt",
}; // WebFetch-verified live shape, 2026-09-02 (see this file's own module header for the type-vocabulary correction)

test("fetchFrDocumentMeta: parses the API JSON fixture into { frType, title, rawTextUrl }", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://www.federalregister.gov/api/v1/documents/2024-00001.json");
    return { ok: true, status: 200, text: async () => JSON.stringify(FR_FIXTURE_JSON) };
  };
  const meta = await fetchFrDocumentMeta("2024-00001", { fetchImpl });
  assert.equal(meta.ok, true);
  assert.equal(meta.frType, "Rule");
  assert.equal(meta.title, "Privacy Act of 1974; System of Records");
  assert.equal(meta.rawTextUrl, "https://www.federalregister.gov/documents/full_text/text/2024/01/05/2024-00001.txt");
});

test("fetchFrDocumentMeta RED: unparseable JSON is a named error, never thrown", async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "not json" });
  const meta = await fetchFrDocumentMeta("2024-00001", { fetchImpl });
  assert.equal(meta.ok, false);
  assert.match(meta.error, /unparseable FR API JSON/);
});

test("resolveRowCapture federal_register: fetches the API JSON then raw_text_url, title from the JSON", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith(".json")) return { ok: true, status: 200, text: async () => JSON.stringify(FR_FIXTURE_JSON) };
    return { ok: true, status: 200, text: async () => "SOCIAL SECURITY ADMINISTRATION full text of the notice ".repeat(10) };
  };
  const identity = { scheme: "federal_register", frDocumentNumber: "2024-00001" };
  const env = await resolveRowCapture({ document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" }, identity, { fetchImpl });
  assert.deepEqual(calls, ["https://www.federalregister.gov/api/v1/documents/2024-00001.json", FR_FIXTURE_JSON.raw_text_url]);
  assert.equal(env.usable, true);
  assert.equal(env.title, "Privacy Act of 1974; System of Records");
  assert.equal(env.titleOrigin, "fr_api_title");
});

test("resolveRowCapture federal_register: reuses an already-fetched identity._frMeta instead of re-fetching the API", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => "full text ".repeat(30) }; };
  const identity = { scheme: "federal_register", frDocumentNumber: "2024-00001", _frMeta: { ok: true, rawTextUrl: FR_FIXTURE_JSON.raw_text_url, title: FR_FIXTURE_JSON.title, status: 200, bytes: 10, head: "x" } };
  const env = await resolveRowCapture({ document_url: "x" }, identity, { fetchImpl });
  assert.deepEqual(calls, [FR_FIXTURE_JSON.raw_text_url]); // exactly ONE call — no second API fetch
  assert.equal(env.usable, true);
});

// ── buildRows: capture_blocked evidence shape (never a bare unexplained hold) ──────────────────────────

test("buildRows: a blocked/short live fetch holds capture_blocked WITH evidence (status, bytes, head, endpoint)", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0320", instrument_identifier: "32009D0320" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => "x".repeat(157) }); // the live WAF-interstitial shape
  const { rows, held, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(rows.length, 0);
  assert.equal(held.length, 1);
  assert.equal(held[0].reason, "capture_blocked");
  assert.equal(held[0].http_status, 200);
  assert.equal(held[0].bytes, 157);
  assert.equal(typeof held[0].head, "string");
  assert.equal(held[0].endpoint, "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009D0320");
  assert.equal(captureFailed, 1);
});

test("buildRows: a non-2xx live fetch also holds capture_blocked with the status recorded", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://eur-lex.europa.eu/x", instrument_identifier: "32009D0320" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "" });
  const { held } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(held[0].reason, "capture_blocked");
  assert.equal(held[0].http_status, 403);
});

// ── buildRows: identity holds short-circuit BEFORE any network call ────────────────────────────────────

test("buildRows: an identity hold (item_type_unmapped etc.) is reported WITHOUT any capture attempt", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://mlit.go.jp/x", instrument_identifier: null }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://mlit.go.jp" }]]);
  let fetchCalls = 0;
  const fetchImpl = async () => { fetchCalls += 1; throw new Error("must not fetch"); };
  const { held } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(held[0].reason, "identity_unmapped_source");
  assert.equal(fetchCalls, 0);
});

// ── buildRows: existing/no-capture branches, including the FR-specific ones ────────────────────────────

test("buildRows: rows with an existing capture build directly; rows with none and --capture off hold no_capture", async () => {
  const kept = [
    { id: "r1", source_id: "s1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" },
    { id: "r2", source_id: "s1", document_url: "https://eur-lex.europa.eu/32024L0002", instrument_identifier: "32024L0002" },
  ];
  const sourcesById = new Map([["s1", SOURCE]]);
  const existingCaptureByUrl = new Map([["https://eur-lex.europa.eu/32024R0001", { text: "y".repeat(300), html: null }]]);
  const { rows, held, captured, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl, capture: false });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row_id, "r1");
  assert.equal(held.length, 1);
  assert.equal(held[0].reason, "no_capture");
  assert.equal(captured, 0);
  assert.equal(captureFailed, 0);
});

test("buildRows: --capture on fetches missing EUR-Lex rows via the HTML endpoint", async () => {
  const kept = [{ id: "r2", source_id: "s1", document_url: "https://eur-lex.europa.eu/32024L0002", instrument_identifier: "32024L0002" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => `<title>t</title>${"z".repeat(400)}` });
  const { rows, held, captured } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(rows.length, 1);
  assert.equal(held.length, 0);
  assert.equal(captured, 1);
});

test("buildRows: federalregister.gov with no existing capture and --capture off holds no_capture (fully network-free)", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://www.federalregister.gov" }]]);
  let fetchCalls = 0;
  const fetchImpl = async () => { fetchCalls += 1; throw new Error("must not fetch — capture is off"); };
  const { held } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: false, fetchImpl });
  assert.equal(held[0].reason, "no_capture");
  assert.equal(fetchCalls, 0);
});

test("buildRows: federalregister.gov WITH an existing capture but --capture off holds fr_type_pending_capture, distinct from no_capture", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://www.federalregister.gov" }]]);
  const existingCaptureByUrl = new Map([["https://www.federalregister.gov/documents/2024/01/05/2024-00001/x", { text: "y".repeat(300), html: null }]]);
  const { rows, held } = await buildRows(kept, { sourcesById, existingCaptureByUrl, capture: false });
  assert.equal(rows.length, 0);
  assert.equal(held[0].reason, "fr_type_pending_capture");
});

test("buildRows: federalregister.gov end to end under --capture — API lookup then raw text, item_type from the live type", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://www.federalregister.gov" }]]);
  const fetchImpl = async (url) => {
    if (url.endsWith(".json")) return { ok: true, status: 200, text: async () => JSON.stringify(FR_FIXTURE_JSON) };
    return { ok: true, status: 200, text: async () => "full text of the rule ".repeat(20) };
  };
  const { rows, held, captured } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(held.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item_type, "regulation");
  assert.equal(rows[0].title, "Privacy Act of 1974; System of Records");
  assert.equal(rows[0].title_origin, "fr_api_title");
  assert.equal(rows[0].canonical_instrument_key, null);
  assert.equal(rows[0].jurisdiction_iso, "US");
  assert.equal(captured, 1);
});

test("buildRows: federalregister.gov whose live type is 'Notice' under --capture holds item_type_unmapped, never guessed into regulation", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00002/x" }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://www.federalregister.gov" }]]);
  const fetchImpl = async (url) => {
    if (url.endsWith(".json")) return { ok: true, status: 200, text: async () => JSON.stringify({ ...FR_FIXTURE_JSON, type: "Notice" }) };
    return { ok: true, status: 200, text: async () => "x".repeat(400) };
  };
  const { rows, held } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(rows.length, 0);
  assert.equal(held[0].reason, "item_type_unmapped");
  assert.equal(held[0].fr_type, "Notice");
});

test("buildRows: a failed FR API fetch under --capture holds capture_blocked with the API's own evidence", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/x" }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://www.federalregister.gov" }]]);
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "" });
  const { held, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(held[0].reason, "capture_blocked");
  assert.equal(held[0].http_status, 500);
  assert.equal(captureFailed, 1);
});

test("buildRows: source_not_found still short-circuits before any identity/capture step", async () => {
  const kept = [{ id: "r1", source_id: "missing", document_url: "https://x/y" }];
  const { held } = await buildRows(kept, { sourcesById: new Map(), existingCaptureByUrl: new Map(), capture: true, fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal(held[0].reason, "source_not_found");
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

// ── read-shape / query-fn regression locks (unchanged from Lane POP's own fix) ─────────────────────────

test("main() never reads agent_run_searches, sources or intelligence_items whole", () => {
  const src = readFileSync(new URL("./export-census-rows.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /readAll\(\s*"agent_run_searches"/);
  assert.doesNotMatch(src, /readAll\(\s*"intelligence_items"/);
  assert.doesNotMatch(src, /readAll\(\s*"sources"/);
  assert.match(src, /readAll\(\s*"census_worklist"[\s\S]*?match:\s*\(q\)\s*=>\s*q\.eq\("dryrun_disposition",\s*"would_mint"\)/);
});

test("fetchRowsIn chunks the key list and concatenates results", async () => {
  const calls = [];
  const sb = { from: (table) => ({ select: (cols) => ({ in: async (col, vals) => { calls.push({ table, cols, col, vals }); return { data: vals.map((v) => ({ [col]: v })), error: null }; } }) }) };
  const rows = await fetchRowsIn(sb, "agent_run_searches", "result_url, result_content", "result_url", Array.from({ length: 120 }, (_, i) => `u${i}`), { chunk: 50 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.vals.length), [50, 50, 20]);
  assert.equal(rows.length, 120);
  const urls = await fetchColumnIn(sb, "intelligence_items", "source_url", "source_url", ["a", "b", "a"]);
  assert.deepEqual(urls.sort(), ["a", "b"]);
});

test("the census read's match is applied to the query builder as a function", async () => {
  const src = readFileSync(new URL("./export-census-rows.mjs", import.meta.url), "utf8");
  const m = /match:\s*(\(q\)\s*=>\s*q\.eq\("dryrun_disposition",\s*"would_mint"\))/.exec(src);
  assert.ok(m, "match function not found");
  const fn = new Function(`return (${m[1]});`)();
  const calls = [];
  const q = { eq: (c, v) => { calls.push([c, v]); return q; } };
  assert.equal(fn(q), q);
  assert.deepEqual(calls, [["dryrun_disposition", "would_mint"]]);
});

// ── workflow: rows_file is a first-class runtime input (the browser-capture escape hatch, §1a) ─────────

test("population-turn.yml: rows_file input skips the export step and drives run-mint-batch/apply-mint-batch directly", () => {
  const yml = readFileSync(new URL("../../../.github/workflows/population-turn.yml", import.meta.url), "utf8");
  assert.match(yml, /rows_file:/, "workflow_dispatch must declare a rows_file input");
  assert.match(yml, /if:\s*\$\{\{\s*inputs\.rows_file\s*==\s*''\s*\}\}/, "the export-census-rows.mjs step must be skipped when rows_file is set");
  assert.match(yml, /CENSUS_ROWS_PATH/, "a resolved census-rows path (export output OR rows_file) must feed both run-mint-batch and apply-mint-batch");
  assert.match(yml, /run-mint-batch\.mjs[\s\S]*?--census-rows\s+"\$CENSUS_ROWS_PATH"/);
  assert.match(yml, /apply-mint-batch\.mjs[\s\S]*?--census-rows\s+"\$CENSUS_ROWS_PATH"/);
});
