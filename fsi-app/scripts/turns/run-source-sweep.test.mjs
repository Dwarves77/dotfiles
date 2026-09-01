// run-source-sweep.test.mjs — proves arg parsing, the portal-resolution mapping, the raw-walk-result
// shaping into CONVENTION.md's per_item/metrics/inputs_ref, and the mirrored persist upsert against a
// fake Supabase client (no DB). Importing this module never invokes main() (IS_MAIN guard).
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs, portalFor, shapeRunOutput, upsertPortalLinkCandidates, SOURCE_SWEEP_GOVERNING_FILES, defaultTraceDir, resolvePortalSourceId, portalUrlKey,
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
  const apply = shapeRunOutput("register-eurlex", result, "/tmp/report.json", "apply");
  assert.match(apply.perItem[0].verdict, /2 upserted/);
  assert.equal(apply.metrics.mode, "apply");
  // Feed and Federal Register verdicts carry the same distinction.
  const fr = shapeRunOutput("register-federal-register", { register: "federal-register", from: "a", to: "b", types: ["RULE"], term: null, pages: [{ page: 1, url: "https://x", results: 5, upserted: 5 }], upserted: 5, failed: 0, totalCount: 5, totalPages: 1, droppedPages: 0 }, "/tmp/r.json", "dry");
  assert.doesNotMatch(fr.perItem[0].verdict, /\bupserted\b/);
  const feed = shapeRunOutput("feed", { feedUrl: "https://f", ok: true, entries: 3, upserted: 3, failed: 0 }, "/tmp/r.json", "dry");
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
