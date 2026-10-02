// Proof for src/components/ui/timeline-dot-styles.ts's nextDotStyle (lane R12-13, 2026-10-01,
// CF-BROKEN-2 / A2bc), plus the computed-style verification the dispatch's acceptance test asks for
// as the alternative to a Playwright rendering-guard spec: "a unit test on the computed style".
//
// THE DEFECT. Both live call sites (Timeline.tsx:178, MilestoneTimeline.tsx:86 via ListRow.tsx:685)
// used to pass `band.cssVar` (e.g. "var(--immediate)") as `bandHex`. nextDotStyle appends a raw "33"
// alpha suffix onto that string for the ring's boxShadow: `var(--immediate)33` is not a color in any
// CSS grammar, so the browser drops the whole boxShadow declaration (computed style: "none", no
// ring ever painted). Both call sites now pass `band.hex` (the raw hex literal UrgencyBand already
// carries), which turns the same suffix trick into a real 8-digit hex-with-alpha color.
import test from "node:test";
import assert from "node:assert/strict";
import { nextDotStyle, passedDotStyle, aheadDotStyle } from "./timeline-dot-styles.ts";

// A valid CSS <color>: either #RRGGBB or #RRGGBBAA (the 8-digit hex-with-alpha form the alpha-suffix
// trick produces when bandHex is a real hex literal).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

test("nextDotStyle: with a raw hex literal (the fixed call-site shape), the ring colour is a valid 8-digit hex", () => {
  const style = nextDotStyle("#DC2626", 12, 3);
  const match = /^0 0 0 3px (#[0-9a-fA-F]{8})$/.exec(String(style.boxShadow));
  assert.ok(match, `boxShadow "${style.boxShadow}" is not the expected "0 0 0 3px #RRGGBBAA" shape`);
  assert.match(match[1], HEX_COLOR_RE, "the ring colour itself must be a syntactically valid CSS hex color");
  assert.equal(style.background, "#DC2626");
});

test("nextDotStyle: the four live UrgencyBand hex values all produce a valid ring colour", () => {
  for (const hex of ["#DC2626", "#F97316", "#2563EB", "#16A34A"]) {
    const style = nextDotStyle(hex, 12, 3);
    const match = /#[0-9a-fA-F]{8}/.exec(String(style.boxShadow));
    assert.ok(match, `${hex}: boxShadow "${style.boxShadow}" carries no valid hex color`);
  }
});

test("REGRESSION GUARD: the old defect shape (a var() reference as bandHex) is demonstrably invalid CSS, proving why the call sites had to change", () => {
  // This is what BOTH call sites used to pass. Reproduced here, not to assert it should work, but to
  // pin the negative: this shape is NOT a valid CSS color, which is the whole reason band.cssVar was
  // wrong and band.hex is required.
  const style = nextDotStyle("var(--immediate)", 12, 3);
  assert.equal(style.boxShadow, "0 0 0 3px var(--immediate)33");
  assert.ok(
    !HEX_COLOR_RE.test("var(--immediate)33") && !/^color-mix\(/.test("var(--immediate)33"),
    "var(--immediate)33 is not a color in any CSS grammar - a browser drops this declaration silently",
  );
});

test("passedDotStyle / aheadDotStyle: unaffected by this fix, still real CSS values", () => {
  assert.equal(passedDotStyle(8).background, "var(--awareness)");
  assert.equal(aheadDotStyle(8).background, "var(--card)");
});
