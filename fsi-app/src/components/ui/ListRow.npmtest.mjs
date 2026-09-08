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
test("the list anatomy is the default: no variant means the original four cells", () => {
  assert.match(SOURCE, /variant\?:\s*"list"\s*\|\s*"register";/, "variant must be an optional prop (undefined-safe)");
  assert.match(SOURCE, /variant = "list"/, "the default must be the list anatomy, so every existing caller is unaffected");
  assert.match(SOURCE, /endStat\?:\s*\{[^}]*\}\s*\|\s*null;/, "endStat must be an optional prop (undefined-safe)");
  // FOLD-61: lane map60 made the `register` variant the ONLY consumer of endStat and deleted the
  // old merged `4 / span 4` approximation, so the branch this assertion once read (`const
  // tailContent = endStat ? (`) no longer exists. The invariant it guarded is unchanged and is
  // asserted on the surviving structure: endStat takes its own branch, and the list anatomy is
  // what every other caller gets.
  assert.match(SOURCE, /if \(variant === "register" && endStat\) \{/, "endStat must take its own branch rather than deforming the list anatomy");
  assert.match(SOURCE, /const tailContent = \(/, "the list anatomy must be the unconditional default");
  // The original four cells must still exist verbatim in the list branch. UPDATED twice:
  // lane opsclip (train 61, defect 3) moved the TIER cell's absence PRESENTATION to the Absence
  // part's `variant="narrow"` (the dash, reason on aria-label/title), because the spelled-out
  // phrase wrapped over three lines in this 40px track on production and doubled the row height;
  // lane mobfix61 (D-M4) made WHETHER that cell speaks depend on the row's single reason. Both
  // survive: the vocabulary is unchanged, the branch that renders it is unchanged.
  assert.match(SOURCE, /<ImpactMeter scores=\{impact\} \/>/);
  assert.match(SOURCE, /tier != null \? <TierChip tier=\{tier\} \/> :/);
  // UPDATED (items B3/B4/B5, operator 2026-09-08): the tier cell's fallback is now the DASH
  // variant unconditionally, not the `narrow` variant gated on a slot. `narrow` swaps back to
  // the spelled-out words below 768px, which would put a second token on a mobile row now that
  // the meta line carries the reason at every width. The vocabulary is unchanged; only the
  // placement is, and it is the operator's.
  assert.match(SOURCE, /<Absence reason=\{rowAbsence \?\? "not in primary source"\} variant="dash" \/>/, "the 40px tier track draws the dash");
});

// D-M4 (operator mobile report 2026-09-08) [CONFIRMED at 1440 and at 390]: the impact, due and
// tier cells each rendered their own <Absence>, so a row missing all three drew a dashed baseline
// plus "UNSCORED" plus "PENDING" plus "NOT IN PRIMARY SOURCE". Ruling 2.1 and the mobile 390 spec
// both allow exactly one reason. The structural guarantee is `reasonSlot`: at most one of the
// three cells can be the slot, so at most one token can render, whatever the data.
test("a row renders AT MOST ONE absence WORD, and every empty value cell draws a dash", () => {
  assert.match(SOURCE, /import \{ Absence, pickAbsenceReason, type AbsenceReason \}/);
  assert.match(SOURCE, /const rowAbsence: AbsenceReason \| null = pickAbsenceReason\(\[/);
  // ITEMS B3/B4/B5 (operator 2026-09-08). `reasonSlot` is gone: there is no cell to choose any
  // more, because the reason has ONE home, the title cell's meta line, and every value cell that
  // has nothing to show draws a dash instead. The one-token guarantee is therefore stronger than
  // it was, not weaker: one render site rather than a three-way choice.
  assert.doesNotMatch(SOURCE, /const reasonSlot|reasonSlot ===/, "the slot mechanism is deleted, not left dormant (rule 13); only the comment explaining its removal may name it");
  assert.match(SOURCE, /const metaReason: AbsenceReason \| null = rowAbsence && rowAbsence !== "unscored" \? rowAbsence : null;/);
  const words = SOURCE.match(/<Absence reason=\{metaReason\} \/>/g) ?? [];
  assert.equal(words.length, 1, "exactly one small-caps reason renders, on the meta line");
  const dashes = SOURCE.match(/<Absence [^/]*variant="dash" \/>/g) ?? [];
  assert.equal(dashes.length, 2, "the due and tier cells each draw a dash (the impact dash is ImpactMeter's own)");
  assert.doesNotMatch(SOURCE, /<Absence[^/]*variant="narrow"/, "the narrow variant's mobile word-swap must not return to the row");
});

// UPDATED (lane map60, 2026-09-08): `endStat` used to render inside the EIGHT-column list grid as
// one merged `gridColumn: "4 / span 4"` cell, an approximation of artboard 10's register that
// map-register.json's own note called "a genuine layout-strategy difference" from what p10 draws.
// `variant="register"` now reproduces p10's six-column grid exactly, and the merged-cell branch is
// DELETED rather than kept as a second way to render the same row (CLAUDE.md rule 13). This test
// guards the replacement, not the shape it replaced.
test("the register variant is p10's own six-column grid, and the merged 8-column approximation is gone", () => {
  assert.match(SOURCE, /const REGISTER_GRID = "3px 1fr 1fr 110px 80px 40px";/);
  assert.doesNotMatch(SOURCE, /gridColumn:\s*"4 \/ span 4"/, "the merged endStat cell must not come back");
  assert.match(SOURCE, /if \(variant === "register" && endStat\)/, "the register anatomy branches on the variant");
});

test("a register row is one click target and ends in the artboard's arrow glyph", () => {
  const registerBlock = SOURCE.slice(SOURCE.indexOf('if (variant === "register" && endStat)'), SOURCE.indexOf("const tailContent"));
  assert.equal((registerBlock.match(/<Link/g) || []).length, 1, "exactly one navigable Link per register row");
  assert.match(registerBlock, /cl-row-register-arrow/);
  assert.match(registerBlock, /→/);
  assert.match(registerBlock, /aria-hidden="true"[\s\S]{0,120}cl-row-register-arrow/, "the arrow is decoration, not a second target");
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

// The INVARIANT is unchanged (one click target per rendered row); only its mount is adapted (lane
// map60, 2026-09-08). ListRow now has two mutually exclusive branches, the list anatomy and the
// register anatomy, so a whole-file count of 2 is correct and a per-branch count of 1 is the
// assertion that still means what the original one meant.
test("the whole row stays the one click target — no second nested Link/button wraps the row", () => {
  const registerBranch = SOURCE.slice(SOURCE.indexOf('if (variant === "register" && endStat)'), SOURCE.indexOf("const tailContent"));
  const listBranch = SOURCE.slice(SOURCE.indexOf("const tailContent"));
  assert.equal((registerBranch.match(/<Link\b/g) || []).length, 1, "exactly one <Link> in the register branch");
  assert.equal((listBranch.match(/<Link\b/g) || []).length, 1, "exactly one <Link> in the list branch");
  assert.equal((SOURCE.match(/<Link\b/g) || []).length, 2, "two branches, one Link each, never a third");
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
  assert.match(SOURCE, /className="cl-row-tier" style=\{\{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",/);
});

test("B61: the desktop overflow-cell divider is --line-2 (rgba(0,0,0,.08)), not --line-3", () => {
  assert.match(SOURCE, /className="cl-row-overflow"[\s\S]{0,300}borderLeft: "1px solid var\(--line-2\)",/);
});

// ── DEFECT 6 (lane opsclip, train 61, 2026-09-08): the row meta line truncates properly ──────
test("the row's meta line can actually shrink, so its own ellipsis is the thing that truncates it", () => {
  // Production cut this line mid-word with NO ellipsis on /research ("initiative · Last-mile
  // electrifica") while the title directly above it truncated properly. Root cause: `flexShrink: 1`
  // with no `minWidth: 0` is inert (a flex item's default `min-width: auto` refuses to shrink below
  // its content), so the span never narrowed, its ellipsis never fired, and the PARENT's
  // `overflow: hidden` did the cutting. Both declarations must be present together.
  const meta = SOURCE.slice(SOURCE.indexOf("{meta && ("), SOURCE.indexOf("{metaReason && ("));
  assert.match(meta, /textOverflow: "ellipsis"/);
  assert.match(meta, /flexShrink: 1/);
  assert.match(meta, /minWidth: 0/, "without this the flexShrink above does nothing");
});

// ── DEFECT 2 (lane opsclip, train 61): the IMPACT header keeps every character ────────────────
test("the IMPACT column header wraps at a word boundary instead of truncating", () => {
  // Production shipped "IMPACT LOW → H". The label measures ~113px against its 88px track, so it
  // could only ever truncate on one line; the artboard (dc.html p1/p11) gives it the same track and
  // the same type with no nowrap and draws it over two lines.
  assert.match(SOURCE, /const impactCellStyle: CSSProperties = \{/);
  assert.match(SOURCE, /whiteSpace: "normal"/);
  assert.match(SOURCE, /<span style=\{impactCellStyle\}>/);
  // Word boundary, not `anywhere`: breaking inside the word ("IMPA / CT") loses the same legibility
  // the truncation did. The register variant's own labels are the only ones allowed to break.
  const impact = SOURCE.slice(SOURCE.indexOf("const impactCellStyle"), SOURCE.indexOf("const wrappingCellStyle"));
  assert.doesNotMatch(impact, /overflowWrap/);
});
