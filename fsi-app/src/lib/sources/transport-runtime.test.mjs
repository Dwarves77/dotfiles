// @ts-check
// RED-THEN-GREEN that the LIVE runtime path (transport-runtime.escalateToFetchResult — what fetchWithTransport
// in canonical-pipeline.ts delegates to) routes PER FAILURE CLASS, not just the pure escalateFetch module.
// Transports are DEP-INJECTED fakes — NO real fetch. Fixtures are the REAL adjudicated corpus bodies. Run:
// node --test (exit-code + file-redirect; Windows libuv eats node --test stdout). Registered in run-test-suite.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import { escalateToFetchResult } from "./transport-runtime.mjs";

const MAX = 40000;
const SFC_403 = "403 ERROR The request could not be satisfied. Request blocked. Access Denied. You don't have permission to access this resource.";
const EURLEX_404 = "Page Not Found - EUR-Lex Skip to main content English Select your language bg es cs da de en fr The page you are looking for was moved, removed, renamed or doesn't exist. Use the search box or the navigation menu above to find the document you need. " + "EUR-Lex navigation footer links about legal notice cookies accessibility ".repeat(6);
const CUSTOMS_JS_SHELL = "JavaScript is required to display this page. Please enable JavaScript in your browser settings and reload. <noscript>You need to enable JavaScript.</noscript>";
const FEDREG_REQUEST_ACCESS = "Request Access Due to aggressive automated scraping you don't have permission to access this page on this server. Please verify you are human.";
const REAL_LAW = "Article 1 Subject matter and scope. This Regulation establishes rules on the sustainability of batteries and requires economic operators to ensure conformity. Article 2 Definitions. " + "x".repeat(3000);
const API_TEXT = "Executive Order 14000. This document requires federal freight forwarders to report scope 1, 2 and 3 transport emissions annually to the Administrator beginning fiscal year 2027. " + "z".repeat(3000);

// ── (happy path) a normal reachable doc returns its content unchanged ───────────────────────────────────────
test("LIVE happy path: a reachable doc returns its content (transport = direct)", async () => {
  const r = await escalateToFetchResult("https://gov.uk/act", MAX, {
    directFetch: async () => ({ status: 200, text: REAL_LAW, truncated: false, fullLength: REAL_LAW.length, cap: MAX }),
    browserlessRender: async () => { throw new Error("render must not be needed for a reachable direct doc"); },
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "direct");
  assert.equal(r.text, REAL_LAW);
  assert.equal(r.truncated, false);
});

// ── (d) API host → API transport, HTML never touched ────────────────────────────────────────────────────────
test("LIVE per-class: an API host routes to the API transport (HTML never touched)", async () => {
  let apiCalls = 0, directCalls = 0, renderCalls = 0;
  const r = await escalateToFetchResult("https://www.federalregister.gov/documents/2026/01/01/2026-1/rule", MAX, {
    apiFetch: async () => { apiCalls++; return { status: 200, text: API_TEXT }; },
    directFetch: async () => { directCalls++; return { status: 200, text: FEDREG_REQUEST_ACCESS }; },
    browserlessRender: async () => { renderCalls++; return { status: 200, text: FEDREG_REQUEST_ACCESS }; },
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "api");
  assert.equal(r.text, API_TEXT);
  assert.equal(apiCalls, 1);
  assert.equal(directCalls, 0, "the HTML path (Request Access to scrapers) is NEVER used for an API host");
  assert.equal(renderCalls, 0);
});

// ── (c) JS shell on direct → render path chosen ──────────────────────────────────────────────────────────────
test("LIVE per-class: a JS shell on direct escalates to the render path", async () => {
  let renderCalls = 0;
  const r = await escalateToFetchResult("https://customs.go.jp/tariff", MAX, {
    directFetch: async () => ({ status: 200, text: CUSTOMS_JS_SHELL }),
    browserlessRender: async () => { renderCalls++; return { status: 200, text: REAL_LAW }; },
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "render");
  assert.equal(r.text, REAL_LAW);
  assert.equal(renderCalls, 1, "the render path executed JS after the JS-shell classification");
});

// ── (b) block/bot-wall on one transport → try the OTHER, either direction ────────────────────────────────────
test("LIVE per-class: a 403 block on render → plain-HTTP salvage (try-both, either direction)", async () => {
  let directCalls = 0, renderCalls = 0;
  const r = await escalateToFetchResult("https://smartfreightcentre.org/report", MAX, { // render-first host
    browserlessRender: async () => { renderCalls++; return { status: 403, text: SFC_403 }; },
    directFetch: async () => { directCalls++; return { status: 200, text: REAL_LAW }; },
    seekMore: async () => { throw new Error("a recoverable block must NOT seek-more"); },
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "direct");
  assert.equal(renderCalls, 1);
  assert.equal(directCalls, 1);
});

// ── (e) true 404 on both transports → seek-more emission, ZERO content, nothing stored ───────────────────────
test("LIVE per-class: a genuine 404 on both transports emits a seek-more task, returns ZERO content", async () => {
  let seekCalls = 0;
  const r = await escalateToFetchResult("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:99999", MAX, {
    directFetch: async () => ({ status: 404, text: EURLEX_404 }),
    browserlessRender: async () => ({ status: 404, text: EURLEX_404 }),
    seekMore: async (u) => { seekCalls++; return { kind: "seek_more_alternate_url", url: u }; },
  });
  assert.equal(r.outcome, "seek_more");
  assert.equal(r.text, "", "a 404 body is NEVER returned as content");
  assert.equal(r.transport, "none");
  assert.equal(seekCalls, 1);
  assert.ok(r.seekMoreTask && r.seekMoreTask.kind === "seek_more_alternate_url");
  // the terminal 404 body is reachable as lastFailureText (for the primary's reason signal) but is not `text`
  assert.ok(r.lastFailureText.includes("Page Not Found"));
});

// ── (f) ladder exhausted on blocks → NO_REACHABLE_SOURCE hold, ZERO content ──────────────────────────────────
test("LIVE per-class: exhaustion on blocks holds NO_REACHABLE_SOURCE, returns ZERO content", async () => {
  const r = await escalateToFetchResult("https://smartfreightcentre.org/report", MAX, {
    browserlessRender: async () => ({ status: 403, text: SFC_403 }),
    directFetch: async () => ({ status: 200, text: FEDREG_REQUEST_ACCESS }), // still a wall
    seekMore: async () => { throw new Error("a block is not a not-found — do NOT seek-more"); },
  });
  assert.equal(r.outcome, "no_reachable_source");
  assert.equal(r.holdReason, "NO_REACHABLE_SOURCE");
  assert.equal(r.text, "");
  // the terminal wall body is exposed as lastFailureText so the primary caller preserves its roadblock reason,
  // but it is never the returned content and the write gate independently refuses to store it.
  assert.ok(r.lastFailureText.length > 0);
});

// ── truncation metadata is preserved through the adapter (no-silent-truncation guard needs it) ───────────────
test("LIVE: the winning transport's truncation metadata survives the verdict→FetchResult adaptation", async () => {
  const r = await escalateToFetchResult("https://eur-lex.europa.eu/reg", MAX, {
    directFetch: async () => ({ status: 200, text: REAL_LAW, truncated: true, fullLength: 999999, cap: MAX }),
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.truncated, true);
  assert.equal(r.fullLength, 999999);
  assert.equal(r.cap, MAX);
});

// ── (a) cache short-circuits the ladder with real content (never re-fetches) ─────────────────────────────────
test("LIVE: a fresh cache hit short-circuits the ladder (no transport fetch)", async () => {
  let directCalls = 0;
  const r = await escalateToFetchResult("https://eur-lex.europa.eu/reg", MAX, {
    cacheGet: async () => ({ text: REAL_LAW }),
    directFetch: async () => { directCalls++; return { status: 200, text: "different" }; },
  });
  assert.equal(r.outcome, "content");
  assert.equal(r.transport, "cache");
  assert.equal(r.text, REAL_LAW);
  assert.equal(directCalls, 0);
});
