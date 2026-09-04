// @ts-check
// PROOF (feed-discovery, lane SITEMAP 2026-09-04). Pure, no network:
//   - isFeedDocument recognises rss/atom/rdf roots, only within the first 1500 chars.
//   - discoveredFeedLinks reads <link type=...> tags regardless of rel=, both quote styles.
//   - feedCandidateUrls builds the operator's named path list, scoped-then-bare, deduped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isFeedDocument, discoveredFeedLinks, FEED_CANDIDATE_PATHS, feedCandidateUrls } from "./feed-discovery.mjs";

// ── isFeedDocument ───────────────────────────────────────────────────────────────────────────────────────

test("isFeedDocument: recognises rss, atom feed, and RDF roots", () => {
  assert.equal(isFeedDocument(`<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`), true);
  assert.equal(isFeedDocument(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`), true);
  assert.equal(isFeedDocument(`<rdf:RDF xmlns:rdf="x"><channel></channel></rdf:RDF>`), true);
  assert.equal(isFeedDocument(`<RDF xmlns="x"></RDF>`), true);
});

test("isFeedDocument: an HTML page or a sitemap is not a feed", () => {
  assert.equal(isFeedDocument(`<!doctype html><html><body>hello</body></html>`), false);
  assert.equal(isFeedDocument(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`), false);
  assert.equal(isFeedDocument(""), false);
  assert.equal(isFeedDocument(null), false);
});

test("isFeedDocument: only the first 1500 chars are checked — a late <rss> tag does not count", () => {
  const padding = "x".repeat(2000);
  assert.equal(isFeedDocument(`${padding}<rss version="2.0"></rss>`), false);
});

// ── discoveredFeedLinks ──────────────────────────────────────────────────────────────────────────────────

test("discoveredFeedLinks: finds rss/atom/rdf/xml link types, both quote styles, resolves relative hrefs", () => {
  const html = `
    <head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="RSS">
      <link rel='alternate' type='application/atom+xml' href='https://x.example/atom.xml'>
      <link type="text/xml" href="/legacy.xml">
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" type="application/json" href="/feed.json">
    </head>`;
  const links = discoveredFeedLinks(html, "https://x.example/section/");
  assert.deepEqual(links, [
    "https://x.example/feed.xml",
    "https://x.example/atom.xml",
    "https://x.example/legacy.xml",
  ]);
});

test("discoveredFeedLinks: does not require rel=alternate (control-center's own regex does not gate on it)", () => {
  const html = `<link type="application/rss+xml" href="/feed">`;
  assert.deepEqual(discoveredFeedLinks(html, "https://x.example/"), ["https://x.example/feed"]);
});

test("discoveredFeedLinks: no matching link tags -> empty array, never throws", () => {
  assert.deepEqual(discoveredFeedLinks("<html><body>no feeds here</body></html>", "https://x.example/"), []);
  assert.deepEqual(discoveredFeedLinks("", "https://x.example/"), []);
});

// ── feedCandidateUrls ────────────────────────────────────────────────────────────────────────────────────

test("FEED_CANDIDATE_PATHS: the operator's named list, verbatim and in order", () => {
  assert.deepEqual(FEED_CANDIDATE_PATHS, ["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml"]);
});

test("feedCandidateUrls: no scope -> bare-origin candidates only, in FEED_CANDIDATE_PATHS order", () => {
  const urls = feedCandidateUrls("https://x.example/");
  assert.deepEqual(urls, [
    "https://x.example/feed",
    "https://x.example/rss",
    "https://x.example/rss.xml",
    "https://x.example/atom.xml",
    "https://x.example/feed.xml",
    "https://x.example/index.xml",
  ]);
});

test("feedCandidateUrls: a scope path -> scoped candidates FIRST, then bare-origin, deduped", () => {
  const urls = feedCandidateUrls("https://x.example/news/climate", "/news/climate");
  assert.deepEqual(urls, [
    "https://x.example/news/climate/feed",
    "https://x.example/news/climate/rss",
    "https://x.example/news/climate/rss.xml",
    "https://x.example/news/climate/atom.xml",
    "https://x.example/news/climate/feed.xml",
    "https://x.example/news/climate/index.xml",
    "https://x.example/feed",
    "https://x.example/rss",
    "https://x.example/rss.xml",
    "https://x.example/atom.xml",
    "https://x.example/feed.xml",
    "https://x.example/index.xml",
  ]);
});
