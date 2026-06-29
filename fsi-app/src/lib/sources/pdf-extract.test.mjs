// Unit tests for the PDF codec the transport calls (pdf-extract.mjs). Pure classification helpers +
// a REAL round-trip through unpdf on a programmatically-built, xref-correct, text-extractable PDF — no
// network, no fixture binary. CI-gated via discipline.yml (alongside primary-fallback.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikePdfUrl, isPdfBytes, classifyBody, pdfToText } from "./pdf-extract.mjs";

// A minimal, xref-correct, text-extractable PDF with one Helvetica text run. Same generator proven in the
// _pdf-probe (pdf.js reads the marker back). Built in-test so there is no binary fixture to drift.
function minimalPdf(text) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { body += `${String(off).padStart(10, "0")} 00000 n \n`; });
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

test("looksLikePdfUrl: .pdf path (with/without query/hash) yes; a 'pdf' mention mid-path no", () => {
  assert.equal(looksLikePdfUrl("https://x.s3.amazonaws.com/documents/240129_EV_v3.0_FINAL.pdf"), true);
  assert.equal(looksLikePdfUrl("https://x/doc.pdf?token=abc"), true);
  assert.equal(looksLikePdfUrl("https://x/doc.pdf#page=4"), true);
  assert.equal(looksLikePdfUrl("https://x/report.html"), false);
  assert.equal(looksLikePdfUrl("https://x/pdf-guide/intro"), false); // 'pdf' in the path, not a .pdf file
  assert.equal(looksLikePdfUrl(""), false);
});

test("isPdfBytes: only a real %PDF- header", () => {
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), true);
  assert.equal(isPdfBytes(new TextEncoder().encode("<!DOCTYPE html>")), false);
  assert.equal(isPdfBytes(new Uint8Array([0x25, 0x50])), false); // too short
  assert.equal(isPdfBytes(minimalPdf("x")), true);
});

test("classifyBody: header OR magic bytes -> pdf (mislabel-proof); html otherwise", () => {
  const pdfBytes = minimalPdf("x");
  const htmlBytes = new TextEncoder().encode("<html><body>real page</body></html>");
  assert.equal(classifyBody("application/pdf", pdfBytes), "pdf");
  assert.equal(classifyBody("application/octet-stream", pdfBytes), "pdf"); // mislabeled -> magic catches it
  assert.equal(classifyBody("application/pdf; charset=binary", pdfBytes), "pdf");
  assert.equal(classifyBody("text/html", htmlBytes), "html");
  assert.equal(classifyBody("", htmlBytes), "html");
  // header lies "pdf" on HTML bytes -> classified pdf, but pdfToText then throws -> caller falls back.
  assert.equal(classifyBody("application/pdf", htmlBytes), "pdf");
});

test("pdfToText: extracts real text, reports pages + fullLength, caps without silent truncation", async () => {
  const bytes = minimalPdf("Hello PDF GLEC framework");
  const r = await pdfToText(bytes, 100000);
  assert.ok(r.text.includes("Hello PDF GLEC framework"), "marker text round-trips through unpdf");
  assert.equal(r.pages, 1);
  assert.equal(r.fullLength, r.text.length); // under cap -> caller sees not-truncated
  const capped = await pdfToText(bytes, 5);
  assert.equal(capped.text.length, 5);
  assert.ok(capped.fullLength > 5, "fullLength > cap so the caller flags the coverage gap");
});

test("pdfToText: THROWS on a non-PDF body (so the transport falls back, never silent-empty)", async () => {
  await assert.rejects(() => pdfToText(new TextEncoder().encode("not a pdf at all, just text"), 1000));
});
