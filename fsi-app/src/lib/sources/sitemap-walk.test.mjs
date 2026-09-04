// @ts-check
// PROOF (sitemap-walk, lane SITEMAP 2026-09-04). Pure parser/orchestrator, no network:
//   - discovery order: walkSource tries feed discovery first (source-is-feed, link-alternate,
//     candidate-path), sitemap only when none is found; within the sitemap path, robots.txt Sitemap:
//     lines win, fallback candidates only when robots yields none, stopping at the first that parses.
//   - sitemapindex fan-out is bounded by TWO documented caps (documents, entries), never silent.
//   - response bytes are bounded; oversize is a per-document error, not a silent truncation.
//   - urlset parsing tolerates single/double-quoted attributes and multiple lastmod granularities.
//   - path scoping keeps a source's candidates to its own registered path.
//   - snapshot diff: new/changed/removed, first walk (no previous) reports everything as added.
//   - coverage gates removed-reporting AND the snapshot write (deferred on a first partial walk, merged
//     into the prior snapshot on a later partial walk).
//   - census row shape mirrors feed-walk's persist() contract; change record carries loc+both lastmods.
//   - dry mode (an injected persist/saveSnapshot/recordChange that only counts) writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  parseRobotsSitemapLines, sitemapFallbackCandidates, looksGzippedUrl, looksGzippedBuffer, decodeXmlBody,
  sitemapRootKind, parseUrlsetEntries, parseSitemapIndexEntries, parseSitemapXml, dedupeByLoc, diffUrlSet,
  mergeSnapshotEntries, sourceContentPath, isUrlWithinSourcePath, filterEntriesForSource,
  checkResponseBytes, DEFAULT_MAX_SITEMAP_RESPONSE_BYTES, DEFAULT_MAX_FEED_RESPONSE_BYTES,
  walkSitemap, DEFAULT_MAX_SITEMAP_FETCHES, DEFAULT_MAX_SITEMAP_ENTRIES,
  probeIsFeed, discoverFeed, walkSource,
} from "./sitemap-walk.mjs";

// ── discovery: robots.txt / fallback ────────────────────────────────────────────────────────────────────

test("parseRobotsSitemapLines: case-insensitive directive, multiple lines, relative resolved against base", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /admin",
    "sitemap: https://example.gov/sitemap.xml",
    "Sitemap:   https://example.gov/sitemap-news.xml  ",
    "Sitemap: /sitemap-relative.xml",
    "Sitemap: ftp://old.example/sitemap.xml", // wrong protocol — dropped, https-only
  ].join("\n");
  const out = parseRobotsSitemapLines(robots, "https://example.gov/");
  assert.deepEqual(out, [
    "https://example.gov/sitemap.xml",
    "https://example.gov/sitemap-news.xml",
    "https://example.gov/sitemap-relative.xml",
  ]);
});

test("sitemapFallbackCandidates: the three conventional paths, in order, off the origin", () => {
  assert.deepEqual(sitemapFallbackCandidates("https://example.gov/deep/path?x=1"), [
    "https://example.gov/sitemap.xml",
    "https://example.gov/sitemap_index.xml",
    "https://example.gov/sitemap-index.xml",
  ]);
});

// ── path scoping ─────────────────────────────────────────────────────────────────────────────────────────

test("sourceContentPath: bare origin, a syndication-looking path, and a real deep path", () => {
  assert.equal(sourceContentPath("https://reg.example/"), "");
  assert.equal(sourceContentPath("https://reg.example"), "");
  assert.equal(sourceContentPath("https://reg.example/feed"), "");
  assert.equal(sourceContentPath("https://reg.example/sitemap.xml"), "");
  assert.equal(sourceContentPath("https://reg.example/news/climate/"), "/news/climate");
});

test("isUrlWithinSourcePath: no scope admits any same-origin url; a scope admits only itself or nested", () => {
  assert.equal(isUrlWithinSourcePath("https://reg.example/anything", "https://reg.example/"), true);
  assert.equal(isUrlWithinSourcePath("https://reg.example/news/climate/x", "https://reg.example/news/climate"), true);
  assert.equal(isUrlWithinSourcePath("https://reg.example/news/climate", "https://reg.example/news/climate"), true);
  assert.equal(isUrlWithinSourcePath("https://reg.example/news/other/x", "https://reg.example/news/climate"), false);
  assert.equal(isUrlWithinSourcePath("https://other.example/news/climate/x", "https://reg.example/news/climate"), false);
  assert.equal(isUrlWithinSourcePath("not a url", "https://reg.example/news/climate"), false);
});

test("filterEntriesForSource: unfiltered when no scope, filtered to the scope otherwise", () => {
  const entries = [
    { loc: "https://reg.example/news/climate/a", lastmod: null },
    { loc: "https://reg.example/other/b", lastmod: null },
  ];
  assert.deepEqual(filterEntriesForSource(entries, "https://reg.example/"), entries);
  assert.deepEqual(filterEntriesForSource(entries, "https://reg.example/news/climate"), [entries[0]]);
});

// ── gzip ─────────────────────────────────────────────────────────────────────────────────────────────────

test("looksGzippedUrl / looksGzippedBuffer / decodeXmlBody: .xml.gz round-trips via node:zlib", async () => {
  assert.equal(looksGzippedUrl("https://x.example/sitemap.xml.gz"), true);
  assert.equal(looksGzippedUrl("https://x.example/sitemap.xml.gz?v=2"), true);
  assert.equal(looksGzippedUrl("https://x.example/sitemap.xml"), false);

  const xml = "<urlset><url><loc>https://x.example/a</loc></url></urlset>";
  const gz = gzipSync(Buffer.from(xml, "utf8"));
  assert.equal(looksGzippedBuffer(gz), true);
  assert.equal(looksGzippedBuffer(Buffer.from(xml, "utf8")), false);

  assert.equal(await decodeXmlBody(gz, "https://x.example/sitemap.xml.gz"), xml);
  assert.equal(await decodeXmlBody(gz, "https://x.example/sitemap-served-without-extension"), xml);
  assert.equal(await decodeXmlBody(Buffer.from(xml, "utf8"), "https://x.example/sitemap.xml"), xml);
});

// ── response-byte bounding ───────────────────────────────────────────────────────────────────────────────

test("checkResponseBytes: passes under the bound, throws over it, message names both sizes and the url", () => {
  checkResponseBytes(Buffer.from("small"), 1000, "https://x/y"); // does not throw
  assert.throws(() => checkResponseBytes(Buffer.alloc(2000), 1000, "https://x/y"), /2,000 bytes.*1,000-byte bound/);
});

test("DEFAULT_MAX_SITEMAP_RESPONSE_BYTES / DEFAULT_MAX_FEED_RESPONSE_BYTES mirror control-center's caps", () => {
  assert.equal(DEFAULT_MAX_SITEMAP_RESPONSE_BYTES, 50 * 1024 * 1024);
  assert.equal(DEFAULT_MAX_FEED_RESPONSE_BYTES, 10_000_000);
});

// ── urlset / sitemapindex parsing ───────────────────────────────────────────────────────────────────────

test("sitemapRootKind + parseUrlsetEntries: both quote styles on the root tag, mixed lastmod granularities", () => {
  const doubleQuoted = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://reg.example/rule-1</loc><lastmod>2026-08-30</lastmod><changefreq>weekly</changefreq></url>
  <url><loc>https://reg.example/rule-2</loc><lastmod>2026-08-31T10:15:00+00:00</lastmod></url>
  <url><loc>http://insecure.example/x</loc></url>
  <url><title>no loc at all</title></url>
</urlset>`;
  const singleQuoted = doubleQuoted.replace(
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    "xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'"
  );

  for (const xml of [doubleQuoted, singleQuoted]) {
    assert.equal(sitemapRootKind(xml), "urlset");
    const entries = parseUrlsetEntries(xml);
    assert.equal(entries.length, 2, "http:// and loc-less entries dropped");
    assert.equal(entries[0].loc, "https://reg.example/rule-1");
    assert.equal(entries[0].lastmod, "2026-08-30");
    assert.equal(entries[0].changefreq, "weekly");
    assert.equal(entries[1].lastmod, "2026-08-31T10:15:00+00:00");
  }
});

test("sitemapRootKind: sitemapindex vs unknown (a non-sitemap XML/HTML document)", () => {
  assert.equal(sitemapRootKind(`<sitemapindex xmlns='x'><sitemap><loc>https://a/b.xml</loc></sitemap></sitemapindex>`), "sitemapindex");
  assert.equal(sitemapRootKind(`<html><body>404 not found</body></html>`), "unknown");
});

test("parseSitemapIndexEntries: child sitemap references with lastmod", () => {
  const xml = `<sitemapindex>
    <sitemap><loc>https://reg.example/sitemap-1.xml</loc><lastmod>2026-08-01</lastmod></sitemap>
    <sitemap><loc>https://reg.example/sitemap-2.xml</loc></sitemap>
  </sitemapindex>`;
  const entries = parseSitemapIndexEntries(xml);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].lastmod, "2026-08-01");
  assert.equal(entries[1].lastmod, null);
});

test("parseSitemapXml: dispatches on root kind, never throws on an unrecognised document", () => {
  const unk = parseSitemapXml("<html>nope</html>");
  assert.deepEqual(unk, { kind: "unknown", urlEntries: [], sitemapEntries: [] });
});

// ── dedupe + diff + merge ────────────────────────────────────────────────────────────────────────────────

test("dedupeByLoc: first-loc-wins", () => {
  const out = dedupeByLoc([
    { loc: "https://a/1", lastmod: "2026-01-01" },
    { loc: "https://a/1", lastmod: "2026-02-02" },
    { loc: "https://a/2", lastmod: null },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out.find((e) => e.loc === "https://a/1").lastmod, "2026-01-01");
});

test("diffUrlSet: first walk (previous=null) reports every loc as added, nothing changed/removed", () => {
  const current = [{ loc: "https://a/1", lastmod: "2026-01-01" }, { loc: "https://a/2", lastmod: null }];
  const diff = diffUrlSet(null, current);
  assert.equal(diff.added.length, 2);
  assert.equal(diff.changed.length, 0);
  assert.equal(diff.removed.length, 0);
});

test("diffUrlSet: new/changed/removed against a real previous snapshot", () => {
  const previous = [
    { loc: "https://a/1", lastmod: "2026-01-01" },
    { loc: "https://a/2", lastmod: "2026-01-01" },
    { loc: "https://a/3", lastmod: null },
  ];
  const current = [
    { loc: "https://a/1", lastmod: "2026-01-01" }, // unchanged
    { loc: "https://a/2", lastmod: "2026-02-15" }, // changed
    { loc: "https://a/4", lastmod: "2026-03-01" }, // new
    // https://a/3 dropped out -> removed
  ];
  const diff = diffUrlSet(previous, current);
  assert.deepEqual(diff.added.map((e) => e.loc), ["https://a/4"]);
  assert.deepEqual(diff.changed, [{ loc: "https://a/2", previousLastmod: "2026-01-01", currentLastmod: "2026-02-15" }]);
  assert.deepEqual(diff.removed.map((e) => e.loc), ["https://a/3"]);
});

test("diffUrlSet: a loc with no lastmod in either snapshot is not reported changed (null === null)", () => {
  const diff = diffUrlSet([{ loc: "https://a/1", lastmod: null }], [{ loc: "https://a/1", lastmod: null }]);
  assert.equal(diff.changed.length, 0);
});

test("mergeSnapshotEntries: a loc not seen this walk keeps its prior lastmod; a seen loc is overwritten", () => {
  const previous = [
    { loc: "https://a/1", lastmod: "2026-01-01" },
    { loc: "https://a/2", lastmod: "2026-01-01" },
  ];
  const current = [{ loc: "https://a/2", lastmod: "2026-02-01" }, { loc: "https://a/3", lastmod: "2026-03-01" }];
  const merged = mergeSnapshotEntries(previous, current);
  assert.deepEqual(merged, [
    { loc: "https://a/1", lastmod: "2026-01-01" }, // not seen this walk — kept
    { loc: "https://a/2", lastmod: "2026-02-01" }, // seen — overwritten
    { loc: "https://a/3", lastmod: "2026-03-01" }, // new
  ]);
});

// ── walkSitemap: end-to-end orchestration over injected deps ───────────────────────────────────────────

const URLSET = (rows) =>
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows
    .map((r) => `<url><loc>${r.loc}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ""}</url>`)
    .join("")}</urlset>`;

function fakeDeps(pages, { previous = null } = {}) {
  const persisted = [];
  const changes = [];
  const snapshots = [];
  const deps = {
    async fetchBytes(url) {
      if (!(url in pages)) throw new Error(`HTTP 404 for ${url}`);
      return Buffer.from(pages[url], "utf8");
    },
    async getPreviousSnapshot() { return previous; },
    async saveSnapshot(entries) { snapshots.push(entries); },
    async persist(links) { persisted.push(...links); return { upserted: links.length, failed: 0 }; },
    async recordChange(changed) { changes.push(...changed); },
  };
  return { deps, persisted, changes, snapshots };
}

test("walkSitemap: robots.txt discovery, first walk, complete coverage — baseline saved, new locs persist", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([
      { loc: "https://reg.example/rule-1", lastmod: "2026-08-30" },
      { loc: "https://reg.example/rule-2", lastmod: null },
    ]),
  };
  const { deps, persisted, snapshots } = fakeDeps(pages);
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });

  assert.equal(r.ok, true);
  assert.equal(r.discoverySource, "robots");
  assert.equal(r.coverageComplete, true);
  assert.equal(r.baselineDeferred, false);
  assert.equal(r.diff.addedCount, 2);
  assert.equal(r.diff.changedCount, 0);
  assert.equal(r.diff.removedCount, 0);
  assert.equal(r.upserted, 2);
  assert.equal(persisted.length, 2);
  assert.equal(persisted.find((p) => p.url === "https://reg.example/rule-1").anchorText, "lastmod 2026-08-30");
  assert.equal(persisted.find((p) => p.url === "https://reg.example/rule-2").anchorText, null);
  assert.equal(snapshots.length, 1, "complete first-walk coverage writes the baseline");
  assert.equal(r.changeRecorded, false);
});

test("walkSitemap: no robots Sitemap: lines -> fallback candidates tried in order, stops at first parseable", () => {
  return (async () => {
    const pages = {
      "https://reg.example/robots.txt": "User-agent: *\nDisallow:\n",
      "https://reg.example/sitemap.xml": "<html>404</html>", // parses as 'unknown' -> not accepted
      "https://reg.example/sitemap_index.xml": URLSET([{ loc: "https://reg.example/x", lastmod: "2026-01-01" }]),
      // sitemap-index.xml deliberately absent — must never be reached
    };
    const { deps } = fakeDeps(pages);
    const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });
    assert.equal(r.ok, true);
    assert.equal(r.discoverySource, "fallback");
    assert.equal(r.sitemapsFetched.some((s) => s.url === "https://reg.example/sitemap-index.xml"), false);
    assert.equal(r.diff.addedCount, 1);
  })();
});

test("walkSitemap: no sitemap discoverable at all -> ok:false, never throws", async () => {
  const pages = { "https://reg.example/robots.txt": "User-agent: *\n" }; // every fallback 404s
  const { deps } = fakeDeps(pages);
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });
  assert.equal(r.ok, false);
  assert.match(r.error, /no sitemap discovered/);
});

test("walkSitemap: sitemapindex fan-out collects children's urls, bounded document cap reported (never silent), coverage incomplete", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap_index.xml\n",
    "https://reg.example/sitemap_index.xml": `<sitemapindex>
      <sitemap><loc>https://reg.example/s1.xml</loc></sitemap>
      <sitemap><loc>https://reg.example/s2.xml</loc></sitemap>
      <sitemap><loc>https://reg.example/s3.xml</loc></sitemap>
    </sitemapindex>`,
    "https://reg.example/s1.xml": URLSET([{ loc: "https://reg.example/a", lastmod: "2026-01-01" }]),
    "https://reg.example/s2.xml": URLSET([{ loc: "https://reg.example/b", lastmod: "2026-01-02" }]),
    "https://reg.example/s3.xml": URLSET([{ loc: "https://reg.example/c", lastmod: "2026-01-03" }]),
  };
  const { deps, snapshots } = fakeDeps(pages);

  // cap = 2 sitemap fetches total: the index itself (1) + exactly one child (2) — s2/s3 never fetched.
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/", maxSitemapFetches: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.sitemapsFetched.length, 2);
  assert.equal(r.sitemapsSkippedCap, 2, "the two un-dequeued children are reported, never silently dropped");
  assert.equal(r.diff.addedCount, 1);
  assert.equal(r.coverageComplete, false, "document budget exhausted -> partial coverage");
  assert.equal(r.baselineDeferred, true, "first walk, partial coverage -> baseline deferred");
  assert.equal(snapshots.length, 0, "deferred baseline writes nothing");

  // uncapped: all three children walked, coverage complete, baseline saved.
  const full = fakeDeps(pages);
  const rFull = await walkSitemap(full.deps, { baseUrl: "https://reg.example/" });
  assert.equal(rFull.sitemapsSkippedCap, 0);
  assert.equal(rFull.diff.addedCount, 3);
  assert.equal(rFull.coverageComplete, true);
  assert.equal(full.snapshots.length, 1);
  assert.equal(DEFAULT_MAX_SITEMAP_FETCHES >= 3, true);
});

test("walkSitemap: maxSitemapEntries caps raw entry accumulation independently of the document budget", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap_index.xml\n",
    "https://reg.example/sitemap_index.xml": `<sitemapindex>
      <sitemap><loc>https://reg.example/s1.xml</loc></sitemap>
      <sitemap><loc>https://reg.example/s2.xml</loc></sitemap>
    </sitemapindex>`,
    "https://reg.example/s1.xml": URLSET([
      { loc: "https://reg.example/a", lastmod: null },
      { loc: "https://reg.example/b", lastmod: null },
    ]),
    "https://reg.example/s2.xml": URLSET([{ loc: "https://reg.example/c", lastmod: null }]), // never reached
  };
  const { deps } = fakeDeps(pages);
  // budget generous enough for every document (10), but the entry cap (2) trips after s1 alone.
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/", maxSitemapFetches: 10, maxSitemapEntries: 2 });
  assert.equal(r.entriesCapped, true);
  assert.equal(r.sitemapsFetched.some((s) => s.url === "https://reg.example/s2.xml"), false, "s2 never fetched — entry budget stopped the walk first");
  assert.equal(r.urlCount, 2);
  assert.equal(r.coverageComplete, false);
});

test("walkSitemap: path scoping keeps only entries under the source's own registered path", async () => {
  const pages = {
    "https://reg.example/section/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([
      { loc: "https://reg.example/section/a", lastmod: "2026-01-01" },
      { loc: "https://reg.example/section/sub/b", lastmod: "2026-01-01" },
      { loc: "https://reg.example/other/c", lastmod: "2026-01-01" },
    ]),
  };
  const { deps, persisted } = fakeDeps(pages);
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/section" });
  assert.equal(r.urlCount, 2);
  assert.equal(r.scopedOutCount, 1);
  assert.deepEqual(persisted.map((p) => p.url).sort(), [
    "https://reg.example/section/a",
    "https://reg.example/section/sub/b",
  ]);
});

test("walkSitemap: changed lastmod on a known loc -> recordChange carries loc + both lastmods, coverage complete -> removed reported", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([
      { loc: "https://reg.example/rule-1", lastmod: "2026-09-01" }, // changed vs previous
      { loc: "https://reg.example/rule-2", lastmod: "2026-08-01" }, // unchanged
      { loc: "https://reg.example/rule-3", lastmod: "2026-09-04" }, // new
      // https://reg.example/rule-0 dropped -> removed
    ]),
  };
  const previous = [
    { loc: "https://reg.example/rule-1", lastmod: "2026-08-15" },
    { loc: "https://reg.example/rule-2", lastmod: "2026-08-01" },
    { loc: "https://reg.example/rule-0", lastmod: "2026-07-01" },
  ];
  const { deps, persisted, changes, snapshots } = fakeDeps(pages, { previous });
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });

  assert.equal(r.coverageComplete, true);
  assert.equal(r.diff.addedCount, 1);
  assert.equal(r.diff.changedCount, 1);
  assert.equal(r.diff.removedCount, 1);
  assert.deepEqual(r.removedLocs, ["https://reg.example/rule-0"]);
  assert.equal(r.removedSuppressed, false);
  assert.equal(r.changeRecorded, true);
  assert.deepEqual(changes, [{ loc: "https://reg.example/rule-1", previousLastmod: "2026-08-15", currentLastmod: "2026-09-01" }]);
  // only the NEW loc goes to the census ledger — a changed lastmod is not re-announced as a new candidate.
  assert.deepEqual(persisted.map((p) => p.url), ["https://reg.example/rule-3"]);
  // complete coverage on a later walk -> the snapshot is REPLACED, not merged.
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0].map((e) => e.loc).sort(), [
    "https://reg.example/rule-1", "https://reg.example/rule-2", "https://reg.example/rule-3",
  ]);
});

test("walkSitemap: partial coverage on a LATER walk -> removed suppressed, snapshot MERGED not replaced", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap_index.xml\n",
    "https://reg.example/sitemap_index.xml": `<sitemapindex>
      <sitemap><loc>https://reg.example/s1.xml</loc></sitemap>
      <sitemap><loc>https://reg.example/s2.xml</loc></sitemap>
    </sitemapindex>`,
    "https://reg.example/s1.xml": URLSET([{ loc: "https://reg.example/a", lastmod: "2026-02-01" }]), // changed
    // s2.xml deliberately 404s — partial coverage
  };
  const previous = [
    { loc: "https://reg.example/a", lastmod: "2026-01-01" },
    { loc: "https://reg.example/b", lastmod: "2026-01-01" }, // only in s2, unreachable this walk
  ];
  const { deps, snapshots } = fakeDeps(pages, { previous });
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/", maxSitemapFetches: 10 });
  assert.equal(r.coverageComplete, false, "s2.xml errored -> partial");
  assert.equal(r.removedLocs.length, 0, "b was not truly removed — s2 just wasn't reached; never reported");
  assert.equal(r.removedSuppressed, true);
  assert.equal(snapshots.length, 1, "a later walk still writes a snapshot — merged, not deferred");
  const savedByLoc = Object.fromEntries(snapshots[0].map((e) => [e.loc, e.lastmod]));
  assert.equal(savedByLoc["https://reg.example/a"], "2026-02-01", "seen this walk — overwritten");
  assert.equal(savedByLoc["https://reg.example/b"], "2026-01-01", "not seen this walk — kept from prior snapshot");
});

test("walkSitemap: no changes at all -> recordChange never called (an empty change list is not an effect)", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([{ loc: "https://reg.example/rule-1", lastmod: "2026-08-01" }]),
  };
  const previous = [{ loc: "https://reg.example/rule-1", lastmod: "2026-08-01" }];
  let recordChangeCalls = 0;
  const { deps, persisted } = fakeDeps(pages, { previous });
  deps.recordChange = async () => { recordChangeCalls++; };
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });
  assert.equal(r.changeRecorded, false);
  assert.equal(recordChangeCalls, 0);
  assert.equal(persisted.length, 0);
});

test("walkSitemap: dry-mode contract — an injected persist/saveSnapshot/recordChange that only counts writes nothing", async () => {
  // Mirrors run-source-sweep.mjs's own dry-mode `persist` closure: the pure walker always CALLS its
  // injected effects; whether they write anywhere is entirely the live binding's decision.
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([
      { loc: "https://reg.example/rule-1", lastmod: "2026-09-02" },
      { loc: "https://reg.example/rule-2", lastmod: "2026-08-01" },
    ]),
  };
  const previous = [{ loc: "https://reg.example/rule-1", lastmod: "2026-08-15" }];
  let persistCalls = 0, saveSnapshotCalls = 0, recordChangeCalls = 0;
  const deps = {
    async fetchBytes(url) {
      if (!(url in pages)) throw new Error(`HTTP 404 for ${url}`);
      return Buffer.from(pages[url], "utf8");
    },
    async getPreviousSnapshot() { return previous; },
    async saveSnapshot() { saveSnapshotCalls++; /* dry: counts, writes nothing */ },
    async persist(links) { persistCalls++; return { upserted: 0, failed: 0 }; /* dry: counts the plan */ },
    async recordChange() { recordChangeCalls++; /* dry: counts, writes nothing */ },
  };
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/" });
  assert.equal(r.ok, true);
  assert.equal(r.upserted, 0, "dry mode's injected persist reports 0 written, per its own return value");
  assert.equal(persistCalls, 1);
  assert.equal(saveSnapshotCalls, 1);
  assert.equal(recordChangeCalls, 1);
});

test("walkSitemap: --limit caps the diffed/persisted URL-entry count, distinct from the walk-time budgets, marks coverage incomplete", async () => {
  const pages = {
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([
      { loc: "https://reg.example/a", lastmod: "2026-01-01" },
      { loc: "https://reg.example/b", lastmod: "2026-01-01" },
      { loc: "https://reg.example/c", lastmod: "2026-01-01" },
    ]),
  };
  const { deps } = fakeDeps(pages);
  const r = await walkSitemap(deps, { baseUrl: "https://reg.example/", limit: 2 });
  assert.equal(r.urlCount, 2);
  assert.equal(r.urlsOverLimit, 1);
  assert.equal(r.diff.addedCount, 2);
  assert.equal(r.coverageComplete, false);
});

// ── feed discovery ───────────────────────────────────────────────────────────────────────────────────────

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title></channel></rss>`;

function fakeFetchDeps(pages) {
  return {
    async fetchBytes(url) {
      if (!(url in pages)) throw new Error(`HTTP 404 for ${url}`);
      return Buffer.from(pages[url], "utf8");
    },
  };
}

test("probeIsFeed: a feed document returns its text; a non-feed or a fetch failure returns null", async () => {
  const deps = fakeFetchDeps({ "https://x/feed.xml": RSS, "https://x/page.html": "<html></html>" });
  assert.equal(await probeIsFeed(deps, "https://x/feed.xml", 1_000_000), RSS);
  assert.equal(await probeIsFeed(deps, "https://x/page.html", 1_000_000), null);
  assert.equal(await probeIsFeed(deps, "https://x/missing", 1_000_000), null);
});

test("discoverFeed: the source URL itself is a feed document", async () => {
  const deps = fakeFetchDeps({ "https://x.example/": RSS });
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.deepEqual(r, { feedUrl: "https://x.example/", discoverySource: "source-is-feed", homepageError: null });
});

test("discoverFeed: a <link rel=alternate> tag on the homepage wins over a bare candidate path", async () => {
  const home = `<html><head><link rel="alternate" type="application/rss+xml" href="/press/feed.xml"></head></html>`;
  const deps = fakeFetchDeps({
    "https://x.example/": home,
    "https://x.example/press/feed.xml": RSS,
    "https://x.example/feed": RSS, // also a real feed, but the <link> tag is tried first
  });
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r.feedUrl, "https://x.example/press/feed.xml");
  assert.equal(r.discoverySource, "link-alternate");
});

test("discoverFeed: falls through to the operator's named candidate paths when no <link> tag resolves", async () => {
  const home = `<html><body>no feed link here</body></html>`;
  const deps = fakeFetchDeps({ "https://x.example/": home, "https://x.example/rss.xml": RSS });
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r.feedUrl, "https://x.example/rss.xml");
  assert.equal(r.discoverySource, "candidate-path");
});

test("discoverFeed: a homepage fetch failure is non-fatal — candidate probing still runs, the failure is still reported", async () => {
  const deps = fakeFetchDeps({ "https://x.example/atom.xml": RSS }); // homepage itself 404s
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r.feedUrl, "https://x.example/atom.xml");
  assert.match(r.homepageError, /HTTP 404/, "the homepage failure is carried on the result, not swallowed");
});

test("discoverFeed: no feed found anywhere -> null (caller proceeds to sitemap discovery)", async () => {
  const deps = fakeFetchDeps({ "https://x.example/": "<html>nothing here</html>" });
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r, null);
});

test("discoverFeed: response-byte bound applies to the homepage/candidate probes too", async () => {
  const deps = { async fetchBytes() { return Buffer.alloc(20_000_000); } }; // over DEFAULT_MAX_FEED_RESPONSE_BYTES
  const r = await discoverFeed(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r, null, "oversize homepage -> homepageError set, no feed; candidates also oversize -> none found");
});

// ── walkSource: the top-level discovery-order dispatcher ───────────────────────────────────────────────

test("walkSource: a feed is found -> returns {kind:'feed', ...} WITHOUT walking any sitemap", async () => {
  let sitemapProbed = false;
  const deps = {
    async fetchBytes(url) {
      if (url === "https://x.example/") return Buffer.from(RSS, "utf8");
      sitemapProbed = true;
      throw new Error(`unexpected fetch: ${url}`);
    },
    getPreviousSnapshot: async () => null,
    saveSnapshot: async () => {},
    persist: async (l) => ({ upserted: l.length, failed: 0 }),
    recordChange: async () => {},
  };
  const r = await walkSource(deps, { sourceUrl: "https://x.example/" });
  assert.equal(r.kind, "feed");
  assert.equal(r.feedUrl, "https://x.example/");
  assert.equal(sitemapProbed, false, "no sitemap discovery happens once a feed is found");
});

test("walkSource: no feed anywhere -> falls through to the sitemap walk, returns {kind:'sitemap', ...}", async () => {
  const pages = {
    "https://reg.example/": "<html>no feed link</html>",
    // every feed candidate path 404s (not in `pages`)
    "https://reg.example/robots.txt": "Sitemap: https://reg.example/sitemap.xml\n",
    "https://reg.example/sitemap.xml": URLSET([{ loc: "https://reg.example/a", lastmod: "2026-01-01" }]),
  };
  const { deps } = fakeDeps(pages);
  const r = await walkSource(deps, { sourceUrl: "https://reg.example/" });
  assert.equal(r.kind, "sitemap");
  assert.equal(r.ok, true);
  assert.equal(r.diff.addedCount, 1);
});
