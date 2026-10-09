// Regression tests for src/components/ui/Timeline.tsx, lane DFIX-1 (2026-10-08): the MOBILE 390 text spec's
// vertical timeline. DAUDIT-2 (session log 2026-10-08-daudit2-design-audit.md, BUILD DEFECTS) found Timeline
// drew one horizontal layout at every width, so the six mobile-03-regulation-detail rows (#1567 to #1571
// and #1596) read MISMATCH or NOT BUILT. The oracle is the audit spec itself
// (.discipline/rendering/audit/spec/mobile-03-regulation-detail.json): the horizontal timeline is not drawn
// at 390, the vertical one is, each row a 62px / 14px / 1fr grid with 14px bottom padding, a right-aligned
// 62px date gutter, a 2px track behind the dots.
//
// Real rendered output, not source text: the component is bundled with esbuild and rendered with
// react-dom/server in Node (same technique as ImpactMeter.npmtest.mjs). Which block is visible at which width
// is decided by the component's own <style> text, so that text is asserted too.
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
const outfile = join(REPO_ROOT, "scripts/tmp", `timeline-npmtest-${process.pid}-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [resolve(HERE, "Timeline.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile,
  logLevel: "silent",
  absWorkingDir: REPO_ROOT,
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});
const { Timeline } = await import(pathToFileURL(outfile).href);
try {
  unlinkSync(outfile);
} catch {
  // best-effort cleanup of a gitignored scratch bundle
}

const BAND = { hex: "#DC2626", cssVar: "var(--critical)", label: "Critical" };
const THREE = [
  { date: "2024-01-01", label: "Entered into force", status: "past" },
  { date: "2099-06-30", label: "Transition deadline", status: "current" },
  { date: "2100-01-01", label: "Review date", status: "future" },
];
const SIX = [
  { date: "2024-01-01", label: "First", status: "past" },
  { date: "2099-02-01", label: "Second", status: "current" },
  { date: "2099-03-01", label: "Third", status: "future" },
  { date: "2099-04-01", label: "Fourth", status: "future" },
  { date: "2099-05-01", label: "Fifth", status: "future" },
  { date: "2099-06-01", label: "Sixth", status: "future" },
];

const render = (props) => renderToStaticMarkup(React.createElement(Timeline, { band: BAND, ...props }));

/** The inner HTML of the first element whose opening tag matches `openRe`, by tag depth. */
function elementHtml(html, openRe) {
  const m = openRe.exec(html);
  assert.ok(m, `no element matches ${openRe}`);
  const tag = /^<(\w+)/.exec(m[0])[1];
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>/]|</${tag}>`, "g");
  re.lastIndex = m.index;
  let t;
  while ((t = re.exec(html))) {
    depth += t[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(m.index, re.lastIndex);
  }
  throw new Error("unbalanced markup");
}

test("the horizontal timeline is one wide block (data-part=timeline) hidden under 768 by the component's own CSS", () => {
  const html = render({ entries: THREE });
  assert.match(html, /<div data-part="timeline" class="cl-timeline-wide">/);
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
  assert.match(css, /@media \(max-width: 767px\)\s*\{[^}]*\.cl-timeline-wide\s*\{\s*display:\s*none/);
  // the narrow block is the one that is hidden by default and shown under 768
  assert.match(css, /\.cl-timeline-narrow\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.cl-timeline-narrow\s*\{\s*display:\s*block/);
});

test("the narrow block is a vertical stack: .cl-timeline-mobile > div (track + rows), one row per marker", () => {
  const html = render({ entries: THREE });
  const mobile = elementHtml(html, /<div class="cl-timeline-mobile"[^>]*>/);
  const wrapper = elementHtml(mobile.slice(mobile.indexOf(">") + 1), /<div style="[^"]*position:relative[^"]*">/);
  const rows = wrapper.match(/<div style="[^"]*grid-template-columns:62px 14px 1fr[^"]*">/g) ?? [];
  assert.equal(rows.length, 3, "one 62px / 14px / 1fr row per marker");
  for (const row of rows) assert.match(row, /padding-bottom:14px/);
  // the 2px track is a direct child span of the stack wrapper, absolutely positioned
  const track = /<span aria-hidden="true" style="([^"]*)"/.exec(wrapper);
  assert.ok(track, "a track span");
  assert.match(track[1], /position:absolute/);
  assert.match(track[1], /width:2px/);
});

test("each row's first cell is the 62px right-aligned tabular date gutter, 11px, muted", () => {
  const html = render({ entries: THREE });
  const mobile = elementHtml(html, /<div class="cl-timeline-mobile"[^>]*>/);
  const date = /<div style="[^"]*grid-template-columns:62px 14px 1fr[^"]*"><span style="([^"]*)">2024-01-01<\/span>/.exec(mobile);
  assert.ok(date, "the date span is the row's first child");
  assert.match(date[1], /width:62px/);
  assert.match(date[1], /text-align:right/);
  assert.match(date[1], /font-variant-numeric:tabular-nums/);
  assert.match(date[1], /font-size:var\(--fs-11\)/);
  assert.match(date[1], /color:var\(--ink-3\)/);
});

test("the next row is the bold one; the Next callout follows the stack once, not repeated inside a row", () => {
  const html = render({ entries: THREE });
  const mobile = elementHtml(html, /<div class="cl-timeline-mobile"[^>]*>/);
  assert.match(mobile, /font-weight:700[^>]*>Transition deadline</);
  assert.match(mobile, /font-weight:500[^>]*>Review date</);
  assert.doesNotMatch(mobile, /Next: /, "no Next line inside a row: the callout below the stack carries it");
  const narrow = elementHtml(html, /<div data-part="timeline-narrow" class="cl-timeline-narrow">/);
  assert.match(narrow, /Next: Transition deadline · 30 Jun 2099 · in \d+ days/);
  assert.equal((narrow.match(/Next: /g) ?? []).length, 1);
});

test("the narrow block keeps the header and the Full schedule action the wide block had (nothing is lost under 768)", () => {
  const html = render({ entries: THREE, fullScheduleHref: "#schedule" });
  const narrow = elementHtml(html, /<div data-part="timeline-narrow" class="cl-timeline-narrow">/);
  assert.match(narrow, /Timeline/);
  assert.match(narrow, /3 milestones/);
  assert.match(narrow, /Full schedule/);
  assert.match(narrow, /href="#schedule"/);
});

test("more than four markers: the narrow stack shows the same four-marker window and a +N more link", () => {
  const html = render({ entries: SIX, moreMarkersHref: "#obligations" });
  const mobile = elementHtml(html, /<div class="cl-timeline-mobile"[^>]*>/);
  const rows = mobile.match(/grid-template-columns:62px 14px 1fr/g) ?? [];
  assert.equal(rows.length, 4, "four markers visible, the same window as the wide block");
  const narrow = elementHtml(html, /<div data-part="timeline-narrow" class="cl-timeline-narrow">/);
  assert.match(narrow, /<a href="#obligations"[^>]*data-audit="timeline-more-markers-narrow"[^>]*>\+2 more<\/a>/);
});

test("no milestones: the narrow block renders nothing extra and the wide block keeps the empty state", () => {
  const html = render({ entries: [] });
  assert.doesNotMatch(html, /cl-timeline-mobile/);
  assert.match(html, /cl-timeline-empty/);
});

test("the wide block is unchanged: dots, ellipsised labels with a focusable duplicate, the Next callout", () => {
  const html = render({ entries: THREE, fullScheduleHref: "#schedule" });
  const wide = elementHtml(html, /<div data-part="timeline" class="cl-timeline-wide">/);
  assert.match(wide, /role="img" aria-label="Milestone timeline: 3 milestones, 1 passed"/);
  assert.equal((wide.match(/tabindex="0"/g) ?? []).length, 3, "one focusable label per dot");
  assert.match(wide, /Next: Transition deadline/);
});
