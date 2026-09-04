// api-transport.test.mjs — Lane LEDGER-WALLS, 2026-09-04. Every fetch is an injected `fetchImpl` stub —
// no real network, matching the discipline every other transport test in this directory already uses
// (transport-escalation.test.mjs, primary-fallback.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchFederalRegisterDocument, fetchEcfrTitle, fetchDocumentApi } from "./api-transport.mjs";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function textResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => body };
}

const FR_DOC_URL =
  "https://www.federalregister.gov/documents/2026/07/15/2026-14204/lake-ontario-national-marine-sanctuary-delay-of-effective-date";

// ── fetchFederalRegisterDocument ─────────────────────────────────────────────────────────────────────────

test("fetchFederalRegisterDocument: document_number is the 4th path segment after 'documents'", async () => {
  let calledUrl = null;
  const fetchImpl = async (u) => {
    calledUrl ??= u; // capture the FIRST call (the documents.json lookup)
    if (String(u).includes("/api/v1/documents/")) {
      return jsonResponse({ title: "t", abstract: "a", raw_text_url: "https://x/raw.txt" });
    }
    return textResponse("Full raw document text here, well over two hundred characters so it clears the usability floor and is returned as the primary content instead of falling back to the title-plus-abstract summary line which would otherwise be all this function returns.");
  };
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.match(calledUrl, /\/api\/v1\/documents\/2026-14204\.json/);
  assert.ok(r.text.length > 200);
});

test("fetchFederalRegisterDocument: raw_text_url is fetched and its text wins over the title+abstract summary", async () => {
  const fetchImpl = async (u) => {
    if (String(u).includes("/api/v1/documents/")) {
      return jsonResponse({ title: "Short title", abstract: "Short abstract.", raw_text_url: "https://x/raw.txt" });
    }
    return textResponse("RAW TEXT ".repeat(50)); // > 200ch
  };
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.ok(r.text.includes("RAW TEXT"));
  assert.equal(r.status, 200);
});

test("fetchFederalRegisterDocument: no raw_text_url -> falls back to title+abstract when that clears 200ch", async () => {
  const longAbstract = "A".repeat(250);
  const fetchImpl = async () => jsonResponse({ title: "T", abstract: longAbstract, raw_text_url: undefined });
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.ok(r.text.includes(longAbstract));
});

test("fetchFederalRegisterDocument: raw_text_url fetch throws -> falls through to the summary, never rejects", async () => {
  const longAbstract = "B".repeat(250);
  const fetchImpl = async (u) => {
    if (String(u).includes("/api/v1/documents/")) return jsonResponse({ title: "T", abstract: longAbstract, raw_text_url: "https://x/raw.txt" });
    throw new Error("network down");
  };
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.ok(r.text.includes(longAbstract));
});

test("fetchFederalRegisterDocument: title+abstract under 200ch -> text is empty (below the usability floor, never padded)", async () => {
  const fetchImpl = async () => jsonResponse({ title: "T", abstract: "short" });
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.equal(r.text, "");
});

test("fetchFederalRegisterDocument: documents.json itself 404s -> {status, text:''}, never throws", async () => {
  const fetchImpl = async () => jsonResponse({}, { ok: false, status: 404 });
  const r = await fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.equal(r.status, 404);
  assert.equal(r.text, "");
});

test("fetchFederalRegisterDocument: a URL with no document_number in the expected position -> null (caller's HTML transport holds instead)", async () => {
  const r = await fetchFederalRegisterDocument("https://www.federalregister.gov/agencies/some-agency", {
    fetchImpl: async () => jsonResponse({}),
    max: 6000,
  });
  assert.equal(r, null);
});

test("fetchFederalRegisterDocument: requires opts.max — throws rather than silently defaulting", async () => {
  await assert.rejects(() => fetchFederalRegisterDocument(FR_DOC_URL, { fetchImpl: async () => jsonResponse({}) }), /requires opts\.max/);
});

// ── fetchEcfrTitle ───────────────────────────────────────────────────────────────────────────────────────

test("fetchEcfrTitle: /on/DATE/title-N/ resolves to the versioner XML endpoint", async () => {
  let calledUrl = null;
  const fetchImpl = async (u) => { calledUrl = u; return textResponse("<xml>full title text over two hundred characters ".repeat(6) + "</xml>"); };
  const r = await fetchEcfrTitle("https://www.ecfr.gov/current/on/2026-01-01/title-40/part-1", { fetchImpl, max: 6000 });
  assert.match(calledUrl, /\/versioner\/v1\/full\/2026-01-01\/title-40\.xml/);
  assert.ok(r.text.length > 200);
});

test("fetchEcfrTitle: a bare /current/title-N/ with no /on/DATE/ -> null (no versioner date to resolve)", async () => {
  const r = await fetchEcfrTitle("https://www.ecfr.gov/current/title-40/part-1", { fetchImpl: async () => textResponse("x"), max: 6000 });
  assert.equal(r, null);
});

test("fetchEcfrTitle: requires opts.max", async () => {
  await assert.rejects(() => fetchEcfrTitle("https://www.ecfr.gov/current/on/2026-01-01/title-40/part-1", { fetchImpl: async () => textResponse("x") }), /requires opts\.max/);
});

// ── fetchDocumentApi — host dispatch ────────────────────────────────────────────────────────────────────

test("fetchDocumentApi: routes federalregister.gov to fetchFederalRegisterDocument's own logic", async () => {
  const fetchImpl = async (u) => {
    if (String(u).includes("/api/v1/documents/")) return jsonResponse({ title: "t", abstract: "a", raw_text_url: "https://x/raw.txt" });
    return textResponse("real text ".repeat(30));
  };
  const r = await fetchDocumentApi(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.ok(r.text.includes("real text"));
});

test("fetchDocumentApi: routes ecfr.gov to fetchEcfrTitle's own logic", async () => {
  const fetchImpl = async () => textResponse("ecfr title text ".repeat(20));
  const r = await fetchDocumentApi("https://www.ecfr.gov/current/on/2026-01-01/title-40/part-1", { fetchImpl, max: 6000 });
  assert.ok(r.text.includes("ecfr title text"));
});

test("fetchDocumentApi: a non-API host -> null (apiEndpointFor says no API transport)", async () => {
  const r = await fetchDocumentApi("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32026R1727", {
    fetchImpl: async () => textResponse("x"),
    max: 6000,
  });
  assert.equal(r, null);
});

test("fetchDocumentApi: www. prefix on the API host is handled the same as bare (apiEndpointFor's own host regex already strips it, this module never re-derives)", async () => {
  const fetchImpl = async (u) => {
    if (String(u).includes("/api/v1/documents/")) return jsonResponse({ title: "t", abstract: "a" + "b".repeat(250) });
    return textResponse("x");
  };
  const r = await fetchDocumentApi(FR_DOC_URL, { fetchImpl, max: 6000 });
  assert.ok(r.text.length > 0);
});
