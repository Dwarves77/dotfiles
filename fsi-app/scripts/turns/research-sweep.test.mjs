// research-sweep.test.mjs — proves arg parsing, registry-subset selection, link discovery/dedup/
// normalization, the screen contract (`provenance: "registry"`, `basis: <registry role>`), the
// congruence skip for source-incongruent research_finding candidates, and sweepOneSource's per-document
// outcome shaping against fake `fetchText` deps (no network, no DB). Importing this module never invokes
// main() (IS_MAIN guard).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  selectResearchSources,
  looksLikeFeedXml,
  discoverCandidateLinks,
  normalizeUrlKey,
  filterNewLinks,
  stripHtmlToText,
  extractHtmlTitle,
  titleFromUrl,
  screenForSource,
  censusRowFor,
  sweepOneSource,
  RESEARCH_SWEEP_GOVERNING_FILES,
  RESEARCH_SOURCE_SELECTION_QUERY,
} from "./research-sweep.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --mode is required", () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: unknown --mode value is refused", () => {
  const r = parseArgs(["--mode", "sideways"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: a valid dry run parses with defaults", () => {
  const r = parseArgs(["--mode", "dry"]);
  assert.equal(r.ok, true);
  assert.equal(r.mode, "dry");
  assert.equal(r.maxSources, 25);
  assert.equal(r.maxDocsPerSource, 10);
  assert.equal(r.seenUrlsFile, null);
});

test("parseArgs: --max-sources / --max-docs-per-source must be positive", () => {
  assert.equal(parseArgs(["--mode", "dry", "--max-sources", "0"]).ok, false);
  assert.equal(parseArgs(["--mode", "dry", "--max-docs-per-source", "-1"]).ok, false);
  assert.equal(parseArgs(["--mode", "dry", "--max-sources", "not-a-number"]).ok, false);
});

test("parseArgs: apply mode with explicit overrides", () => {
  const r = parseArgs([
    "--mode", "apply", "--max-sources", "5", "--max-docs-per-source", "2",
    "--seen-urls-file", "/tmp/seen.json", "--out-dir", "/tmp/out", "--harness-runs-dir", "/tmp/hr",
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.maxSources, 5);
  assert.equal(r.maxDocsPerSource, 2);
  assert.equal(r.seenUrlsFile, "/tmp/seen.json");
  assert.equal(r.outDir, "/tmp/out");
  assert.equal(r.harnessRunsDir, "/tmp/hr");
});

// ── selectResearchSources ────────────────────────────────────────────────────────────────────────

const SOURCES_ROWS = [
  { id: "s1", url: "https://b-institute.org", category: "research", status: "active", source_role: "academic_research" },
  { id: "s2", url: "https://a-thinktank.org", category: "research", status: "active", source_role: "intergovernmental_body" },
  { id: "s3", url: "https://retired-institute.org", category: "research", status: "inactive", source_role: "academic_research" },
  { id: "s4", url: "https://a-vendor.example", category: "market_news", status: "active", source_role: "industry_association" },
  { id: "s5", url: "https://loadstar.example", category: "research", status: "active", source_role: "trade_press" },
  { id: "s6", url: null, category: "research", status: "active", source_role: "academic_research" },
];

test("selectResearchSources: filters to category=research AND status=active, drops rows with no url", () => {
  const rows = selectResearchSources(SOURCES_ROWS);
  assert.deepEqual(rows.map((r) => r.id), ["s2", "s1", "s5"]); // sorted by url
});

test("selectResearchSources: name-excepted trade_press stays in the subset (category='research' governs, not role)", () => {
  const rows = selectResearchSources(SOURCES_ROWS);
  assert.ok(rows.some((r) => r.id === "s5" && r.source_role === "trade_press"));
});

test("selectResearchSources: maxSources bounds the result, never silently drops without a caller-visible count", () => {
  const rows = selectResearchSources(SOURCES_ROWS, { maxSources: 2 });
  assert.equal(rows.length, 2);
});

test("selectResearchSources: non-array input yields an empty result, never throws", () => {
  assert.deepEqual(selectResearchSources(null), []);
  assert.deepEqual(selectResearchSources(undefined), []);
});

// ── looksLikeFeedXml / discoverCandidateLinks ───────────────────────────────────────────────────

test("looksLikeFeedXml: recognizes rss/atom roots, rejects plain HTML", () => {
  assert.equal(looksLikeFeedXml("<rss version=\"2.0\"><channel></channel></rss>"), true);
  assert.equal(looksLikeFeedXml("<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>"), true);
  assert.equal(looksLikeFeedXml("<html><body>hi</body></html>"), false);
  assert.equal(looksLikeFeedXml(""), false);
});

test("discoverCandidateLinks: feed body -> parseFeedEntries, HTML body -> extractPortalLinks", () => {
  const feedXml =
    '<rss><channel><item><title>Guidance report</title>' +
    '<link>https://example.org/reports/guidance-report</link></item></channel></rss>';
  const feedLinks = discoverCandidateLinks(feedXml, "https://example.org");
  assert.ok(feedLinks.some((l) => l.url === "https://example.org/reports/guidance-report"));

  const html =
    '<html><body><a href="/reports/emissions-guidance">Emissions guidance report</a></body></html>';
  const htmlLinks = discoverCandidateLinks(html, "https://example.org");
  assert.ok(htmlLinks.some((l) => l.url === "https://example.org/reports/emissions-guidance"));
});

// ── normalizeUrlKey / filterNewLinks ────────────────────────────────────────────────────────────

test("normalizeUrlKey: trailing slash, hash and host case do not break exact matching", () => {
  assert.equal(normalizeUrlKey("https://Example.ORG/reports/x/"), normalizeUrlKey("https://example.org/reports/x"));
  assert.equal(normalizeUrlKey("https://example.org/reports/x#section"), normalizeUrlKey("https://example.org/reports/x"));
  assert.notEqual(normalizeUrlKey("https://example.org/reports/x"), normalizeUrlKey("https://example.org/reports/y"));
});

test("normalizeUrlKey: an unparseable URL falls back to a trailing-slash-stripped string, never throws", () => {
  assert.equal(normalizeUrlKey("not a url"), "not a url");
});

test("filterNewLinks: drops links already present in seenUrlKeys (by normalized key)", () => {
  const links = [{ url: "https://example.org/a" }, { url: "https://example.org/b/" }, { url: "https://example.org/c" }];
  const seen = new Set([normalizeUrlKey("https://example.org/a"), normalizeUrlKey("https://example.org/b")]);
  const fresh = filterNewLinks(links, seen);
  assert.deepEqual(fresh.map((l) => l.url), ["https://example.org/c"]);
});

// ── stripHtmlToText / extractHtmlTitle / titleFromUrl ───────────────────────────────────────────

test("stripHtmlToText: strips script/style, tags, decodes entities, collapses whitespace", () => {
  const html = "<html><head><style>.x{color:red}</style><script>var x=1;</script></head>" +
    "<body><h1>A &amp; B</h1><p>Line one.</p>\n\n\n<p>Line two.</p></body></html>";
  const text = stripHtmlToText(html);
  assert.doesNotMatch(text, /color:red/);
  assert.doesNotMatch(text, /var x=1/);
  assert.match(text, /A & B/);
  assert.match(text, /Line one\.\s*Line two\./s);
});

test("extractHtmlTitle: returns the <title> text, normalized; null when absent", () => {
  assert.equal(extractHtmlTitle("<html><head><title>  Freight Report 2026  </title></head></html>"), "Freight Report 2026");
  assert.equal(extractHtmlTitle("<html><head></head></html>"), null);
  assert.equal(extractHtmlTitle(""), null);
});

test("titleFromUrl: humanizes the last path segment; falls back to host (extension-stripped); never throws on garbage", () => {
  assert.equal(titleFromUrl("https://example.org/reports/freight-decarbonisation-2026.pdf"), "freight decarbonisation 2026");
  // No path segment -> falls back to u.host, then the SAME trailing-extension strip runs on it (an
  // existing titleFromUrl quirk, unchanged here: ".org" reads as a stripped extension too).
  assert.equal(titleFromUrl("https://example.org/"), "example");
  assert.equal(titleFromUrl("not a url"), "not a url");
});

// ── screenForSource (docs/plans/wave2-lanes-2026-09-02.md's exact research-source screen contract) ──

test('screenForSource: verdict on_vertical, provenance "registry", basis is the source\'s own registry role', () => {
  const s = screenForSource({ id: "s1", url: "https://x", source_role: "academic_research", category: "research" });
  assert.deepEqual(s, { verdict: "on_vertical", provenance: "registry", basis: "academic_research" });
});

test("screenForSource: name-excepted sources carry their OWN true source_role, not the exception category", () => {
  const s = screenForSource({ id: "s5", url: "https://loadstar.example", source_role: "trade_press", category: "research" });
  assert.equal(s.basis, "trade_press");
});

test("screenForSource: falls back to category, then 'unspecified', never throws on a sparse source row", () => {
  assert.equal(screenForSource({ id: "s6", url: "https://x", category: "research" }).basis, "research");
  assert.equal(screenForSource({ id: "s7", url: "https://x" }).basis, "unspecified");
});

// ── censusRowFor ─────────────────────────────────────────────────────────────────────────────────

test("censusRowFor: shape matches run-mint-batch.mjs's --census-rows contract, carries the screen verdict through", () => {
  const source = { id: "s1", url: "https://x.org", base_tier: 3, tier_override: null, status: "active" };
  const screen = { verdict: "on_vertical", provenance: "registry", basis: "academic_research" };
  const row = censusRowFor({ source, docUrl: "https://x.org/reports/y", title: "Y", capturedText: "hello world", screen });
  assert.equal(row.row_id, "s1:https://x.org/reports/y");
  assert.equal(row.item_type, "research_finding");
  assert.equal(row.source_url, "https://x.org/reports/y");
  assert.deepEqual(row.screen, screen);
  assert.equal(row.fetched_length, "hello world".length);
  assert.equal(row.source.id, "s1");
});

// ── sweepOneSource ───────────────────────────────────────────────────────────────────────────────

const SOURCE = {
  id: "src-1", url: "https://example-institute.org/research",
  name: "Example Institute", base_tier: 4, tier_override: null, status: "active",
  source_role: "academic_research", category: "research",
};

const REQUIRED_SLOTS = ["decision_relevance", "does_not_resolve", "finding", "methodology_limits"];

const LISTING_HTML =
  '<html><body>' +
  '<a href="/reports/freight-decarbonisation-guidance">Freight decarbonisation guidance report</a>' +
  '<a href="/press-releases/new-emissions-guidance">New emissions guidance announcement</a>' +
  '<a href="/reports/failed-fetch-guidance">Fetch-failure guidance report</a>' +
  '<a href="/reports/blocked-guidance">Blocked guidance report</a>' +
  '</body></html>';

const RICH_DOC_HTML =
  '<html><head><title>Freight decarbonisation guidance report</title></head><body>' +
  '<p>This report finds that electric truck adoption in the EU grew 18% year over year.</p>' +
  '<p>Limitations of this study include a sample restricted to large fleets.</p>' +
  '<p>Policymakers should treat the depot-power bottleneck as the binding constraint.</p>' +
  '<p>This report does not resolve whether hydrogen refuelling reaches cost parity.</p>' +
  '</body></html>';

function fakeDeps({ errorUrl = null, failUrl = null } = {}) {
  return {
    async fetchText(url) {
      if (url === SOURCE.url) return LISTING_HTML;
      if (url === failUrl) throw new Error("ECONNRESET");
      if (url === errorUrl) return "Access Denied — 403 Forbidden";
      return RICH_DOC_HTML;
    },
  };
}

test("sweepOneSource: listing fetch failure -> ok:false, nothing built, nothing marked seen", async () => {
  const deps = { fetchText: async () => { throw new Error("ETIMEDOUT"); } };
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  assert.equal(result.ok, false);
  assert.match(result.error, /listing fetch failed/);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.newlySeenUrls, []);
});

test("sweepOneSource: error-body listing page -> ok:false, inconclusive (not an empty listing)", async () => {
  const deps = { fetchText: async () => "Access Denied — 403 Forbidden" };
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  assert.equal(result.ok, false);
  assert.match(result.error, /error-body gate/);
});

test("sweepOneSource: a press-release-shaped candidate is skipped as source-incongruent (congruence 1b) and marked seen", async () => {
  const deps = fakeDeps();
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  const pressDoc = result.perDoc.find((d) => d.id.includes("press-releases"));
  assert.ok(pressDoc, "expected the press-releases candidate to be discovered");
  assert.equal(pressDoc.outcome, "skipped_incongruent_source");
  assert.ok(result.newlySeenUrls.includes(pressDoc.id));
});

test("sweepOneSource: a fetch failure on one document is recorded and NOT marked seen (eligible for retry)", async () => {
  const failUrl = "https://example-institute.org/reports/failed-fetch-guidance";
  const deps = fakeDeps({ failUrl });
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  const failed = result.perDoc.find((d) => d.id === failUrl);
  assert.ok(failed);
  assert.equal(failed.outcome, "fetch_failed");
  assert.ok(!result.newlySeenUrls.includes(failUrl));
});

test("sweepOneSource: an error-body document is recorded and NOT marked seen", async () => {
  const errorUrl = "https://example-institute.org/reports/blocked-guidance";
  const deps = fakeDeps({ errorUrl });
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  const blocked = result.perDoc.find((d) => d.id === errorUrl);
  assert.ok(blocked);
  assert.equal(blocked.outcome, "error_body");
  assert.ok(!result.newlySeenUrls.includes(errorUrl));
});

test("sweepOneSource: a congruent, fetchable document is built, screened (provenance: registry), and validated", async () => {
  const deps = fakeDeps();
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  const goodUrl = "https://example-institute.org/reports/freight-decarbonisation-guidance";
  const built = result.perDoc.find((d) => d.id === goodUrl);
  assert.ok(built, "expected the freight-decarbonisation-guidance candidate to be built");
  assert.ok(result.newlySeenUrls.includes(goodUrl));
  assert.ok(result.rows.some((r) => r.source_url === goodUrl));
  const payload = result.payloads.find((p) => p.item.source_url === goodUrl);
  assert.ok(payload);
  assert.equal(payload.screen.provenance, "registry");
  assert.equal(payload.screen.basis, "academic_research");
  // validate-mint-payload.mjs accepts provenance "registry" since the coordinator's allowlist change
  // (2026-09-03); a congruent research document now builds VALID end to end.
  assert.equal(built.outcome, "built_valid", built.verdict);
  assert.doesNotMatch(String(built.verdict), /screen_verdict_missing/);
});

test("sweepOneSource: maxDocsPerSource bounds how many NEW candidates are processed", async () => {
  const deps = fakeDeps();
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: new Set(), maxDocsPerSource: 1, requiredSlots: REQUIRED_SLOTS });
  assert.equal(result.newCandidates, 1);
  assert.equal(result.perDoc.length, 1);
});

test("sweepOneSource: already-seen candidates are excluded before congruence/build, never re-processed", async () => {
  const deps = fakeDeps();
  const goodUrl = "https://example-institute.org/reports/freight-decarbonisation-guidance";
  const seen = new Set([normalizeUrlKey(goodUrl)]);
  const result = await sweepOneSource(deps, { source: SOURCE, seenUrlKeys: seen, maxDocsPerSource: 10, requiredSlots: REQUIRED_SLOTS });
  assert.ok(!result.perDoc.some((d) => d.id === goodUrl));
});

// ── GOVERNING_FILES / query documentation sanity ────────────────────────────────────────────────

test("RESEARCH_SWEEP_GOVERNING_FILES names this driver plus the research-grade payload builder", () => {
  assert.deepEqual(RESEARCH_SWEEP_GOVERNING_FILES, [
    "scripts/turns/research-sweep.mjs",
    "src/lib/intake/record-facts-research.mjs",
  ]);
});

test("RESEARCH_SOURCE_SELECTION_QUERY states the exact registry-subset query", () => {
  assert.equal(RESEARCH_SOURCE_SELECTION_QUERY, "sources.category = 'research' AND sources.status = 'active'");
});
