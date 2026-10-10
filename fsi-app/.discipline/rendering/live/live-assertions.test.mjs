// live-assertions.test.mjs (lane GATES-2, 2026-10-05): every Live smoke invariant has a passing fixture and an
// attack fixture that fails. Pure; no browser, no network.
import test from "node:test";
import assert from "node:assert/strict";
import {
  INVARIANTS,
  KNOWN_TAG_SLUGS,
  findMarkerTexts,
  findPlaceholderTexts,
  findRawTagSlugs,
  findBareScores,
  findTiersAboveCeiling,
  findLegendsBelowCeiling,
  checkSnapshot,
  checkResponses,
  checkConsole,
  formatSummary,
  buildReport,
  ADMIN_GATE_API_PATHS,
  findAdminLinks,
  judgeAdminProbe,
  ADMIN_MARKER_SELECTORS,
  checkAdminProbes,
  extractAccessToken,
} from "./live-assertions.mjs";

const base = (over = {}) => ({
  url: "https://x.test/market/abc",
  kind: "detail",
  viewport: { width: 1440, height: 900 },
  redirectedToLogin: false,
  textNodes: ["A clean sentence about a price signal."],
  chips: ["Ocean carrier"],
  blocks: [],
  tierChips: ["T2", "T7"],
  scaleTexts: ["T1 binding law → T7 news / commentary"],
  rowCount: 0,
  mastheadTitle: "A masthead title",
  containerScan: null,
  ...over,
});
const ids = (snap) => checkSnapshot(snap).map((f) => f.invariant);

test("CLEAN: a healthy detail snapshot produces no finding", () => {
  assert.deepEqual(checkSnapshot(base()), []);
});

// ---- internal markers
test("internal-marker: ATTACK raw ledger JSON as text fails; clean prose passes", () => {
  assert.deepEqual(findMarkerTexts(["Fine."]), []);
  const bad = '<<<CLAIM_PROVENANCE_LEDGER [{"section":"1","claim_text":"x","claim_kind":"FACT","source_span":"verbatim"}]';
  assert.ok(ids(base({ textNodes: [bad] })).includes(INVARIANTS.INTERNAL_MARKER));
  assert.ok(ids(base({ textNodes: ["a SOURCE_PROVENANCE flag"] })).includes(INVARIANTS.INTERNAL_MARKER));
});

// ---- placeholder literals
test("placeholder-literal: ATTACK undefined / null / NaN / [object Object] as a whole node or chip fails", () => {
  for (const tok of ["undefined", "null", "NaN", "[object Object]"]) {
    assert.deepEqual(findPlaceholderTexts([tok]), [tok]);
    assert.ok(ids(base({ textNodes: [tok] })).includes(INVARIANTS.PLACEHOLDER_LITERAL));
    assert.ok(ids(base({ chips: [tok] })).includes(INVARIANTS.PLACEHOLDER_LITERAL));
  }
  // inside a sentence it is just a word
  assert.deepEqual(findPlaceholderTexts(["The value is null in the source."]), []);
});

// ---- raw tag slugs and bare scores, inside analysis blocks only
test("raw-tag-slug: ATTACK a known slug in a theme card fails; its human label passes; outside a block is ignored", () => {
  assert.ok(KNOWN_TAG_SLUGS.has("carrier-ocean"));
  assert.ok(KNOWN_TAG_SLUGS.has("ets-allowance-surrender"));
  assert.deepEqual(findRawTagSlugs(["ocean carrier", "ETS allowance surrender"]), []);
  const hits = findRawTagSlugs(["Shared: carrier-ocean, ETS-Allowance-Surrender"]);
  assert.deepEqual(hits.map((h) => h.slug), ["carrier-ocean", "ets-allowance-surrender"]);
  assert.ok(ids(base({ blocks: [{ kind: "theme-card", texts: ["Both touch carrier-ocean"] }] })).includes(INVARIANTS.RAW_TAG_SLUG));
  assert.deepEqual(ids(base({ blocks: [{ kind: "theme-card", texts: ["Both touch ocean carriers"] }] })), []);
  assert.deepEqual(ids(base({ blocks: [{ kind: "other", texts: ["carrier-ocean"] }] })), []);
});

test("bare-score: ATTACK a decimal score fails; ordinary figures pass", () => {
  assert.deepEqual(findBareScores(["85 items", "2.5% of volume", "EUR 1.50 per tonne", "the 2026 filing"]), []);
  assert.deepEqual(findBareScores(["0.180"]), ["0.180"]);
  assert.deepEqual(findBareScores(["85 items · density 0.180"]), ["85 items · density 0.180"]);
  assert.ok(ids(base({ blocks: [{ kind: "cross-page", texts: ["centrality 0.62"] }] })).includes(INVARIANTS.BARE_SCORE));
  assert.ok(ids(base({ blocks: [{ kind: "theme-strip", texts: ["0.45"] }] })).includes(INVARIANTS.BARE_SCORE));
});

// ---- phone-width scroll containers (shared rule)
test("scroll-container-overflow: ATTACK main scrolls sideways at 375 fails; the same at 1440 is not measured", () => {
  const scan = {
    viewportWidth: 375,
    containers: [
      { name: "document", kind: "document", scrollWidth: 375, clientWidth: 375, boxRight: 375, allowed: false },
      { name: "main", kind: "main", scrollWidth: 1108, clientWidth: 375, boxRight: 375, allowed: false },
    ],
  };
  assert.ok(ids(base({ viewport: { width: 375, height: 812 }, containerScan: scan })).includes(INVARIANTS.SCROLL_CONTAINER));
  assert.deepEqual(ids(base({ viewport: { width: 1440, height: 900 }, containerScan: scan })), []);
  const fine = { viewportWidth: 375, containers: [scan.containers[0]] };
  assert.deepEqual(ids(base({ viewport: { width: 375, height: 812 }, containerScan: fine })), []);
});

// ---- own-origin responses and console
test("own-origin-5xx: ATTACK a 500 on the own origin fails; a 404 is a warning; a third party 500 is ignored", () => {
  const origin = "https://x.test";
  const f = checkResponses(
    [
      { url: "https://x.test/api/a", status: 500, method: "post" },
      { url: "https://x.test/missing.png", status: 404 },
      { url: "https://cdn.other.test/a.js", status: 503 },
      { url: "https://x.test/ok", status: 200 },
    ],
    origin,
    { url: "https://x.test/", viewport: 375 },
  );
  assert.deepEqual(f.map((x) => [x.invariant, x.severity, x.text]), [
    [INVARIANTS.OWN_ORIGIN_5XX, "fail", "500 /api/a"],
    [INVARIANTS.OWN_ORIGIN_4XX, "warn", "404 /missing.png"],
  ]);
  // Method, status and path are fields of their own, so a summary never has to parse them back out of text.
  assert.deepEqual(f.map((x) => [x.method, x.status, x.path]), [["POST", 500, "/api/a"], ["GET", 404, "/missing.png"]]);
  assert.deepEqual(checkResponses([{ url: "https://x.test/ok", status: 200 }], origin), []);
});

test("console-error: ATTACK a console error fails; warnings and the resource-load echo do not", () => {
  assert.equal(checkConsole([{ type: "error", text: "Uncaught TypeError: x is undefined" }]).length, 1);
  assert.deepEqual(
    checkConsole([
      { type: "warning", text: "deprecated" },
      { type: "log", text: "hi" },
      { type: "error", text: "Failed to load resource: the server responded with a status of 404" },
    ]),
    [],
  );
});

// ---- tier ceiling and legend
test("tier-above-ceiling: ATTACK a T8 chip fails; T1..T7 pass", () => {
  assert.deepEqual(findTiersAboveCeiling(["T1", "T4", "T7", "Unrated"]), []);
  assert.deepEqual(findTiersAboveCeiling(["T7", "T8"]), ["T8"]);
  assert.ok(ids(base({ tierChips: ["T9"] })).includes(INVARIANTS.TIER_ABOVE_CEILING));
});

test("legend-below-ceiling: ATTACK a legend that ends the scale at T6 fails; the real span passes", () => {
  assert.deepEqual(findLegendsBelowCeiling(["T1 binding law → T7 news / commentary", "T1 binding law through T7 news / commentary"]), []);
  assert.deepEqual(findLegendsBelowCeiling(["T1 binding law → T6 news / commentary"]), ["T1 binding law → T6 news / commentary"]);
  assert.deepEqual(findLegendsBelowCeiling(["T1 binding law through T6 commercial"]).length, 1);
  assert.ok(ids(base({ scaleTexts: ["Source tier, T1 binding law through T6 news"] })).includes(INVARIANTS.LEGEND_BELOW_CEILING));
  assert.deepEqual(findLegendsBelowCeiling(["Promote T3 to T2 when corroborated"]), []);
});

// ---- rows, masthead, session
test("list-has-no-rows / detail-has-no-masthead: ATTACK empty lists and titleless details fail", () => {
  assert.ok(ids(base({ kind: "list", rowCount: 0, mastheadTitle: "Market" })).includes(INVARIANTS.LIST_EMPTY));
  assert.deepEqual(ids(base({ kind: "list", rowCount: 12 })), []);
  assert.ok(ids(base({ kind: "detail", mastheadTitle: "  " })).includes(INVARIANTS.DETAIL_NO_MASTHEAD));
  assert.ok(ids(base({ kind: "detail", mastheadTitle: null })).includes(INVARIANTS.DETAIL_NO_MASTHEAD));
  assert.deepEqual(ids(base({ kind: "home", rowCount: 0, mastheadTitle: null })), []);
});

test("session-invalid: ATTACK a /login redirect is reported ALONE under its own name, not as page defects", () => {
  const found = checkSnapshot(base({ kind: "list", rowCount: 0, mastheadTitle: null, redirectedToLogin: true, textNodes: ["<<<"] }));
  assert.deepEqual(found.map((f) => f.invariant), [INVARIANTS.SESSION_INVALID]);
});

test("console-error: error text is not truncated (a minified React error keeps its arguments)", () => {
  const long = `Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings. ${"x".repeat(300)}`;
  const [f] = checkConsole([{ type: "error", text: long }]);
  assert.equal(f.text, long);
});

// ---- reporting
test("formatSummary prints one line per distinct finding with url path and truncated text; buildReport counts by invariant", () => {
  const findings = checkSnapshot(base({ textNodes: ["x".repeat(400) + " <<<"], status: 200 }));
  const lines = formatSummary(findings);
  assert.match(lines[0], /^FAIL internal-marker GET 200 \/market\/abc :: /);
  assert.match(lines[0], / \(1 page\)$/);
  assert.ok(lines[0].length < 260, "offending text is truncated");
  assert.equal(lines[lines.length - 1], "live smoke: 1 failure(s), 0 warning(s)");
  const r = buildReport({ baseUrl: "https://x.test", pages: [{ url: "https://x.test/", viewport: 1440 }], findings });
  assert.equal(r.failureCount, 1);
  assert.deepEqual(r.byInvariant, { "internal-marker": 1 });
});

test("formatSummary: every warning and failure shows method, status and path, and one route seen on many pages is ONE line with a page count", () => {
  const origin = "https://x.test";
  const findings = [];
  // The first live run: the same 403 on /api/workspace/tags from 12 pages at 2 viewports = 24 raw warnings.
  for (const viewport of [1440, 375]) {
    for (let i = 0; i < 12; i++) {
      findings.push(...checkResponses([{ url: `${origin}/api/workspace/tags`, status: 403, method: "GET" }], origin, { url: `${origin}/page-${i}`, viewport }));
    }
  }
  findings.push(...checkResponses([{ url: `${origin}/api/other`, status: 500, method: "POST" }], origin, { url: `${origin}/a`, viewport: 1440 }));
  assert.deepEqual(formatSummary(findings), [
    "FAIL own-origin-5xx POST 500 /api/other (1 page)",
    "WARN own-origin-4xx GET 403 /api/workspace/tags (24 pages)",
    "live smoke: 1 failure(s), 24 warning(s)",
  ]);
  // A page-level finding at two viewports on one path is one line and two pages; a different path is its own line.
  const overflow = [1440, 375].map((w) => ({ invariant: INVARIANTS.SCROLL_CONTAINER, url: `${origin}/market`, viewport: w, text: "div.x: wide", severity: "fail", status: 200 }));
  overflow.push({ invariant: INVARIANTS.SCROLL_CONTAINER, url: `${origin}/research/abc`, viewport: 375, text: "div.x: wide", severity: "fail" });
  assert.deepEqual(formatSummary(overflow).slice(0, 2), [
    "FAIL scroll-container-overflow GET 200 /market :: div.x: wide (2 pages)",
    "FAIL scroll-container-overflow GET - /research/abc :: div.x: wide (1 page)",
  ]);
});

// ---- admin gate (rule 15: the smoke account is never a platform admin)
test("admin-gate: the two API probes are read-only GET routes under src/app/api/admin", () => {
  assert.deepEqual([...ADMIN_GATE_API_PATHS], ["/api/admin/coverage", "/api/admin/integrity-flags"]);
});

test("admin-gate: ATTACK an admin navigation link on any page fails; no admin link passes", () => {
  assert.deepEqual(findAdminLinks(["/regulations", "/profile", "/community"]), []);
  assert.deepEqual(findAdminLinks(["/regulations", "/admin", "/admin/factors"]), ["/admin", "/admin/factors"]);
  assert.deepEqual(findAdminLinks(["/administrators"]), []);
  assert.deepEqual(ids(base({ adminLinks: [] })), []);
  assert.ok(ids(base({ adminLinks: ["/admin"] })).includes(INVARIANTS.ADMIN_GATE));
  assert.ok(ids(base({ kind: "list", rowCount: 3, adminLinks: ["/admin"] })).includes(INVARIANTS.ADMIN_GATE));
});

test("admin-gate: GET /admin passes on a redirect away or 401/403/404; ATTACK a 200 that stays on /admin fails", () => {
  assert.equal(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/" }), null);
  assert.equal(judgeAdminProbe({ kind: "page", path: "/admin", status: 403, finalPath: "/admin" }), null);
  assert.equal(judgeAdminProbe({ kind: "page", path: "/admin", status: 404, finalPath: "/admin" }), null);
  assert.match(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/admin" }), /may have become a platform admin: GET \/admin stayed on \/admin with status 200/);
});

test("admin-gate: the STREAMED redirect (a 200 loading shell, then the URL leaves /admin) passes; markers or a stay on /admin fail", () => {
  assert.equal(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/", markers: 0 }), null);
  // ATTACK: settled on /admin with the dashboard rendered.
  assert.match(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/admin", markers: 2 }), /rendered admin-only markers/);
  // ATTACK: markers win over a refusal status and over a URL that moved (the content is the leak).
  assert.match(judgeAdminProbe({ kind: "page", path: "/admin", status: 403, finalPath: "/admin", markers: 1 }), /rendered admin-only markers/);
  assert.match(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/", markers: 1 }), /rendered admin-only markers/);
  // ATTACK: still on /admin after settling with a 200 and no marker: the redirect never fired.
  assert.match(judgeAdminProbe({ kind: "page", path: "/admin", status: 200, finalPath: "/admin", markers: 0 }), /stayed on \/admin with status 200/);
  assert.ok(ADMIN_MARKER_SELECTORS.includes("[data-admin-dashboard]"));
});

test("admin-gate: admin API routes pass on 401/403/404; ATTACK a 200 or a 500 fails; a missing token is unverifiable, not a pass", () => {
  for (const status of [401, 403, 404]) assert.equal(judgeAdminProbe({ kind: "api", path: "/api/admin/coverage", status }), null);
  assert.match(judgeAdminProbe({ kind: "api", path: "/api/admin/coverage", status: 200 }), /answered 200, expected 401\/403\/404/);
  assert.match(judgeAdminProbe({ kind: "api", path: "/api/admin/integrity-flags", status: 500 }), /answered 500/);
  assert.match(judgeAdminProbe({ kind: "api", path: "/api/admin/coverage", status: null, tokenMissing: true }), /cannot be verified as refused/);
  const f = checkAdminProbes([{ kind: "api", path: "/api/admin/coverage", status: 200 }, { kind: "api", path: "/api/admin/integrity-flags", status: 403 }], "https://x.test");
  assert.deepEqual(f.map((x) => [x.invariant, x.url, x.severity]), [[INVARIANTS.ADMIN_GATE, "https://x.test/api/admin/coverage", "fail"]]);
});

test("extractAccessToken: raw JSON, base64 and chunked supabase cookies parse; absent or broken ones return null", () => {
  const json = JSON.stringify({ access_token: "tok-1", refresh_token: "r" });
  assert.equal(extractAccessToken(`a=b; sb-abc-auth-token=${encodeURIComponent(json)}`), "tok-1");
  assert.equal(extractAccessToken(`sb-abc-auth-token=base64-${Buffer.from(json).toString("base64url")}`), "tok-1");
  const b64 = "base64-" + Buffer.from(json).toString("base64url");
  assert.equal(extractAccessToken(`sb-abc-auth-token.1=${b64.slice(10)}; sb-abc-auth-token.0=${b64.slice(0, 10)}`), "tok-1");
  assert.equal(extractAccessToken("a=b; other=c"), null);
  assert.equal(extractAccessToken("sb-abc-auth-token=not-json"), null);
  assert.equal(extractAccessToken(undefined), null);
});
