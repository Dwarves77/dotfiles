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

test("DashboardBrief's Card mounts exactly one <SectionRule /> JSX element at the top of every panel", () => {
  assert.match(DASHBOARD_SOURCE, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule"/);
  const cardBody = DASHBOARD_SOURCE.slice(
    DASHBOARD_SOURCE.indexOf("function Card("),
    DASHBOARD_SOURCE.indexOf("export interface DashboardBriefProps")
  );
  // Match only the actual JSX element on its own line, not the doc-comment prose that also
  // mentions `<SectionRule/>` in backticks a few lines above the function.
  const matches = cardBody.match(/^\s*<SectionRule \/>\s*$/gm) ?? [];
  assert.equal(matches.length, 1);
});

test("DashboardBrief's SectionHeading no longer sets a borderBottom style on its own div (item 4.1)", () => {
  const headingBody = DASHBOARD_SOURCE.slice(
    DASHBOARD_SOURCE.indexOf("function SectionHeading("),
    DASHBOARD_SOURCE.indexOf("/** The foot line")
  );
  assert.doesNotMatch(headingBody, /borderBottom:\s*"/);
});
