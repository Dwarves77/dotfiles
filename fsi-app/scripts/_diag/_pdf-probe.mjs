// PROBE (scratch): confirm unpdf extracts text in THIS node before wiring it into the transport.
// (1) a programmatically-built minimal PDF with known text -> deterministic, for the unit test.
// (2) the REAL S3 GLEC PDF (smart-freight-centre-media) -> proves the actual 50ccd5cc target doc.
import { extractText, getDocumentProxy } from "unpdf";

// ---- (1) build a minimal, xref-correct, text-extractable PDF in memory ----
function minimalPdf(text) {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null, // 4 = content stream, built below
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

const MARKER = "Hello PDF GLEC framework";
const bytes = minimalPdf(MARKER);
try {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const flat = String(text).replace(/\s+/g, " ").trim();
  console.log(`(1) minimal PDF: pages=${totalPages} len=${flat.length} containsMarker=${flat.includes(MARKER)}`);
  console.log(`    text="${flat.slice(0, 120)}"`);
} catch (e) { console.log(`(1) minimal PDF THREW: ${e.message}`); }

// ---- (2) the real S3 GLEC PDF ----
const S3 = "https://smart-freight-centre-media.s3.amazonaws.com/documents/240129_EV_Emissions_reporting_v3.0_FINAL.pdf";
try {
  const res = await fetch(S3, { redirect: "follow", signal: AbortSignal.timeout(30000) });
  const ctype = res.headers.get("content-type");
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 5));
  const magic = String.fromCharCode(...head);
  console.log(`\n(2) S3 GLEC PDF: status=${res.status} content-type=${ctype} bytes=${buf.byteLength} magic="${magic}"`);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const flat = String(text).replace(/\s+/g, " ").trim();
  console.log(`    extracted: pages=${totalPages} chars=${flat.length}`);
  console.log(`    head: ${flat.slice(0, 300)}`);
} catch (e) { console.log(`(2) S3 GLEC PDF THREW: ${e.name} ${e.message}`); }
