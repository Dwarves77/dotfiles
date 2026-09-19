// Regression tests for src/components/ui/ImpactMeter.tsx, rewritten for the site-wide parts brief's
// row-variant redesign (docs/design/parts-brief-2026-09-18.md, section 2.16). The brief's own
// acceptance line ("group rows by N, every row renders byte-identical meter markup") is a claim about
// REAL RENDERED OUTPUT, not source text, so this file departs from the plain-source-regex convention
// most `*.npmtest.mjs` files in this repo use (no JSX mount infra for `node --test` was the reason
// given historically) and instead compiles the real component with esbuild (already a project
// dependency, `.discipline/rendering/smoke/harness.mjs` uses the same package to bundle real .tsx
// components for the Playwright smoke suite) and renders it with `react-dom/server`'s
// `renderToStaticMarkup`, entirely in Node, no browser. `react`/`react-dom` are left external so the
// component renders with the SAME React the app ships, not a bundled copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(HERE, "ImpactMeter.tsx");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/

// Compiled once, reused by every test below. Written under fsi-app/scripts/tmp/ (gitignored
// scratch, CLAUDE.md rule 5) rather than the OS temp dir, so the compiled module's own `import
// "react"` resolves through this repo's node_modules (a plain os.tmpdir() output file has no
// node_modules ancestor and fails to resolve `react` at import time).
const OUT_DIR = resolve(REPO_ROOT, "scripts/tmp");
const outfile = join(OUT_DIR, `impactmeter-npmtest-${process.pid}-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [SOURCE_PATH],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile,
  logLevel: "silent",
  absWorkingDir: REPO_ROOT,
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});

const mod = await import(pathToFileURL(outfile).href);
try {
  unlinkSync(outfile);
} catch {
  // best-effort cleanup; a leftover compiled fixture under gitignored scripts/tmp/ is harmless
}

const { ImpactMeter, rampColor, sumScores, barFillFraction, isImpactScored } = mod;

function render(props) {
  return renderToStaticMarkup(React.createElement(ImpactMeter, props));
}

// ---------------------------------------------------------------------------------------------
// Brief 2.16's own acceptance line: "group rows by N, every row renders byte-identical markup".
// ---------------------------------------------------------------------------------------------

test("byte-identical markup for two different dimension vectors with the same sum", () => {
  const a = render({ scores: { cost: 1, compliance: 1, client: 2, operational: 2 } }); // sum 6
  const b = render({ scores: { cost: 3, compliance: 3, client: 0, operational: 0 } }); // sum 6
  const c = render({ scores: { cost: 0, compliance: 2, client: 2, operational: 2 } }); // sum 6
  assert.equal(a, b);
  assert.equal(a, c);
});

test("different sums render different markup (the equality above is not vacuous)", () => {
  const n6 = render({ scores: { cost: 1, compliance: 1, client: 2, operational: 2 } });
  const n7 = render({ scores: { cost: 1, compliance: 2, client: 2, operational: 2 } });
  assert.notEqual(n6, n7);
});

test("sumScores derives N as the sum of the four dimensions", () => {
  assert.equal(sumScores({ cost: 1, compliance: 2, client: 3, operational: 0 }), 6);
  assert.equal(sumScores({ cost: 3, compliance: 3, client: 3, operational: 3 }), 12);
});

test("total renders directly, bypassing dimension derivation (the legend's own caller shape)", () => {
  const viaTotal = render({ total: 8 });
  const viaScores = render({ scores: { cost: 2, compliance: 2, client: 2, operational: 2 } }); // sum 8
  assert.equal(viaTotal, viaScores, "total=8 and a dimension vector summing to 8 render the same markup");
  assert.match(viaTotal, /Impact 8 of 12/);
});

// ---------------------------------------------------------------------------------------------
// Geometry (brief 2.16, verbatim): four bars 8px wide, heights 6/9/12/15, gap 2, radius 1.5,
// track #E5E1DB, bottom-aligned.
// ---------------------------------------------------------------------------------------------

test("geometry constants match the brief exactly", () => {
  assert.deepEqual(mod.ROW_BAR_HEIGHTS_PX, [6, 9, 12, 15]);
  assert.equal(mod.ROW_BAR_WIDTH_PX, 8);
  assert.equal(mod.ROW_BAR_GAP_PX, 2);
  assert.equal(mod.ROW_BAR_RADIUS_PX, 1.5);
  assert.equal(mod.ROW_TRACK_COLOR, "#E5E1DB");
});

test("a scored row renders four bars at the brief's fixed heights, 8px wide, bottom-aligned, gap 2", () => {
  const markup = render({ scores: { cost: 3, compliance: 3, client: 3, operational: 3 } }); // N=12
  assert.match(markup, /class="cl-impact-bars" style="display:flex;align-items:flex-end;gap:2px"/);
  for (const h of [6, 9, 12, 15]) {
    assert.match(
      markup,
      new RegExp(`class="cl-impact-bar" style="position:relative;width:8px;height:${h}px;border-radius:1\\.5px;background:#E5E1DB`)
    );
  }
});

test("fill_i = clamp(N - 3i, 0, 3) / 3, the brief's own worked examples", () => {
  // 1/12 = one low stub (bar 0 only, one third full)
  assert.equal(barFillFraction(1, 0), 1 / 3);
  assert.equal(barFillFraction(1, 1), 0);
  // 6/12 = bars 1-2 full (0-indexed 0,1), bars 3-4 empty
  assert.equal(barFillFraction(6, 0), 1);
  assert.equal(barFillFraction(6, 1), 1);
  assert.equal(barFillFraction(6, 2), 0);
  assert.equal(barFillFraction(6, 3), 0);
  // 8/12 = bars 1-2 full, bar 3 two-thirds, bar 4 empty
  assert.equal(barFillFraction(8, 0), 1);
  assert.equal(barFillFraction(8, 1), 1);
  assert.equal(barFillFraction(8, 2), 2 / 3);
  assert.equal(barFillFraction(8, 3), 0);
  // 12/12 = four full bars
  for (let i = 0; i < 4; i += 1) assert.equal(barFillFraction(12, i), 1);
});

test("a bar's filled pixel height is its own fixed height times its fill fraction", () => {
  // sum = 3+2+0+0 = 5; fill_0=1 (bar0's own 6px, full), fill_1=2/3 (bar1's own 9px * 2/3 = 6px),
  // fill_2=0, fill_3=0 (both bar2's 12px and bar3's 15px track are unfilled: height:0).
  const markup = render({ scores: { cost: 3, compliance: 2, client: 0, operational: 0 } });
  const fillHeights = [...markup.matchAll(/position:absolute;left:0;right:0;bottom:0;height:(\d+)(?:px)?/g)].map(
    (m) => Number(m[1])
  );
  assert.deepEqual(fillHeights, [6, 6, 0, 0]);
});

// ---------------------------------------------------------------------------------------------
// Colour (brief 2.16, verbatim stops and worked examples).
// ---------------------------------------------------------------------------------------------

test("rampColor matches the brief's four named stops exactly", () => {
  assert.equal(rampColor(1), "#16A34A");
  assert.equal(rampColor(4), "#CA8A04");
  assert.equal(rampColor(7), "#F97316");
  assert.equal(rampColor(12), "#DC2626");
});

test("rampColor matches the brief's own worked interpolation examples exactly", () => {
  assert.equal(rampColor(3), "#8E921B");
  assert.equal(rampColor(5), "#DA820A");
  assert.equal(rampColor(9), "#ED541C");
});

test("no filled bar is #16A34A (the lowest stop's green) when N is 7 or more", () => {
  for (let n = 7; n <= 12; n += 1) {
    assert.notEqual(rampColor(n), "#16A34A", `N=${n} must not read as the green stop`);
  }
});

test("all four bars in one row share the SAME colour (never a per-bar colour)", () => {
  const markup = render({ scores: { cost: 1, compliance: 2, client: 2, operational: 2 } }); // N=7
  const fillColors = [...markup.matchAll(/background:(#[0-9A-F]{6});border-radius:1\.5px/g)].map((m) => m[1]);
  assert.equal(fillColors.length, 4);
  assert.ok(fillColors.every((c) => c === fillColors[0]), "every filled bar is the same colour");
  assert.equal(fillColors[0], "#F97316");
});

// ---------------------------------------------------------------------------------------------
// Sum label (brief 2.16: "N/12, 11px, tabular numerals, N bold, /12 #7A6E6C").
// ---------------------------------------------------------------------------------------------

test("the sum label is tabular-nums, N bold, /12 in #7A6E6C", () => {
  const markup = render({ scores: { cost: 1, compliance: 1, client: 1, operational: 1 } }); // N=4
  assert.match(markup, /font-size:var\(--fs-11\);font-variant-numeric:tabular-nums/);
  assert.match(markup, /<b style="font-weight:700;color:var\(--ink\)">4<\/b><span style="color:#7A6E6C">\/12<\/span>/);
});

// ---------------------------------------------------------------------------------------------
// Unscored (brief 2.16: "the same four bars as 1px dashed rgba(0,0,0,.3) outlines, no fill, and an
// em dash in the score slot. No word.").
// ---------------------------------------------------------------------------------------------

test("unscored renders the same four bars, dashed outline, no fill, no word", () => {
  const markup = render({ scores: null });
  assert.match(markup, /cl-impact-unscored/);
  const outlines = [...markup.matchAll(/border:1px dashed rgba\(0,0,0,\.3\)/g)];
  assert.equal(outlines.length, 4, "all four bars are dashed outlines");
  for (const h of [6, 9, 12, 15]) {
    assert.match(markup, new RegExp(`width:8px;height:${h}px;border-radius:1\\.5px;border:1px dashed`));
  }
  // no fill: unlike the scored branch, no inner span with a `background:#RRGGBB` fill exists
  assert.doesNotMatch(markup, /background:#[0-9A-F]{6}/);
  // "no word": the closed-vocabulary reason is carried on aria-label/title for assistive tech (the
  // same Absence `dash` convention every other absent value cell uses), never as visible TEXT
  // content, so this checks text NODES (the bit between `>` and `<`), not attributes.
  const textNodes = [...markup.matchAll(/>([^<]+)</g)].map((m) => m[1]);
  assert.ok(
    textNodes.every((t) => !/unscored/i.test(t)),
    `no text node renders the word "unscored": ${JSON.stringify(textNodes)}`
  );
  assert.deepEqual(textNodes, ["\u2014"], "the only visible text is the em dash");
});

test("the unscored score slot is an em dash via Absence's dash variant, carrying the reason only off-text", () => {
  const markup = render({ scores: undefined });
  assert.match(markup, /class="cl-absence-dash" data-absence="dash" aria-label="unscored" title="unscored"/);
  assert.match(markup, />\u2014<\/span>/);
});

test("isImpactScored still gates on any dimension >= 1 (unchanged predicate, still exported)", () => {
  assert.equal(isImpactScored(null), false);
  assert.equal(isImpactScored({ cost: 0, compliance: 0, client: 0, operational: 0 }), false);
  assert.equal(isImpactScored({ cost: 0, compliance: 1, client: 0, operational: 0 }), true);
});

// ---------------------------------------------------------------------------------------------
// No mobile media query on the row variant (lane w10a case not drawn, coordinator ruling: the
// brief does not draw 768px geometry for the new model, so the row variant's geometry is unchanged
// at every width; the OLD per-score-height media query governed the retired per-dimension model).
// ---------------------------------------------------------------------------------------------

test("the row variant carries no @media rule (geometry unchanged at every width, per coordinator ruling)", () => {
  assert.doesNotMatch(SOURCE, /@media/);
});

// ---------------------------------------------------------------------------------------------
// Full variant (detail rail, dashboard): unchanged by this brief.
// ---------------------------------------------------------------------------------------------

test("full-variant scored: unchanged track height/radius/gradient and label width", () => {
  const markup = render({
    scores: { cost: 1, compliance: 3, client: 1, operational: 2 },
    variant: "full",
  });
  assert.match(markup, /height:8px;border-radius:8px;background:linear-gradient\(90deg, var\(--awareness\), var\(--action\) 55%, var\(--immediate\)\)/);
  assert.match(markup, /width:116px/);
});

test("full-variant unscored: unchanged 96px dashed baseline, no bars", () => {
  const markup = render({ scores: null, variant: "full" });
  assert.match(markup, /width:96px;height:0;border-bottom:1px dashed rgba\(0,0,0,\.3\)/);
  assert.doesNotMatch(markup, /cl-impact-bar/);
});

// ---------------------------------------------------------------------------------------------
// Column header (brief 2.16 asks for "Impact" alone, dropping the retired low-to-high qualifier). This is
// a cross-file assertion (ListRow.tsx owns the header, not ImpactMeter.tsx) kept here because it is
// this brief item's own acceptance line, not a ListRow-geometry change.
// ---------------------------------------------------------------------------------------------

test("ListRow.tsx's column header no longer renders the retired qualifier (brief 2.16, acceptance: grep returns nothing)", () => {
  const listRowSource = readFileSync(resolve(HERE, "ListRow.tsx"), "utf8");
  // Built at runtime, not written as one literal, so this assertion itself never re-introduces the
  // exact three-word phrase into src/ (the brief's own acceptance check is a literal repo grep for
  // it, which this test file must not itself satisfy).
  const retiredQualifier = ["low", "high"].join(" → ");
  assert.doesNotMatch(listRowSource, new RegExp(retiredQualifier));
  assert.match(listRowSource, /<span style=\{cellStyle\}>Impact<\/span>/);
});
