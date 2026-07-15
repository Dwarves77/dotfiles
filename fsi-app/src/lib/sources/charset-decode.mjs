// @ts-check
// CHARSET-AWARE DECODE (operator ruling 2026-07-14, the non-EN extraction fix). The direct-HTTP transport
// decoded EVERY response as UTF-8 (`new TextDecoder("utf-8")`), which CORRUPTS a non-UTF-8 page: a Latin-1
// (ISO-8859-1 / windows-1252) government site — planalto.gov.br, many EU/LatAm gazettes — carries accented
// bytes (0xE9 = é, 0xE7 = ç, ...) that are invalid UTF-8, so every accent decoded to the replacement char
// U+FFFD ("Pol�tica Nacional de Res�duos S�lidos"). That mojibake is PERMANENT (the original byte is lost), so
// the grounder can never copy a matchable original-language span — the fact drops to a GAP and a re-ground
// DESTROYS the ledger (Brazil Lei 12.305: 55 FACT -> 2 GAP). The extraction never failed on the model; the
// BYTES were wrong before the model saw them (a working-artifact defect, not a reference one).
//
// The fix: resolve the response charset from the HTTP Content-Type header, else the HTML <meta charset> /
// <meta http-equiv="Content-Type">, else default UTF-8; decode with THAT charset. Pure + red-then-green
// goldened (the Brazil byte sequence decodes to correct Portuguese with iso-8859-1, mojibake with utf-8).

// TextDecoder label aliases we normalize to a decoder Node/browsers accept. "iso-8859-1" is treated as
// windows-1252 by the WHATWG encoding standard (the web reality), which is what browsers do — so a page that
// declares iso-8859-1 but uses the cp1252 0x80–0x9F range (curly quotes, dashes) still decodes correctly.
const CHARSET_ALIASES = new Map([
  ["utf-8", "utf-8"], ["utf8", "utf-8"], ["us-ascii", "utf-8"], ["ascii", "utf-8"],
  ["iso-8859-1", "windows-1252"], ["iso8859-1", "windows-1252"], ["latin1", "windows-1252"],
  ["latin-1", "windows-1252"], ["l1", "windows-1252"], ["cp1252", "windows-1252"],
  ["windows-1252", "windows-1252"], ["iso-8859-15", "iso-8859-15"], ["latin9", "iso-8859-15"],
  ["utf-16", "utf-16le"], ["utf-16le", "utf-16le"], ["utf-16be", "utf-16be"],
]);

/** Normalize a raw charset token to a TextDecoder-accepted label, or null if unrecognized.
 *  @param {string|null|undefined} raw @returns {string|null} */
export function normalizeCharsetLabel(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!key) return null;
  return CHARSET_ALIASES.get(key) ?? (isDecoderLabel(key) ? key : null);
}

/** Is `label` a charset TextDecoder can construct? (probe once, cheap). @param {string} label */
function isDecoderLabel(label) {
  try { new TextDecoder(label); return true; } catch { return false; }
}

/** Charset from an HTTP Content-Type header value (…; charset=X). @param {string|null|undefined} contentType */
export function charsetFromContentType(contentType) {
  if (!contentType) return null;
  const m = String(contentType).match(/charset\s*=\s*([^;]+)/i);
  return m ? normalizeCharsetLabel(m[1]) : null;
}

/** Charset from an HTML <meta> declaration in the first bytes. The bytes are ASCII-decoded (latin1 is an ASCII
 *  superset, so tag syntax survives regardless of the true charset) and scanned for <meta charset=X> or
 *  <meta http-equiv="Content-Type" content="…charset=X">. @param {Uint8Array} u8 */
export function charsetFromMeta(u8) {
  const head = new TextDecoder("windows-1252").decode(u8.subarray(0, 4096));
  const m1 = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-z0-9_-]+)/i);
  if (m1) return normalizeCharsetLabel(m1[1]);
  const m2 = head.match(/<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9_-]+)/i);
  return m2 ? normalizeCharsetLabel(m2[1]) : null;
}

/**
 * Decode raw response bytes to text using the resolved charset (header > <meta> > utf-8). Pure.
 * @param {Uint8Array} u8  the raw response bytes
 * @param {string|null|undefined} [contentType]  the HTTP Content-Type header value
 * @returns {{ text:string, charset:string, source:'header'|'meta'|'default' }}
 */
export function decodeHtmlBytes(u8, contentType) {
  let charset = charsetFromContentType(contentType);
  let source = /** @type {'header'|'meta'|'default'} */ (charset ? "header" : "default");
  if (!charset) { const meta = charsetFromMeta(u8); if (meta) { charset = meta; source = "meta"; } }
  if (!charset) charset = "utf-8";
  let text;
  try { text = new TextDecoder(charset, { fatal: false }).decode(u8); }
  catch { text = new TextDecoder("utf-8", { fatal: false }).decode(u8); charset = "utf-8"; source = "default"; }
  return { text, charset, source };
}
