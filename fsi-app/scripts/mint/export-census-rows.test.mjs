// Tests for export-census-rows.mjs (Lane POP, 2026-09-02; Lane POP2, 2026-09-02 per-family rewrite).
// node:test + node:assert/strict. No network, no DB: every DB-shaped input is passed in directly
// (censusRows/sourcesById/existingCaptureByUrl); every network path (captureDocument/resolveRowCapture/
// fetchFrDocumentMeta/makePoliteFetch) is exercised only with an injected fetchImpl stub.
// Run: node --test scripts/mint/export-census-rows.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isOjFileName,
  extractOjActTitle,
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
  buildHeldUrlIndex,
  buildHeldKeyIndex,
  partitionExcludeHeldByKey,
  isEurlexRobotGate,
  buildExportRow,
  buildRows,
  captureDocument,
  makePoliteFetch,
  fetchFrDocumentMeta,
  resolveRowCapture,
  followUpgradingRedirects,
  extractCellarTitle,
  cellarEndpointForCelex,
  summarize,
  partitionByScreen,
  loadReviewedVerdicts,
  detectNotInForce,
  detectCellarGarbledMetadata,
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

test("classifyFrDocType: the API's ACTUAL field value ('Rule', case-insensitive) -> regulation; 'Proposed Rule' -> initiative (Lane HELD, 2026-09-02: the single largest held class, in-vertical); Notice/Presidential Document still hold, naming themselves (no evidence yet)", () => {
  assert.deepEqual(classifyFrDocType("Rule"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyFrDocType("rule"), { itemType: "regulation", hold: null });
  assert.deepEqual(classifyFrDocType("Proposed Rule"), { itemType: "initiative", hold: null });
  assert.deepEqual(classifyFrDocType("proposed rule"), { itemType: "initiative", hold: null });
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

test("resolveIdentity: federalregister.gov with NO frDocType supplied yet -> needsFrLookup, not a guess; canonicalKey is already the FR's own document number (Lane HELD, 2026-09-02: a real, citation-shaped key, never fabricated)", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug", instrument_identifier: null };
  const id = resolveIdentity(row, SOURCE_FR);
  assert.equal(id.scheme, "federal_register");
  assert.equal(id.canonicalKey, "2024-00001");
  assert.equal(id.itemType, null);
  assert.equal(id.jurisdictionIso, "US");
  assert.equal(id.hold, null);
  assert.equal(id.needsFrLookup, true);
  assert.equal(id.frDocumentNumber, "2024-00001");
});

test("resolveIdentity: federalregister.gov WITH frDocType 'Rule' supplied -> regulation, no hold, canonicalKey the FR document number", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug" };
  const id = resolveIdentity(row, SOURCE_FR, { frDocType: "Rule" });
  assert.deepEqual(id, {
    scheme: "federal_register", canonicalKey: "2024-00001", itemType: "regulation", jurisdictionIso: "US",
    hold: null, host: "www.federalregister.gov", frType: "Rule", frDocumentNumber: "2024-00001",
  });
});

test("resolveIdentity: federalregister.gov WITH frDocType 'Proposed Rule' supplied -> initiative, no hold (Lane HELD)", () => {
  const row = { document_url: "https://www.federalregister.gov/documents/2024/01/05/2024-00001/title-slug" };
  const id = resolveIdentity(row, SOURCE_FR, { frDocType: "Proposed Rule" });
  assert.deepEqual(id, {
    scheme: "federal_register", canonicalKey: "2024-00001", itemType: "initiative", jurisdictionIso: "US",
    hold: null, host: "www.federalregister.gov", frType: "Proposed Rule", frDocumentNumber: "2024-00001",
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

test("resolveIdentity: a host outside the three coded families whose document_url does NOT institution-match its own row's registered source still holds identity_unmapped_source, host recorded, never guessed", () => {
  // The document is on mlit.go.jp but this row's OWN registered source is a different institution
  // (e.g. a mis-joined census row, or a redirect off-institution) -- sameInstitution() is false, so this
  // must stay held exactly as before Lane HELD's fix.
  const row = { document_url: "https://mlit.go.jp/some/page" };
  assert.deepEqual(resolveIdentity(row, { url: "https://transport.gov.example", category: "regulatory" }), {
    scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host: "mlit.go.jp",
  });
});

// ── resolveIdentity: the registered-institution fallback (Lane HELD, 2026-09-02) ───────────────────────
// A host outside the three coded families (eurlex/uk_legislation/federal_register) is no longer
// automatically identity_unmapped_source: census_worklist.source_id already ties the row to a REGISTERED
// `sources` row, and when the document_url institution-matches that row's own registered url
// (institutionKey equality, scripts/lib/institution-key.mjs's sameInstitution), the row is a document FROM
// an institution this registry already trusts -- not "unmapped."

test("resolveIdentity: a host outside the three coded families, institution-matching its own row's REGULATORY-category registered source -> item_type regulation, no hold, scheme registered_institution, canonicalKey null (no scheme invented)", () => {
  const row = { document_url: "https://sdir.no/siteassets/engelske-forskrifter-pdf/30-may-2012-no.-488-environmental-safety-for-ships-and-mobile-offshore-units.pdf" };
  assert.deepEqual(resolveIdentity(row, { url: "https://sdir.no/", category: "regulatory" }), {
    scheme: "registered_institution", canonicalKey: null, itemType: "regulation", jurisdictionIso: null,
    hold: null, host: "sdir.no", category: "regulatory",
  });
});

test("resolveIdentity: institution-matched but a NON-regulatory category -> institution_category_unmapped, naming the category, never forced to regulation", () => {
  const row = { document_url: "https://think-tank.example/reports/x.pdf" };
  assert.deepEqual(resolveIdentity(row, { url: "https://think-tank.example", category: "research" }), {
    scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null,
    hold: "institution_category_unmapped", host: "think-tank.example", category: "research",
  });
});

test("resolveIdentity: institution-matched but source.category is unset -> institution_category_unmapped with category null, never guessed regulatory", () => {
  const row = { document_url: "https://agency.example/x.pdf" };
  assert.deepEqual(resolveIdentity(row, { url: "https://agency.example" }), {
    scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null,
    hold: "institution_category_unmapped", host: "agency.example", category: null,
  });
});

test("resolveIdentity: a shared-government-portal host institution-matches only within its own path prefix (SHARED_PORTAL_KEYDEPTH, institution-key.mjs) -- a different agency on the SAME host still holds identity_unmapped_source", () => {
  const row = { document_url: "https://gob.mx/economia/algo" };
  assert.deepEqual(resolveIdentity(row, { url: "https://gob.mx/semarnat", category: "regulatory" }), {
    scheme: null, canonicalKey: null, itemType: null, jurisdictionIso: null, hold: "identity_unmapped_source", host: "gob.mx",
  });
});

// ── the exact mint-run-012 held fixture (Lane HELD, 2026-09-02) ────────────────────────────────────────
// scripts/_snapshots/population-33678399902/census-rows.held.json IS the 8-row held file this fix was
// root-caused against (docs/plans/wave2-lanes-2026-09-02.md's own evidence). This block runs resolveIdentity
// on every one of those 8 rows verbatim -- never a re-typed copy -- so a future edit to the fixture file or
// to resolveIdentity is caught here, not just in the synthetic unit tests above. The `sources` registry
// row for each identity_unmapped_source host is not in this repo (census-rows.json holds only the KEPT/
// exported rows, not the 8 that were held -- see export-census-rows.mjs's own file-shape note above
// buildRows), so a same-institution, category:"regulatory" source is supplied here, matching
// institution-key.mjs's own documented evidence that every one of these seven hosts (this fixture's four)
// is a single-institution host with no SHARED_PORTAL_KEYDEPTH collision.
const HELD_RUN_012_FIXTURE = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "_snapshots", "population-33678399902", "census-rows.held.json"), "utf8"),
);

test("mint-run-012 fixture: exactly 8 held rows, the three classes this lane closed", () => {
  assert.equal(HELD_RUN_012_FIXTURE.length, 8);
  const byReason = {};
  for (const r of HELD_RUN_012_FIXTURE) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  assert.deepEqual(byReason, { identity_unmapped_source: 4, item_type_unmapped: 1, canonical_key_unresolved: 3 });
});

test("mint-run-012 fixture: the 4 identity_unmapped_source rows (sdir.no, climate.ec.europa.eu x2, rules.cityofnewyork.us) now resolve to item_type regulation via their own registered (regulatory-category) institution, no hold", () => {
  const rows = HELD_RUN_012_FIXTURE.filter((r) => r.reason === "identity_unmapped_source");
  assert.equal(rows.length, 4);
  for (const r of rows) {
    const censusRow = { document_url: r.document_url, instrument_identifier: r.instrument_identifier };
    const source = { url: `https://${r.host}/`, category: "regulatory" };
    const identity = resolveIdentity(censusRow, source);
    assert.equal(identity.hold, null, `${r.row_id} (${r.host}) should no longer hold`);
    assert.equal(identity.scheme, "registered_institution");
    assert.equal(identity.itemType, "regulation");
  }
});

test("mint-run-012 fixture: the FR item_type_unmapped row (Proposed Rule, 2026-13667) resolves to initiative with its own FR document number as canonicalKey, no hold", () => {
  const r = HELD_RUN_012_FIXTURE.find((x) => x.reason === "item_type_unmapped");
  assert.equal(r.fr_type, "Proposed Rule");
  const censusRow = { document_url: r.document_url, instrument_identifier: r.instrument_identifier };
  const source = { url: "https://www.federalregister.gov", category: "regulatory" };
  const identity = resolveIdentity(censusRow, source, { frDocType: r.fr_type });
  assert.equal(identity.hold, null);
  assert.equal(identity.itemType, "initiative");
  assert.equal(identity.canonicalKey, "2026-13667");
});

test("mint-run-012 fixture: 2 of the 3 canonical_key_unresolved CELEX rows (sector-2 agreements 22004A0806(01), 21998A0912(01)) now resolve to framework, no hold; the EFTA E-prefixed row (E2012C0522, a shape deriveKey does not parse) stays held", () => {
  const rows = HELD_RUN_012_FIXTURE.filter((r) => r.reason === "canonical_key_unresolved");
  assert.equal(rows.length, 3);
  const efta = rows.find((r) => r.instrument_identifier === "E2012C0522");
  const sector2a = rows.filter((r) => r.instrument_identifier !== "E2012C0522");
  assert.equal(sector2a.length, 2);
  const source = { url: "https://eur-lex.europa.eu/", category: "regulatory" };
  for (const r of sector2a) {
    const censusRow = { document_url: r.document_url, instrument_identifier: r.instrument_identifier };
    const identity = resolveIdentity(censusRow, source);
    assert.equal(identity.hold, null, `${r.instrument_identifier} should now resolve`);
    assert.equal(identity.itemType, "framework");
    assert.equal(identity.canonicalKey, r.instrument_identifier);
  }
  // The EFTA "E"-prefixed key is a genuinely different numbering scheme deriveKey() does not parse at all
  // (out of this lane's write set -- canonical-key.mjs). It stays held, explicitly, not guessed.
  const eftaCensusRow = { document_url: efta.document_url, instrument_identifier: efta.instrument_identifier };
  const eftaIdentity = resolveIdentity(eftaCensusRow, source);
  assert.equal(eftaIdentity.hold, "canonical_key_unresolved");
  assert.equal(eftaIdentity.canonicalKey, null);
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

test("partitionExcludeHeld: default excludes rows whose document_url already has an intelligence_items row carrying the SAME instrument_identifier (a true duplicate)", () => {
  // r2's own instrument_identifier is "32023L0002" (see ROWS above) -- the holder matches it exactly.
  const held = buildHeldUrlIndex([{ id: "holder-b", source_url: "https://eur-lex.europa.eu/b", instrument_identifier: "32023L0002" }]);
  const { kept, excludedHeld } = partitionExcludeHeld(ROWS.slice(0, 2), held, true);
  assert.deepEqual(kept.map((r) => r.id), ["r1"]);
  assert.deepEqual(excludedHeld.map((r) => r.id), ["r2"]);
});

test("partitionExcludeHeld: excludeHeld=false keeps everything, excludes nothing", () => {
  const held = buildHeldUrlIndex([{ id: "holder-b", source_url: "https://eur-lex.europa.eu/b", instrument_identifier: "32023L0002" }]);
  const { kept, excludedHeld } = partitionExcludeHeld(ROWS.slice(0, 2), held, false);
  assert.equal(kept.length, 2);
  assert.equal(excludedHeld.length, 0);
});

// ── RD-M4b (2026-09-04): partitionExcludeHeld is an IDENTITY exclusion, not a bare URL match ────────────

test("buildHeldUrlIndex: keeps every holder at a URL, not just the last one indexed (a series landing page can carry several)", () => {
  const idx = buildHeldUrlIndex([
    { id: "item-1", source_url: "https://x/bulletin", instrument_identifier: "eu-oil-bulletin:eurosuper-95" },
    { id: "item-2", source_url: "https://x/bulletin", instrument_identifier: "eu-oil-bulletin:automotive-diesel" },
    { id: "item-3", source_url: "https://x/other", instrument_identifier: null },
  ]);
  assert.deepEqual(idx.get("https://x/bulletin"), [
    { id: "item-1", instrument_identifier: "eu-oil-bulletin:eurosuper-95" },
    { id: "item-2", instrument_identifier: "eu-oil-bulletin:automotive-diesel" },
  ]);
  assert.deepEqual(idx.get("https://x/other"), [{ id: "item-3", instrument_identifier: null }]);
  assert.equal(idx.has("https://x/does-not-exist"), false);
});

test("buildHeldUrlIndex: absent items array -> empty index, never throws; a holder with no source_url is skipped", () => {
  assert.equal(buildHeldUrlIndex(undefined).size, 0);
  assert.equal(buildHeldUrlIndex([]).size, 0);
  assert.equal(buildHeldUrlIndex([{ id: "x", source_url: null, instrument_identifier: "a" }]).size, 0);
});

test("partitionExcludeHeld RD-M4b (population apply #34's own shape): a sibling series -- SAME URL, DIFFERENT non-null instrument_identifier -- is NOT excluded (the defect RD-M4's own apply-mint-batch.mjs commit flagged one layer up)", () => {
  const rows = [
    { id: "automotive-diesel", document_url: "https://energy.ec.europa.eu/.../weekly-oil-bulletin_en", instrument_identifier: "eu-oil-bulletin:automotive-diesel" },
    { id: "heating-gas-oil", document_url: "https://energy.ec.europa.eu/.../weekly-oil-bulletin_en", instrument_identifier: "eu-oil-bulletin:heating-gas-oil" },
  ];
  const heldUrlIndex = buildHeldUrlIndex([
    { id: "eurosuper-95-item", source_url: "https://energy.ec.europa.eu/.../weekly-oil-bulletin_en", instrument_identifier: "eu-oil-bulletin:eurosuper-95" },
  ]);
  const { kept, excludedHeld } = partitionExcludeHeld(rows, heldUrlIndex, true);
  assert.deepEqual(kept.map((r) => r.id), ["automotive-diesel", "heating-gas-oil"]);
  assert.equal(excludedHeld.length, 0);
});

test("partitionExcludeHeld: a true duplicate (same URL, same instrument_identifier, case/whitespace-insensitive) IS excluded", () => {
  const rows = [{ id: "r1", document_url: "https://x/bulletin", instrument_identifier: "  EU-Oil-Bulletin:Eurosuper-95  " }];
  const heldUrlIndex = buildHeldUrlIndex([{ id: "holder", source_url: "https://x/bulletin", instrument_identifier: "eu-oil-bulletin:eurosuper-95" }]);
  const { kept, excludedHeld } = partitionExcludeHeld(rows, heldUrlIndex, true);
  assert.equal(kept.length, 0);
  assert.deepEqual(excludedHeld.map((r) => r.id), ["r1"]);
});

test("partitionExcludeHeld: both sides unlabelled (null instrument_identifier) at the same URL IS excluded -- fail-closed, no positive evidence they differ", () => {
  const rows = [{ id: "r1", document_url: "https://x/legacy", instrument_identifier: null }];
  const heldUrlIndex = buildHeldUrlIndex([{ id: "holder", source_url: "https://x/legacy", instrument_identifier: null }]);
  const { kept, excludedHeld } = partitionExcludeHeld(rows, heldUrlIndex, true);
  assert.equal(kept.length, 0);
  assert.deepEqual(excludedHeld.map((r) => r.id), ["r1"]);
});

test("partitionExcludeHeld: the null-holder asymmetry excludes in BOTH directions -- a labelled row against an unlabelled holder, and an unlabelled row against a labelled holder", () => {
  const labelledRow = [{ id: "r1", document_url: "https://x/a", instrument_identifier: "32024R0001" }];
  const unlabelledHolder = buildHeldUrlIndex([{ id: "holder-a", source_url: "https://x/a", instrument_identifier: null }]);
  assert.equal(partitionExcludeHeld(labelledRow, unlabelledHolder, true).excludedHeld.length, 1);

  const unlabelledRow = [{ id: "r2", document_url: "https://x/b", instrument_identifier: null }];
  const labelledHolder = buildHeldUrlIndex([{ id: "holder-b", source_url: "https://x/b", instrument_identifier: "32024R0002" }]);
  assert.equal(partitionExcludeHeld(unlabelledRow, labelledHolder, true).excludedHeld.length, 1);
});

test("partitionExcludeHeld: a row whose document_url has no holder at all passes through kept, untouched", () => {
  const rows = [{ id: "r1", document_url: "https://x/nobody-here", instrument_identifier: "32024R0009" }];
  const heldUrlIndex = buildHeldUrlIndex([{ id: "holder", source_url: "https://x/elsewhere", instrument_identifier: "32024R0009" }]);
  const { kept, excludedHeld } = partitionExcludeHeld(rows, heldUrlIndex, true);
  assert.deepEqual(kept, rows);
  assert.equal(excludedHeld.length, 0);
});

// ── buildHeldKeyIndex / partitionExcludeHeldByKey (Lane EXPORT-HOLD, 2026-09-03, defect 1) ──────────────

test("buildHeldKeyIndex: keys a live intelligence_items read by canonical_instrument_key, archive_reason -> archived flag, first holder wins on a duplicate key", () => {
  const idx = buildHeldKeyIndex([
    { id: "item-1", canonical_instrument_key: "32019R1242", archive_reason: null },
    { id: "item-2", canonical_instrument_key: "32020D1124(01)", archive_reason: "out_of_scope_wo26" },
    { id: "item-3", canonical_instrument_key: null, archive_reason: null }, // no key -> never indexed
    { id: "item-4", canonical_instrument_key: "32019R1242", archive_reason: null }, // duplicate key, first wins
  ]);
  assert.deepEqual(idx.get("32019R1242"), { id: "item-1", archived: false });
  assert.deepEqual(idx.get("32020D1124(01)"), { id: "item-2", archived: true });
  assert.equal(idx.has("does-not-exist"), false);
  assert.equal(idx.size, 2);
});

test("buildHeldKeyIndex: absent items array -> empty index, never throws", () => {
  assert.equal(buildHeldKeyIndex(undefined).size, 0);
  assert.equal(buildHeldKeyIndex([]).size, 0);
});

test("partitionExcludeHeldByKey RED (defect 1 repro): a row whose canonical_instrument_key matches a holder at a DIFFERENT source_url is excluded with the holder's id as evidence, mirroring apply-mint-batch.mjs's M4 not_applied_holder_conflict for row 26bf4a98-9dc4-472e-9c6a-8883c3bffea1 / holder ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7", () => {
  const row = {
    id: "26bf4a98-9dc4-472e-9c6a-8883c3bffea1",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242",
    instrument_identifier: "32019R1242",
  };
  const heldKeyIndex = buildHeldKeyIndex([{ id: "ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7", canonical_instrument_key: "32019R1242", archive_reason: null }]);
  const { kept, excludedHeldByKey } = partitionExcludeHeldByKey([row], heldKeyIndex);
  assert.equal(kept.length, 0);
  assert.deepEqual(excludedHeldByKey, [{
    row_id: "26bf4a98-9dc4-472e-9c6a-8883c3bffea1",
    document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1242",
    canonical_instrument_key: "32019R1242",
    reason: "already_held_by_key",
    holder_item_id: "ab922a18-c9a8-4b1b-9ac6-b7f20606c5d7",
  }]);
});

test("partitionExcludeHeldByKey: an archived holder still excludes the row, but is named holder_archived: true (the 459/529-row archived-holder disposition itself is untouched by this)", () => {
  const row = { id: "r1", document_url: "https://eur-lex.europa.eu/x", instrument_identifier: "32020D1124(01)" };
  const heldKeyIndex = buildHeldKeyIndex([{ id: "item-archived", canonical_instrument_key: "32020D1124(01)", archive_reason: "out_of_scope_wo26" }]);
  const { excludedHeldByKey } = partitionExcludeHeldByKey([row], heldKeyIndex);
  assert.equal(excludedHeldByKey[0].holder_archived, true);
});

test("partitionExcludeHeldByKey: a row whose derived key does not match any holder passes through as kept, untouched", () => {
  const row = { id: "r1", document_url: "https://eur-lex.europa.eu/x", instrument_identifier: "32099R9999" };
  const heldKeyIndex = buildHeldKeyIndex([{ id: "item-1", canonical_instrument_key: "32019R1242", archive_reason: null }]);
  const { kept, excludedHeldByKey } = partitionExcludeHeldByKey([row], heldKeyIndex);
  assert.deepEqual(kept, [row]);
  assert.equal(excludedHeldByKey.length, 0);
});

test("partitionExcludeHeldByKey: a row with no derivable canonical_instrument_key (e.g. legislation.gov.uk) never collides, passes through as kept", () => {
  const row = { id: "r1", document_url: "https://www.legislation.gov.uk/uksi/2021/1095/made", instrument_identifier: null };
  const heldKeyIndex = buildHeldKeyIndex([{ id: "item-1", canonical_instrument_key: "32019R1242", archive_reason: null }]);
  const { kept, excludedHeldByKey } = partitionExcludeHeldByKey([row], heldKeyIndex);
  assert.deepEqual(kept, [row]);
  assert.equal(excludedHeldByKey.length, 0);
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
  assert.equal(row.screen, null, "a censusRow carrying no .screen (e.g. this direct call, outside the screened export path) exports screen: null, never a fabricated verdict");
});

test("buildExportRow: a censusRow carrying .screen (partitionByScreen's own attachment) is copied onto the exported row verbatim (Lane WSEQ)", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001", screen: { verdict: "on_vertical", provenance: "rule", basis: "eur-lex regulation" } };
  const capture = { text: "x".repeat(500), html: null };
  const { row } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, capture);
  assert.deepEqual(row.screen, { verdict: "on_vertical", provenance: "rule", basis: "eur-lex regulation" });
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

// ── detectNotInForce / buildExportRow in-force screen (Lane HOLLOW-GATE, 2026-09-04) ───────────────────
// Build requirement 3. Structurally anchored on the `forceIndicator` widget markup, never a bare substring
// scan -- see this function's own header comment in export-census-rows.mjs for the false-positive trap
// (32020R0893, [CONFIRMED] via Supabase) a bare scan would fall into.

test("detectNotInForce: the REAL 32020R0893 force-indicator markup (green/on) -> notInForce false", () => {
  const html =
    '<p xmlns="http://www.w3.org/1999/xhtml" class="forceIndicator">\n' +
    '         <span>\n' +
    '            <img class="forceIndicatorBullet" src="./../../../images/green-on.png"\n' +
    '                 alt="Legal status of the document"/>\n' +
    '         </span>In force</p>\n' +
    '      <p>ELI: <a class="underlineLink" href="http://data.europa.eu/eli/reg_impl/2020/893/oj">http://data.europa.eu/eli/reg_impl/2020/893/oj</a></p>';
  const m = detectNotInForce(html);
  assert.ok(m);
  assert.equal(m.notInForce, false);
  assert.equal(m.statusText, "In force");
});

test("detectNotInForce: the SAME 32020R0893 page's own body prose ALSO carries the literal phrase 'no longer in force' (about a DIFFERENT, unrelated regulation) -- the indicator, not the prose, wins", () => {
  const forceIndicatorHtml =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="green-on.png" alt="x"/></span>In force</p>';
  const bodyText =
    " It was therefore invalid. Regulations (EEC) No 2913/92 and (EEC) No 2454/93 are no longer in force, " +
    "but point (c) of Article 132 of Implementing Regulation (EU) 2015/2447 also establishes a one-year " +
    "limitation for adjusting the customs value of defective goods.";
  const m = detectNotInForce(forceIndicatorHtml + bodyText);
  assert.equal(m.notInForce, false, "the indicator itself says In force; the unrelated body-text phrase must never override it");
});

test("detectNotInForce RED [HYPOTHESIS: EUR-Lex's own on/off asset-naming convention inferred, not observed live -- zero rows in this corpus carry it]: a red/off-state variant reads notInForce true, with the evidence span carrying the whole widget", () => {
  const html =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="./../../../images/red-off.png" ' +
    'alt="Legal status of the document"/></span>No longer in force</p>';
  const m = detectNotInForce(html);
  assert.ok(m);
  assert.equal(m.notInForce, true);
  assert.equal(m.statusText, "No longer in force");
  assert.match(m.span, /forceIndicator/);
});

test("detectNotInForce: no force-indicator markup at all (the common case -- neither the Cellar nor EUR-Lex clean-text capture endpoints carry this interactive-page-only widget) -> null", () => {
  assert.equal(detectNotInForce("Article 1. This Regulation shall enter into force on 1 January 2026."), null);
  assert.equal(detectNotInForce(""), null);
  assert.equal(detectNotInForce(null), null);
});

test("buildExportRow RED: a not-in-force capture (real red/off widget shape) is held not_in_force with the evidence span, never minted", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  const notInForceHtml =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="./../../../images/red-off.png" ' +
    'alt="Legal status of the document"/></span>No longer in force</p>' +
    " ".repeat(0) +
    "Article 1 of this Regulation, now repealed, previously governed the labelling of packaging waste.".repeat(3);
  const capture = { text: notInForceHtml, html: null };
  const { row, hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, capture);
  assert.equal(row, undefined);
  assert.equal(hold.reason, "not_in_force");
  assert.match(hold.evidence_span, /forceIndicator/);
  assert.equal(hold.status_text, "No longer in force");
});

test("buildExportRow: a genuinely in-force capture carrying the false-positive-trap body prose still exports a normal row (the indicator markup, when present, correctly says In force; not_in_force never fires)", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  const forceIndicatorHtml =
    '<p class="forceIndicator"><span><img class="forceIndicatorBullet" src="green-on.png" alt="x"/></span>In force</p>';
  const bodyText =
    " It was therefore invalid. Regulations (EEC) No 2913/92 and (EEC) No 2454/93 are no longer in force, " +
    "but point (c) of Article 132 of Implementing Regulation (EU) 2015/2447 also establishes a one-year limitation.".repeat(3);
  const capture = { text: forceIndicatorHtml + bodyText, html: null };
  const { row, hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, capture);
  assert.equal(hold, undefined);
  assert.ok(row);
  assert.equal(row.item_type, "regulation");
});

test("buildExportRow: an ordinary capture with no force-indicator markup at all is unaffected by the screen (the overwhelming common case)", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/32024R0001", instrument_identifier: "32024R0001" };
  const capture = { text: "x".repeat(500), html: null };
  const { row, hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, capture);
  assert.equal(hold, undefined);
  assert.ok(row);
});

// ── detectCellarGarbledMetadata / buildExportRow capture_garbled_metadata screen (Lane BOILER-2, ────────
// 2026-09-04, defect 3 — HOLLOW-GATE's "Cellar garbled metadata captures"). Both fixtures below are the
// REAL captured_text of two live rows (Supabase, `agent_run_searches.result_content`, 2026-09-04):
// CELEX 21976A0216(03) (a 1976 Mediterranean-Sea pollution protocol, sector-2 'A' agreement, 368 chars
// total) and CELEX 32006R1907 (REACH — an ordinarily huge Regulation, 1,114 chars in this garbled
// capture). Both `search_query = 'canonical:record-grade'`, `agent_run_id` null -- this pipeline's OWN
// signature, confirming this is a capture-path defect in THIS file's Cellar handling, not an older
// agent-driven capture. See detectCellarGarbledMetadata's own header in export-census-rows.mjs for what
// "garbled" concretely means (Cellar's own conversion-provenance fingerprint, never the act's own text).

test("detectCellarGarbledMetadata: the REAL CELEX 21976A0216(03) capture (368 chars, Cellar's own conversion fingerprint, no substantive act text at all)", () => {
  const text =
    "CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea by dumping from ships " +
    "and aircraft CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea by dumping " +
    "from ships and aircraft CELEX1 cdm:CDM_2.1.7 tdm:1523 xslt:3945 saxon:9.0.0.1J JVM:1.6.0_29 " +
    "metaconvJar:1.1.9 builddate:21/01/2014 17:28:36 eng en 2025-01-13T16:35:16.890+01:00";
  const m = detectCellarGarbledMetadata(text);
  assert.ok(m, "must detect the fingerprint");
  assert.match(m.span, /cdm:CDM_2\.1\.7/);
  assert.match(m.span, /metaconvJar:1\.1\.9/);
  assert.match(m.span, /builddate:21\/01\/2014/);
  assert.ok(text.includes(m.span), "span must be verbatim-by-construction");
});

test("detectCellarGarbledMetadata: the REAL CELEX 32006R1907 (REACH) capture — a real, ordinarily huge regulation, garbled to 1,114 chars of the same Cellar fingerprint", () => {
  const text =
    "eng en 2025-06-16T09:47:44.681+02:00 REACH REACH REACH Regulation (EC) No 1907/2006 of the European " +
    "Parliament and of the Council of 18 December 2006 concerning the Registration, Evaluation, " +
    "Authorisation and Restriction of Chemicals (REACH) CELEX1 Regulation (EC) No 1907/2006 of the " +
    "European Parliament and of the Council of 18 December 2006 concerning the Registration, Evaluation, " +
    "Authorisation and Restriction of Chemicals (REACH) CELEX1 cdm:CDM_2.1.7 tdm:1523 xslt:3945 " +
    "saxon:9.0.0.1J JVM:1.6.0_29 metaconvJar:1.2.0 builddate:10/03/2015 17:49:14 CELEX1";
  const m = detectCellarGarbledMetadata(text);
  assert.ok(m, "a real, famous regulation's title repeated around this fingerprint must still be caught -- the fingerprint, not the title, is what disqualifies it");
});

test("detectCellarGarbledMetadata: a genuine, real act capture (no Cellar fingerprint tokens at all) is never falsely flagged", () => {
  assert.equal(
    detectCellarGarbledMetadata(
      "COUNCIL RECOMMENDATION of 4 May 1976 on the rational use of energy in urban passenger transport " +
        "HEREBY RECOMMENDS TO THE MEMBER STATES: 1. that they encourage the authorities responsible to " +
        "promote frequent, convenient, regular, fast, reliable, comfortable urban public passenger " +
        "transport services.",
    ),
    null,
  );
  assert.equal(detectCellarGarbledMetadata(""), null);
  assert.equal(detectCellarGarbledMetadata(null), null);
});

test("buildExportRow RED: a Cellar-garbled capture (real CELEX 21976A0216(03) shape) is held capture_garbled_metadata with the evidence span, never minted as a hollow record", () => {
  const censusRow = { id: "r1", document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:21976A0216(03)", instrument_identifier: "21976A0216(03)" };
  const garbledText =
    "CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea by dumping from ships " +
    "and aircraft CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea by dumping " +
    "from ships and aircraft CELEX1 cdm:CDM_2.1.7 tdm:1523 xslt:3945 saxon:9.0.0.1J JVM:1.6.0_29 " +
    "metaconvJar:1.1.9 builddate:21/01/2014 17:28:36 eng en 2025-01-13T16:35:16.890+01:00";
  const { row, hold } = buildExportRow(censusRow, SOURCE, EURLEX_IDENTITY, { text: garbledText, html: null });
  assert.equal(row, undefined);
  assert.equal(hold.reason, "capture_garbled_metadata");
  assert.match(hold.evidence_span, /metaconvJar/);
  assert.equal(hold.fetched_length, garbledText.length);
});

test("resolveRowCapture EUR-Lex: Cellar returns its own garbled conversion-metadata (real shape, >200 chars) -> treated as unusable, falls through to the EUR-Lex clean-text fallback exactly like a too-short or blocked Cellar response", async () => {
  const calls = [];
  const garbledCellarBody =
    '<html><body>CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea by dumping ' +
    'from ships and aircraft CELEX1 Protocol for the prevention of pollution of the Mediterranean Sea ' +
    'by dumping from ships and aircraft CELEX1 cdm:CDM_2.1.7 tdm:1523 xslt:3945 saxon:9.0.0.1J JVM:1.6.0_29 ' +
    'metaconvJar:1.1.9 builddate:21/01/2014 17:28:36 eng en 2025-01-13T16:35:16.890+01:00</body></html>';
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith("https://publications.europa.eu/")) return fakeResponse({ body: garbledCellarBody });
    return fakeResponse({ body: "<html><body>Protocol for the prevention of pollution of the Mediterranean Sea by dumping from ships and aircraft, THE CONTRACTING PARTIES, HAVING REGARD to the relevant provisions.</body></html>".padEnd(300, " x") });
  };
  const identity = { scheme: "celex", canonicalKey: "21976A0216(03)" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:21976A0216(03)" }, identity, { fetchImpl });
  assert.equal(calls.length, 2, "Cellar's garbled response must not be accepted as final -- the EUR-Lex fallback must be tried");
  assert.equal(calls[1], "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:21976A0216(03)");
  assert.equal(env.usable, true, "the EUR-Lex fallback's real text must be accepted");
  assert.equal(env.cellar_status, 200, "the Cellar attempt is recorded even though its content was refused");
  assert.ok(!detectCellarGarbledMetadata(env.text), "the accepted text must not itself be the garbled fingerprint");
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

const CELLAR_XHTML =
  '<html><head><title>L_2006209EN.01000101.xml</title></head><body><p class="oj-hd-date">31.7.2006</p>' +
  '<p class="oj-doc-ti">COUNCIL DECISION</p><p class="oj-doc-ti">of 14 October 2004</p>' +
  '<p class="oj-doc-ti">concerning the conclusion of the Stockholm Convention</p><p class="oj-doc-ti">(2006/507/EC)</p>' +
  '<p class="oj-normal">THE COUNCIL OF THE EUROPEAN UNION, Having regard to the Treaty establishing the European Community.</p></body></html>'.padEnd(600, " x");

function fakeResponse({ status = 200, body = "", location = null } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (k) => (k.toLowerCase() === "location" ? location : null) }, text: async () => body };
}

test("resolveRowCapture EUR-Lex: Cellar FIRST (publications.europa.eu/resource/celex/<key>), following its http 303 upgraded to https; title from oj-doc-ti, never <title>", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, redirect: opts?.redirect });
    if (url === "https://publications.europa.eu/resource/celex/32006D0507") {
      return fakeResponse({ status: 303, location: "http://publications.europa.eu/resource/cellar/604cda99.0005.02/DOC_1" });
    }
    if (url === "https://publications.europa.eu/resource/cellar/604cda99.0005.02/DOC_1") return fakeResponse({ body: CELLAR_XHTML });
    throw new Error(`unexpected url ${url}`);
  };
  const identity = { scheme: "celex", canonicalKey: "32006D0507" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006D0507" }, identity, { fetchImpl });
  assert.deepEqual(calls.map((c) => c.url), [
    "https://publications.europa.eu/resource/celex/32006D0507",
    "https://publications.europa.eu/resource/cellar/604cda99.0005.02/DOC_1",
  ]);
  assert.ok(calls.every((c) => c.redirect === "manual"));
  assert.equal(env.usable, true);
  assert.equal(env.endpoint, cellarEndpointForCelex("32006D0507"));
  assert.equal(env.title, "COUNCIL DECISION of 14 October 2004 concerning the conclusion of the Stockholm Convention (2006/507/EC)");
  assert.equal(env.titleOrigin, "cellar_doc_title");
  // the title is a verbatim substring of the captured text, so record-facts' identity FACT will bind
  assert.ok(env.text.includes(env.title));
  assert.equal(env.fallbackFrom, undefined);
});

test("resolveRowCapture EUR-Lex: Cellar refused -> falls back to /TXT/HTML/?uri=CELEX:<key> (never /TXT/?uri=), recording the Cellar attempt", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith("https://publications.europa.eu/")) return fakeResponse({ status: 404, body: "None of the requests returned successfully a redirection." });
    return fakeResponse({ body: "<html><body>COUNCIL DECISION of 14 October 2004 concerning the position.</body></html>".padEnd(300, " x") });
  };
  const identity = { scheme: "celex", canonicalKey: "32009D0320" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009D0320" }, identity, { fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[1], "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32009D0320");
  assert.doesNotMatch(calls[1], /\/TXT\/\?uri=/);
  assert.equal(env.usable, true);
  assert.match(env.title, /^COUNCIL DECISION of 14 October 2004/);
  assert.equal(env.fallbackFrom, "https://publications.europa.eu/resource/celex/32009D0320");
  assert.equal(env.cellar_status, 404);
});

test("resolveRowCapture EUR-Lex: Cellar refused AND the EUR-Lex bot gate (HTTP 202, 2,035-byte interstitial) -> NOT usable, both attempts on the envelope (reproduces run #4's hold)", async () => {
  const fetchImpl = async (url) =>
    url.startsWith("https://publications.europa.eu/")
      ? fakeResponse({ status: 503, body: "" })
      : fakeResponse({ status: 202, body: "<html><body>JavaScript is disabled In order to continue, we need to verify that you're not a robot.</body></html>".padEnd(2035, " ") });
  const identity = { scheme: "celex", canonicalKey: "32006D0507" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/x" }, identity, { fetchImpl });
  assert.equal(env.usable, false);
  assert.equal(env.status, 202);
  assert.equal(env.cellar_status, 503);
  assert.match(env.head, /not a robot/);
  // Lane EXPORT-HOLD (2026-09-03, defect 2): the EUR-Lex answer matches its own known bot-gate
  // interstitial -> tagged so buildRows holds this no_capture_path, not capture_blocked (never retried
  // every population-turn run for a request that can never succeed).
  assert.equal(env.noCapturePath, true);
});

test("resolveRowCapture EUR-Lex: Cellar refused, EUR-Lex fallback ALSO fails but is NOT the robot-gate shape -> noCapturePath is never set (a transient failure stays capture_blocked, worth retrying)", async () => {
  const fetchImpl = async (url) =>
    url.startsWith("https://publications.europa.eu/")
      ? fakeResponse({ status: 404, body: "Resource not found." })
      : fakeResponse({ status: 500, body: "Internal Server Error" });
  const identity = { scheme: "celex", canonicalKey: "32006D0507" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/x" }, identity, { fetchImpl });
  assert.equal(env.usable, false);
  assert.equal(env.status, 500);
  assert.equal(env.noCapturePath, undefined);
});

// ── isEurlexRobotGate / cellarEndpointForCelex parens fix (Lane EXPORT-HOLD, 2026-09-03, defect 2) ──────

test("isEurlexRobotGate: status 202 + the marker text -> true; detected by status+text, never byte count alone", () => {
  assert.equal(isEurlexRobotGate(202, "JavaScript is disabled In order to continue, we need to verify that you're not a robot. This requires JavaScript."), true);
});

test("isEurlexRobotGate RED: right status, wrong text -> false (a genuine 202 that is not the bot gate is never misclassified)", () => {
  assert.equal(isEurlexRobotGate(202, "Accepted for processing"), false);
});

test("isEurlexRobotGate RED: right text, wrong status -> false (status is checked, never inferred from text alone)", () => {
  assert.equal(isEurlexRobotGate(200, "verify that you're not a robot"), false);
});

test("isEurlexRobotGate RED: no head text at all -> false, never throws", () => {
  assert.equal(isEurlexRobotGate(202, null), false);
  assert.equal(isEurlexRobotGate(202, undefined), false);
});

test("cellarEndpointForCelex: percent-encodes ( and ) — encodeURIComponent leaves them literal, and Cellar 404s a literal-paren request (live-confirmed, 2026-09-03)", () => {
  assert.equal(cellarEndpointForCelex("22004A0806(01)"), "https://publications.europa.eu/resource/celex/22004A0806%2801%29");
  assert.equal(encodeURIComponent("22004A0806(01)"), "22004A0806(01)", "documents WHY the fix is needed: JS's own encoder does not escape parens");
});

test("cellarEndpointForCelex: a key with no parens is unaffected by the fix", () => {
  assert.equal(cellarEndpointForCelex("32006D0507"), "https://publications.europa.eu/resource/celex/32006D0507");
});

test("resolveRowCapture EUR-Lex: an OJ-sequence-suffixed key now resolves through Cellar (defect 2's root fix) — Cellar receives the percent-encoded parens, not the literal ones", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, redirect: opts?.redirect });
    if (url === "https://publications.europa.eu/resource/celex/22004A0806%2801%29") {
      return fakeResponse({ status: 302, location: "http://publications.europa.eu/resource/cellar/ce485962-eefe-4b78-921a-6f6b6d2d01bd/rdf/object/full" });
    }
    if (url === "https://publications.europa.eu/resource/cellar/ce485962-eefe-4b78-921a-6f6b6d2d01bd/rdf/object/full") return fakeResponse({ body: CELLAR_XHTML });
    throw new Error(`unexpected url ${url}`);
  };
  const identity = { scheme: "celex", canonicalKey: "22004A0806(01)" };
  const env = await resolveRowCapture({ document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:22004A0806(01)" }, identity, { fetchImpl });
  assert.equal(calls[0].url, "https://publications.europa.eu/resource/celex/22004A0806%2801%29");
  assert.doesNotMatch(calls[0].url, /\(01\)/, "the literal-paren form is exactly what 404s live; never sent");
  assert.equal(env.usable, true);
});

test("followUpgradingRedirects: upgrades http Location to https, resolves relative Locations, stops at maxHops", async () => {
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); return fakeResponse({ status: 302, location: "http://example.org/next" }); };
  const res = await followUpgradingRedirects(fetchImpl, { maxHops: 2 })("https://example.org/start");
  assert.equal(res.status, 302);
  assert.deepEqual(seen, ["https://example.org/start", "https://example.org/next", "https://example.org/next"]);
  const rel = [];
  const relFetch = async (url) => { rel.push(url); return rel.length === 1 ? fakeResponse({ status: 303, location: "/a/b" }) : fakeResponse({ body: "ok" }); };
  await followUpgradingRedirects(relFetch)("https://example.org/start");
  assert.deepEqual(rel, ["https://example.org/start", "https://example.org/a/b"]);
});

test("extractCellarTitle: legacy EUR-Lex HTML from Cellar (older acts) -> the first <strong> after the CELEX <h1>, never the 'Important legal notice' body lead", () => {
  const legacy =
    '<html><head><title>EUR-Lex - 32001D0573 - EN</title></head><body><div id="banner"><p class="bglang"><a><b>Important legal notice</b></a></p></div>' +
    '<h1>32001D0573</h1><p><strong>2001/573/EC: Council Decision of 23 July 2001 amending Commission Decision 2000/532/EC as regards the list of wastes</strong> Official Journal L 203 , 28/07/2001 P. 0018 - 0019</p>' +
    '<p>Council Decision</p><p>of 23 July 2001</p></body></html>';
  assert.deepEqual(extractCellarTitle(legacy), { title: "2001/573/EC: Council Decision of 23 July 2001 amending Commission Decision 2000/532/EC as regards the list of wastes", origin: "cellar_legacy_title" });
  // the title is verbatim in the stripped capture, so the identity FACT binds
  assert.ok(stripHtmlToText(legacy).includes(extractCellarTitle(legacy).title));
});

test("extractCellarTitle: joins oj-doc-ti lines; ignores the OJ-file-name <title>; body-lead fallback when no doc-ti", () => {
  assert.deepEqual(extractCellarTitle(CELLAR_XHTML), { title: "COUNCIL DECISION of 14 October 2004 concerning the conclusion of the Stockholm Convention (2006/507/EC)", origin: "cellar_doc_title" });
  assert.equal(extractCellarTitle("<html><head><title>L_2006209EN.01000101.xml</title></head><body><p>Some act text here.</p></body></html>").origin, "captured_body_lead");
  assert.equal(extractCellarTitle(""), null);
});

test("stripHtmlToText: drops U+0000 (Postgres refuses it; run #8's Federal Register raw text)", () => {
  assert.equal(stripHtmlToText("Rescinding the\u0000 Definition of Harm &#0;x"), "Rescinding the Definition of Harm x");
});

test("stripHtmlToText: decodes numeric character references (&#xD; inside legislation.gov.uk running text)", () => {
  assert.equal(stripHtmlToText("penalty where the person fails&#xD; to comply &#8364;100"), "penalty where the person fails to comply €100");
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

test("buildRows: Cellar 404 + EUR-Lex's own robot-gate interstitial (run #14's live shape, e.g. the malformed 32025D05242 row) holds no_capture_path, not capture_blocked, with the SAME evidence fields", async () => {
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32025D0524", instrument_identifier: "32025D0524" }];
  const sourcesById = new Map([["s1", SOURCE]]);
  const fetchImpl = async (url) =>
    url.startsWith("https://publications.europa.eu/")
      ? { ok: false, status: 404, text: async () => "Resource [system 'celex' - id '32025D0524'] not found." }
      : { ok: false, status: 202, text: async () => "JavaScript is disabled In order to continue, we need to verify that you're not a robot. This requires JavaScript.".padEnd(2035, " ") };
  const { rows, held, captureFailed } = await buildRows(kept, { sourcesById, existingCaptureByUrl: new Map(), capture: true, fetchImpl });
  assert.equal(rows.length, 0);
  assert.equal(held.length, 1);
  assert.equal(held[0].reason, "no_capture_path");
  assert.equal(held[0].http_status, 202);
  assert.equal(held[0].endpoint, "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32025D0524");
  assert.equal(held[0].cellar_status, 404);
  assert.equal(captureFailed, 1, "still counted as a capture failure -- the summary's captured/capture_failed totals are unaffected by the new reason name");
});

// ── buildRows: identity holds short-circuit BEFORE any network call ────────────────────────────────────

test("buildRows: an identity hold (item_type_unmapped etc.) is reported WITHOUT any capture attempt", async () => {
  // document_url's host does not institution-match its own row's registered source (mismatched, not the
  // same institution) -- stays identity_unmapped_source, never captured.
  const kept = [{ id: "r1", source_id: "s1", document_url: "https://mlit.go.jp/x", instrument_identifier: null }];
  const sourcesById = new Map([["s1", { ...SOURCE, url: "https://transport.gov.example" }]]);
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
  // Lane HELD (2026-09-02): canonical_instrument_key is now the FR's own document number, never null.
  assert.equal(rows[0].canonical_instrument_key, "2024-00001");
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

test("summarize: excludedHeldByKeyCount defaults to 0 and its own line never collides with excluded_held's =2 match (defect 1 evidence line)", () => {
  const text = summarize({
    eligibleCount: 10,
    excludedHeldCount: 2,
    rows: [{}, {}],
    held: [{ reason: "no_capture" }],
    captured: 1,
    captureFailed: 0,
  });
  assert.match(text, /excluded_held_by_key.*=0/);
});

test("summarize: a non-zero excludedHeldByKeyCount is reported on its own line", () => {
  const text = summarize({
    eligibleCount: 10,
    excludedHeldCount: 2,
    excludedHeldByKeyCount: 3,
    rows: [{}, {}],
    held: [],
    captured: 1,
    captureFailed: 0,
  });
  assert.match(text, /excluded_held_by_key.*=3/);
});

// ── read-shape / query-fn regression locks (unchanged from Lane POP's own fix) ─────────────────────────

test("main() never reads agent_run_searches, sources or intelligence_items whole", () => {
  const src = readFileSync(new URL("./export-census-rows.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /readAll\(\s*"agent_run_searches"/);
  assert.doesNotMatch(src, /readAll\(\s*"intelligence_items"/);
  assert.doesNotMatch(src, /readAll\(\s*"sources"/);
  assert.match(src, /readAll\(\s*"census_worklist"[\s\S]*?match:\s*\(q\)\s*=>\s*q\.eq\("dryrun_disposition",\s*"would_mint"\)/);
});

test("main() reads intelligence_items.canonical_instrument_key alongside source_url, batch-scoped via fetchRowsIn/fetchColumnIn (defect 1), never a second whole-table read", () => {
  const src = readFileSync(new URL("./export-census-rows.mjs", import.meta.url), "utf8");
  assert.match(src, /fetchRowsIn\(sb,\s*"intelligence_items",\s*"id, canonical_instrument_key, archive_reason",\s*"canonical_instrument_key"/);
  assert.match(src, /buildHeldKeyIndex\(/);
  assert.match(src, /partitionExcludeHeldByKey\(/);
});

test("main() reads intelligence_items.instrument_identifier alongside source_url (RD-M4b), batch-scoped via fetchRowsIn, feeding buildHeldUrlIndex -- never a bare source_url-only read", () => {
  const src = readFileSync(new URL("./export-census-rows.mjs", import.meta.url), "utf8");
  assert.match(src, /fetchRowsIn\(sb,\s*"intelligence_items",\s*"id, source_url, instrument_identifier",\s*"source_url"/);
  assert.match(src, /buildHeldUrlIndex\(/);
  assert.match(src, /partitionExcludeHeld\(\s*preselected,\s*heldUrlIndex,\s*excludeHeld\s*\)/);
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

// ── the relevance screen at the export (runs #9–#11 minted from the unscreened pool) ─────────────────

test("partitionByScreen: only on_vertical rows are mintable; off_vertical and ambiguous rows are returned with verdict/basis/provenance, never exported", () => {
  const rows = [
    { id: "r1", title: "Safety Zone; Savannah River, Savannah, GA", document_url: "https://www.federalregister.gov/documents/2026/07/01/2026-1/safety-zone", surface_tags: [] },
    { id: "r2", title: "Regulation (EU) 2023/1805 on the use of renewable and low-carbon fuels in maritime transport", document_url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1805", surface_tags: [] },
  ];
  // the rules alone leave the FuelEU row ambiguous (no on-vertical rule names it); the operator's reviewed
  // verdict decides it, exactly as the 2026-08-31 rounds did; with NO reviewed entry it stays out
  const none = partitionByScreen(rows, {});
  assert.deepEqual(none.mintable, []);
  assert.deepEqual(none.screenedOut.map((x) => x.verdict), ["off_vertical", "ambiguous"]);
  const { mintable, screenedOut } = partitionByScreen(rows, { r2: { verdict: "on_vertical", reason: "FuelEU Maritime, core vertical", reviewer: "operator" } });
  assert.deepEqual(mintable.map((r) => r.id), ["r2"]);
  // Lane WSEQ (2026-09-02): a mintable row carries its OWN screen verdict now, not just the rejects — the
  // downstream chain (buildExportRow -> census-rows.json -> run-mint-batch.mjs -> payload.screen) has
  // nowhere else to read it from.
  assert.deepEqual(mintable[0].screen, { verdict: "on_vertical", provenance: "reviewed", basis: "FuelEU Maritime, core vertical" });
  assert.equal(screenedOut.length, 1);
  assert.equal(screenedOut[0].row_id, "r1");
  assert.equal(screenedOut[0].verdict, "off_vertical");
  assert.equal(screenedOut[0].provenance, "rule");
  assert.ok(screenedOut[0].basis);
});

test("loadReviewedVerdicts: the repo's reviewed-verdicts.json loads as an id-keyed object; a missing file means no overrides", () => {
  const reviewed = loadReviewedVerdicts();
  assert.equal(typeof reviewed, "object");
  assert.ok(Object.keys(reviewed).length > 1000, "the 2026-08-31 review covered 1,746 rows");
  assert.deepEqual(loadReviewedVerdicts("/nonexistent/reviewed.json"), {});
});


// ── OJ file names are never titles (2026-09-02, population run #12: two C-series rows exported with
//    "C_2023226EN.01000601.xml" as title) ─────────────────────────────────────────────────────────────
const OJ_C_BODY =
  "C_2023226EN.01000601.xml 28.6.2023 EN Official Journal of the European Union C 226/6 COMMISSION DECISION " +
  "of 19 April 2023 on instructing the Central Administrator of the European Union Transaction Log to enter " +
  "changes to the national aviation allocation table of Italy for 2022 and 2023 into the European Union " +
  "Transaction Log (2023/C 226/06) THE EUROPEAN COMMISSION, Having regard to the Treaty";

test("isOjFileName: recognises L- and C-series OJ file names, nothing else", () => {
  assert.equal(isOjFileName("C_2023226EN.01000601.xml"), true);
  assert.equal(isOjFileName("L_2006209EN.01000101.xml"), true);
  assert.equal(isOjFileName("Energy Act 2023"), false);
  assert.equal(isOjFileName("EUR-Lex - 32001D0573 - EN"), false);
});

test("extractOjActTitle: the act title from an OJ body lead, ending at its OJ reference", () => {
  assert.equal(
    extractOjActTitle(OJ_C_BODY),
    "COMMISSION DECISION of 19 April 2023 on instructing the Central Administrator of the European Union Transaction Log to enter changes to the national aviation allocation table of Italy for 2022 and 2023 into the European Union Transaction Log (2023/C 226/06)",
  );
  assert.equal(
    extractOjActTitle("L_2006209EN.01000101.xml 29.7.2006 EN Official Journal L 209/1 COUNCIL DECISION of 14 October 2004 concerning the conclusion of the Stockholm Convention (2006/507/EC) THE COUNCIL"),
    "COUNCIL DECISION of 14 October 2004 concerning the conclusion of the Stockholm Convention (2006/507/EC)",
  );
  assert.equal(extractOjActTitle("no act here at all"), null);
});

test("extractEurlexTitle / extractCellarTitle: an OJ file name in <title> is skipped and the act title is taken from the body", () => {
  const html = `<html><head><title>C_2023226EN.01000601.xml</title></head><body><p>${OJ_C_BODY}</p></body></html>`;
  for (const fn of [extractEurlexTitle, extractCellarTitle]) {
    const r = fn(html);
    assert.equal(r.origin, "captured_body_act_title");
    assert.match(r.title, /^COMMISSION DECISION of 19 April 2023/);
    assert.doesNotMatch(r.title, /\.xml/);
  }
});

test("extractTitleFromHtml: a real <title> is still preferred; only OJ file names are skipped", () => {
  assert.deepEqual(extractTitleFromHtml("<title>Energy Act 2023</title>"), { title: "Energy Act 2023", origin: "captured_title" });
  assert.equal(extractTitleFromHtml("<title>C_2023226EN.01000601.xml</title>"), null);
});
