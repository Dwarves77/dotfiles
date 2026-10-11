// live-smoke-content.test.mjs (lane SMOKE-2, 2026-10-08): the RUNNER's content wiring, proven against a stub browser
// (no playwright, no network): runLiveSmoke with `contentChecks` measures each page kind's requirements through the
// real collector entry, judges the `each` scope per page and the `any` scope over the run, and reports a missing
// element under its own named invariant. Without `contentChecks` the runner behaves exactly as before.
import test from "node:test";
import assert from "node:assert/strict";
import { runLiveSmoke, readCandidatesFile, VIEWPORTS, LIST_SURFACES } from "./live-smoke.mjs";
import { INVARIANTS } from "./live-assertions.mjs";
import { CONTENT_REQUIREMENTS, CONTENT_INVARIANT_IDS } from "./live-content.mjs";
import { collectSnapshotInPage, collectLinksInPage, collectContentInPage } from "./live-snapshot.mjs";
import { collectContainersInPage } from "../overflow-rule.mjs";

const CONTENT_IDS = new Set(Object.values(CONTENT_INVARIANT_IDS));
const BASE = "https://fixture.test";

/** A Playwright-shaped stub. `absent(path, key, pathAndQuery)` says whether a requirement's element is missing on that page. */
function stubBrowser({ absent = () => false } = {}) {
  const pageFor = () => {
    let current = "/";
    let currentFull = "/";
    return {
      on: () => {},
      close: async () => {},
      url: () => `${BASE}${current}`,
      goto: async (url) => {
        current = new URL(url).pathname;
        currentFull = `${current}${new URL(url).search}`;
        return { status: () => 200 };
      },
      fill: async () => {},
      click: async () => {},
      waitForURL: async () => {},
      waitForLoadState: async () => {},
      evaluate: async (fn, arg) => {
        if (fn === collectSnapshotInPage) {
          const kind = current === "/" ? "home" : current.split("/").filter(Boolean).length === 1 ? "list" : "detail";
          return {
            pathname: current, origin: BASE, textNodes: [], chips: [], blocks: [], tierChips: [], scaleTexts: [], adminLinks: [],
            rowCount: kind === "list" ? 5 : 0, mastheadTitle: kind === "detail" ? "An item" : null,
          };
        }
        if (fn === collectLinksInPage) return { first: `/${arg}/item-1`, chip: null };
        if (fn === collectContainersInPage) return { viewportWidth: 375, containers: [] };
        if (fn === collectContentInPage) {
          const out = {};
          for (const req of arg) {
            out[req.key] = absent(current, req.key, currentFull)
              ? []
              : [{ textLength: req.textMin + 30, children: req.childSelector ? (req.childMin ?? 1) + 1 : 0, matches: true, text: "stub" }];
          }
          return out;
        }
        return Array.isArray(arg) ? 0 : ""; // admin probe reads (cookie string, marker count, fetch): not under test here
      },
    };
  };
  return {
    newContext: async () => ({ newPage: async () => pageFor(), storageState: async () => ({ cookies: [] }), close: async () => {} }),
  };
}

const run = (opts, stub) => runLiveSmoke({ browser: stubBrowser(stub), baseUrl: BASE, email: "smoke@fixture.test", password: "x", ...opts });
const contentFindings = (r) => r.findings.filter((f) => CONTENT_IDS.has(f.invariant));

test("a site carrying every element passes the content checks at both viewports", async () => {
  const r = await run({ contentChecks: true });
  assert.deepEqual(contentFindings(r), []);
  assert.equal(r.report.pagesVisited.length, (1 + LIST_SURFACES.length + LIST_SURFACES.length) * VIEWPORTS.length);
});

test("contentChecks off (the default) measures nothing and reports no content finding, even when every element is absent", async () => {
  const r = await run({}, { absent: () => true });
  assert.deepEqual(contentFindings(r), []);
});

/** Resolved candidates for the runner tests: each class holds `count` items, visited at `visit`. */
const candidatesOf = (count, visit = []) => ({
  resolved: true,
  classes: Object.fromEntries(["inference", "record", "bias"].map((c) => [c, { count, visit: count ? visit : [], sample: visit }])),
});
const inferenceFindings = (r) => r.findings.filter((f) => f.invariant === INVARIANTS.INFERENCES_SECTION);

test("ATTACK: a candidate item exists but its page renders no Inferences section: FAIL once per viewport, by its own invariant", async () => {
  const r = await run(
    { contentChecks: true, candidates: candidatesOf(2, ["/regulations/cand-inf"]) },
    { absent: (path, key) => key === "inferences-section@detail" && path === "/regulations/cand-inf" },
  );
  const f = contentFindings(r);
  assert.deepEqual(f.map((x) => [x.invariant, x.viewport]), [
    [INVARIANTS.INFERENCES_SECTION, 1440],
    [INVARIANTS.INFERENCES_SECTION, 375],
  ]);
  assert.match(f[0].text, /#inferences/);
  assert.match(f[0].text, /2 inference candidate item\(s\) exist/);
  assert.match(r.lines.find((l) => l.startsWith("FAIL content-inferences-section")), /detail page: missing Inferences section/);
  assert.equal(r.report.byInvariant[INVARIANTS.INFERENCES_SECTION], 2);
  assert.equal(r.holds.some((h) => h.invariant === INVARIANTS.INFERENCES_SECTION), false);
});

test("CHOOSER: the runner visits the candidate item the live data names, at both viewports, and judges the section on THAT page", async () => {
  // Every discovered item (/<surface>/item-1) lacks the section; only the candidate page carries it. Before SMOKE-3 this
  // run failed (the fixed items were judged); now the candidate page is what is judged and it passes.
  const r = await run(
    { contentChecks: true, candidates: candidatesOf(1, ["/regulations/cand-inf"]) },
    { absent: (path, key) => key === "inferences-section@detail" && path !== "/regulations/cand-inf" },
  );
  assert.deepEqual(inferenceFindings(r), []);
  const visited = r.report.pagesVisited.filter((p) => p.url.endsWith("/regulations/cand-inf"));
  assert.deepEqual(visited.map((p) => p.viewport), [1440, 375]);
});

test("HOLD: a corpus with zero inference candidates is a named HOLD in the report and the log, with the count, and no content invariant fails", async () => {
  const r = await run({ contentChecks: true, candidates: candidatesOf(0) }, { absent: (path, key) => key === "inferences-section@detail" });
  assert.deepEqual(contentFindings(r), []);
  assert.deepEqual(Object.keys(r.report.byInvariant).filter((k) => CONTENT_IDS.has(k)), [], "no content invariant failed");
  const hold = r.holds.find((h) => h.invariant === INVARIANTS.INFERENCES_SECTION);
  assert.deepEqual([hold.state, hold.candidates, hold.candidate], ["hold", 0, "inference"]);
  assert.equal(r.report.holdCount, 4);
  assert.deepEqual(r.report.candidates, { resolved: true, counts: { inference: 0, record: 0, bias: 0 } });
  assert.ok(r.lines.some((l) => /^HOLD content-inferences-section .*\[candidates=0\]$/.test(l)));
  assert.match(r.lines.at(-1), /, 4 hold\(s\)$/, "the totals line carries the hold count");
});

test("HOLD: candidates that were never resolved (no file) hold as unresolved, and nothing extra is visited", async () => {
  const r = await run({ contentChecks: true, candidates: null }, { absent: () => false });
  assert.deepEqual(contentFindings(r), []);
  assert.ok(r.holds.length > 0 && r.holds.every((h) => h.candidates === null));
  assert.equal(r.report.candidates.resolved, false);
  assert.equal(r.report.pagesVisited.length, (1 + LIST_SURFACES.length + LIST_SURFACES.length) * VIEWPORTS.length);
});

test("readCandidatesFile: a readable JSON object is returned, a missing path, a missing file or garbage is null", () => {
  assert.deepEqual(readCandidatesFile("x.json", () => '{"resolved":true,"classes":{}}'), { resolved: true, classes: {} });
  assert.equal(readCandidatesFile(undefined), null);
  assert.equal(readCandidatesFile("x.json", () => { throw new Error("ENOENT"); }), null);
  assert.equal(readCandidatesFile("x.json", () => "not json"), null);
  assert.equal(readCandidatesFile("x.json", () => "null"), null);
});

test("ATTACK: one list losing its tier squares fails that list only; the dashboard rail missing fails the home page", async () => {
  const r = await run(
    { contentChecks: true },
    { absent: (path, key) => (path === "/research" && key === "tier-square@list") || (path === "/" && key === "across-pages-rail@home") },
  );
  const f = contentFindings(r);
  assert.deepEqual(
    f.map((x) => [x.invariant, x.path, x.viewport]).sort(),
    [
      [INVARIANTS.ACROSS_PAGES_RAIL, "/", 1440],
      [INVARIANTS.ACROSS_PAGES_RAIL, "/", 375],
      [INVARIANTS.TIER_SQUARE, "/research", 1440],
      [INVARIANTS.TIER_SQUARE, "/research", 375],
    ].sort(),
  );
});

test("every requirement of the table is measured by the runner (none is declared and left unwired)", async () => {
  const seen = new Set();
  const r = await run({ contentChecks: true }, { absent: (path, key) => { seen.add(key); return false; } });
  assert.deepEqual([...seen].sort(), CONTENT_REQUIREMENTS.map((q) => q.key).sort());
  assert.deepEqual(contentFindings(r), []);
});

// ---------------------------------------------------------------- the list-side chooser (lane SMOKE-4)
const gradeFindings = (r) => r.findings.filter((f) => f.invariant === INVARIANTS.GRADE_CHIP);
const listCandidates = (record, bias) => ({
  resolved: true,
  classes: {
    inference: { count: 0, visit: [], sample: [], listVisit: [] },
    record: { count: record.count, visit: [], sample: [], listVisit: record.listVisit },
    bias: { count: bias.count, visit: bias.visit ?? [], sample: [], listVisit: bias.listVisit },
  },
});
const REC = { count: 5, listVisit: ["/regulations?q=Record%20one"] };
const BIAS = { count: 7, visit: ["/market/biased-one"], listVisit: ["/market?q=Biased%20one"] };

test("LIST CHOOSER: the runner visits the filtered list a candidate row sits on, at both viewports, and judges the chip on THAT list", async () => {
  // Every plain list lacks the chips; only the filtered candidate lists carry them. Before SMOKE-4 this failed.
  const r = await run(
    { contentChecks: true, candidates: listCandidates(REC, BIAS) },
    { absent: (path, key, full) => (key === "grade-chip@list" || key === "bias-chips@list") && !full.includes("?q=") },
  );
  assert.deepEqual(gradeFindings(r), []);
  assert.deepEqual(r.findings.filter((f) => f.invariant === INVARIANTS.BIAS_CHIPS), []);
  const visited = (suffix) => r.report.pagesVisited.filter((p) => p.url.endsWith(suffix));
  assert.deepEqual(visited("/regulations?q=Record%20one").map((p) => p.viewport), [1440, 375]);
  assert.deepEqual(visited("/market?q=Biased%20one").map((p) => p.viewport), [1440, 375]);
});

test("LIST CHOOSER ATTACK: a candidate row's list renders no grade chip while a plain list carries one: FAIL once per viewport", async () => {
  const r = await run(
    { contentChecks: true, candidates: listCandidates(REC, BIAS) },
    { absent: (path, key, full) => key === "grade-chip@list" && full.includes("?q=Record") },
  );
  const f = gradeFindings(r);
  assert.deepEqual(f.map((x) => x.viewport), [1440, 375]);
  assert.match(f[0].text, /5 record candidate item\(s\) exist/);
  assert.match(r.lines.find((l) => l.startsWith("FAIL content-grade-chip")), /list page: missing grade chip/);
});

test("LIST CHOOSER: a filtered candidate list is not held to the `each` list requirements (no tier-square failure from it)", async () => {
  const r = await run(
    { contentChecks: true, candidates: listCandidates(REC, BIAS) },
    { absent: (path, key, full) => key === "tier-square@list" && full.includes("?q=") },
  );
  assert.deepEqual(r.findings.filter((f) => f.invariant === INVARIANTS.TIER_SQUARE), []);
});

test("LIST CHOOSER: no listVisit in the candidate file adds no list visit (older files behave as before)", async () => {
  const r = await run({ contentChecks: true, candidates: candidatesOf(2, ["/regulations/cand"]) });
  assert.equal(r.report.pagesVisited.filter((p) => p.url.includes("?q=")).length, 0);
});
