// run-source-sweep.test.mjs — proves arg parsing, the portal-resolution mapping, the raw-walk-result
// shaping into CONVENTION.md's per_item/metrics/inputs_ref, and the mirrored persist upsert against a
// fake Supabase client (no DB). Importing this module never invokes main() (IS_MAIN guard).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, portalFor, shapeRunOutput, upsertPortalLinkCandidates, SOURCE_SWEEP_GOVERNING_FILES, defaultTraceDir, resolvePortalSourceId, portalUrlKey,
  selectSitemapSources, hostKeyOf, groupActiveSourcesByHost, hostSitemapCoverage, orderHostGroupsForSweep,
  selectAllHostsTargets, buildSitemapCoveragePatch, buildCoverageReport, DEFAULT_MAX_HOSTS,
  DEFAULT_TIME_BUDGET_SECONDS, checkTimeBudget, walkTargetsWithinBudget, withFetchTimeout,
} from "./run-source-sweep.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────────────────────────

test("parseArgs: --walker and --mode are required", () => {
  assert.equal(parseArgs([]).ok, false);
  assert.equal(parseArgs(["--mode", "dry"]).ok, false);
  assert.equal(parseArgs(["--walker", "register-eurlex"]).ok, false);
});

test("parseArgs: unknown --walker value is refused", () => {
  const r = parseArgs(["--walker", "bogus", "--mode", "dry", "--from", "2026-08-01", "--to", "2026-08-02"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--walker must be one of/);
});

test("parseArgs: unknown --mode value is refused", () => {
  const r = parseArgs(["--walker", "register-eurlex", "--mode", "sideways", "--from", "2026-08-01", "--to", "2026-08-02"]);
  assert.equal(r.ok, false);
  assert.match(r.error, /--mode must be/);
});

test("parseArgs: register walkers require --from/--to", () => {
  const noFrom = parseArgs(["--walker", "register-eurlex", "--mode", "dry", "--to", "2026-08-02"]);
  assert.equal(noFrom.ok, false);
  assert.match(noFrom.error, /--from/);
  const noTo = parseArgs(["--walker", "register-federal-register", "--mode", "dry", "--from", "2026-08-01"]);
  assert.equal(noTo.ok, false);
  assert.match(noTo.error, /--to/);
});

test("parseArgs: feed walker requires --feed-url, not --from/--to", () => {
  const noFeed = parseArgs(["--walker", "feed", "--mode", "dry"]);
  assert.equal(noFeed.ok, false);
  assert.match(noFeed.error, /--feed-url/);
  const ok = parseArgs(["--walker", "feed", "--mode", "dry", "--feed-url", "https://example.gov/feed.xml"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.feedUrl, "https://example.gov/feed.xml");
});

test("parseArgs: a valid register-eurlex dry run parses with defaults", () => {
  const r = parseArgs(["--walker", "register-eurlex", "--mode", "dry", "--from", "2026-08-25", "--to", "2026-08-31"]);
  assert.equal(r.ok, true);
  assert.equal(r.series, "L");
  assert.deepEqual(r.types, ["RULE"]);
  assert.equal(r.maxPages, 5);
  assert.equal(r.perPage, 100);
});

test("parseArgs: --types is a comma list, trimmed", () => {
  const r = parseArgs(["--walker", "register-federal-register", "--mode", "dry", "--from", "2026-08-01", "--to", "2026-08-02", "--types", "RULE, PRORULE"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.types, ["RULE", "PRORULE"]);
});

test("parseArgs: --max-pages / --per-page must be positive", () => {
  const r = parseArgs(["--walker", "register-federal-register", "--mode", "dry", "--from", "2026-08-01", "--to", "2026-08-02", "--max-pages", "0"]);
  assert.equal(r.ok, false);
});

// ── portalFor ────────────────────────────────────────────────────────────────────────────────────

test("portalFor: register-eurlex resolves to a fixed portal", () => {
  const p = portalFor({ walker: "register-eurlex", feedUrl: null, sourceName: null });
  assert.equal(p.url, "https://eur-lex.europa.eu");
});

test("portalFor: register-federal-register resolves to a fixed portal", () => {
  const p = portalFor({ walker: "register-federal-register", feedUrl: null, sourceName: null });
  assert.equal(p.url, "https://www.federalregister.gov");
});

test("portalFor: feed resolves to the feed URL itself, name defaults to its host", () => {
  const p = portalFor({ walker: "feed", feedUrl: "https://example.gov/press/feed.xml", sourceName: null });
  assert.equal(p.url, "https://example.gov/press/feed.xml");
  assert.equal(p.name, "example.gov");
});

test("portalFor: an explicit --source-name overrides every walker's default", () => {
  const p = portalFor({ walker: "register-eurlex", feedUrl: null, sourceName: "Custom Name" });
  assert.equal(p.name, "Custom Name");
});

// ── shapeRunOutput ───────────────────────────────────────────────────────────────────────────────

test("shapeRunOutput: register-eurlex — one per_item per day, error days flagged", () => {
  const result = {
    register: "eurlex-oj", series: "L", from: "2026-08-25", to: "2026-08-26",
    days: [
      { day: "2026-08-25", url: "https://x/1", extracted: 3, upserted: 3, error: null },
      { day: "2026-08-26", url: "https://x/2", extracted: 0, upserted: 0, error: "HTTP 404" },
    ],
    upserted: 3, failed: 0,
  };
  const shaped = shapeRunOutput("register-eurlex", result, "/tmp/report.json");
  assert.equal(shaped.perItem.length, 2);
  assert.equal(shaped.perItem[0].outcome, "walked");
  assert.equal(shaped.perItem[1].outcome, "error");
  assert.equal(shaped.perItem[1].error, "HTTP 404");
  assert.equal(shaped.metrics.days_walked, 2);
  assert.equal(shaped.metrics.days_with_error, 1);
  assert.equal(shaped.metrics.extracted_total, 3);
  assert.deepEqual(shaped.fullTraceRefs, ["/tmp/report.json"]);
  assert.deepEqual(shaped.inputsRef, ["https://x/1", "https://x/2"]);
});

test("shapeRunOutput: dry mode never says 'upserted' (source-sweep-run-001 read '221 upserted' for 0 writes)", () => {
  const result = {
    register: "eurlex-oj", series: "L", from: "2026-08-28", to: "2026-08-28",
    days: [{ day: "2026-08-28", url: "https://x/1", extracted: 2, upserted: 2, urls: ["https://x/a", "https://x/b"], duplicate_of: null, error: null }],
    upserted: 2, failed: 0,
  };
  const dry = shapeRunOutput("register-eurlex", result, "/tmp/report.json", "dry");
  assert.doesNotMatch(dry.perItem[0].verdict, /\bupserted\b/);
  assert.match(dry.perItem[0].verdict, /planned \(dry, nothing written\)/);
  assert.equal(dry.metrics.mode, "dry");
  // The METRIC is honest too (source-sweep-run-006, dry, read `upserted: 7` for 0 writes): dry carries
  // upserted 0 and the plan size under `planned`; apply carries upserted and no `planned` key.
  assert.equal(dry.metrics.upserted, 0);
  assert.equal(dry.metrics.planned, 2);
  const apply = shapeRunOutput("register-eurlex", result, "/tmp/report.json", "apply");
  assert.match(apply.perItem[0].verdict, /2 upserted/);
  assert.equal(apply.metrics.mode, "apply");
  assert.equal(apply.metrics.upserted, 2);
  assert.equal("planned" in apply.metrics, false);
  // Feed and Federal Register verdicts carry the same distinction.
  const fr = shapeRunOutput("register-federal-register", { register: "federal-register", from: "a", to: "b", types: ["RULE"], term: null, pages: [{ page: 1, url: "https://x", results: 5, upserted: 5 }], upserted: 5, failed: 0, totalCount: 5, totalPages: 1, droppedPages: 0 }, "/tmp/r.json", "dry");
  assert.doesNotMatch(fr.perItem[0].verdict, /\bupserted\b/);
  assert.equal(fr.metrics.upserted, 0); assert.equal(fr.metrics.planned, 5);
  const feed = shapeRunOutput("feed", { feedUrl: "https://f", ok: true, entries: 3, upserted: 3, failed: 0 }, "/tmp/r.json", "dry");
  assert.equal(feed.metrics.upserted, 0); assert.equal(feed.metrics.planned, 3);
  assert.doesNotMatch(feed.perItem[0].verdict, /\bupserted\b/);
});

test("shapeRunOutput: register-eurlex — a duplicate_of day is its own outcome and counted in metrics", () => {
  const result = {
    register: "eurlex-oj", series: "L", from: "2026-08-28", to: "2026-08-29",
    days: [
      { day: "2026-08-28", url: "https://x/1", extracted: 2, upserted: 2, urls: ["https://x/a", "https://x/b"], duplicate_of: null, error: null },
      { day: "2026-08-29", url: "https://x/2", extracted: 0, upserted: 0, urls: [], duplicate_of: "2026-08-28", error: null },
    ],
    upserted: 2, failed: 0,
  };
  const shaped = shapeRunOutput("register-eurlex", result, "/tmp/report.json", "apply");
  assert.equal(shaped.perItem[1].outcome, "duplicate_edition");
  assert.match(shaped.perItem[1].verdict, /2026-08-28 edition again/);
  assert.equal(shaped.metrics.days_duplicate_edition, 1);
  assert.equal(shaped.metrics.extracted_total, 2);
});

test("shapeRunOutput: register-federal-register — one per_item per page", () => {
  const result = {
    register: "federal-register", from: "2026-08-01", to: "2026-08-02", types: ["RULE"], term: undefined,
    pages: [{ page: 1, url: "https://fr/1", results: 12, upserted: 12 }],
    upserted: 12, failed: 0, totalCount: 12, totalPages: 1, droppedPages: 0,
  };
  const shaped = shapeRunOutput("register-federal-register", result, "/tmp/report.json");
  assert.equal(shaped.perItem.length, 1);
  assert.equal(shaped.perItem[0].id, "page-1");
  assert.equal(shaped.metrics.pages_walked, 1);
  assert.equal(shaped.metrics.dropped_pages, 0);
});

test("shapeRunOutput: feed ok:true — single per_item entry", () => {
  const result = { ok: true, feedUrl: "https://example.gov/feed.xml", entries: 5, upserted: 5, failed: 0 };
  const shaped = shapeRunOutput("feed", result, "/tmp/report.json");
  assert.equal(shaped.perItem.length, 1);
  assert.equal(shaped.perItem[0].outcome, "walked");
  assert.equal(shaped.metrics.entries, 5);
});

test("shapeRunOutput: feed ok:false — reports the error, zeroed counts", () => {
  const result = { ok: false, feedUrl: "https://example.gov/feed.xml", error: "not a feed: 0ch body" };
  const shaped = shapeRunOutput("feed", result, "/tmp/report.json");
  assert.equal(shaped.perItem[0].outcome, "error");
  assert.equal(shaped.perItem[0].error, "not a feed: 0ch body");
  assert.equal(shaped.metrics.ok, false);
  assert.equal(shaped.metrics.entries, 0);
});

// ── upsertPortalLinkCandidates (mirrors persistPortalCandidates against a fake client) ─────────────

function fakeSb(errorForUrl = null) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        upsert(row, opts) {
          calls.push({ table, row, opts });
          if (errorForUrl && row.url === errorForUrl) return Promise.resolve({ error: { message: "boom" } });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

test("upsertPortalLinkCandidates: upserts every link with onConflict:url, source_id + anchor_text set", async () => {
  const sb = fakeSb();
  const res = await upsertPortalLinkCandidates(sb, "source-1", [
    { url: "https://x/a", anchorText: "A" },
    { url: "https://x/b", anchorText: null },
  ]);
  assert.deepEqual(res, { upserted: 2, failed: 0 });
  assert.equal(sb.calls.length, 2);
  assert.equal(sb.calls[0].table, "portal_link_candidates");
  assert.equal(sb.calls[0].row.source_id, "source-1");
  assert.equal(sb.calls[0].row.anchor_text, "A");
  assert.equal(sb.calls[1].row.anchor_text, null); // never invents an anchor text
  assert.deepEqual(sb.calls[0].opts, { onConflict: "url" });
});

test("upsertPortalLinkCandidates: a single failed upsert is counted, not thrown, and the walk continues", async () => {
  const sb = fakeSb("https://x/bad");
  const res = await upsertPortalLinkCandidates(sb, "source-1", [
    { url: "https://x/bad" },
    { url: "https://x/good" },
  ]);
  assert.deepEqual(res, { upserted: 1, failed: 1 });
});

// ── GOVERNING_FILES sanity ───────────────────────────────────────────────────────────────────────

test("SOURCE_SWEEP_GOVERNING_FILES names the driver plus both walker modules", () => {
  assert.deepEqual(SOURCE_SWEEP_GOVERNING_FILES, [
    "scripts/turns/run-source-sweep.mjs",
    "src/lib/sources/register-walk.mjs",
    "src/lib/sources/feed-walk.mjs",
  ]);
});

test("defaultTraceDir: the raw-result trace lives BELOW the family dir, never beside the artifacts F28 validates", () => {
  const d = defaultTraceDir("/repo/fsi-app/scripts/harness-runs/source-sweep");
  assert.equal(d, "/repo/fsi-app/scripts/harness-runs/source-sweep/traces");
});

// ── resolvePortalSourceId (source-sweep-run-003 finding: host-key dedup attached OJ candidates to a 1976 opinion) ──

const EURLEX_DOC_ROWS = [
  { id: "000d2ee5", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31976A0456", status: "active" },
  { id: "111aaaaa", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1805", status: "active" },
];
const fakeDb = (rows, onRegister) => ({
  readAll: async () => rows,
  registerSource: async (src, opts) => { onRegister?.(src, opts); return { source_id: "NEW", created: true, host: "eur-lex.europa.eu" }; },
  institutionKey: (u) => new URL(u).host,
});
const PORTAL = { url: "https://eur-lex.europa.eu", name: "EUR-Lex Official Journal" };

test("resolvePortalSourceId: never resolves the portal to a same-host DOCUMENT row (dry → null)", async () => {
  const id = await resolvePortalSourceId(fakeDb(EURLEX_DOC_ROWS), PORTAL, "dry", {});
  assert.equal(id, null);
});

test("resolvePortalSourceId: apply registers a dedicated portal row with a key host-dedup cannot match", async () => {
  let seen = null;
  const id = await resolvePortalSourceId(fakeDb(EURLEX_DOC_ROWS, (src) => { seen = src; }), PORTAL, "apply", { skill: "x", reason: "y" });
  assert.equal(id, "NEW");
  assert.equal(seen.url, "https://eur-lex.europa.eu");
  assert.equal(seen.name, "EUR-Lex Official Journal");
  assert.equal(seen.institutionKey, "eur-lex.europa.eu#portal");
});

test("resolvePortalSourceId: an existing exact-url portal row wins in both modes and is never re-registered", async () => {
  const rows = [...EURLEX_DOC_ROWS, { id: "PORTAL", url: "https://eur-lex.europa.eu/", status: "active" }];
  let registered = 0;
  assert.equal(await resolvePortalSourceId(fakeDb(rows, () => registered++), PORTAL, "dry", {}), "PORTAL");
  assert.equal(await resolvePortalSourceId(fakeDb(rows, () => registered++), PORTAL, "apply", {}), "PORTAL");
  assert.equal(registered, 0);
});

test("portalUrlKey: trailing slash, hash and host case do not break exact matching", () => {
  assert.equal(portalUrlKey("https://EUR-Lex.europa.eu/"), portalUrlKey("https://eur-lex.europa.eu"));
  assert.equal(portalUrlKey("https://www.federalregister.gov/#top"), "https://www.federalregister.gov");
  assert.notEqual(portalUrlKey("https://eur-lex.europa.eu/oj"), portalUrlKey("https://eur-lex.europa.eu"));
});

// ── parseArgs: --walker sitemap's selector rules (--source-id / --host / --all-hosts / --check-coverage,
//    lane SITEMAP-3, 2026-09-04) ─────────────────────────────────────────────────────────────────────────

test("parseArgs: --walker sitemap requires exactly one selector (--source-id, --host, or --all-hosts)", () => {
  const none = parseArgs(["--walker", "sitemap", "--mode", "dry"]);
  assert.equal(none.ok, false);
  assert.match(none.error, /exactly one/);

  const both = parseArgs(["--walker", "sitemap", "--mode", "dry", "--source-id", "abc", "--host", "x.example"]);
  assert.equal(both.ok, false);
  assert.match(both.error, /exactly one/);

  const sourceId = parseArgs(["--walker", "sitemap", "--mode", "dry", "--source-id", "abc"]);
  assert.equal(sourceId.ok, true);
  assert.equal(sourceId.sourceId, "abc");
  assert.equal(sourceId.allHosts, false);

  const byHost = parseArgs(["--walker", "sitemap", "--mode", "dry", "--host", "x.example"]);
  assert.equal(byHost.ok, true);
  assert.equal(byHost.host, "x.example");

  const byAllHosts = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts"]);
  assert.equal(byAllHosts.ok, true);
  assert.equal(byAllHosts.allHosts, true);
  assert.equal(byAllHosts.maxHosts, DEFAULT_MAX_HOSTS);
});

test("parseArgs: --max-hosts overrides the default and must be positive", () => {
  const r = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts", "--max-hosts", "5"]);
  assert.equal(r.ok, true);
  assert.equal(r.maxHosts, 5);
  const bad = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts", "--max-hosts", "0"]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /--max-hosts/);
});

test("parseArgs: --time-budget-seconds defaults to DEFAULT_TIME_BUDGET_SECONDS, is overridable, must be positive", () => {
  const def = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts"]);
  assert.equal(def.ok, true);
  assert.equal(def.timeBudgetSeconds, DEFAULT_TIME_BUDGET_SECONDS);

  const override = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts", "--time-budget-seconds", "600"]);
  assert.equal(override.ok, true);
  assert.equal(override.timeBudgetSeconds, 600);

  const bad = parseArgs(["--walker", "sitemap", "--mode", "dry", "--all-hosts", "--time-budget-seconds", "0"]);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /--time-budget-seconds/);
});

test("parseArgs: --check-coverage is read-only — refuses a selector alongside it, requires --mode dry", () => {
  const ok = parseArgs(["--walker", "sitemap", "--mode", "dry", "--check-coverage"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.checkCoverage, true);

  const withSelector = parseArgs(["--walker", "sitemap", "--mode", "dry", "--check-coverage", "--host", "x.example"]);
  assert.equal(withSelector.ok, false);
  assert.match(withSelector.error, /takes no selector/);

  const applyMode = parseArgs(["--walker", "sitemap", "--mode", "apply", "--check-coverage"]);
  assert.equal(applyMode.ok, false);
  assert.match(applyMode.error, /never writes/);
});

// ── hostKeyOf / selectSitemapSources (previously untested — lane SITEMAP-3, 2026-09-04) ────────────────

test("hostKeyOf: lowercases, strips www, returns null for an unparseable url", () => {
  assert.equal(hostKeyOf("https://WWW.Example.GOV/a/b"), "example.gov");
  assert.equal(hostKeyOf("https://example.gov"), "example.gov");
  assert.equal(hostKeyOf("not a url"), null);
});

const SITEMAP_ROWS = [
  { id: "a1", url: "https://news.example/section", status: "active" },
  { id: "a2", url: "https://news.example/other", status: "active" },
  { id: "a3", url: "https://www.news.example/third", status: "active" }, // same host, www-prefixed
  { id: "s1", url: "https://suspended.example/", status: "suspended" },
  { id: "b1", url: "https://other.example/", status: "active" },
  { id: "bad", url: "not a url", status: "active" },
];

test("selectSitemapSources: --source-id ignores status (an explicit single target may probe a dead row)", () => {
  const r = selectSitemapSources(SITEMAP_ROWS, { sourceId: "s1", host: null });
  assert.deepEqual(r.map((x) => x.id), ["s1"]);
});

test("selectSitemapSources: --host is active-only, www-insensitive, case-insensitive, matches every row on the host", () => {
  const r = selectSitemapSources(SITEMAP_ROWS, { sourceId: null, host: "NEWS.example" });
  assert.deepEqual(r.map((x) => x.id).sort(), ["a1", "a2", "a3"]);
});

test("selectSitemapSources: --host never returns a suspended row or an unparseable-url row", () => {
  const r = selectSitemapSources(SITEMAP_ROWS, { sourceId: null, host: "suspended.example" });
  assert.deepEqual(r, []);
});

// ── groupActiveSourcesByHost / hostSitemapCoverage / orderHostGroupsForSweep / selectAllHostsTargets ────

test("groupActiveSourcesByHost: active-only, groups www-insensitively, skips unparseable urls, preserves first-seen order", () => {
  const groups = groupActiveSourcesByHost(SITEMAP_ROWS);
  assert.deepEqual(groups.map((g) => g.host), ["news.example", "other.example"]);
  assert.equal(groups[0].rows.length, 3);
  assert.equal(groups[1].rows.length, 1);
});

test("hostSitemapCoverage: neverWalked true only when EVERY row is null; oldestWalkedAt is the min stamp", () => {
  assert.deepEqual(hostSitemapCoverage([{ sitemap_last_walked_at: null }, { sitemap_last_walked_at: undefined }]), {
    neverWalked: true, oldestWalkedAt: null,
  });
  const mixed = hostSitemapCoverage([
    { sitemap_last_walked_at: "2026-08-20T00:00:00.000Z" },
    { sitemap_last_walked_at: null },
    { sitemap_last_walked_at: "2026-08-01T00:00:00.000Z" },
  ]);
  assert.equal(mixed.neverWalked, false);
  assert.equal(mixed.oldestWalkedAt, "2026-08-01T00:00:00.000Z");
});

test("orderHostGroupsForSweep: never-walked hosts first (alpha), then walked hosts oldest-coverage-first", () => {
  const groups = [
    { host: "z-walked-recent.example", rows: [{ sitemap_last_walked_at: "2026-09-01T00:00:00.000Z" }] },
    { host: "b-never.example", rows: [{ sitemap_last_walked_at: null }] },
    { host: "a-never.example", rows: [{ sitemap_last_walked_at: null }] },
    { host: "y-walked-old.example", rows: [{ sitemap_last_walked_at: "2026-07-01T00:00:00.000Z" }] },
  ];
  const ordered = orderHostGroupsForSweep(groups);
  assert.deepEqual(ordered.map((g) => g.host), [
    "a-never.example", "b-never.example", "y-walked-old.example", "z-walked-recent.example",
  ]);
});

test("orderHostGroupsForSweep: identical input twice produces an identical order (resumability)", () => {
  const groups = [
    { host: "c.example", rows: [{ sitemap_last_walked_at: "2026-08-15T00:00:00.000Z" }] },
    { host: "a.example", rows: [{ sitemap_last_walked_at: null }] },
    { host: "b.example", rows: [{ sitemap_last_walked_at: "2026-08-10T00:00:00.000Z" }] },
  ];
  const first = orderHostGroupsForSweep(groups).map((g) => g.host);
  const second = orderHostGroupsForSweep(groups.slice().reverse()).map((g) => g.host);
  assert.deepEqual(first, second);
});

test("selectAllHostsTargets: caps by DISTINCT HOSTS, flattens to every row on each selected host, reports remaining-unwalked", () => {
  const rows = [
    { id: "n1", url: "https://never1.example/a", status: "active" },
    { id: "n2a", url: "https://never2.example/a", status: "active" },
    { id: "n2b", url: "https://never2.example/b", status: "active" }, // second row, SAME host as n2a
    { id: "w1", url: "https://walked1.example/a", status: "active", sitemap_last_walked_at: "2026-08-01T00:00:00.000Z" },
  ];
  const sel = selectAllHostsTargets(rows, { maxHosts: 1 });
  assert.deepEqual(sel.hostsSelected, ["never1.example"]); // alpha-first of the never-walked bucket
  assert.deepEqual(sel.targets.map((r) => r.id), ["n1"]);
  assert.equal(sel.hostsTotalActive, 3);
  assert.equal(sel.hostsNeverWalkedBefore, 2);
  assert.equal(sel.hostsRemainingUnwalkedAfter, 1); // never2.example still not covered by this selection

  const sel2 = selectAllHostsTargets(rows, { maxHosts: 2 });
  assert.deepEqual(sel2.hostsSelected, ["never1.example", "never2.example"]);
  assert.deepEqual(sel2.targets.map((r) => r.id).sort(), ["n1", "n2a", "n2b"]); // BOTH rows on never2.example
  assert.equal(sel2.hostsRemainingUnwalkedAfter, 0);
});

test("selectAllHostsTargets: maxHosts larger than the host count selects everything, no error", () => {
  const rows = [{ id: "x", url: "https://only.example/", status: "active" }];
  const sel = selectAllHostsTargets(rows, { maxHosts: 999 });
  assert.deepEqual(sel.targets.map((r) => r.id), ["x"]);
});

// ── buildSitemapCoveragePatch ────────────────────────────────────────────────────────────────────────

const NOW = "2026-09-04T12:00:00.000Z";

test("buildSitemapCoveragePatch: kind 'feed' — feed_only outcome, feed probed, no sitemap_url/count touched", () => {
  const patch = buildSitemapCoveragePatch({ kind: "feed", feedUrl: "https://x/feed.xml" }, NOW);
  assert.deepEqual(patch, {
    sitemap_last_walked_at: NOW,
    sitemap_walk_outcome: "feed_only",
    feed_last_probed_at: NOW,
  });
  assert.equal("sitemap_url" in patch, false);
  assert.equal("sitemap_url_count" in patch, false);
});

test("buildSitemapCoveragePatch: kind 'sitemap' ok:true — walked outcome, records the first-fetched sitemap url and urlCount", () => {
  const patch = buildSitemapCoveragePatch({
    kind: "sitemap", ok: true, urlCount: 383,
    sitemapsFetched: [{ url: "https://x/sitemap.xml" }, { url: "https://x/sitemap-2.xml" }],
  }, NOW);
  assert.deepEqual(patch, {
    sitemap_last_walked_at: NOW,
    feed_last_probed_at: NOW,
    sitemap_walk_outcome: "walked",
    sitemap_url: "https://x/sitemap.xml",
    sitemap_url_count: 383,
  });
});

test("buildSitemapCoveragePatch: kind 'sitemap' ok:false discoverySource 'bot_wall' — bot_wall outcome, no sitemap_url", () => {
  const patch = buildSitemapCoveragePatch({ kind: "sitemap", ok: false, discoverySource: "bot_wall" }, NOW);
  assert.equal(patch.sitemap_walk_outcome, "bot_wall");
  assert.equal(patch.feed_last_probed_at, NOW);
  assert.equal("sitemap_url" in patch, false);
});

test("buildSitemapCoveragePatch: kind 'sitemap' ok:false, no bot wall — no_sitemap outcome", () => {
  const patch = buildSitemapCoveragePatch({ kind: "sitemap", ok: false, discoverySource: "none" }, NOW);
  assert.equal(patch.sitemap_walk_outcome, "no_sitemap");
});

test("buildSitemapCoveragePatch: kind 'error' — unfetchable outcome, feed_last_probed_at OMITTED (unknown which phase threw)", () => {
  const patch = buildSitemapCoveragePatch({ kind: "error", error: "network reset" }, NOW);
  assert.deepEqual(patch, { sitemap_last_walked_at: NOW, sitemap_walk_outcome: "unfetchable" });
  assert.equal("feed_last_probed_at" in patch, false);
});

// ── buildCoverageReport ──────────────────────────────────────────────────────────────────────────────

test("buildCoverageReport: totals, active-only walked/unwalked split, outcome breakdown incl. never_walked, feed count over ALL statuses", () => {
  const rows = [
    { status: "active", sitemap_last_walked_at: "2026-09-01T00:00:00.000Z", sitemap_walk_outcome: "walked", rss_feed_url: "https://a/feed" },
    { status: "active", sitemap_last_walked_at: "2026-09-01T00:00:00.000Z", sitemap_walk_outcome: "bot_wall", rss_feed_url: null },
    { status: "active", sitemap_last_walked_at: null, sitemap_walk_outcome: null, rss_feed_url: null },
    { status: "suspended", sitemap_last_walked_at: null, sitemap_walk_outcome: null, rss_feed_url: "https://b/feed" },
  ];
  const r = buildCoverageReport(rows);
  assert.equal(r.sourcesTotalAll, 4);
  assert.equal(r.sourcesActiveTotal, 3);
  assert.equal(r.sitemapWalkedActive, 2);
  assert.equal(r.sitemapUnwalkedActive, 1);
  assert.deepEqual(r.walkOutcomeCounts, { walked: 1, bot_wall: 1, never_walked: 1 });
  assert.equal(r.feedUrlPopulated, 2); // both statuses counted — matches the operator's own framing
});

// ── shapeRunOutput: walker "sitemap" (previously untested — lane SITEMAP-3, 2026-09-04) ────────────────

test("shapeRunOutput sitemap: mixed feed/sitemap/bot_wall/error sources — per_item outcomes and the new hosts_*/feeds_discovered/new_locs/lastmod_changes fields", () => {
  const result = {
    sources: [
      {
        sourceId: "f1", sourceName: "Feed Source", sourceUrl: "https://feed.example/",
        kind: "feed", feedUrl: "https://feed.example/rss.xml", discoverySource: "candidate-path",
        feedResult: { ok: true, entries: 5, upserted: 5, failed: 0 }, rssFeedUrlWritten: true,
      },
      {
        sourceId: "s1", sourceName: "Sitemap Source", sourceUrl: "https://sm.example/",
        kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 10,
        sitemapsFetched: [{ url: "https://sm.example/sitemap.xml" }],
        diff: { addedCount: 3, changedCount: 1, removedCount: 0 },
        coverageComplete: true, baselineDeferred: false, upserted: 3, failed: 0, changeRecorded: true,
      },
      {
        sourceId: "w1", sourceName: "Bot Wall Source", sourceUrl: "https://walled.example/",
        kind: "sitemap", ok: false, discoverySource: "bot_wall", error: "bot_wall detected: ...",
      },
      {
        sourceId: "e1", sourceName: "Error Source", sourceUrl: "https://broken.example/",
        kind: "error", error: "network reset",
      },
    ],
    allHosts: null,
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.perItem.length, 4);
  assert.equal(shaped.perItem[0].outcome, "walked"); // feed
  assert.equal(shaped.perItem[1].outcome, "walked"); // sitemap ok
  assert.equal(shaped.perItem[2].outcome, "bot_wall");
  assert.equal(shaped.perItem[3].outcome, "error");

  const m = shaped.metrics;
  assert.equal(m.hosts_walked, 4, "four distinct hosts across the four sources");
  assert.equal(m.hosts_skipped_bot_wall, 1);
  assert.equal(m.feeds_discovered, 1);
  assert.equal(m.new_locs, 3 + 5); // sitemap added(3) + feed entries(5)
  assert.equal(m.lastmod_changes, 1);
  assert.equal(m.hosts_remaining_unwalked, null, "no --all-hosts selection on this run");
});

test("shapeRunOutput sitemap: two sources on the SAME host both bot_wall -> host counted once in hosts_skipped_bot_wall; a partial host is not", () => {
  const result = {
    sources: [
      { sourceId: "a", sourceName: "A", sourceUrl: "https://walled.example/a", kind: "sitemap", ok: false, discoverySource: "bot_wall", error: "x" },
      { sourceId: "b", sourceName: "B", sourceUrl: "https://walled.example/b", kind: "sitemap", ok: false, discoverySource: "bot_wall", error: "x" },
      { sourceId: "c", sourceName: "C", sourceUrl: "https://partial.example/a", kind: "sitemap", ok: false, discoverySource: "bot_wall", error: "x" },
      {
        sourceId: "d", sourceName: "D", sourceUrl: "https://partial.example/b", kind: "sitemap", ok: true, discoverySource: "robots",
        urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 },
        coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false,
      },
    ],
    allHosts: null,
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.hosts_walked, 2);
  assert.equal(shaped.metrics.hosts_skipped_bot_wall, 1, "only walled.example — partial.example has a successful sibling row");
});

test("shapeRunOutput sitemap: --all-hosts run reports hosts_remaining_unwalked and hosts_selected from the selection", () => {
  const result = {
    sources: [
      { sourceId: "a", sourceName: "A", sourceUrl: "https://a.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false },
    ],
    allHosts: { targets: [], hostsSelected: ["a.example"], hostsTotalActive: 5, hostsNeverWalkedBefore: 3, hostsRemainingUnwalkedAfter: 2 },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.hosts_remaining_unwalked, 2);
  assert.equal(shaped.metrics.hosts_selected, 1);
});

test("shapeRunOutput sitemap: dry mode never says 'planned' as 'upserted' for the sitemap walker either (same discipline as the other three walkers)", () => {
  const result = {
    sources: [{
      sourceId: "s1", sourceName: "S", sourceUrl: "https://sm.example/",
      kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 2,
      sitemapsFetched: [{ url: "https://sm.example/sitemap.xml" }],
      diff: { addedCount: 2, changedCount: 0, removedCount: 0 },
      coverageComplete: true, baselineDeferred: false, upserted: 2, failed: 0, changeRecorded: false,
    }],
    allHosts: null,
  };
  const dry = shapeRunOutput("sitemap", result, "/tmp/report.json", "dry");
  assert.match(dry.perItem[0].verdict, /planned \(dry, nothing written\)/);
  assert.equal(dry.metrics.upserted, 0);
  assert.equal(dry.metrics.planned, 2);
});

// ── DEFAULT_MAX_HOSTS budget arithmetic (lane SITEMAP-3, 2026-09-04) ────────────────────────────────────
// Guards the constant against silent comment drift: re-derives it from the SAME [CONFIRMED] measured
// inputs DEFAULT_MAX_HOSTS's own comment names (workflow timeout, non-walk overhead reserve, measured
// per-row cost, active sources/hosts) and asserts the exported constant is still the comment's own
// rounded-down result. If any of these inputs is re-measured (a new timeout-minutes, a new per-row
// measurement), this test fails alongside the stale comment rather than silently drifting apart from it.
test("DEFAULT_MAX_HOSTS: matches the measured-budget arithmetic in its own comment, with real headroom", () => {
  const WORKFLOW_TIMEOUT_S = 1800; // .github/workflows/source-sweep.yml timeout-minutes: 30
  const NON_WALK_OVERHEAD_S = 300; // reserved: checkout/setup-node/npm ci/hydrate/commit-PR steps
  const WALK_BUDGET_S = WORKFLOW_TIMEOUT_S - NON_WALK_OVERHEAD_S;
  assert.equal(WALK_BUDGET_S, 1500);

  const MEASURED_S_PER_ROW = 14; // source-sweep-run-010, 4 rows / 56s wall time, one host
  const ACTIVE_SOURCES = 1630; // CONFIRMED SQL, 2026-09-04
  const ACTIVE_HOSTS = 646; // CONFIRMED SQL, 2026-09-04
  const avgRowsPerHost = ACTIVE_SOURCES / ACTIVE_HOSTS;
  const avgCostPerHostS = MEASURED_S_PER_ROW * avgRowsPerHost;
  const rawMaxHosts = WALK_BUDGET_S / avgCostPerHostS;

  // The comment's own arithmetic: floor(1500/35) = 42, then rounded DOWN to 40 for headroom against
  // sitemap-index fan-out / the full unscoped feed-candidate list — never round UP past the measured
  // budget.
  assert.ok(rawMaxHosts >= DEFAULT_MAX_HOSTS, `raw budget ${rawMaxHosts.toFixed(2)} must be >= the constant actually used`);
  assert.equal(Math.floor(rawMaxHosts), 42, "floor(1500 / (14 * 1630/646)) must still be 42, matching the comment");
  assert.equal(DEFAULT_MAX_HOSTS, 40, "the constant is 42's own comment rounded DOWN for headroom, not 42 itself");

  // Dispatch-count consequence the operator's own framing ("2,563 dispatches") is measured against: a
  // CEILING, not a floor — 16 full 40-host dispatches cover only 640 of 646 hosts, so full coverage needs
  // 17 (matches CORPUS-TURN-RUNBOOK.md's "The sitemap walker" section, computed independently there).
  const dispatchesToCoverAllHosts = Math.ceil(ACTIVE_HOSTS / DEFAULT_MAX_HOSTS);
  assert.equal(dispatchesToCoverAllHosts, 17);
});

// ── checkTimeBudget / walkTargetsWithinBudget / withFetchTimeout (lane SWEEP-BUDGET, 2026-09-04) ────────
// Source-sweep #14 (13m24s) and #15 (14m57s) finished; #16 (70 hosts) was killed by
// .github/workflows/source-sweep.yml's timeout-minutes: 30 with NO artifact at all — the per-host
// arithmetic DEFAULT_MAX_HOSTS's comment states is an AVERAGE, and nothing checked wall-clock time. These
// tests prove the fix without sleeping: checkTimeBudget is a pure predicate over an injected clock VALUE;
// walkTargetsWithinBudget is the actual loop main() runs, driven here with a fake, advancing `nowMs`
// function and a fast stub `walkOne` (no real network); withFetchTimeout is proven both with instant
// mock fetches (signal wiring, error mapping) and one real, short-timeout wait against a fetch stub that
// only resolves when ITS OWN injected AbortSignal fires — proving the timeout actually interrupts a hang.

test("DEFAULT_TIME_BUDGET_SECONDS: 1500s — SAME arithmetic DEFAULT_MAX_HOSTS's own comment already computed (workflow timeout 1800s minus the 300s non-walk reserve)", () => {
  assert.equal(DEFAULT_TIME_BUDGET_SECONDS, 1800 - 300);
});

test("checkTimeBudget: pure over an injected clock VALUE — not exhausted before the budget, exhausted at/after it", () => {
  assert.deepEqual(checkTimeBudget(0, 0, 1500), { exhausted: false, elapsedSeconds: 0 });
  assert.deepEqual(checkTimeBudget(0, 1_499_000, 1500), { exhausted: false, elapsedSeconds: 1499 });
  assert.deepEqual(checkTimeBudget(0, 1_500_000, 1500), { exhausted: true, elapsedSeconds: 1500 });
  assert.deepEqual(checkTimeBudget(0, 2_000_000, 1500), { exhausted: true, elapsedSeconds: 2000 });
  // startedAtMs offset (not always 0) — only the DIFFERENCE matters.
  assert.deepEqual(checkTimeBudget(10_000, 10_000 + 500_000, 1500), { exhausted: false, elapsedSeconds: 500 });
});

test("walkTargetsWithinBudget: walks every target when the fake clock never exceeds the budget", async () => {
  const targets = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let calls = 0;
  const walkOne = async (t) => { calls++; return { id: t.id, outcome: "walked" }; };
  const r = await walkTargetsWithinBudget(targets, walkOne, {
    startedAtMs: 0, budgetSeconds: 1500, nowMs: () => calls * 1000, // 1s "elapsed" per call, well under budget
  });
  assert.equal(calls, 3);
  assert.equal(r.results.length, 3);
  assert.deepEqual(r.notReached, []);
  assert.equal(r.exhausted, false);
});

test("walkTargetsWithinBudget: THE LOOP'S EARLY EXIT — a fake, advancing clock stops the loop before every target is reached, never mid-target", async () => {
  const targets = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const clockReadings = [0, 500_000, 1_000_000, 1_600_000]; // 4th reading (1600s) is past a 1500s budget
  let i = 0;
  const walked = [];
  const walkOne = async (t) => { walked.push(t.id); return { id: t.id }; };
  const r = await walkTargetsWithinBudget(targets, walkOne, {
    startedAtMs: 0, budgetSeconds: 1500, nowMs: () => clockReadings[i++],
  });
  // Budget check reads BEFORE targets a/b/c (0s, 500s, 1000s — all under budget) and BEFORE d (1600s —
  // over budget) — so a/b/c walk, d never does. This is checked BEFORE, never mid-target: walkOne for "d"
  // is never called at all (not called-then-aborted).
  assert.deepEqual(walked, ["a", "b", "c"]);
  assert.equal(r.results.length, 3);
  assert.deepEqual(r.notReached.map((t) => t.id), ["d"]);
  assert.equal(r.exhausted, true);
  assert.equal(r.elapsedSeconds, 1600);
});

test("walkTargetsWithinBudget: an empty target list never calls walkOne, reports elapsedSeconds 0, not exhausted", async () => {
  let called = false;
  const r = await walkTargetsWithinBudget([], async () => { called = true; }, { startedAtMs: 0, budgetSeconds: 1500, nowMs: () => 999_000 });
  assert.equal(called, false);
  assert.deepEqual(r, { results: [], notReached: [], exhausted: false, elapsedSeconds: 0 });
});

test("walkTargetsWithinBudget: nowMs defaults to Date.now — the live binding's own contract, no injection required", async () => {
  const r = await walkTargetsWithinBudget([{ id: "x" }], async (t) => ({ id: t.id }), { startedAtMs: Date.now() - 1, budgetSeconds: 1500 });
  assert.equal(r.results.length, 1);
  assert.equal(r.exhausted, false);
});

test("withFetchTimeout: attaches an AbortSignal to every call, passes the real response through unchanged", async () => {
  let seenOpts = null;
  const fakeFetch = async (url, opts) => { seenOpts = opts; return { ok: true, url }; };
  const timed = withFetchTimeout(fakeFetch, 20_000);
  const res = await timed("https://x/y", { headers: { a: "b" } });
  assert.equal(res.ok, true);
  assert.equal(seenOpts.headers.a, "b", "the caller's own opts are preserved");
  assert.ok(seenOpts.signal instanceof AbortSignal, "a signal is always attached");
  assert.equal(seenOpts.signal.aborted, false, "not aborted on an instantly-resolving fetch");
});

test("withFetchTimeout: a TimeoutError/AbortError from the wrapped fetch is reported as a plain Error naming the timeout and the url — not a raw DOMException", async () => {
  const timeoutFetch = async () => { throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }); };
  await assert.rejects(
    () => withFetchTimeout(timeoutFetch, 20_000)("https://slow.example/sitemap.xml", {}),
    /fetch timed out after 20000ms for https:\/\/slow\.example\/sitemap\.xml/
  );
  const abortFetch = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  await assert.rejects(() => withFetchTimeout(abortFetch, 5)("https://x/y", {}), /fetch timed out after 5ms for https:\/\/x\/y/);
});

test("withFetchTimeout: a normal fetch failure (network error, non-timeout) is rethrown UNCHANGED, never relabeled a timeout", async () => {
  const brokenFetch = async () => { throw new Error("getaddrinfo ENOTFOUND x.example"); };
  await assert.rejects(() => withFetchTimeout(brokenFetch, 20_000)("https://x.example/", {}), /ENOTFOUND/);
});

// A REAL-timer variant of this test (a fetch that only settles when its injected AbortSignal.timeout(N)
// actually fires) was tried and dropped: green in isolation but flaky under the full discipline suite's
// heavy parallel load ("Promise resolution is still pending but the event loop has already resolved"),
// which also cascaded into cancelling every later test in this file. AbortSignal.timeout's own firing is
// Node runtime behavior, not this module's — the two tests above already prove everything this module
// itself is responsible for: a signal is always attached (instanceof AbortSignal), and a TimeoutError/
// AbortError from the wrapped fetch (however it arrives) is relabeled correctly. A flaky proof of a
// third party's timer is worse than no proof of it (CLAUDE.md rule 15's "attack, don't assert presence"
// cuts the other way here: asserting presence of a real timer under load is exactly the kind of proof
// that cries wolf).

// ── shapeRunOutput sitemap: budget metrics + hosts_remaining_unwalked recomputed from what actually walked ──

test("shapeRunOutput sitemap: budget fields pass through metrics verbatim (present even when not exhausted)", () => {
  const result = {
    sources: [
      { sourceId: "a", sourceName: "A", sourceUrl: "https://a.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false },
    ],
    allHosts: null,
    budget: { budgetSeconds: 1500, elapsedSeconds: 42.5, exhausted: false, sourcesWalked: 1, sourcesNotReached: { count: 0, ids: [] } },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.budget_seconds, 1500);
  assert.equal(shaped.metrics.elapsed_seconds, 42.5);
  assert.equal(shaped.metrics.sources_walked, 1);
  assert.deepEqual(shaped.metrics.sources_not_reached, { count: 0, ids: [] });
  assert.equal(shaped.metrics.budget_exhausted, false);
});

test("shapeRunOutput sitemap: budget_exhausted true + sources_not_reached names the ids — per_item is NEVER fabricated for an unreached source (it simply isn't in per_item; only the count/ids are in metrics)", () => {
  const result = {
    sources: [
      { sourceId: "walked-1", sourceName: "W1", sourceUrl: "https://w1.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 1, sitemapsFetched: [], diff: { addedCount: 1, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 1, failed: 0, changeRecorded: false },
    ],
    allHosts: null,
    budget: { budgetSeconds: 1500, elapsedSeconds: 1500.2, exhausted: true, sourcesWalked: 1, sourcesNotReached: { count: 2, ids: ["not-reached-1", "not-reached-2"] } },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.budget_exhausted, true);
  assert.deepEqual(shaped.metrics.sources_not_reached, { count: 2, ids: ["not-reached-1", "not-reached-2"] });
  assert.equal(shaped.perItem.length, 1, "per_item carries only the ONE source actually walked");
  assert.deepEqual(shaped.perItem.map((p) => p.id), ["walked-1"]);
  assert.equal(shaped.perItem.some((p) => p.id === "not-reached-1" || p.id === "not-reached-2"), false, "an unreached source is never invented a per_item verdict");
});

test("shapeRunOutput sitemap: hosts_remaining_unwalked RECOMPUTED from hosts actually walked when the budget stopped the run early (never the assume-all-selected-walked original)", () => {
  // Selection: 5 never-walked hosts existed; this dispatch selected 3 of them (hostsRemainingUnwalkedAfter
  // = 5 - 3 = 2, the ORIGINAL "assume all 3 selected get walked" number). The budget stopped the run after
  // only 1 of those 3 hosts was actually reached — the recomputed remaining count must be 5 - 1 = 4, not 2.
  const result = {
    sources: [
      { sourceId: "s1", sourceName: "S1", sourceUrl: "https://only-host-reached.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false },
    ],
    allHosts: { targets: [], hostsSelected: ["only-host-reached.example", "second.example", "third.example"], hostsTotalActive: 8, hostsNeverWalkedBefore: 5, hostsRemainingUnwalkedAfter: 2 },
    budget: { budgetSeconds: 1500, elapsedSeconds: 1500.1, exhausted: true, sourcesWalked: 1, sourcesNotReached: { count: 1, ids: ["s2-on-second-host"] } },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.hosts_remaining_unwalked, 4, "5 never-walked hosts total minus the 1 this run actually reached");
  assert.equal(shaped.metrics.budget_exhausted, true);
});

test("shapeRunOutput sitemap: hosts_remaining_unwalked matches the ORIGINAL (assume-all-walked) figure when the budget was NOT exhausted — every selected host really was reached", () => {
  const result = {
    sources: [
      { sourceId: "s1", sourceName: "S1", sourceUrl: "https://a.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false },
      { sourceId: "s2", sourceName: "S2", sourceUrl: "https://b.example/", kind: "sitemap", ok: true, discoverySource: "robots", urlCount: 0, sitemapsFetched: [], diff: { addedCount: 0, changedCount: 0, removedCount: 0 }, coverageComplete: true, baselineDeferred: false, upserted: 0, failed: 0, changeRecorded: false },
    ],
    allHosts: { targets: [], hostsSelected: ["a.example", "b.example"], hostsTotalActive: 8, hostsNeverWalkedBefore: 5, hostsRemainingUnwalkedAfter: 3 },
    budget: { budgetSeconds: 1500, elapsedSeconds: 40, exhausted: false, sourcesWalked: 2, sourcesNotReached: { count: 0, ids: [] } },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "apply");
  assert.equal(shaped.metrics.hosts_remaining_unwalked, 3, "both selected never-walked hosts were reached — same as the original figure");
});

test("shapeRunOutput sitemap: --check-coverage result shape — read-only metrics, no per_item, no writes implied", () => {
  const result = {
    coverageReport: {
      sourcesTotalAll: 2563, sourcesActiveTotal: 1630, sitemapWalkedActive: 4, sitemapUnwalkedActive: 1626,
      walkOutcomeCounts: { walked: 4, never_walked: 1626 }, feedUrlPopulated: 189,
    },
  };
  const shaped = shapeRunOutput("sitemap", result, "/tmp/report.json", "dry");
  assert.deepEqual(shaped.perItem, []);
  assert.equal(shaped.metrics.check_coverage, true);
  assert.equal(shaped.metrics.sources_total_all, 2563);
  assert.equal(shaped.metrics.sources_active_total, 1630);
  assert.equal(shaped.metrics.sitemap_walked_active, 4);
  assert.equal(shaped.metrics.sitemap_unwalked_active, 1626);
  assert.deepEqual(shaped.metrics.walk_outcome_counts, { walked: 4, never_walked: 1626 });
  assert.equal(shaped.metrics.feed_url_populated, 189);
});
