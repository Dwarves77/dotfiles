// live-smoke-content.test.mjs (lane SMOKE-2, 2026-10-08): the RUNNER's content wiring, proven against a stub browser
// (no playwright, no network): runLiveSmoke with `contentChecks` measures each page kind's requirements through the
// real collector entry, judges the `each` scope per page and the `any` scope over the run, and reports a missing
// element under its own named invariant. Without `contentChecks` the runner behaves exactly as before.
import test from "node:test";
import assert from "node:assert/strict";
import { runLiveSmoke, VIEWPORTS, LIST_SURFACES } from "./live-smoke.mjs";
import { INVARIANTS } from "./live-assertions.mjs";
import { CONTENT_REQUIREMENTS, CONTENT_INVARIANT_IDS } from "./live-content.mjs";
import { collectSnapshotInPage, collectLinksInPage, collectContentInPage } from "./live-snapshot.mjs";
import { collectContainersInPage } from "../overflow-rule.mjs";

const CONTENT_IDS = new Set(Object.values(CONTENT_INVARIANT_IDS));
const BASE = "https://fixture.test";

/** A Playwright-shaped stub. `absent(path, key)` says whether a requirement's element is missing on that page. */
function stubBrowser({ absent = () => false } = {}) {
  const pageFor = () => {
    let current = "/";
    return {
      on: () => {},
      close: async () => {},
      url: () => `${BASE}${current}`,
      goto: async (url) => {
        current = new URL(url).pathname;
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
            out[req.key] = absent(current, req.key)
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

test("ATTACK: the Inferences section missing from every detail page fails once per viewport, by its own invariant", async () => {
  const r = await run({ contentChecks: true }, { absent: (path, key) => key === "inferences-section@detail" });
  const f = contentFindings(r);
  assert.deepEqual(f.map((x) => [x.invariant, x.viewport]), [
    [INVARIANTS.INFERENCES_SECTION, 1440],
    [INVARIANTS.INFERENCES_SECTION, 375],
  ]);
  assert.match(f[0].text, /#inferences/);
  assert.match(r.lines.find((l) => l.startsWith("FAIL content-inferences-section")), /detail page: missing Inferences section/);
  assert.equal(r.report.byInvariant[INVARIANTS.INFERENCES_SECTION], 2);
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
