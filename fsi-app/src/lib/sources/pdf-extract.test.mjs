// Unit tests for the PURE PDF-classification helpers the transport calls (pdf-extract.mjs). These run in
// the depless discipline CI (node --test, NO npm ci), so this file imports ONLY the relative .mjs and
// touches NOTHING that needs node_modules — pdfToText (which loads unpdf) is deliberately NOT exercised
// here. The real unpdf extraction round-trip is proven LIVE (scripts/_diag/_pdf-probe.mjs round-trips a
// generated minimal PDF AND the 26-page GLEC S3 whitepaper; the 50ccd5cc salvage proof grounds the real
// doc) — the same split as primary-fallback.test.mjs, which unit-tests detectRoadblock, not real Browserless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikePdfUrl, isPdfBytes, classifyBody } from "./pdf-extract.mjs";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
const HTML = new TextEncoder().encode("<!DOCTYPE html><html><body>real page</body></html>");

test("looksLikePdfUrl: .pdf path (with/without query/hash) yes; a 'pdf' mention mid-path no", () => {
  assert.equal(looksLikePdfUrl("https://x.s3.amazonaws.com/documents/240129_EV_v3.0_FINAL.pdf"), true);
  assert.equal(looksLikePdfUrl("https://x/doc.pdf?token=abc"), true);
  assert.equal(looksLikePdfUrl("https://x/doc.pdf#page=4"), true);
  assert.equal(looksLikePdfUrl("https://x/report.html"), false);
  assert.equal(looksLikePdfUrl("https://x/pdf-guide/intro"), false); // 'pdf' in the path, not a .pdf file
  assert.equal(looksLikePdfUrl(""), false);
});

test("isPdfBytes: only a real %PDF- header", () => {
  assert.equal(isPdfBytes(PDF_MAGIC), true);
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), true); // exactly 5 bytes
  assert.equal(isPdfBytes(HTML), false);
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50])), false); // too short
  assert.equal(isPdfBytes(new Uint8Array([])), false);
});

test("classifyBody: header OR magic bytes -> pdf (mislabel-proof both ways); html otherwise", () => {
  assert.equal(classifyBody("application/pdf", PDF_MAGIC), "pdf");
  assert.equal(classifyBody("application/octet-stream", PDF_MAGIC), "pdf"); // mislabeled -> magic catches it
  assert.equal(classifyBody("application/pdf; charset=binary", PDF_MAGIC), "pdf");
  assert.equal(classifyBody("text/html", HTML), "html");
  assert.equal(classifyBody("", HTML), "html");
  // header lies "pdf" on HTML bytes -> classified pdf; pdfToText then throws -> the transport falls back
  // (header-or-bytes is permissive toward pdf by design; the throw is the safety net).
  assert.equal(classifyBody("application/pdf", HTML), "pdf");
});
