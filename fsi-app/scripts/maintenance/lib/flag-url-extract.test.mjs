// Run: node --test scripts/maintenance/lib/flag-url-extract.test.mjs -- no DB, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { trimUrlPunctuation, extractFlagUrls } from "./flag-url-extract.mjs";

test("trimUrlPunctuation: strips trailing sentence punctuation and a bare trailing ')'", () => {
  assert.equal(trimUrlPunctuation("https://example.org/page,"), "https://example.org/page");
  assert.equal(trimUrlPunctuation("https://example.org/page."), "https://example.org/page");
  assert.equal(trimUrlPunctuation("https://example.org/page:"), "https://example.org/page");
  assert.equal(trimUrlPunctuation("https://example.org/page)"), "https://example.org/page");
});

test("trimUrlPunctuation: keeps a balanced parenthetical inside the URL itself", () => {
  assert.equal(trimUrlPunctuation("https://en.wikipedia.org/wiki/Foo_(bar)"), "https://en.wikipedia.org/wiki/Foo_(bar)");
});

test("extractFlagUrls: reads recommended_actions[].rationale (error-body-gate's own 'url: rest of sentence' shape)", () => {
  const flag = {
    recommended_actions: [
      { action: "refetch_source", rationale: "https://example.org/a: stored capture is a failed fetch (isErrorBody) -- re-fetch the real source at hold-lift, re-ground" },
      { action: "refetch_source", rationale: "https://example.net/b: stored capture is a failed fetch (isErrorBody) -- re-fetch the real source at hold-lift, re-ground" },
    ],
  };
  assert.deepEqual(extractFlagUrls(flag), ["https://example.org/a", "https://example.net/b"]);
});

test("extractFlagUrls: reads recommended_actions[].rationale (cited-host-gate's own 'url (cited in ctx): rest' shape)", () => {
  const flag = {
    recommended_actions: [
      { action: "register_source", rationale: "https://example.org/c (cited in section prose): verify the source is real, register the host (or reject the citation), then re-ground" },
    ],
  };
  assert.deepEqual(extractFlagUrls(flag), ["https://example.org/c"]);
});

test("extractFlagUrls: falls back to description when recommended_actions is empty or absent", () => {
  const flag = { description: "1 stored capture(s) excluded from grounding as failed fetches (bot wall / 403 / 404 / nav shell): https://example.org/z", recommended_actions: [] };
  assert.deepEqual(extractFlagUrls(flag), ["https://example.org/z"]);
  assert.deepEqual(extractFlagUrls({ description: "https://example.org/y" }), ["https://example.org/y"]);
});

test("extractFlagUrls: description lists multiple URLs joined by '; '", () => {
  const flag = { description: "2 stored capture(s) excluded: https://a.example/1; https://b.example/2" };
  assert.deepEqual(extractFlagUrls(flag), ["https://a.example/1", "https://b.example/2"]);
});

test("extractFlagUrls: deduplicates across recommended_actions entries, preserves first-seen order", () => {
  const flag = {
    recommended_actions: [
      { rationale: "https://a.example/1: repeat" },
      { rationale: "https://a.example/1: repeat again" },
      { rationale: "https://b.example/2: once" },
    ],
  };
  assert.deepEqual(extractFlagUrls(flag), ["https://a.example/1", "https://b.example/2"]);
});

test("extractFlagUrls: empty/malformed flag returns [] without throwing", () => {
  assert.deepEqual(extractFlagUrls({}), []);
  assert.deepEqual(extractFlagUrls({ recommended_actions: null, description: null }), []);
  assert.deepEqual(extractFlagUrls(undefined), []);
});
