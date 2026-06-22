// Unit tests for the roadblock detector (the carved roadblocked-vs-partial line) + the bounded
// alternative-search orchestrator. Pure + dep-injected, no network. CI-gated via discipline.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRoadblock, fetchPrimaryWithFallback, targetLangRatio, renderingUrlForPrimary, STUB_MIN_CHARS } from "./primary-fallback.mjs";

const EN = (n) => "The regulation requires covered entities to submit annual emissions reports. ".repeat(Math.ceil(n / 72)).slice(0, n);
const JP = (n) => "排出量取引制度の対象事業者は年次報告を提出する必要があります。".repeat(Math.ceil(n / 28)).slice(0, n);

test("detector: empty / <200ch stub → roadblock (the META 154ch stub)", () => {
  assert.equal(detectRoadblock("").roadblocked, true);
  assert.equal(detectRoadblock("x".repeat(154)).reason, "empty_stub");
  assert.equal(detectRoadblock("x".repeat(STUB_MIN_CHARS - 1)).roadblocked, true);
});

test("THE CARVED LINE: >=200ch real English = SUCCESS, never a roadblock (METI-EN 7487ch honest partial)", () => {
  const partial = EN(7487);
  const d = detectRoadblock(partial);
  assert.equal(d.roadblocked, false, "a real-but-partial English page must NOT trip — residual facts go to counsel, not an alt-hunt");
  assert.equal(d.reason, "ok");
  // a thin-but-real page just above the bar is also success (bias: thin real primary > false roadblock)
  assert.equal(detectRoadblock(EN(220)).roadblocked, false);
});

test("detector: challenge stub above the stub bar (iso.org 376ch, dpiit 245ch Access Denied) → roadblock", () => {
  assert.equal(detectRoadblock("Just a moment... Performing security verification " + "a".repeat(330)).reason, "challenge_stub");
  assert.equal(detectRoadblock("Access Denied. You don't have permission to access " + "b".repeat(200)).reason, "challenge_stub");
});

test("detector: a long real article mentioning 'cloudflare' must NOT trip (no false challenge)", () => {
  const article = EN(5000) + " The company uses Cloudflare for its CDN. " + EN(1000);
  assert.equal(detectRoadblock(article).roadblocked, false);
});

test("detector: wrong-language-only (substantial non-ASCII) → roadblock (drives the alt-hunt for the EN version)", () => {
  const d = detectRoadblock(JP(2000));
  assert.equal(d.roadblocked, true);
  assert.equal(d.reason, "wrong_language_only");
  assert.ok(d.langRatio < 0.6);
});

test("detector: SOFT-404 — a real-length 200 whose head says 'Page Not Found' → roadblock (the CSRD/EUR-Lex bug)", () => {
  // EUR-Lex's actual soft-404 body for a mis-formed CELEX url: ~3000ch, 200 OK, leads with "Page Not Found".
  const eurlexSoft404 = "Page Not Found - EUR-Lex Skip to main content English Select your language " + EN(2900);
  const d = detectRoadblock(eurlexSoft404, { httpStatus: 200 });
  assert.equal(d.roadblocked, true, "a 200 'Page Not Found' must trip so the fallback fires (else reg facts ground on secondary corroborators)");
  assert.equal(d.reason, "soft_404");
  // a real article that merely MENTIONS '404' deep in the body must NOT trip (marker scoped to the head)
  const realArticle = EN(2000) + " The server returned a 404 not found error during testing. " + EN(2000);
  assert.equal(detectRoadblock(realArticle).roadblocked, false, "a '404' mention deep in a real article is not a soft-404");
});

test("renderingUrlForPrimary: EUR-Lex /TXT → /TXT/HTML/ (enacted text), preserving uri=; others untouched", () => {
  assert.equal(
    renderingUrlForPrimary("https://eur-lex.europa.eu/legal-content/EN/TXT?uri=CELEX:32022L2464"),
    "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464",
  );
  // already-HTML form is left alone (idempotent)
  assert.equal(
    renderingUrlForPrimary("https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464"),
    "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2464",
  );
  // non-EUR-Lex and non-URL inputs pass through unchanged
  assert.equal(renderingUrlForPrimary("https://www.federalregister.gov/documents/2024/x"), "https://www.federalregister.gov/documents/2024/x");
  assert.equal(renderingUrlForPrimary("not a url"), "not a url");
});

test("detector: hard HTTP + timeout", () => {
  assert.equal(detectRoadblock(EN(5000), { httpStatus: 404 }).reason, "http_404");
  assert.equal(detectRoadblock("", { timedOut: true }).reason, "timeout");
});

test("detector: langRatio is recorded (so an ASCII-ratio misfire is visible, never trusted silently)", () => {
  const d = detectRoadblock(EN(1000));
  assert.ok(typeof d.langRatio === "number" && d.langRatio > 0.9);
});

test("orchestrator: healthy primary → no fallback, no search", async () => {
  let searched = false;
  const r = await fetchPrimaryWithFallback(
    { title: "X", primaryUrl: "https://reg.gov/x", itemType: "regulation" },
    { browserlessFetch: async () => ({ text: EN(3000) }), webSearchAlternatives: async () => { searched = true; return []; } },
  );
  assert.equal(r.ok, true);
  assert.equal(r.fellBack, false);
  assert.equal(searched, false, "must not search when the primary succeeds");
  assert.equal(r.alternatives.length, 1);
});

test("orchestrator: roadblocked primary → search → first fetchable alternative wins", async () => {
  const pages = { "https://reg.gov/dead": "", "https://reg.gov/bad": "Just a moment...", "https://reg.gov/good": EN(4000) };
  const r = await fetchPrimaryWithFallback(
    { title: "GX-ETS", primaryUrl: "https://reg.gov/dead", itemType: "regulation" },
    {
      browserlessFetch: async (u) => ({ text: pages[u] ?? "" }),
      webSearchAlternatives: async () => ["https://reg.gov/bad", "https://reg.gov/good", "https://reg.gov/unused"],
    },
  );
  assert.equal(r.ok, true);
  assert.equal(r.fellBack, true);
  assert.equal(r.url, "https://reg.gov/good");
  assert.equal(r.primaryReason, "empty_stub");
  // audit trail: declared primary + the two alternatives tried up to the winner (not the 3rd)
  assert.deepEqual(r.alternatives.map((a) => a.role), ["declared_primary", "alternative", "alternative"]);
});

test("orchestrator: roadblocked primary + no fetchable alternative → ok:false (caller honest-exits)", async () => {
  const r = await fetchPrimaryWithFallback(
    { title: "X", primaryUrl: "https://reg.gov/dead", itemType: "regulation" },
    { browserlessFetch: async () => ({ text: "" }), webSearchAlternatives: async () => ["https://reg.gov/alsodead"] },
  );
  assert.equal(r.ok, false);
  assert.equal(r.fellBack, true);
  assert.ok(r.alternatives.length >= 2, "records the primary + every alternative tried (proof the search ran)");
});

test("orchestrator: per-fetch timeout is bounded (a hanging fetch never blocks past perFetchMs)", async () => {
  const start = Date.now();
  const r = await fetchPrimaryWithFallback(
    { title: "X", primaryUrl: "https://reg.gov/hang", itemType: "regulation" },
    {
      browserlessFetch: async (u) => (u.includes("hang") ? new Promise(() => {}) : { text: "" }),
      webSearchAlternatives: async () => [],
      perFetchMs: 200,
    },
  );
  assert.equal(r.alternatives[0].reason, "timeout");
  assert.ok(Date.now() - start < 2000, "must not hang past the bound");
  void r;
});

test("targetLangRatio basic", () => {
  assert.equal(targetLangRatio(""), 0);
  assert.ok(targetLangRatio("hello world") > 0.99);
  assert.ok(targetLangRatio(JP(100)) < 0.5);
});
