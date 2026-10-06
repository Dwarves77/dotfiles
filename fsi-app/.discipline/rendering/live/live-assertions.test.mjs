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
      { url: "https://x.test/api/a", status: 500 },
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

// ---- reporting
test("formatSummary prints one line per finding with url and truncated text; buildReport counts by invariant", () => {
  const findings = checkSnapshot(base({ textNodes: ["x".repeat(400) + " <<<"] }));
  const lines = formatSummary(findings);
  assert.match(lines[0], /^FAIL internal-marker @1440 https:\/\/x\.test\/market\/abc :: /);
  assert.ok(lines[0].length < 260, "offending text is truncated");
  assert.equal(lines[lines.length - 1], "live smoke: 1 failure(s), 0 warning(s)");
  const r = buildReport({ baseUrl: "https://x.test", pages: [{ url: "https://x.test/", viewport: 1440 }], findings });
  assert.equal(r.failureCount, 1);
  assert.deepEqual(r.byInvariant, { "internal-marker": 1 });
});
