// Rail facet geometry — the source-level half of operator items C1/C2/C3 (lane railfacets,
// train 62, 2026-09-08).
//
// The measured half lives in the design audit: .discipline/rendering/audit/spec/list-surface.json
// renders the real FiltersRailCard at 1440 and reads every one of these values back out of
// getComputedStyle, and mobile-11-watchlist.json reads the 44px target back at 390. This file
// guards the two things a rendered measurement CANNOT see:
//
//   1. that the 24px desktop row and the 44px touch target are expressed as ONE breakpoint pair
//      over the same two class names, rather than one of them quietly disappearing. The audit can
//      only ever measure one viewport per spec, so nothing there fails if a later edit drops
//      `.cl-facet-more` from the mobile declaration; this does.
//   2. that the geometry lives in the SHARED part. The operator's framing for this round is "fix
//      the shared part once; do not patch pages" — a page-local facet row would satisfy every
//      audit row above while being exactly the defect the round exists to remove.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "ListSurfaceRailCards.tsx"), "utf8");
const GLOBALS = readFileSync(join(HERE, "../../app/globals.css"), "utf8");

// ── The artboard's own values (02/id="p2" FILTERS card, repeated in 04, 06 and 08) ──────────────
test("the facet group carries the artboard's 10px either side and its 1px rgba(0,0,0,.06) rule", () => {
  assert.match(SRC, /padding: "10px 0", borderBottom: "1px solid rgba\(0,0,0,\.06\)"/);
});

// FACETFIX (2026-09-11), task 0.1: this test's own min-height assertion is UPDATED, not merely
// tolerated. The dated FOLD-62 exemption that let the artboard's 24px desktop row stand without an
// inline min-height (exemptions-law2-desktop.mjs, expiryWave: 70) was ALWAYS meant to lapse - "past
// wave 70 this covers nothing and the findings return" - and the real repo has now landed wave71
// (commit 5e891abd), past that expiry, on both the site-wide L9 floor (28px short axis) and law 2
// itself (docs/design/ux-laws.md #2: "44 CSS px on the shorter axis, or 24 px with 8 px clear space
// on every side" - these rows are stacked with 0px clearance, so the 24px branch was never
// available). The row's `min-height: 44` inline is the PERMANENT fix the exemption bought time for,
// not a relapse of the block the FOLD-62 note warned against: that note described a WHOLE ~44px row
// with an 11px label floating in a tall empty band (operator-measured "~33px"); this keeps every
// other artboard measure (4px padding, 12.5px font, space-between) and only grows the row's own
// height so its label - which wraps the checkbox as the real click/tap target - clears the floor.
test("the facet row carries the artboard's 4px-either-side 12.5px type and now a real 44px hit target (FACETFIX, 2026-09-11)", () => {
  const row = SRC.slice(SRC.indexOf('className="cl-facet-row"'), SRC.indexOf('className="cl-facet-count"'));
  assert.match(row, /padding: "4px 0"/);
  assert.match(row, /fontSize: "var\(--fs-125\)"/);
  assert.match(row, /justifyContent: "space-between"/);
  assert.match(row, /minHeight: 44/, "the row IS the label (the checkbox's hit target); law 2 / L9 both require >=44px (or >=24px with 8px clearance, unavailable here since rows stack with 0 clearance) on the shorter axis, at every width - the FOLD-62 desktop-only carve-out expired at wave70");
});

test("the count is 11px muted and tabular, sized in its own right rather than inheriting the row", () => {
  const count = SRC.slice(SRC.indexOf('className="cl-facet-count"'));
  assert.match(count, /fontSize: "var\(--fs-11\)"/);
  assert.match(count, /fontVariantNumeric: "tabular-nums"/);
});

test("the checkbox is the artboard's 13px glyph", () => {
  assert.match(SRC, /width: 13, height: 13, accentColor/);
});

// ── C3: a link row, and no dead square on it ────────────────────────────────────────────────────
test('"+ N more" is a 12px link row with no checkbox of its own', () => {
  const more = SRC.slice(SRC.indexOf('className="cl-facet-more"'), SRC.indexOf("more\n        </button>"));
  assert.match(more, /fontSize: "var\(--fs-12\)"/);
  assert.match(more, /textDecoration: "underline"/);
  assert.doesNotMatch(more, /type="checkbox"/);
});

// ── The 24px row and the 44px target, one pair, both class names ────────────────────────────────
test("the 24px desktop min-height and the 44px phone target are one breakpoint pair over both facet classes", () => {
  const base = GLOBALS.match(/\.cl-facet-row, \.cl-facet-more \{ min-height: 24px; \}/);
  assert.ok(base, "the desktop 24px min-height must name both classes");
  const mobile = GLOBALS.match(
    /@media \(max-width: 767px\) \{\s*\.cl-facet-row, \.cl-facet-more \{ min-height: 44px !important; \}\s*\}/
  );
  assert.ok(mobile, "the 44px target must be restored below 768px for both classes");
  assert.ok(
    GLOBALS.indexOf(base[0]) < GLOBALS.indexOf(mobile[0]),
    "the breakpoint override must come after the base declaration or the cascade drops it"
  );
});

// ── The shared part is the only place the geometry lives ────────────────────────────────────────
test("no component outside this file declares a facet row of its own", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".tsx") && e.name !== "ListSurfaceRailCards.tsx") {
        if (/className="cl-facet-(row|group|group-label|count|check|more)"/.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    }
  };
  walk(join(HERE, "../.."));
  assert.deepEqual(offenders, [], `the facet row is a shared part; these files build their own: ${offenders.join(", ")}`);
});
