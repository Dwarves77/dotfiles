// @ts-check
// GOLDEN: charset-aware decode (the non-EN extraction fix). The red fixture is the Brazil planalto.gov.br class:
// the SAME Latin-1 bytes decode to CORRECT Portuguese with the right charset and to MOJIBAKE (U+FFFD) as UTF-8 —
// which is what corrupted "Política Nacional de Resíduos Sólidos" into "Pol�tica ... Res�duos S�lidos" and left
// the grounder no matchable original-language span.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeHtmlBytes, charsetFromContentType, charsetFromMeta, normalizeCharsetLabel } from "./charset-decode.mjs";

// windows-1252 / iso-8859-1 bytes for "Política Nacional de Resíduos Sólidos" (í=0xED, ó=0xF3).
const PT = "Política Nacional de Resíduos Sólidos"; // Política ... Resíduos Sólidos
const latin1Bytes = Uint8Array.from([...PT].map((ch) => ch.charCodeAt(0))); // each code point < 256 -> its byte

test("RED GOLDEN (Brazil): Latin-1 bytes decode to correct Portuguese with charset, MOJIBAKE as utf-8", () => {
  // utf-8 (the bug): the 0xED / 0xF3 bytes are invalid UTF-8 -> replacement chars (mojibake).
  const asUtf8 = new TextDecoder("utf-8", { fatal: false }).decode(latin1Bytes);
  assert.ok(asUtf8.includes("�"), "utf-8 decode should corrupt the accents to U+FFFD");
  assert.ok(!asUtf8.includes("Política"), "utf-8 decode must NOT contain correct Portuguese");

  // header says iso-8859-1 -> correct Portuguese, no replacement char.
  const viaHeader = decodeHtmlBytes(latin1Bytes, "text/html; charset=iso-8859-1");
  assert.equal(viaHeader.source, "header");
  assert.equal(viaHeader.text, PT);
  assert.ok(!viaHeader.text.includes("�"));
});

test("charset from <meta> when the header omits it (the planalto real case: charset only in <meta>)", () => {
  const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body>'
    + PT + "</body></html>";
  const bytes = Uint8Array.from([...html].map((c) => c.charCodeAt(0)));
  const out = decodeHtmlBytes(bytes, "text/html"); // header has NO charset
  assert.equal(out.source, "meta");
  assert.ok(out.text.includes(PT), "meta-declared charset should recover correct Portuguese");
  assert.ok(!out.text.includes("�"));
});

test("charset from <meta charset=...> short form", () => {
  const bytes = Uint8Array.from([...'<meta charset="windows-1252">'].map((c) => c.charCodeAt(0)));
  assert.equal(charsetFromMeta(bytes), "windows-1252");
});

test("default utf-8 when neither header nor meta declares a charset (correct UTF-8 stays correct)", () => {
  const utf8 = new TextEncoder().encode(PT); // real UTF-8 bytes
  const out = decodeHtmlBytes(utf8, "text/html");
  assert.equal(out.source, "default");
  assert.equal(out.charset, "utf-8");
  assert.equal(out.text, PT);
});

test("charsetFromContentType parses and normalizes; unknown -> null", () => {
  assert.equal(charsetFromContentType("text/html; charset=UTF-8"), "utf-8");
  assert.equal(charsetFromContentType("text/html; charset=iso-8859-1"), "windows-1252");
  assert.equal(charsetFromContentType("text/html"), null);
  assert.equal(charsetFromContentType(null), null);
});

test("normalizeCharsetLabel: aliases fold, junk -> null", () => {
  assert.equal(normalizeCharsetLabel("Latin1"), "windows-1252");
  assert.equal(normalizeCharsetLabel("UTF8"), "utf-8");
  assert.equal(normalizeCharsetLabel("'iso-8859-1'"), "windows-1252");
  assert.equal(normalizeCharsetLabel("not-a-charset-xyz"), null);
  assert.equal(normalizeCharsetLabel(""), null);
});
