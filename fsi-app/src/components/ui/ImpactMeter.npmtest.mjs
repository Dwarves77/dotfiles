// Structural regression test for src/components/ui/ImpactMeter.tsx's mobile-390 addition (lane
// moblist, 2026-09-07). Text-level, same convention as ListRow.npmtest.mjs's own header explains
// (no JSX mount infra for plain `node --test`; the rendering guard's Playwright smoke specs are
// the real-DOM check for this file, exercised live via the five list pages' row fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "ImpactMeter.tsx"),
  "utf8"
);

test("row-variant bars grow to heights 5/10/16 for scores 1/2/3 below 768px", () => {
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="1"\]\s*\{\s*height:\s*5px/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="2"\]\s*\{\s*height:\s*10px/);
  assert.match(SOURCE, /\.cl-impact-bar\[data-score="3"\]\s*\{\s*height:\s*16px/);
});

test("mobile bars sit on a rgba(0,0,0,.25) baseline (from the desktop --line-1 rgba(0,0,0,.12))", () => {
  assert.match(SOURCE, /rgba\(0,0,0,\.25\)/);
});

// UPDATED (lane mobfix61, 2026-09-08, operator mobile report D-M4): the meter no longer names an
// absence reason of its own. It rendered `<Absence reason="unscored" />` unconditionally while the
// row's due and tier cells rendered their own, so one unscored row showed three tokens (the stack
// the operator photographed) — and ruling 2.1 forbids that literal outright. The unscored state is
// now the 30px dashed baseline ALONE, plus whatever single reason the COMPOSITE hands it through
// `reason`. A test pinning the old literal would be preserving the defect, so it is replaced by
// the invariant that actually binds.
test("the meter never renders the literal 'unscored' (ruling 2.1)", () => {
  assert.match(SOURCE, /import \{ Absence \} from "@\/components\/ui\/Absence";/);
  // UPDATED (item B3, operator 2026-09-08): the meter DOES now pass the closed-vocabulary word
  // "unscored" to Absence — but to its `dash` variant, which renders U+2014 and carries the word
  // only on aria-label/title. Ruling 2.1's actual prohibition is on the literal token appearing as
  // TEXT, so the assertion is made on rendered output rather than on the source string: no
  // `variant="reason"` (the word-rendering variant) anywhere in this file.
  assert.match(SOURCE, /<Absence reason="unscored" variant="dash" \/>/);
  assert.doesNotMatch(SOURCE, /<Absence reason=\{[^}]*\} \/>/, "the meter never renders a spelled-out reason of its own");
});

// UPDATED (item B3, operator 2026-09-08): "the meter column gets the 30px dashed baseline
// rgba(0,0,0,.3) with an em dash in the score slot and NO literal UNSCORED". The composite's
// single reason moved to the row's title-cell meta line, so the `reason` prop this meter took
// from the row is DELETED rather than left unused (CLAUDE.md rule 13), and the score slot draws
// the artboard's dash at both variants.
test("the unscored meter draws the dash in the score slot and takes no reason from its caller", () => {
  assert.doesNotMatch(SOURCE, /reason\?: AbsenceReason/, "the reason prop is removed, not left dormant");
  assert.doesNotMatch(SOURCE, /AbsenceReason/, "and its type import with it");
  const unscored = SOURCE.slice(SOURCE.indexOf("if (!scored)"), SOURCE.indexOf("const s = scores!;"));
  assert.match(unscored, /<span style=\{\{ fontSize: "var\(--fs-11\)" \}\}>\s*<Absence reason="unscored" variant="dash" \/>/);
  assert.doesNotMatch(unscored, /variant === "row"\s*\n?\s*\? reason/, "the old row/full reason branch is gone");
});

test("operator audit item 2.1 (2026-09-07): unscored row-variant baseline is 30px at every viewport, desktop and mobile", () => {
  assert.match(SOURCE, /width: variant === "full" \? 96 : 30/);
  assert.doesNotMatch(SOURCE, /variant === "full" \? 96 : 40/);
});

// Design audit B29-B46 (docs/design/handoff-2026-09-06/AUDIT-2026-09-07.md,
// impactmeter.json, artboard #sys list-row example): desktop row-scored bars are 9px
// wide, heights 6/12/18 for scores 1/2/3, top-only 1px radius, sitting in an 18px
// container on a 1px solid rgba(0,0,0,.25) baseline; the sum label sits margin-left:7px.
test("B29-B31: row-scored bars container is 18px tall with a 1px solid rgba(0,0,0,.25) baseline", () => {
  assert.match(SOURCE, /className="cl-impact-bars"[\s\S]{0,160}height: 18,[\s\S]{0,80}borderBottom: "1px solid rgba\(0,0,0,\.25\)"/);
});

test("B33-B39: row-scored bars are 9px wide, height = score * 6px, top-only radius", () => {
  assert.match(SOURCE, /width: 9,\s*\n\s*height: `\$\{v >= 1 \? v \* 6 : ZERO_BAR_HEIGHT_PX\}px`/);
  assert.match(SOURCE, /borderRadius: "1px 1px 0 0"/);
});

// Lane METERFIX (2026-09-08, operator ruling "never one lonely bar"). The RENDERED-height proof for
// the zero dimension is .discipline/rendering/smoke/impact-meter-partial-smoke.mjs, which measures a
// real chromium at 1440 and 390 and is red on the base tree. These two are the source-level guards
// that keep the constants from drifting back: 2px is one third of the 6px score unit (so it can
// never be read as a score of 1), and the stub is the baseline's own rgba(0,0,0,.25), not the
// fainter --line-1 the bar background used to fall back to.
test("METERFIX: a zero dimension draws a 2px stub, not a 0px box", () => {
  assert.match(SOURCE, /const ZERO_BAR_HEIGHT_PX = 2;/);
  assert.doesNotMatch(SOURCE, /height: `\$\{v \* 6\}px`/, "the unguarded v*6 height is what painted the invisible box");
});

test("METERFIX: the zero stub uses the baseline ink, and the VALUE_COLOR ramp is untouched", () => {
  assert.match(SOURCE, /const ZERO_BAR_COLOR = "rgba\(0,0,0,\.25\)";/);
  assert.match(SOURCE, /background: VALUE_COLOR\[v\] \?\? ZERO_BAR_COLOR/);
  assert.match(
    SOURCE,
    /const VALUE_COLOR: Record<number, string> = \{\s*\n\s*1: "var\(--awareness\)",\s*\n\s*2: "var\(--action\)",\s*\n\s*3: "var\(--immediate\)",\s*\n\};/,
    "the ramp keeps exactly its three entries, and a zero bar is not a value on it"
  );
});

test("B40: row-scored sum label sits margin-left:7px from the bars", () => {
  assert.match(SOURCE, /whiteSpace: "nowrap",\s*\n\s*marginLeft: 7,/);
});

test("B41: unscored dashed baseline is rgba(0,0,0,.3), not the --line-1 token", () => {
  assert.match(SOURCE, /borderBottom: "1px dashed rgba\(0,0,0,\.3\)"/);
});

test("B42-B44: full-variant track is 8px tall, 8px radius, gradient mid stop at 55%", () => {
  assert.match(SOURCE, /height: 8,\s*\n\s*borderRadius: 8,\s*\n\s*background:\s*\n\s*"linear-gradient\(90deg, var\(--awareness\), var\(--action\) 55%, var\(--immediate\)\)"/);
});

test("B45-B46: full-variant dimension label is 116px wide at fs-125", () => {
  assert.match(SOURCE, /fontSize: "var\(--fs-125\)", color: "var\(--ink-2\)", width: 116/);
});
