// Structural regression test for the masthead's title/command-bar row (lane settings60,
// 2026-09-08). dc.html declares that row as a grid — `grid-template-columns:minmax(0,1fr) 420px;
// gap:10px 24px; align-items:end` — on 15 of the 17 artboards. The implementation was a wrapping
// flex row, which put the WHOLE command bar on a second line whenever the dek's max-content ran
// past the space left beside it; /settings, whose scope line is one long sentence ending "scoped
// to <workspace>", is where that showed. The grid wraps the DEK inside its own column instead and
// keeps the bar on the title's row.
//
// The grid is applied AT 1440 and not below it, and that is the load-bearing half of this test:
// every artboard is drawn at 1440 and none defines a narrower layout (ruling R10, DEVIATION-LOG:
// no responsive rules are invented), and the flat 420px track is a 1440 value — carried down to
// 1280 it left a long detail title at 55% of its card, the exact squeeze the rendering guard's
// law-2 measurement exists to catch. Below 1440 the pre-existing shrink-then-wrap flex behaviour
// is unchanged, so nothing that was passing starts failing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Masthead.tsx"),
  "utf8",
);

test("at 1440 the row is dc.html's own grid", () => {
  const rule = SOURCE.slice(SOURCE.indexOf("@media (min-width: 1440px)"), SOURCE.indexOf("`}</style>"));
  assert.match(rule, /\.cl-masthead-row \{/);
  assert.match(rule, /display: grid !important;/);
  assert.match(rule, /grid-template-columns: minmax\(0,1fr\) 420px !important;/);
  assert.match(rule, /align-items: end !important;/);
  assert.match(rule, /gap: 10px 24px !important;/);
});

test("below 1440 the row keeps the flex behaviour it already had", () => {
  assert.match(
    SOURCE,
    /className="cl-masthead-row"\s*\n\s*style=\{\{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" \}\}/,
  );
  assert.match(SOURCE, /className="cl-masthead-cmdbar" style=\{\{ flex: "0 1 420px", minWidth: 260 \}\}/);
});

test("the mobile stack below 767 is untouched", () => {
  const mobile = SOURCE.slice(SOURCE.indexOf("@media (max-width: 767px)"), SOURCE.indexOf("@media (min-width: 1440px)"));
  assert.match(mobile, /\.cl-masthead-row \{ flex-direction: column !important;/);
  assert.match(mobile, /\.cl-masthead-cmdbar \{ flex: 1 1 auto !important;/);
});

test("the scope and verticals lines still balance rather than orphan a word (operator, 2026-09-07)", () => {
  assert.match(SOURCE, /\.cl-masthead-dek > \* \{\s*\n\s*text-wrap: pretty;\s*\n\s*text-wrap: balance;/);
});

// ── notice link (lane opsclip, train 61, defect 5) ────────────────────────────
test("a notice link renders only when it has a real target: no '#' href fallback", () => {
  // Production's only `#`-href anchor across all fifteen pages was this fallback, on /settings'
  // "See audit log →", and it was dead on click. Ruling 1.1's class is that a dead control is a
  // defect, so the component can no longer manufacture a target it does not have. W10-StateNote
  // (2026-09-23) moved this banner onto the shared StateNote part (one home for the border-left
  // 3px / radius 0 6px 6px 0 / 9px 12px shape); the guarantee now lives in the ternary that
  // decides whether StateNote's own `action` prop is passed at all.
  assert.doesNotMatch(SOURCE, /notice\.linkHref \?\? "#"/);
  assert.match(SOURCE, /notice\.linkLabel && notice\.linkHref \? \{ label: notice\.linkLabel, href: notice\.linkHref \} : undefined/);
  assert.match(SOURCE, /<StateNote/);
});

test("the notice banner delegates to StateNote rather than retyping its shape (F42/F49 one-home)", () => {
  assert.doesNotMatch(SOURCE, /borderLeft: "3px solid var\(--ink-3\)"/);
  assert.doesNotMatch(SOURCE, /borderRadius: "0 6px 6px 0"/);
  assert.match(SOURCE, /import \{ StateNote \} from "@\/components\/ui\/StateNote"/);
});
