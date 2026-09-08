// Structural regression test for src/components/ui/ListRow.tsx (lane uimapcomm, 2026-09-06).
//
// WHY A TEXT-LEVEL TEST. This repo has no JSX mount infrastructure for a plain `node --test` run
// (the rendering guard's Playwright smoke specs are the real-DOM check, and this file's own
// `endStat` cells are covered live by map-smoke.mjs). This test guards the two SPECIFIC regressions
// a future edit could reintroduce without a browser: (1) the `endStat` extension silently losing its
// "additive, default-undefined" contract — every existing caller (Regulations, Market, Research,
// Operations, Watchlist, Dashboard) passes no `endStat` and must keep rendering the original
// impact/due/timeline/tier four-cell anatomy untouched; (2) the mobile reflow rule disappearing,
// which would reopen the 375px clipping map-smoke.mjs found and fixed this lane.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ListRow.tsx"),
  "utf8"
);

// UPDATED (lane moblist, 2026-09-07): the endStat/impact-due-timeline-tier branch moved from an
// inline `{endStat ? (...) : (...)}` expression into a `tailContent = endStat ? (...) : (...)`
// variable (so both the desktop columns AND the mobile line-2 flex row can reuse the identical
// JSX) — the branch itself, and everything it guards, is unchanged.
test("endStat is optional and defaults to the original four-cell anatomy", () => {
  assert.match(SOURCE, /endStat\?:\s*\{[^}]*\}\s*\|\s*null;/, "endStat must be an optional prop (undefined-safe)");
  assert.match(SOURCE, /const tailContent = endStat \? \(/, "rendering must branch on endStat rather than always taking the new path");
  // The original four cells must still exist verbatim in the non-endStat branch.
  assert.match(SOURCE, /<ImpactMeter scores=\{impact\} \/>/);
  assert.match(SOURCE, /tier != null \? <TierChip tier=\{tier\} \/> : <Absence reason="not in primary source" \/>/);
});

test("endStat replaces columns 4-7 as one merged band-coloured stat, never a fifth column", () => {
  assert.match(SOURCE, /gridColumn:\s*"4 \/ span 4"/);
});

// UPDATED (lane moblist, 2026-09-07): the operator's binding mobile-390 spec landed (this lane's
// brief, "mobile is the desktop part at a smaller measure, expressed as media queries INSIDE the
// shared part"), superseding the 2026-09-07 "no mobile treatment yet" ruling the previous version
// of this test guarded — that ruling was itself dated pending exactly this spec's delivery. The row
// now DOES reflow below 768px (never 640px, the breakpoint this train's base sets: "below 768: one
// column"), via the `display: contents` sub-wrapper technique documented in the file's own header,
// which keeps >=768px byte-identical to before (verified live by the rendering guard's unchanged
// >=768px checks).
test("mobile reflow: an @media (max-width: 767px) rule exists, keyed to the train's 768 breakpoint, not the retired 640px one", () => {
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(SOURCE, /@media \(max-width: 640px\)/);
});

test("mobile reflow drops only the timeline column, per the spec's own 'THE 76px TIMELINE COLUMN IS THE ONLY THING DROPPED' line", () => {
  const mobileBlock = SOURCE.slice(SOURCE.indexOf("@media (max-width: 767px)"));
  assert.match(mobileBlock, /\.cl-row-timeline\s*\{\s*display:\s*none/, "timeline is the one cell hidden at mobile");
  assert.doesNotMatch(mobileBlock, /\.cl-row-impact\s*\{\s*display:\s*none/);
  assert.doesNotMatch(mobileBlock, /\.cl-row-tier\s*\{\s*display:\s*none/);
  assert.doesNotMatch(mobileBlock, /\.cl-row-due\s*\{\s*display:\s*none/);
});

test("mobile reflow uses `display: contents` sub-wrappers so >=768px stays the original flat 8-column grid, not a rebuilt one", () => {
  assert.match(SOURCE, /className="cl-row-content" style=\{\{ display: "contents" \}\}/);
  assert.match(SOURCE, /className="cl-row-line1" style=\{\{ display: "contents" \}\}/);
  assert.match(SOURCE, /className="cl-row-line2" style=\{\{ display: "contents" \}\}/);
});

test("the whole row stays the one click target — no second nested Link/button wraps the row", () => {
  const linkMatches = SOURCE.match(/<Link\b/g) || [];
  assert.equal(linkMatches.length, 1, "exactly one <Link> (the full-row overlay) — never a second competing click target");
});

// ── tags (lane uitags, 2026-09-07, README "Workspace tags" / ruling R6) ──
test("tags is an optional prop, additive — every pre-existing caller (no tags passed) is unaffected", () => {
  assert.match(SOURCE, /tags\?:\s*\{\s*id:\s*string;\s*name:\s*string\s*\}\[\]\s*\|\s*null;/);
});
test("tags render on the second line, beside meta — not a fifth grid column", () => {
  assert.match(SOURCE, /tags && tags\.length > 0 && \(/);
  assert.match(SOURCE, /WorkspaceTagPill/);
});

// UPDATED (lane moblist, 2026-09-07): mobile-390 spec's LIST ROW line-2 item order puts workspace
// tags AFTER impact/date/tier, not under the title where the desktop `meta` line renders them — the
// spec gives no mobile position for `meta` itself (see DEVIATION-LOG.md), so `meta` stays put and
// only `tags` gets a second, CSS-gated render for the mobile position.
test("tags render a SECOND time for the mobile line-2 position, hidden >=768px, desktop rendering (.cl-row-meta-tags) untouched", () => {
  assert.match(SOURCE, /cl-row-meta-tags/, "the desktop meta+tags line keeps its existing class hook");
  assert.match(SOURCE, /cl-row-tags-mobile/, "a second, mobile-only tags render exists");
  assert.match(SOURCE, /\.cl-row-meta-tags\s*\{\s*display:\s*none\s*!important/, "desktop meta+tags line hides at mobile");
  assert.match(SOURCE, /\.cl-row-tags-mobile\s*\{\s*display:\s*inline-flex\s*!important/, "mobile tags render shows only at mobile");
});

// ── Design audit B47-B61 (docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md, listrow.json,
// artboard #sys the list-row block): the 3px transparent left border misaligned every desktop
// cell against its own column header by 3px; the row's padding-right, jurisdiction-code type,
// title line-height, meta-line colour, due-date font-size, tier-cell alignment and overflow-cell
// divider colour were all off the artboard's stated values. ListRowColumnHeader's own height was
// 22px measured against 30px stated.
test("B47: the row root carries no left border (the 3px transparent border that misaligned every cell from its column header is gone)", () => {
  assert.doesNotMatch(SOURCE, /borderLeft:\s*"3px solid transparent"/);
});

test("B48: the row root has padding-right:12px", () => {
  assert.match(SOURCE, /className="cl-list-row"[\s\S]{0,400}paddingRight: 12,/);
});

test("B49: ListRowColumnHeader is 30px tall", () => {
  assert.match(SOURCE, /className="cl-list-row-header"[\s\S]{0,120}height: 30,/);
});

test("B50-B53: jurisdiction-code cell is fs-11/700/0.06em on --ink-2 (#5A6B67), not --ink-3", () => {
  assert.match(SOURCE, /className="cl-row-juris"[\s\S]{0,220}fontSize: "var\(--fs-11\)",\s*\n\s*fontWeight: 700,\s*\n\s*color: "var\(--ink-2\)",\s*\n\s*letterSpacing: "0\.06em",/);
});

test("B54: title cell line-height is 18.2px", () => {
  assert.match(SOURCE, /className="cl-row-title-text"[\s\S]{0,220}lineHeight: "18\.2px",/);
});

test("B55: the desktop meta line is --ink-3 (#7A6E6C), not --ink-2", () => {
  assert.match(SOURCE, /fontSize: "var\(--fs-11\)",\s*\n\s*color: "var\(--ink-3\)",\s*\n\s*overflow: "hidden",\s*\n\s*textOverflow: "ellipsis",\s*\n\s*whiteSpace: "nowrap",\s*\n\s*flexShrink: 1,/);
});

test("B56: the due-date label is fs-125 (12.5px)", () => {
  assert.match(SOURCE, /className="cl-row-due-label" style=\{\{ fontSize: "var\(--fs-125\)",/);
});

test("B60: the tier cell is text-align:center", () => {
  assert.match(SOURCE, /className="cl-row-tier" style=\{\{ display: "flex", alignItems: "center", textAlign: "center",/);
});

test("B61: the desktop overflow-cell divider is --line-2 (rgba(0,0,0,.08)), not --line-3", () => {
  assert.match(SOURCE, /className="cl-row-overflow"[\s\S]{0,300}borderLeft: "1px solid var\(--line-2\)",/);
});
