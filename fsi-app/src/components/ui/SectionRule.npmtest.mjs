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

// UPDATED (lane cardrule, 2026-09-08, operator item A1) and again at FOLD 62. This test used to
// assert that DashboardBrief's own `Card` helper mounted exactly one `<SectionRule />`. It no
// longer has one, and that is the fix rather than a regression: the operator ruled the rule "part
// of the card component, not a decoration", so the shared card mounts it and no caller can. Lanes
// layoutguard and cardrule each built that shared card the same day (`ui/Card.tsx` and
// `ui/SectionCard.tsx`); SectionCard is the survivor, `Card.tsx` is deleted, and DashboardBrief
// mounts `SectionCard` DIRECTLY rather than through a local one-line wrapper of its own, so there
// is no second name for a card anywhere in the file. Note the trap this test itself names two
// comments below: a slice taken between markers no longer in the file is EMPTY and asserts
// nothing, so this reads the whole source rather than a slice.
test("DashboardBrief reaches the rule through the shared SectionCard, never by hand and never through a local card of its own", () => {
  assert.match(DASHBOARD_SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard"/);
  assert.doesNotMatch(DASHBOARD_SOURCE, /import \{ SectionRule \}/);
  assert.doesNotMatch(DASHBOARD_SOURCE, /function Card\(/, "the dashboard has gone back to defining its own card");
  // No hand-mounted rule anywhere in the file: only doc-comment prose may mention it, in backticks.
  assert.equal((DASHBOARD_SOURCE.match(/^\s*<SectionRule \/>\s*$/gm) ?? []).length, 0);
  // The two brief cards still carry the audit hooks their specs address.
  assert.match(DASHBOARD_SOURCE, /<SectionCard dataAudit="due-next-card">/);
  assert.match(DASHBOARD_SOURCE, /<SectionCard dataAudit="what-changed-card">/);
});

test("SectionCard mounts the rule unconditionally, so no card can be built without it", () => {
  const CARD_SOURCE = readFileSync(resolve(here, "SectionCard.tsx"), "utf8");
  assert.match(CARD_SOURCE, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule"/);
  // Ruling 5.2's band-grouping card is the ONE documented branch that renders no rule.
  assert.match(CARD_SOURCE, /suppressRuleForBandGrouping \? null :/);
});

// UPDATED (lane comp-11, 2026-09-08): SectionHeading moved to the shared ui/ layer, so this
// assertion follows it there. Reading DashboardBrief for a function it no longer defines made the
// old slice empty, which passes vacuously — exactly the kind of proof rule 15 calls a lie.
test("the shared SectionHeading sets no borderBottom on its own div (item 4.1)", () => {
  const headingBody = readFileSync(resolve(here, "SectionHeading.tsx"), "utf8");
  assert.doesNotMatch(headingBody, /borderBottom:\s*"/);
});
