// html-to-text.test.mjs — the ONE htmlToText body (Lane LEDGER-TEXT, 2026-09-04). See that module's own
// header for the defect this consolidation closes and which of this repo's three prior copies it replaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText } from "./html-to-text.mjs";

test("htmlToText: strips <script> and <style> blocks, including their content", () => {
  const html = "<html><head><style>body{color:red}</style><script>alert('x')</script></head>" +
    "<body><p>Real content.</p></body></html>";
  const out = htmlToText(html);
  assert.equal(out, "Real content.");
  assert.ok(!out.includes("alert"));
  assert.ok(!out.includes("color:red"));
});

test("htmlToText: unwraps every other tag, KEEPING its visible text (this is a markup-strip, not a chrome-remover — nav/footer text survives)", () => {
  const html = "<nav><a href='/x'>Home</a></nav><main><h1>Title</h1><p>Body text.</p></main><footer>Copyright 2026</footer>";
  const out = htmlToText(html);
  assert.equal(out, "Home Title Body text. Copyright 2026");
});

test("htmlToText: collapses whitespace runs (newlines, tabs, repeated spaces) to a single space, and trims", () => {
  const html = "<p>Line one.\n\n\t\tLine   two.</p>\n   ";
  const out = htmlToText(html);
  assert.equal(out, "Line one. Line two.");
});

test("htmlToText: empty / null / undefined input never throws, returns an empty string", () => {
  assert.equal(htmlToText(""), "");
  assert.equal(htmlToText(null), "");
  assert.equal(htmlToText(undefined), "");
});

test("htmlToText: plain text with no markup passes through (whitespace-collapsed) unchanged", () => {
  assert.equal(htmlToText("hello world"), "hello world");
});

test("htmlToText: maxChars slices the FINAL text (after collapse+trim), not the raw html", () => {
  const html = "<p>" + "a".repeat(20) + "</p>";
  const out = htmlToText(html, { maxChars: 5 });
  assert.equal(out, "aaaaa");
  assert.equal(out.length, 5);
});

test("htmlToText: maxChars longer than the text is a no-op (no padding, no throw)", () => {
  assert.equal(htmlToText("<p>short</p>", { maxChars: 500 }), "short");
});

test("htmlToText: omitting maxChars returns the full text, unsliced", () => {
  const html = "<p>" + "b".repeat(9000) + "</p>";
  assert.equal(htmlToText(html).length, 9000);
});

test("htmlToText: a script tag with attributes (type=, src=) is still matched and removed", () => {
  const html = '<script type="text/javascript" src="/x.js">var x = 1;</script><p>content</p>';
  assert.equal(htmlToText(html), "content");
});

test("htmlToText: does NOT decode HTML entities (neither of the two consolidated bodies did — a caller that wants entities decoded does it itself)", () => {
  assert.equal(htmlToText("<p>Tom &amp; Jerry</p>"), "Tom &amp; Jerry");
});
