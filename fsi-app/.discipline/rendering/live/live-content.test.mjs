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
  judgeContentRun,
} from "./live-content.mjs";
import { INVARIANTS, checkSnapshot, formatSummary, buildReport } from "./live-assertions.mjs";
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
/** Resolved candidates: every class has `count` items, visited at the given paths. */
const cands = (count, visit = []) => ({
  resolved: true,
  classes: Object.fromEntries(["inference", "record", "bias"].map((c) => [c, { count, visit, sample: visit }])),
});
for (const [key, invariant, kind, pathA, pathB] of ANY_CASES) {
  test(`${key} (scope any): ATTACK absent from every ${kind} page fails naming the pages and selector; one carrying page passes`, () => {
    const req = CONTENT_REQUIREMENTS.find((r) => r.key === key);
    // A conditional requirement is judged against what the live data says; an unconditional one needs no candidates.
    const candidates = req.candidate ? cands(1, [pathA, pathB]) : undefined;
    const bothMissing = [without(kind, pathA, key), without(kind, pathB, key)];
    const f = checkContentRun(bothMissing, candidates).filter((x) => x.invariant === invariant && x.text.includes(req.selector));
    assert.equal(f.length, 1, "one finding for the one viewport");
    assert.equal(f[0].severity, "fail");
    assert.equal(f[0].viewport, 1440);
    assert.match(f[0].text, new RegExp(`${kind} page: missing ${req.element}`));
    assert.ok(f[0].text.includes(req.selector), "names the selector");
    assert.ok(f[0].text.includes(pathA) && f[0].text.includes(pathB), "names the pages it looked at");
    const oneCarries = [without(kind, pathA, key), page(kind, pathB)];
    assert.deepEqual(checkContentRun(oneCarries, candidates).filter((x) => x.invariant === invariant && x.text.includes(req.selector)), [], "one page carrying it is enough");
  });
}

test("scope any is judged per viewport: present at 1440 and absent at 375 fails the 375 width only", () => {
  const wide = (p) => page("list", p);
  const narrow = (p) => without("list", p, "grade-chip@list", { viewport: { width: 375, height: 812 } });
  const f = checkContentRun([wide("/regulations"), narrow("/regulations")], cands(2)).filter((x) => x.invariant === INVARIANTS.GRADE_CHIP);
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
  const judged = judgeContentRun(run, cands(1, ["/regulations/a", "/market/b"]));
  assert.deepEqual(judged.findings, []);
  assert.deepEqual(judged.holds, [], "every conditional class had a candidate and every candidate page carried its element");
  assert.deepEqual(checkContentRun(run), []);
  for (const s of run) assert.deepEqual(checkContentSnapshot(s), []);
});

// ---------------------------------------------------------------- conditional invariants from live data (lane SMOKE-3)
const CONDITIONAL = CONTENT_REQUIREMENTS.filter((r) => r.candidate);
const isConditional = (f) => CONDITIONAL.some((r) => r.invariant === f.invariant);

test("the conditional requirements are exactly the inference, record and bias classes, each naming a candidate class", () => {
  assert.deepEqual(CONDITIONAL.map((r) => [r.key, r.candidate]).sort(), [
    ["bias-chips@detail", "bias"],
    ["bias-chips@list", "bias"],
    ["grade-chip@list", "record"],
    ["inferences-section@detail", "inference"],
  ]);
  for (const r of CONDITIONAL) assert.equal(r.scope, "any", `${r.key}: a conditional requirement is never scope each`);
});

/** A run in which every conditional element is absent from every page. */
const bareRun = () => {
  const empty = (pg, kind) => CONDITIONAL.filter((r) => r.kind === kind).reduce((acc, r) => ({ ...acc, content: { ...acc.content, [r.key]: [] } }), pg);
  const run = [];
  for (const width of [1440, 375]) {
    const viewport = { width, height: 800 };
    run.push(page("home", "/", { viewport }));
    for (const p of ["/regulations", "/market"]) run.push(empty(page("list", p, { viewport }), "list"));
    for (const p of ["/regulations/a", "/market/b"]) run.push(empty(page("detail", p, { viewport }), "detail"));
  }
  return run;
};

test("HOLD: zero candidates in the corpus is a named HOLD per conditional invariant (not a failure), carrying the count", () => {
  const { findings, holds } = judgeContentRun(bareRun(), cands(0));
  assert.deepEqual(findings.filter(isConditional), [], "nothing to judge, nothing failed");
  assert.deepEqual(holds.map((h) => h.key).sort(), CONDITIONAL.map((r) => r.key).sort());
  const inf = holds.find((h) => h.key === "inferences-section@detail");
  assert.equal(inf.state, "hold");
  assert.equal(inf.invariant, INVARIANTS.INFERENCES_SECTION);
  assert.equal(inf.candidates, 0);
  assert.equal(inf.candidate, "inference");
  assert.match(inf.reason, /0 inference candidate item\(s\) in the corpus/);
  assert.match(inf.reason, /population hold/);
});

test("HOLD: candidates never resolved (undefined, null, resolved:false) are an unresolved HOLD with a null count, never a silent pass", () => {
  for (const unresolved of [undefined, null, { resolved: false, reason: "no creds", classes: {} }]) {
    const { findings, holds } = judgeContentRun(bareRun(), unresolved);
    assert.deepEqual(findings.filter(isConditional), []);
    assert.equal(holds.length, CONDITIONAL.length);
    assert.ok(holds.every((h) => h.candidates === null));
    assert.match(holds[0].reason, /not resolved/);
  }
});

test("ATTACK: a candidate that exists but renders no Inferences section is a FAIL, once per viewport, naming the candidate page", () => {
  const { findings, holds } = judgeContentRun(bareRun(), cands(3, ["/regulations/a"]));
  const inf = findings.filter((f) => f.invariant === INVARIANTS.INFERENCES_SECTION);
  assert.deepEqual(inf.map((f) => f.viewport), [1440, 375]);
  assert.equal(inf[0].severity, "fail");
  assert.match(inf[0].text, /missing Inferences section/);
  assert.match(inf[0].text, /3 inference candidate item\(s\) exist/);
  assert.match(inf[0].text, /\/regulations\/a/);
  assert.deepEqual(holds, [], "with a candidate in every class there is no hold left");
});

test("the chooser: a detail requirement is judged ONLY on the candidate pages (a non-candidate page can neither rescue nor fail it)", () => {
  const key = "inferences-section@detail";
  const candidates = cands(1, ["/market/b"]);
  const onlyInf = (r) => r.findings.filter((f) => f.invariant === INVARIANTS.INFERENCES_SECTION);
  // /regulations/a (not a candidate) carries the section; the candidate /market/b does not: FAIL.
  assert.equal(onlyInf(judgeContentRun([page("detail", "/regulations/a"), without("detail", "/market/b", key)], candidates)).length, 1);
  // /regulations/a (not a candidate) lacks it; the candidate /market/b has it: PASS.
  assert.deepEqual(onlyInf(judgeContentRun([without("detail", "/regulations/a", key), page("detail", "/market/b")], candidates)), []);
});

test("a candidate path is matched ignoring percent-encoding, and a candidate page that was never checked is a FAIL, not a pass", () => {
  const onlyInf = (r) => r.findings.filter((f) => f.invariant === INVARIANTS.INFERENCES_SECTION);
  assert.deepEqual(onlyInf(judgeContentRun([page("detail", "/regulations/a%20b")], cands(1, ["/regulations/a b"]))), []);
  const f = onlyInf(judgeContentRun([page("detail", "/regulations/a")], cands(1, ["/regulations/zzz"])));
  assert.equal(f.length, 1);
  assert.match(f[0].text, /no candidate page was checked at 1440px/);
});

// ---------------------------------------------------------------- the list-side chooser (lane SMOKE-4)
/** Resolved candidates whose list-kind classes carry `listVisit`, the filtered list URLs that must hold a candidate row. */
const listCands = (count, listVisit) => ({
  resolved: true,
  classes: Object.fromEntries(["inference", "record", "bias"].map((c) => [c, { count, visit: [], sample: [], listVisit }])),
});
const onlyGrade = (r) => r.findings.filter((f) => f.invariant === INVARIANTS.GRADE_CHIP);
const GRADE = "grade-chip@list";
const candList = (path, key, absent, over = {}) => (absent ? without("list", path, key, { candidateList: true, ...over }) : page("list", path, { candidateList: true, ...over }));

test("list chooser: a list requirement is judged ONLY on the candidate list pages (an unfiltered list can neither rescue nor fail it)", () => {
  const c = listCands(2, ["/regulations?q=alpha"]);
  // The plain list lacks the grade chip, the candidate list (a row that must carry it) has it: PASS.
  assert.deepEqual(onlyGrade(judgeContentRun([without("list", "/regulations", GRADE), candList("/regulations?q=alpha", GRADE, false)], c)), []);
  // The plain list carries a chip, the candidate list does not: FAIL once per viewport, naming the candidate list.
  const f = onlyGrade(judgeContentRun([page("list", "/regulations"), candList("/regulations?q=alpha", GRADE, true)], c));
  assert.equal(f.length, 1);
  assert.match(f[0].text, /missing grade chip/);
  assert.match(f[0].text, /2 record candidate item\(s\) exist/);
  assert.match(f[0].text, /\/regulations/);
});

test("list chooser: ATTACK a candidate list page that was never visited is a FAIL, not a pass", () => {
  const f = onlyGrade(judgeContentRun([page("list", "/regulations"), page("detail", "/regulations/a")], listCands(1, ["/regulations?q=alpha"])));
  assert.equal(f.length, 1);
  assert.match(f[0].text, /no candidate page was checked at 1440px/);
  assert.match(f[0].text, /\/regulations\?q=alpha/);
});

test("list chooser: the candidate list URL is matched ignoring percent-encoding and including its query", () => {
  const c = listCands(1, ["/market?q=carbon border"]);
  assert.deepEqual(onlyGrade(judgeContentRun([candList("/market?q=carbon%20border", GRADE, false)], c)), []);
  // A different query on the same list path is a different page: not the candidate list.
  assert.equal(onlyGrade(judgeContentRun([page("list", "/market?q=other", { candidateList: true })], c)).length, 1);
});

test("list chooser: candidates exist but no list page could be chosen is a named HOLD (carrying the count), never a pass or a fail", () => {
  const { findings, holds } = judgeContentRun([page("list", "/regulations"), page("detail", "/regulations/a")], listCands(3, []));
  assert.deepEqual(findings.filter((f) => f.invariant === INVARIANTS.GRADE_CHIP), []);
  const h = holds.find((x) => x.key === GRADE);
  assert.deepEqual([h.state, h.candidates], ["hold", 3]);
  assert.match(h.reason, /no list page/);
});

test("list chooser: a candidate file without listVisit (an older file) is judged over every list page as before", () => {
  const legacy = cands(2, ["/regulations/a"]);
  assert.equal(onlyGrade(judgeContentRun([without("list", "/regulations", GRADE), without("list", "/market", GRADE)], legacy)).length, 1);
  assert.deepEqual(onlyGrade(judgeContentRun([without("list", "/regulations", GRADE), page("list", "/market")], legacy)), []);
});

test("list chooser: zero candidates is still a HOLD whatever listVisit says", () => {
  const { findings, holds } = judgeContentRun(bareRun(), listCands(0, []));
  assert.deepEqual(findings.filter(isConditional), []);
  assert.equal(holds.length, CONDITIONAL.length);
});

test("list chooser: a candidate list page is exempt from the `each` list requirements (a filtered list need not show a tier square) but not from the rest", () => {
  const filtered = without("list", "/regulations?q=alpha", "tier-square@list", { candidateList: true });
  assert.deepEqual(checkContentSnapshot(filtered), []);
  assert.equal(checkContentSnapshot({ ...filtered, candidateList: false }).length, 1, "the same page unflagged still fails the tier square");
});

test("formatSummary prints each hold as a HOLD line naming the invariant and the count; the totals line carries the hold count; buildReport records them", () => {
  const { findings, holds } = judgeContentRun(bareRun(), cands(0));
  const lines = formatSummary(findings, holds);
  assert.match(lines.find((l) => l.startsWith("HOLD content-inferences-section")), /\[candidates=0\]$/);
  assert.match(lines[lines.length - 1], /, 4 hold\(s\)$/);
  assert.equal(formatSummary([], []).at(-1), "live smoke: 0 failure(s), 0 warning(s)", "no holds, the totals line is unchanged");
  const report = buildReport({ baseUrl: "https://x.test", pages: [], findings, holds, candidates: cands(0) });
  assert.equal(report.holdCount, 4);
  assert.equal(report.failureCount, 0);
  assert.deepEqual(report.candidates, { resolved: true, counts: { inference: 0, record: 0, bias: 0 } });
  assert.equal(report.holds[0].candidates, 0);
  assert.equal(buildReport({ baseUrl: "https://x.test", pages: [], findings: [] }).candidates.resolved, false);
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
