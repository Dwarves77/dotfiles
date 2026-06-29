// PDF -> text for the ONE transport primitive (canonical-pipeline.fetchWithTransport). A reachable PDF
// (the GLEC S3 whitepaper, and many wave sources) must ground like an HTML page: directFetchClean pulls
// the bytes, this module turns the bytes into text. There is deliberately NO second PDF fetcher — the
// transport stays the SSOT for transport selection; this is only the bytes->text CODEC it calls, so the
// fetchMeta/blFetchClean unification the fetch-path audit won is not re-accreted.
//
// unpdf bundles a serverless pdf.js build (zero native deps), so it runs in the Vercel Node function the
// same as in local node. The classification helpers (URL + magic-byte + content-type) are pure and
// dep-free (unit-tested in the depless discipline CI); pdfToText loads unpdf via a DYNAMIC import so this
// module imports clean without the dependency present — and so the ~MB pdf.js only loads when a PDF is
// actually fetched. Proven live on the 26-page GLEC whitepaper (1.17 MB -> 57,592 chars).

// A URL whose PATH ends in .pdf (ignoring ?query / #hash). The transport uses this to route a PDF
// straight to the byte-fetch path — Browserless renders a PDF as an empty viewer shell, so spending a
// unit on it is pure waste AND trips a false roadblock. A bare 'pdf' substring mid-path does NOT match.
export const looksLikePdfUrl = (url) => /\.pdf(?:$|[?#])/i.test(String(url || ""));

// PDF magic bytes: a PDF file begins with "%PDF-" (0x25 0x50 0x44 0x46 0x2D) per the spec. This catches a
// PDF served WITHOUT an application/pdf content-type (some S3 / portal hosts mislabel), so the codec
// choice never depends on a header a host might get wrong.
export const isPdfBytes = (bytes) => {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
};

// THE codec choice: a body is a PDF if EITHER the content-type says so OR the magic bytes say so. Magic
// bytes are authoritative for real PDFs (the "%PDF-" header is mandatory); the content-type is the
// permissive hint. Header-or-bytes is deliberately permissive toward PDF because pdfToText THROWS on a
// non-PDF (an HTML page mislabeled application/pdf), and that throw is the caller's fall-back trigger —
// so a wrong "pdf" guess degrades to a Browserless/HTML retry, never to silent-empty content.
// Returns "pdf" | "html".
export const classifyBody = (contentType, bytes) =>
  /application\/pdf|application\/x-pdf/i.test(String(contentType || "")) || isPdfBytes(bytes) ? "pdf" : "html";

// Extract text from PDF bytes via unpdf's serverless pdf.js. Returns { text, fullLength, pages } with
// whitespace collapsed and the text capped to `max`. The caller derives truncation from fullLength > max
// and surfaces it as a coverage_gap exactly like the HTML path — NO silent truncation. THROWS on an
// unparseable / non-PDF body so the caller's fallback fires (a corrupt PDF is a roadblock, not content).
export async function pdfToText(bytes, max) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // pdf.js TRANSFERS the backing ArrayBuffer to its parse worker. A small Node Buffer is pooled into a
  // SHARED ArrayBuffer that cannot be transferred (DataCloneError "Cannot transfer object of unsupported
  // type" — bit only the tiny generated PDF, not the 1.17 MB S3 one whose large alloc is unpooled). Hand
  // pdf.js a standalone, exact-size, owned copy so transfer always succeeds regardless of how the caller
  // allocated the bytes.
  const u8 = new Uint8Array(src.byteLength);
  u8.set(src);
  const pdf = await getDocumentProxy(u8);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const full = String(text || "").replace(/\s+/g, " ").trim();
  if (!full) throw new Error("pdf extracted to empty text");
  return { text: full.slice(0, max), fullLength: full.length, pages: totalPages };
}
