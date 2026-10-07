// Regression tests for src/components/ui/ImpactMeter.tsx. Rewritten (lane PAR-1, 2026-10-07) for Claude
// Design artboard 22 ruling B: "Twelve equal 12 px segments in four groups of three, filled left to
// right in the ramp colour. Replaces the stepped four-bar meter everywhere, legend included." The
// parts brief's acceptance line ("group rows by N, every row renders byte-identical meter markup",
// docs/design/parts-brief-2026-09-18.md section 2.16) is a claim about REAL RENDERED OUTPUT, not source
// text, so this file departs from the plain-source-regex convention most `*.npmtest.mjs` files in this
// repo use and instead compiles the real component with esbuild (already a project dependency,
// `.discipline/rendering/smoke/harness.mjs` uses the same package to bundle real .tsx components for
// the Playwright smoke suite) and renders it with `react-dom/server`'s `renderToStaticMarkup`,
// entirely in Node, no browser. `react`/`react-dom` are left external so the component renders with
// the SAME React the app ships, not a bundled copy.
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

const { ImpactMeter, rampColor, sumScores, segmentFilled, isImpactScored } = mod;

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
// Geometry (artboard 22 ruling B): twelve equal segments, four groups of three, 12 px, left to right.
// ---------------------------------------------------------------------------------------------

test("geometry constants: twelve segments in groups of three, 12 px tall, equal", () => {
  assert.equal(mod.ROW_SEGMENT_COUNT, 12);
  assert.equal(mod.ROW_SEGMENT_GROUP_SIZE, 3);
  assert.equal(mod.ROW_SEGMENT_HEIGHT_PX, 12);
  assert.equal(mod.ROW_TRACK_COLOR, "#E5E1DB");
});

test("the four-bar implementation is gone: no stepped heights, no per-bar fill fraction", () => {
  assert.equal(mod.ROW_BAR_HEIGHTS_PX, undefined);
  assert.equal(mod.ROW_BAR_WIDTH_PX, undefined);
  assert.equal(mod.barFillFraction, undefined);
  assert.doesNotMatch(SOURCE, /ROW_BAR_|barFillFraction|stepped fill/);
});

test("a scored row renders twelve equal segments in four groups of three", () => {
  const markup = render({ scores: { cost: 3, compliance: 3, client: 3, operational: 3 } }); // N=12
  assert.equal([...markup.matchAll(/class="cl-impact-bar"/g)].length, 12);
  const groups = markup.split('class="cl-impact-group"').slice(1);
  assert.equal(groups.length, 4);
  for (const g of groups) {
    assert.equal([...g.slice(0, g.indexOf("</span></span>") + 14).matchAll(/class="cl-impact-bar"/g)].length >= 3, true);
  }
  // every segment carries the same size, whatever N is
  const sizes = new Set([...markup.matchAll(/class="cl-impact-bar" style="[^"]*?(width:\d+px;height:\d+px)/g)].map((m) => m[1]));
  assert.equal(sizes.size, 1);
  assert.match(markup, /width:3px;height:12px/);
});

test("each group holds exactly three segments (group markup, not a count of the whole)", () => {
  const markup = render({ total: 5 });
  const perGroup = [...markup.matchAll(/<span aria-hidden="true" class="cl-impact-group"[^>]*>((?:<span[^>]*class="cl-impact-bar"[^>]*><\/span>)+)<\/span>/g)].map(
    (m) => [...m[1].matchAll(/class="cl-impact-bar"/g)].length
  );
  assert.deepEqual(perGroup, [3, 3, 3, 3]);
});

test("segmentFilled: segment i is filled when i < N, so the fill runs left to right", () => {
  assert.equal(segmentFilled(1, 0), true);
  assert.equal(segmentFilled(1, 1), false);
  const n8 = Array.from({ length: 12 }, (_, i) => segmentFilled(8, i)).map(Number).join("");
  assert.equal(n8, "111111110000");
  assert.equal(Array.from({ length: 12 }, (_, i) => segmentFilled(12, i)).every(Boolean), true);
  assert.equal(Array.from({ length: 12 }, (_, i) => segmentFilled(0, i)).some(Boolean), false);
});

test("the painted markup fills exactly N segments, leftmost first, the rest the track colour", () => {
  for (const n of [1, 2, 5, 8, 11, 12]) {
    const markup = render({ total: n });
    const backgrounds = [...markup.matchAll(/class="cl-impact-bar" style="[^"]*?background:(#[0-9A-F]{6})/g)].map((m) => m[1]);
    assert.equal(backgrounds.length, 12);
    const filled = backgrounds.map((c) => c !== "#E5E1DB");
    assert.deepEqual(filled, Array.from({ length: 12 }, (_, i) => i < n), `N=${n}`);
  }
});

test("the accessible label states the value in words and the segments are decoration", () => {
  const markup = render({ total: 8 });
  assert.match(markup, /aria-label="Impact 8 of 12"/);
  assert.equal([...markup.matchAll(/class="cl-impact-bar"/g)].length, 12);
  assert.equal([...markup.matchAll(/aria-hidden="true" class="cl-impact-group"/g)].length, 4);
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

test("every filled segment in one row shares the SAME colour (never a per-segment colour)", () => {
  const markup = render({ scores: { cost: 1, compliance: 2, client: 2, operational: 2 } }); // N=7
  const fillColors = [...markup.matchAll(/class="cl-impact-bar" style="[^"]*?background:(#[0-9A-F]{6})/g)]
    .map((m) => m[1])
    .filter((c) => c !== "#E5E1DB");
  assert.equal(fillColors.length, 7);
  assert.ok(fillColors.every((c) => c === fillColors[0]), "every filled segment is the same colour");
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

test("unscored renders the same twelve segments, dashed outline, no fill, no word", () => {
  const markup = render({ scores: null });
  assert.match(markup, /cl-impact-unscored/);
  const outlines = [...markup.matchAll(/border:1px dashed rgba\(0,0,0,\.3\)/g)];
  assert.equal(outlines.length, 12, "all twelve segments are dashed outlines");
  assert.equal([...markup.matchAll(/class="cl-impact-group"/g)].length, 4);
  assert.match(markup, /width:3px;height:12px/);
  // no fill: unlike the scored branch, no segment carries a `background:#RRGGBB` fill
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
  // 2026-09-25 (Absence rule reversal, look-only pass against the new artboards): the dash variant's
  // aria-label/title now carry the closed-vocabulary NEEDS_PHRASE text, not the raw reason string.
  assert.match(markup, /class="cl-absence-dash" data-absence="dash" aria-label="needs scoring inputs" title="needs scoring inputs"/);
  assert.match(markup, />\u2014<\/span>/);
});

test("isImpactScored still gates on any dimension >= 1 (unchanged predicate, still exported)", () => {
  assert.equal(isImpactScored(null), false);
  assert.equal(isImpactScored({ cost: 0, compliance: 0, client: 0, operational: 0 }), false);
  assert.equal(isImpactScored({ cost: 0, compliance: 1, client: 0, operational: 0 }), true);
});

// ---------------------------------------------------------------------------------------------
// No media query on the row variant: the meter draws the same twelve segments at every width; the row
// (ListRow.tsx) owns the three layouts and the meter fits its fixed 88px impact track in all of them.
// ---------------------------------------------------------------------------------------------

test("the row variant carries no @media rule (the same meter at every width)", () => {
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
  // Amendment 2 added `data-part-slot="column-label"` ahead of `style={cellStyle}` on this span;
  // tolerate that (or any other) attribute in between rather than pin the exact attribute set.
  assert.match(listRowSource, /<span[^>]*style=\{cellStyle\}>Impact<\/span>/);
});
