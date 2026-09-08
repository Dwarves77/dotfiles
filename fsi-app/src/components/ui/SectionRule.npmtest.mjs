// Structural regression test for src/components/ui/SectionRule.tsx and its dashboard consumer —
// operator audit items 5.1 + 4.1 (2026-09-07, CLOSED rulings, artboard 18): every panel/section
// card gets a 3px top gradient rule (dark grey gradation, NOT the band-proportion rule — see 5.2),
// and the divider below the section title is removed. Source-text regression (no JSX render harness
// in this repo — see WatchButton.npmtest.mjs's own header).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const RULE_SOURCE = readFileSync(resolve(here, "SectionRule.tsx"), "utf8");
const DASHBOARD_SOURCE = readFileSync(
  resolve(here, "..", "dashboard", "DashboardBrief.tsx"),
  "utf8"
);

test("SectionRule renders the exact ruled dark-grey gradation, 3px, no other color source", () => {
  assert.match(
    RULE_SOURCE,
    /"linear-gradient\(90deg,#5A5552,#5A5552 22%,rgba\(90,85,82,\.18\)\)"/
  );
  assert.match(RULE_SOURCE, /height: 3/);
});

test("SectionRule is a different component than the band-proportion rule (5.2: one coloured rule per screen, everywhere else uses this dark-grey rule)", () => {
  assert.doesNotMatch(RULE_SOURCE, /import .*BandGradientRule/);
  assert.doesNotMatch(RULE_SOURCE, /<BandGradientRule\b/);
});

// UPDATED (lane layoutguard, 2026-09-08). This read DashboardBrief for a LOCAL `function Card()`
// that no longer exists: three other files carried a byte-for-byte identical one, and all four now
// mount `components/ui/Card.tsx`. Note the trap this test itself names two comments below - a slice
// taken between markers that are no longer in the file is EMPTY, and an assertion over an empty
// slice can pass vacuously. `indexOf` returning -1 here would have sliced from the end and produced
// exactly that, so the assertion follows the code to where it lives rather than being deleted or
// left to rot: the shared Card mounts exactly one rule, and the dashboard mounts the shared Card.
test("the shared Card mounts exactly one <SectionRule /> JSX element, and DashboardBrief mounts that Card", () => {
  const cardSource = readFileSync(resolve(here, "Card.tsx"), "utf8");
  assert.match(cardSource, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule"/);
  // Match only the actual JSX element on its own line, not the doc-comment prose that also
  // mentions `<SectionRule/>` in backticks a few lines above the function.
  const matches = cardSource.match(/^\s*\{!noRule && <SectionRule \/>\}\s*$/gm) ?? [];
  assert.equal(matches.length, 1);
  assert.match(DASHBOARD_SOURCE, /import \{ Card \} from "@\/components\/ui\/Card";/);
  assert.doesNotMatch(DASHBOARD_SOURCE, /function Card\(/, "the dashboard has gone back to defining its own card");
});

// UPDATED (lane comp-11, 2026-09-08): SectionHeading moved to the shared ui/ layer, so this
// assertion follows it there. Reading DashboardBrief for a function it no longer defines made the
// old slice empty, which passes vacuously — exactly the kind of proof rule 15 calls a lie.
test("the shared SectionHeading sets no borderBottom on its own div (item 4.1)", () => {
  const headingBody = readFileSync(resolve(here, "SectionHeading.tsx"), "utf8");
  assert.doesNotMatch(headingBody, /borderBottom:\s*"/);
});
