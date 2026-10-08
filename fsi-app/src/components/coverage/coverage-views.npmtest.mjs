// coverage-views.npmtest.mjs: lane COV-1 (2026-10-08). The Coverage page, a surface's denominator line and the
// portfolio-add line, rendered from FIXTURE data with the real components (esbuild + react-dom/server, the
// ImpactMeter.npmtest.mjs approach). The claims are about rendered output: the page is generated from the matrix,
// every cell shows numerator and denominator beside each other with its own static URL, a gap is the "not covered"
// state with a request action, a failed read is the "error" state and never an empty matrix, and the version and
// both dates are on the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/

async function compile(rel, tag) {
  const outfile = join(resolve(REPO_ROOT, "scripts/tmp"), `${tag}-npmtest-${process.pid}-${Date.now()}.mjs`);
  await esbuild.build({
    entryPoints: [resolve(REPO_ROOT, rel)],
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    outfile,
    logLevel: "silent",
    absWorkingDir: REPO_ROOT,
    // Prefer the ESM entry of bundled packages (lucide-react ships a CJS main that require()s react, which an ESM bundle cannot do).
    mainFields: ["module", "main"],
    alias: { "@": resolve(REPO_ROOT, "src") },
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "@supabase/*", "next/*", "next"],
    // next/link and next/navigation need the app router at runtime; the claims under test are the anchors and the text
    // rendered, so the two are stubbed (a plain anchor, and a router that does nothing).
    plugins: [
      {
        name: "stub-next",
        setup(b) {
          const STUBS = {
            "next/link": 'import React from "react"; export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children); }',
            "next/navigation": "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; } export function usePathname() { return '/'; } export function useSearchParams() { return new URLSearchParams(); }",
          };
          b.onResolve({ filter: /^next[/](link|navigation)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js", resolveDir: REPO_ROOT }));
        },
      },
    ],
  });
  const mod = await import(pathToFileURL(outfile).href);
  try {
    unlinkSync(outfile);
  } catch {
    // gitignored scratch
  }
  return mod;
}

const { CoveragePageView } = await compile("src/components/coverage/CoveragePageView.tsx", "coveragepage");
const { CoverageDenominatorLineView } = await compile("src/components/coverage/CoverageDenominatorLineView.tsx", "coverageline");
const { PortfolioCoverageLine } = await compile("src/components/portfolio/PortfolioAddSearch.tsx", "portfolioline");
const { buildCoverageMatrix, buildCoverageView, parseCoverageQuery, surfaceDenominator } = await import("../../lib/coverage/coverage-matrix.mjs");

const NOW = "2026-10-08T09:00:00.000Z";
const e = (id, jurisdiction, surfaces, relevance, identity, extra = {}) => ({ id, jurisdiction, surfaces, relevance, identity, ...extra });
const ENTRIES = [
  e("a", "EU", ["regulations"], "firm", "verified"),
  e("b", "EU", ["regulations"], "firm", "pending"),
  e("c", "GB", ["research"], "firm", "verified"),
];
const LABELS = { EU: "European Union", GB: "United Kingdom" };
const matrix = buildCoverageMatrix(ENTRIES, { generatedAt: NOW, verifiedBriefs: 41, labelOf: (c) => LABELS[c] ?? c });

function page(search = "", over = {}) {
  const query = parseCoverageQuery(new URLSearchParams(search));
  return renderToStaticMarkup(
    React.createElement(CoveragePageView, { matrix, view: buildCoverageView(matrix, query), query, error: null, dateLabel: "Thursday, October 8, 2026", nowIso: NOW, ...over })
  );
}

test("the page is generated from the matrix: version, generation date, a data as-of that says when it is not recorded", () => {
  const out = page();
  assert.match(out, new RegExp(`Version ${matrix.version}`));
  assert.match(out, /generated October 8, 2026/);
  assert.match(out, /data as of not recorded by the index yet/);
});

test("every present cell shows its numerator and denominator side by side and links to its own static URL", () => {
  const out = page();
  assert.match(out, /href="\/dashboard\/coverage\?data_class=regulations&amp;geography=EU"/);
  assert.match(out, /Regulations in European Union: 1 of 2 dual-verified/);
  assert.match(out, /Research in United Kingdom: 1 of 1 dual-verified/);
  assert.match(out, />1 of 2</, "the fraction is one run of text: numerator and denominator side by side");
  assert.match(out, /platform total is/);
});

test("a gap cell is the not-covered state (declared dash with its explanation), not a zero, and is still a link", () => {
  const out = page();
  assert.match(out, /Research in European Union: not covered, open the cell to request coverage/);
  assert.match(out, /data-coverage-state="not_covered"/);
  assert.doesNotMatch(out, /0<!-- --> of <!-- -->0/, "no 0 of 0 is ever drawn");
});

test("the mode axis is named as a gap when no instrument carries a mode, with the request action", () => {
  const out = page();
  assert.match(out, /Transport mode on the catalogue is not covered yet\./);
  assert.match(out, /sits in the untagged mode/);
  assert.match(out, />Request coverage</);
});

test("a selected cell with no instrument is a named gap with Request coverage; a present one is not", () => {
  const gap = page("data_class=research&geography=EU");
  assert.match(gap, /Selected cell/);
  assert.match(gap, /Nothing has been catalogued in this cell yet\./);
  const present = page("data_class=regulations&geography=EU");
  assert.match(present, /Selected cell/);
  assert.match(present, /catalogued instruments here are dual-verified/);
  assert.doesNotMatch(present, /Nothing has been catalogued in this cell yet/);
  const unknown = page("data_class=research&geography=ZZ");
  assert.match(unknown, /This combination is not in the catalogue\./);
});

test("a failed read renders the error state with a retry to this very view, and no numbers", () => {
  const out = page("data_class=regulations", { error: "Coverage could not be read just now." });
  assert.match(out, /role="alert"/);
  assert.match(out, /data-coverage-state="error"/);
  assert.match(out, /href="\/dashboard\/coverage\?data_class=regulations"[^>]*>Retry</);
  assert.doesNotMatch(out, /catalogued instruments in this view|Download CSV|<select/);
});

test("the export, the form and the definitions are on the page; the verified-brief count is separate", () => {
  const out = page();
  assert.match(out, /Download CSV/);
  assert.match(out, /<form [^>]*action="\/dashboard\/coverage" method="get"/);
  for (const name of ["data_class", "geography", "mode"]) assert.match(out, new RegExp(`<select name="${name}"`));
  assert.match(out, /41 on the platform\./);
  assert.match(out, /counted separately and never mixed into the cells/);
});

test("the methodology drawer states the numerator definition in one line and is closed by default", () => {
  const out = page();
  assert.match(out, /<details data-part="coverage-methodology">/);
  assert.doesNotMatch(out, /<details[^>]*open/);
  assert.match(out, /A cell&#x27;s figure is the catalogued instruments that are dual-verified/);
});

test("rows are wrapping flex rows with a guarded title, not a table that would overflow at 375", () => {
  const out = page();
  assert.doesNotMatch(out, /<table/);
  assert.match(out, /data-guard-title/);
  assert.match(out, /flex-wrap:wrap/);
  assert.match(out, /min-height:44px/);
});

test("no catalogue entry fields leak into the page", () => {
  assert.doesNotMatch(page(), /document_url|instrument_identifier|"id":"a"/);
});

test("once entries carry modes and a check date, the mode filter lists them, the as-of is a date, and the tagged count is stated", () => {
  const withModes = buildCoverageMatrix(
    [
      e("a", "EU", ["regulations"], "firm", "verified", { modes: ["air", "road"], checkedAt: "2026-10-02T00:00:00Z" }),
      e("b", "EU", ["regulations"], "firm", "pending", { modes: [], checkedAt: "2026-09-01T00:00:00Z" }),
    ],
    { generatedAt: NOW, labelOf: (c) => c }
  );
  const query = parseCoverageQuery(new URLSearchParams(""));
  const out = renderToStaticMarkup(
    React.createElement(CoveragePageView, { matrix: withModes, view: buildCoverageView(withModes, query), query, error: null, dateLabel: "x", nowIso: NOW })
  );
  assert.match(out, /data as of October 2, 2026/);
  assert.match(out, /<option value="air">Air<\/option>/);
  assert.match(out, /<option value="road">Road<\/option>/);
  assert.match(out, /Transport mode is tagged on <span[^>]*>1 of 2<\/span> catalogued/);
  assert.doesNotMatch(out, /Transport mode on the catalogue is not covered yet/, "the gap is gone once any instrument has a mode");
});

// ── denominator line ─────────────────────────────────────────────────────

const den = surfaceDenominator("regulations", { total: 340, dualVerified: 120, verifiedBriefs: 56 });
const line = (props) => renderToStaticMarkup(React.createElement(CoverageDenominatorLineView, { surfacePath: "/regulations", ...props }));

test("the denominator line puts numerator and denominator side by side, the verified briefs separately, and links to the cell", () => {
  const out = line({ denominator: den, error: null });
  assert.match(out, /Coverage: 120 of 340 catalogued Regulations instruments are dual-verified\. 56 verified briefs are on the platform\./);
  assert.match(out, /href="\/dashboard\/coverage\?data_class=regulations"[^>]*>See coverage</);
  assert.match(out, /width:100%/, "takes the column it sits in (lane P3)");
});

test("nothing catalogued is the not-covered state with a request; a failed read is the error state with a retry to this page", () => {
  const none = line({ denominator: { ...den, numerator: 0, denominator: 0 }, error: null });
  assert.match(none, /data-coverage-state="not_covered"/);
  assert.match(none, /The Regulations catalogue is not covered yet\./);
  assert.match(none, />Request coverage</);
  const failed = line({ denominator: null, error: "x" });
  assert.match(failed, /data-coverage-state="error"/);
  assert.match(failed, /href="\/regulations"[^>]*>Retry</);
  assert.doesNotMatch(failed, /0 of 0/);
});

// ── portfolio-add line ───────────────────────────────────────────────────

const CLASSES = [
  { code: "regulations", label: "Regulations", numerator: 120, denominator: 340 },
  { code: "market_intel", label: "Market Intel", numerator: 4, denominator: 11 },
];
const pline = (itemType, classes = CLASSES) => renderToStaticMarkup(React.createElement(PortfolioCoverageLine, { itemType, classes }));

test("portfolio-add: the line is the coverage of the cell the item sits in, linked, per surface", () => {
  const reg = pline("regulation");
  assert.match(reg, /Coverage for this: 120 of 340 catalogued Regulations instruments are dual-verified\./);
  assert.match(reg, /href="\/dashboard\/coverage\?data_class=regulations"/);
  const mkt = pline("market_signal");
  assert.match(mkt, /Coverage for this: 4 of 11 catalogued Market Intel instruments are dual-verified\./);
  assert.match(mkt, /href="\/dashboard\/coverage\?data_class=market_intel"/);
});

test("portfolio-add: an item with no census surface is the not-applicable dash explained on hover; an uncatalogued surface is a named gap", () => {
  assert.match(pline(null), /data-coverage-state="not_applicable"/);
  assert.match(pline("tool"), /data-coverage-state="not_applicable"/);
  const gap = pline("research_finding", CLASSES);
  assert.match(gap, /data-coverage-state="not_covered"/);
  assert.match(gap, />Request coverage</);
});
