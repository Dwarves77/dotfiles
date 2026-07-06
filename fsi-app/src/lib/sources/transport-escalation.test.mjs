// @ts-check
// RED-THEN-GREEN for the transport escalation ladder + write-side capture gate (invariant RD-14). Fixtures are
// the REAL adjudicated cases from the 2026-07-06 corpus work order. Transports are DEP-INJECTED fakes — NO real
// fetch happens. Run: node --test (exit-code + file-redirect; Windows libuv eats node --test stdout).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS, classifyTransportResult, apiEndpointFor, selectTransportOrder,
  escalateFetch, captureForStorage, isNotFound, isBlock, isJsShell,
} from "./transport-escalation.mjs";

// ── REAL failed-fetch bodies (verbatim shape, abbreviated) ──────────────────────────────────────────────
const SFC_403 = "403 ERROR The request could not be satisfied. Request blocked. Access Denied. You don't have permission to access this resource.";
const EURLEX_404_BODY = "Page Not Found - EUR-Lex Skip to main content English Select your language bg es cs da de en fr The page you are looking for was moved, removed, renamed or doesn't exist. Use the search box or the navigation menu above to find the document you need. " + "EUR-Lex navigation footer links about legal notice cookies accessibility ".repeat(6);
const CUSTOMS_JS_SHELL = "JavaScript is required to display this page. Please enable JavaScript in your browser settings and reload. <noscript>You need to enable JavaScript.</noscript>";
const FEDREG_REQUEST_ACCESS = "Request Access Due to aggressive automated scraping you don't have permission to access this page on this server. Please verify you are human.";
const REAL_LAW = "Article 1 Subject matter and scope. This Regulation establishes rules on the sustainability of batteries and requires economic operators to ensure conformity. Article 2 Definitions. " + "x".repeat(3000);
const REAL_LAW_2 = "Section 1. Short title. This Act may be cited as the Clean Freight Act. Section 2. The Administrator shall issue regulations requiring reporting of emissions. " + "y".repeat(3000);
const API_JSON = JSON.stringify({ title: "Executive Order 14000 — Federal Freight Emissions Reporting", abstract: "This document requires federal agencies and their contracted freight forwarders to report scope 1, 2 and 3 transport emissions annually to the Administrator, establishes the calculation methodology, and sets penalties for non-compliance beginning fiscal year 2027.", body_html_url: "https://www.federalregister.gov/documents/full_text/x", full_text_xml_url: "https://www.federalregister.gov/x.xml" });

// ── (1) CLASSIFIER — each failure class is recognised, real content is OK ────────────────────────────────
test("classifier: each failure class is recognised; a real law body is OK", () => {
  assert.equal(classifyTransportResult({ status: 403, text: SFC_403 }), CLASS.HTTP_403);
  assert.equal(classifyTransportResult({ status: 404, text: EURLEX_404_BODY }), CLASS.HTTP_404);
  assert.equal(classifyTransportResult({ status: 410, text: "" }), CLASS.HTTP_410);
  assert.equal(classifyTransportResult({ status: 503, text: "Service Unavailable" }), CLASS.HTTP_5XX);
  assert.equal(classifyTransportResult({ timedOut: true }), CLASS.TIMEOUT);
  assert.equal(classifyTransportResult({ status: 200, text: CUSTOMS_JS_SHELL }), CLASS.JS_SHELL);
  assert.equal(classifyTransportResult({ status: 200, text: FEDREG_REQUEST_ACCESS }), CLASS.REQUEST_ACCESS);
  assert.equal(classifyTransportResult({ status: 200, text: EURLEX_404_BODY }), CLASS.SOFT_404); // 200-wrapped soft-404
  assert.equal(classifyTransportResult({ status: 200, text: "" }), CLASS.EMPTY);
  assert.equal(classifyTransportResult({ status: 200, text: REAL_LAW }), CLASS.OK);
});

test("classifier: the two-detector gap — an error body detectRoadblock's head window misses is caught", () => {
  // A long nav shell whose 403/forbidden markers sit PAST detectRoadblock's 300/600-char head window but
  // inside isErrorBody's 2500-char scan (>=2 distinct markers). detectRoadblock would call this OK.
  const deepError = "Home About Contact Menu Navigation " + "nav ".repeat(220) + " 403 Forbidden. Access denied. You do not have permission.";
  assert.equal(classifyTransportResult({ status: 200, text: deepError }), CLASS.ERROR_BODY);
});

test("class families: not-found vs block vs js-shell partition correctly", () => {
  assert.ok(isNotFound(CLASS.HTTP_404) && isNotFound(CLASS.HTTP_410) && isNotFound(CLASS.SOFT_404));
  assert.ok(isBlock(CLASS.HTTP_403) && isBlock(CLASS.CDN_BLOCK) && isBlock(CLASS.REQUEST_ACCESS));
  assert.ok(isJsShell(CLASS.JS_SHELL));
  assert.ok(!isNotFound(CLASS.HTTP_403) && !isBlock(CLASS.HTTP_404));
});

// ── (2) HOST → TRANSPORT SELECTION ───────────────────────────────────────────────────────────────────────
test("API hosts route to the JSON API; others do not", () => {
  assert.ok(apiEndpointFor("https://www.federalregister.gov/documents/2026/01/01/x"));
  assert.ok(apiEndpointFor("https://www.ecfr.gov/current/title-40/x"));
  assert.equal(apiEndpointFor("https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464"), null);
  assert.deepEqual(selectTransportOrder("https://www.federalregister.gov/x")[0], "api");
  assert.deepEqual(selectTransportOrder("https://smartfreightcentre.org/x"), ["render", "direct"]);
  assert.deepEqual(selectTransportOrder("https://customs.go.jp/x"), ["direct", "render"]);
});

// ── (3) THE FOUR REAL ADJUDICATED LADDER CASES ───────────────────────────────────────────────────────────

test("(i) Smart Freight Centre WAF/403 on render → plain-HTTP salvage stays GREEN", async () => {
  let directCalls = 0, renderCalls = 0;
  const v = await escalateFetch("https://smartfreightcentre.org/report", {
    browserlessRender: async () => { renderCalls++; return { status: 403, text: SFC_403 }; }, // WAF blocks datacenter IP
    directFetch: async () => { directCalls++; return { status: 200, text: REAL_LAW }; },        // plain-HTTP salvages
    seekMore: async () => { throw new Error("must NOT seek-more on a recoverable block"); },
  });
  assert.equal(v.outcome, "content");
  assert.equal(v.transport, "direct");
  assert.equal(v.storeRow, true);
  assert.equal(renderCalls, 1); // render tried first (render-first host), 403'd
  assert.equal(directCalls, 1); // then the OTHER transport salvaged — 403 class fired try-other
  assert.equal(v.attempts[0].class, CLASS.HTTP_403);
});

test("(ii) EUR-Lex 404 → BOTH transports 404 → seek-more task emitted, ZERO rows stored", async () => {
  let seekCalls = 0;
  const v = await escalateFetch("https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:99999", {
    directFetch: async () => ({ status: 404, text: EURLEX_404_BODY }),
    browserlessRender: async () => ({ status: 404, text: EURLEX_404_BODY }),
    seekMore: async (u) => { seekCalls++; return { kind: "seek_more_alternate_url", url: u }; },
  });
  assert.equal(v.outcome, "seek_more");
  assert.equal(v.storeRow, false, "a 404 body is NEVER stored");
  assert.equal(v.text, "");
  assert.equal(seekCalls, 1);
  assert.ok(v.seekMoreTask && v.seekMoreTask.kind === "seek_more_alternate_url");
  assert.ok(v.attempts.every((a) => a.class === CLASS.HTTP_404));
});

test("(iii) customs.go.jp JS shell on direct → render path chosen, GREEN via render", async () => {
  let renderCalls = 0;
  const v = await escalateFetch("https://customs.go.jp/tariff", {
    directFetch: async () => ({ status: 200, text: CUSTOMS_JS_SHELL }), // plain fetch = JS shell
    browserlessRender: async () => { renderCalls++; return { status: 200, text: REAL_LAW }; }, // render executes JS
    seekMore: async () => { throw new Error("a JS shell is not a not-found"); },
  });
  assert.equal(v.outcome, "content");
  assert.equal(v.transport, "render");
  assert.equal(renderCalls, 1, "the render path was chosen after the JS-shell classification");
  assert.equal(v.attempts[0].class, CLASS.JS_SHELL);
});

test("(iv) federalregister 'Request Access' → API route chosen, HTML never touched", async () => {
  let apiCalls = 0, directCalls = 0, renderCalls = 0;
  const v = await escalateFetch("https://www.federalregister.gov/documents/2026/01/01/rule", {
    apiFetch: async () => { apiCalls++; return { status: 200, text: API_JSON }; },
    directFetch: async () => { directCalls++; return { status: 200, text: FEDREG_REQUEST_ACCESS }; },
    browserlessRender: async () => { renderCalls++; return { status: 200, text: FEDREG_REQUEST_ACCESS }; },
  });
  assert.equal(v.outcome, "content");
  assert.equal(v.transport, "api");
  assert.equal(apiCalls, 1);
  assert.equal(directCalls, 0, "the HTML path (which returns Request Access) is NEVER used for an API host");
  assert.equal(renderCalls, 0);
});

// ── (4) BOTH DIRECTIONS + EXHAUSTION + CACHE ─────────────────────────────────────────────────────────────

test("both directions: cdn_block on render → direct salvage (mirror of the 403-on-render case)", async () => {
  const v = await escalateFetch("https://iea.org/reports/x", { // render-first host
    browserlessRender: async () => ({ status: 200, text: "ERROR: The request could not be satisfied. Request blocked. We can't connect to the server for this app or website at this time. There might be too much traffic or a configuration error. Generated by cloudfront (CloudFront) Request ID: abc123def456ghijk789." }),
    directFetch: async () => ({ status: 200, text: REAL_LAW }),
  });
  assert.equal(v.outcome, "content");
  assert.equal(v.transport, "direct");
  assert.equal(v.attempts[0].class, CLASS.CDN_BLOCK);
});

test("(f) ladder exhausted on blocks → HOLD NO_REACHABLE_SOURCE, event-bound, ZERO stored", async () => {
  const v = await escalateFetch("https://smartfreightcentre.org/report", {
    browserlessRender: async () => ({ status: 403, text: SFC_403 }),
    directFetch: async () => ({ status: 200, text: FEDREG_REQUEST_ACCESS }), // still a wall
    seekMore: async () => { throw new Error("a block is not a not-found — do NOT seek-more"); },
  });
  assert.equal(v.outcome, "no_reachable_source");
  assert.equal(v.holdReason, "NO_REACHABLE_SOURCE");
  assert.equal(v.storeRow, false);
  assert.equal(v.text, "");
});

test("(a) cache hit short-circuits the ladder with real content", async () => {
  let directCalls = 0;
  const v = await escalateFetch("https://eur-lex.europa.eu/x", {
    cacheGet: async () => ({ text: REAL_LAW }),
    directFetch: async () => { directCalls++; return { status: 200, text: REAL_LAW_2 }; },
  });
  assert.equal(v.outcome, "content");
  assert.equal(v.transport, "cache");
  assert.equal(directCalls, 0, "a fresh cache hit never re-fetches");
});

// ── (4b) CANDIDATE-ARRAY + EXHAUSTION-RECORD SEAMS (for the paired seek-more unit) ───────────────────────────

test("candidate array: each candidate is tried through the FULL ladder; the first content success wins", async () => {
  const bodies = {
    "https://eur-lex.europa.eu/dead": EURLEX_404_BODY,           // 404 on both transports
    "https://reg.example.gov/blocked": SFC_403,                  // block on both transports
    "https://reg.example.gov/good": REAL_LAW,                    // real content — the winner
    "https://reg.example.gov/unused": REAL_LAW_2,                // never reached (win short-circuits)
  };
  let unusedTouched = false;
  const v = await escalateFetch(
    ["https://eur-lex.europa.eu/dead", "https://reg.example.gov/blocked", "https://reg.example.gov/good", "https://reg.example.gov/unused"],
    {
      directFetch: async (u) => { if (u.endsWith("/unused")) unusedTouched = true; return { status: bodies[u] === EURLEX_404_BODY ? 404 : 200, text: bodies[u] ?? "" }; },
      browserlessRender: async (u) => ({ status: bodies[u] === EURLEX_404_BODY ? 404 : 200, text: bodies[u] ?? "" }),
      seekMore: async () => { throw new Error("a candidate succeeded — must NOT seek-more"); },
    },
  );
  assert.equal(v.outcome, "content");
  assert.equal(v.url, "https://reg.example.gov/good", "the first candidate that yields real content wins");
  assert.equal(v.text, REAL_LAW);
  assert.equal(unusedTouched, false, "candidates after the winner are never fetched");
});

test("exhaustion record: attempts carry {url, transport, verdict, bytes|reason} for EVERY (candidate × transport)", async () => {
  const v = await escalateFetch(
    ["https://eur-lex.europa.eu/a", "https://sfc.org/b"],
    {
      directFetch: async (u) => (u.includes("eur-lex") ? { status: 404, text: EURLEX_404_BODY } : { status: 403, text: SFC_403 }),
      browserlessRender: async (u) => (u.includes("eur-lex") ? { status: 404, text: EURLEX_404_BODY } : { status: 403, text: SFC_403 }),
      seekMore: async (u) => ({ kind: "seek_more_alternate_url", url: u }),
    },
  );
  // a 404 candidate present → seek-more (go find MORE); the record proves exhaustion across BOTH candidates.
  assert.equal(v.outcome, "seek_more");
  // every attempt row is a full exhaustion record, tagged with its candidate URL + a coarse verdict + bytes/reason
  for (const a of v.attempts) {
    assert.ok(typeof a.url === "string" && a.url, "each attempt names its candidate URL");
    assert.ok(["content", "not_found", "js_shell", "block"].includes(a.verdict) || typeof a.verdict === "string");
    assert.ok(typeof a.transport === "string");
    assert.ok(typeof a.bytes === "number");
  }
  // both candidates appear in the record (proven exhaustion of the whole list, not just the first)
  const urls = new Set(v.attempts.map((a) => a.url));
  assert.ok(urls.has("https://eur-lex.europa.eu/a") && urls.has("https://sfc.org/b"), "the record spans every candidate tried");
  assert.ok(v.attempts.some((a) => a.verdict === "not_found") && v.attempts.some((a) => a.verdict === "block"));
});

test("single-URL back-compat: a bare string is normalized to a one-candidate list", async () => {
  const v = await escalateFetch("https://gov.uk/act", { directFetch: async () => ({ status: 200, text: REAL_LAW }) });
  assert.equal(v.outcome, "content");
  assert.equal(v.url, "https://gov.uk/act");
  assert.ok(v.attempts.every((a) => a.url === "https://gov.uk/act"));
});

// ── (5) THE WRITE-SIDE CAPTURE GATE (the class kill) ─────────────────────────────────────────────────────

test("captureForStorage: error bodies are NEVER stored; only real content is", () => {
  const fetched = [
    { url: "https://eur-lex.europa.eu/reg", text: REAL_LAW },
    { url: "https://sfc.org/x", text: SFC_403 },            // 403 block
    { url: "https://eur-lex.europa.eu/404", text: EURLEX_404_BODY }, // soft-404 nav shell
    { url: "https://customs.go.jp/x", text: CUSTOMS_JS_SHELL },       // JS shell
    { url: "https://gov.uk/act", text: REAL_LAW_2 },
  ];
  const { store, excluded, holdReason } = captureForStorage(fetched);
  assert.deepEqual(store.map((x) => x.url), ["https://eur-lex.europa.eu/reg", "https://gov.uk/act"]);
  assert.equal(excluded.length, 3, "the 403, the 404 nav shell, and the JS shell are all excluded");
  assert.equal(holdReason, null, "usable content remains → no hold");
});

test("captureForStorage: an all-junk capture holds NO_REACHABLE_SOURCE (never a brief over junk)", () => {
  const { store, excluded, holdReason } = captureForStorage([
    { url: "a", text: SFC_403 },
    { url: "b", text: FEDREG_REQUEST_ACCESS },
  ]);
  assert.equal(store.length, 0);
  assert.equal(excluded.length, 2);
  assert.equal(holdReason, "NO_REACHABLE_SOURCE");
});

test("captureForStorage: an empty capture is not a hold (nothing to collect)", () => {
  assert.equal(captureForStorage([]).holdReason, null);
  assert.equal(captureForStorage(null).holdReason, null);
});
