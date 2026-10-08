// live-content.test.mjs (lane SMOKE-2, 2026-10-08): every content requirement of the Live smoke gate has a fixture page
// that carries the element (passes) and a fixture page with the element absent, empty or too thin (fails, naming the
// page and the selector). Pure; no browser, no network. The browser-side collector is exercised against a stub DOM.
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_INVARIANT_IDS,
  CONTENT_REQUIREMENTS,
  requirementsForKind,
  judgeRequirement,
  checkContentSnapshot,
  checkContentRun,
} from "./live-content.mjs";
import { INVARIANTS, checkSnapshot, formatSummary } from "./live-assertions.mjs";
import { collectContentInPage } from "./live-snapshot.mjs";

/** One measurement that satisfies a requirement (the shape collectContentInPage returns). */
const passing = (req) => ({
  textLength: Math.max(req.textMin, 1) + 20,
  children: req.childSelector ? (req.childMin ?? 1) + 1 : 0,
  matches: true,
  text: "fixture",
});

/** The measurements of a healthy page of `kind`: every requirement of that kind satisfied. */
const healthy = (kind) => Object.fromEntries(requirementsForKind(kind).map((r) => [r.key, [passing(r)]]));

/** A page snapshot as live-smoke.mjs builds it, with `content` measurements. */
const page = (kind, path, over = {}) => ({
  url: `https://x.test${path}`,
  kind,
  viewport: { width: 1440, height: 900 },
  status: 200,
  redirectedToLogin: false,
  content: healthy(kind),
  ...over,
});

/** The same page with one requirement's element absent. */
const without = (kind, path, key, over = {}) => {
  const content = healthy(kind);
  content[key] = [];
  return page(kind, path, { content, ...over });
};

const KEYS = CONTENT_REQUIREMENTS.map((r) => r.key);

// ---------------------------------------------------------------- the table itself
test("the requirement table covers all six elements, each with a selector, a scope and a minimum content", () => {
  const elements = new Set(CONTENT_REQUIREMENTS.map((r) => r.invariant));
  assert.deepEqual(
    [...elements].sort(),
    Object.values(CONTENT_INVARIANT_IDS).sort(),
    "grade chip, bias chips, tier square, Connected intelligence, Inferences section, Across pages rail",
  );
  for (const r of CONTENT_REQUIREMENTS) {
    assert.ok(r.selector.length > 0, `${r.key} names its selector`);
    assert.ok(["home", "list", "detail"].includes(r.kind), `${r.key} names its page kind`);
    assert.ok(["each", "any"].includes(r.scope), `${r.key} names its scope`);
    assert.ok(r.textMin > 0 && r.minCount >= 1, `${r.key} has a minimum content`);
    assert.ok(Object.values(INVARIANTS).includes(r.invariant), `${r.key} invariant is a registered INVARIANT`);
  }
  assert.equal(new Set(KEYS).size, KEYS.length, "requirement keys are unique");
});

// ---------------------------------------------------------------- judgeRequirement
test("judgeRequirement: ATTACK absent, empty, childless and off-pattern elements fail; a qualifying one passes", () => {
  const req = CONTENT_REQUIREMENTS.find((r) => r.key === "connected-intelligence@detail");
  assert.deepEqual(judgeRequirement(req, [passing(req)]), { ok: true, reason: null });
  const absent = judgeRequirement(req, []);
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /^missing Connected intelligence section: expected 1\+ visible #across-pages/);
  assert.match(absent.reason, /found no visible match/);
  assert.equal(judgeRequirement(req, undefined).ok, false, "no measurement at all is absent, not a pass");
  const empty = judgeRequirement(req, [{ ...passing(req), textLength: 0 }]);
  assert.equal(empty.ok, false, "present but empty text");
  assert.match(empty.reason, /none qualifying/);
  assert.equal(judgeRequirement(req, [{ ...passing(req), children: 0 }]).ok, false, "a heading with no body child");
  assert.equal(judgeRequirement(req, [{ ...passing(req), matches: false }]).ok, false, "the wrong text");
});

test("judgeRequirement: the tier square needs a T<n> label, not any text; a pattern-free requirement ignores `matches`", () => {
  const tier = CONTENT_REQUIREMENTS.find((r) => r.key === "tier-square@list");
  assert.equal(judgeRequirement(tier, [{ textLength: 2, children: 0, matches: true }]).ok, true);
  assert.equal(judgeRequirement(tier, [{ textLength: 2, children: 0, matches: false }]).ok, false);
  const grade = CONTENT_REQUIREMENTS.find((r) => r.key === "grade-chip@list");
  assert.equal(judgeRequirement(grade, [{ textLength: 16, children: 0, matches: false }]).ok, true, "no pattern, so matches is ignored");
  assert.equal(judgeRequirement(grade, [{ textLength: 3, children: 0, matches: true }]).ok, false, "a chip with no real label");
});

// ---------------------------------------------------------------- per page (scope each)
test("tier square on a list page (scope each): ATTACK a list with no tier square fails naming page and selector; present passes", () => {
  assert.deepEqual(checkContentSnapshot(page("list", "/market")), []);
  const f = checkContentSnapshot(without("list", "/market", "tier-square@list"));
  assert.equal(f.length, 1);
  assert.equal(f[0].invariant, INVARIANTS.TIER_SQUARE);
  assert.equal(f[0].severity, "fail");
  assert.equal(f[0].path, "/market");
  assert.match(f[0].text, /list page: missing tier square/);
  assert.match(f[0].text, /\[data-part="chip-tier"\]/);
});

test("Across pages rail on the home page (scope each): ATTACK a dashboard without the rail, or with a hollow one, fails", () => {
  assert.deepEqual(checkContentSnapshot(page("home", "/")), []);
  const gone = checkContentSnapshot(without("home", "/", "across-pages-rail@home"));
  assert.deepEqual(gone.map((x) => x.invariant), [INVARIANTS.ACROSS_PAGES_RAIL]);
  assert.match(gone[0].text, /home page: missing Across pages rail: expected 1\+ visible \[data-audit="across-platform-card"\]/);
  const req = requirementsForKind("home")[0];
  const hollow = page("home", "/", { content: { [req.key]: [{ textLength: 60, children: 4, matches: false }] } });
  assert.deepEqual(checkContentSnapshot(hollow).map((x) => x.invariant), [INVARIANTS.ACROSS_PAGES_RAIL], "stat links only, no cross-page theme");
});

test("checkSnapshot carries the per-page content findings, and a run without content checks (content null) adds none", () => {
  const base = { url: "https://x.test/", kind: "home", viewport: { width: 1440, height: 900 }, redirectedToLogin: false, textNodes: [], chips: [], blocks: [], tierChips: [], scaleTexts: [], rowCount: 0, mastheadTitle: null, containerScan: null };
  assert.deepEqual(checkSnapshot({ ...base, content: null }), []);
  assert.deepEqual(checkSnapshot({ ...base, content: healthy("home") }), []);
  assert.deepEqual(checkSnapshot({ ...base, content: without("home", "/", "across-pages-rail@home").content }).map((f) => f.invariant), [INVARIANTS.ACROSS_PAGES_RAIL]);
  const toLogin = checkSnapshot({ ...base, redirectedToLogin: true, content: without("home", "/", "across-pages-rail@home").content });
  assert.deepEqual(toLogin.map((f) => f.invariant), [INVARIANTS.SESSION_INVALID], "a logged-out page is the session invariant's alone");
});

// ---------------------------------------------------------------- over the run (scope any)
const ANY_CASES = [
  ["grade-chip@list", INVARIANTS.GRADE_CHIP, "list", "/regulations", "/market"],
  ["bias-chips@list", INVARIANTS.BIAS_CHIPS, "list", "/regulations", "/market"],
  ["bias-chips@detail", INVARIANTS.BIAS_CHIPS, "detail", "/regulations/a", "/market/b"],
  ["tier-square@detail", INVARIANTS.TIER_SQUARE, "detail", "/regulations/a", "/market/b"],
  ["connected-intelligence@detail", INVARIANTS.CONNECTED_SECTION, "detail", "/regulations/a", "/market/b"],
  ["inferences-section@detail", INVARIANTS.INFERENCES_SECTION, "detail", "/regulations/a", "/market/b"],
];
for (const [key, invariant, kind, pathA, pathB] of ANY_CASES) {
  test(`${key} (scope any): ATTACK absent from every ${kind} page fails naming the pages and selector; one carrying page passes`, () => {
    const req = CONTENT_REQUIREMENTS.find((r) => r.key === key);
    const bothMissing = [without(kind, pathA, key), without(kind, pathB, key)];
    const f = checkContentRun(bothMissing).filter((x) => x.invariant === invariant && x.text.includes(req.selector));
    assert.equal(f.length, 1, "one finding for the one viewport");
    assert.equal(f[0].severity, "fail");
    assert.equal(f[0].viewport, 1440);
    assert.match(f[0].text, new RegExp(`${kind} page: missing ${req.element}`));
    assert.ok(f[0].text.includes(req.selector), "names the selector");
    assert.ok(f[0].text.includes(pathA) && f[0].text.includes(pathB), "names the pages it looked at");
    const oneCarries = [without(kind, pathA, key), page(kind, pathB)];
    assert.deepEqual(checkContentRun(oneCarries).filter((x) => x.invariant === invariant && x.text.includes(req.selector)), [], "one page carrying it is enough");
  });
}

test("scope any is judged per viewport: present at 1440 and absent at 375 fails the 375 width only", () => {
  const wide = (p) => page("list", p);
  const narrow = (p) => without("list", p, "grade-chip@list", { viewport: { width: 375, height: 812 } });
  const f = checkContentRun([wide("/regulations"), narrow("/regulations")]).filter((x) => x.invariant === INVARIANTS.GRADE_CHIP);
  assert.deepEqual(f.map((x) => x.viewport), [375]);
});

test("a kind with no page visited is a failure, a kind whose pages all redirected to login is the session invariant's, content null is skipped", () => {
  const listsOnly = [page("list", "/market"), page("home", "/")];
  const noDetail = checkContentRun(listsOnly);
  assert.ok(noDetail.some((f) => f.invariant === INVARIANTS.CONNECTED_SECTION && /no detail page was visited at 1440px/.test(f.text)));
  const redirected = [page("list", "/market"), page("home", "/"), page("detail", "/market/a", { redirectedToLogin: true })];
  assert.deepEqual(checkContentRun(redirected).filter((f) => f.invariant === INVARIANTS.CONNECTED_SECTION), []);
  assert.deepEqual(checkContentRun([page("detail", "/market/a", { content: null })]), []);
  assert.deepEqual(checkContentRun([]), []);
  assert.deepEqual(checkContentRun(undefined), []);
});

test("a fully healthy run passes every requirement", () => {
  const run = [];
  for (const width of [1440, 375]) {
    const viewport = { width, height: 800 };
    run.push(page("home", "/", { viewport }));
    for (const p of ["/regulations", "/market", "/research", "/operations"]) run.push(page("list", p, { viewport }));
    for (const p of ["/regulations/a", "/market/b"]) run.push(page("detail", p, { viewport }));
  }
  assert.deepEqual(checkContentRun(run), []);
  for (const s of run) assert.deepEqual(checkContentSnapshot(s), []);
});

test("formatSummary prints a content failure as one line naming the invariant, the path and the selector", () => {
  const lines = formatSummary(checkContentSnapshot(without("home", "/", "across-pages-rail@home")));
  assert.match(lines[0], /^FAIL content-across-pages-rail GET 200 \/ :: home page: missing Across pages rail/);
  assert.match(lines[0], /\[data-audit="across-platform-card"\]/);
  assert.equal(lines[lines.length - 1], "live smoke: 1 failure(s), 0 warning(s)");
});

// ---------------------------------------------------------------- the browser-side collector, against a stub DOM
function stubElement({ text, visible = true, childMatches = {} }) {
  return {
    textContent: text,
    checkVisibility: () => visible,
    querySelectorAll: (sel) => Array.from({ length: childMatches[sel] ?? 0 }, () => ({})),
  };
}

test("collectContentInPage measures VISIBLE matches only, with text length, child match count and pattern result", () => {
  const byCss = {
    '[data-part="chip-tier"]': [stubElement({ text: " T2 " }), stubElement({ text: "T7", visible: false }), stubElement({ text: "not a tier" })],
    "#across-pages": [stubElement({ text: "Connected intelligence  and body text", childMatches: { '[data-guard-container="cross-page"]': 1 } })],
    "#inferences": [],
    "!!bad selector": "throws",
  };
  const prior = globalThis.document;
  globalThis.document = {
    querySelectorAll: (sel) => {
      if (byCss[sel] === "throws") throw new Error("bad selector");
      return byCss[sel] ?? [];
    },
  };
  try {
    const reqs = [
      { key: "tier", selector: '[data-part="chip-tier"]', textPattern: "^T\\d+$" },
      { key: "conn", selector: "#across-pages", textPattern: "Connected intelligence", childSelector: '[data-guard-container="cross-page"]' },
      { key: "inf", selector: "#inferences" },
      { key: "bad", selector: "!!bad selector" },
    ];
    const m = collectContentInPage(reqs);
    assert.deepEqual(m.tier.map((r) => [r.textLength, r.matches]), [[2, true], [10, false]], "the hidden T7 is not counted");
    assert.deepEqual(m.conn.map((r) => [r.children, r.matches]), [[1, true]]);
    assert.equal(m.conn[0].text, "Connected intelligence and body text".slice(0, 60));
    assert.deepEqual(m.inf, [], "an absent section measures as no match");
    assert.deepEqual(m.bad, [], "an invalid selector measures as no match, never throws");
  } finally {
    if (prior === undefined) delete globalThis.document;
    else globalThis.document = prior;
  }
});
