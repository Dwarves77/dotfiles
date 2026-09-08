// Structural regression test for src/components/ui/SectionCard.tsx, the ONE section/panel card
// shell (operator item A1, UI fix round 2026-09-08: "The 3px graduated rule at the top of every
// card is MISSING on all pages except the band blocks. It is part of the card component, not a
// decoration"; item A3: "Card shadow is missing on rail cards ... Border 1px rgba(0,0,0,.12),
// radius 10"). Source-text regression, the convention this repo's ui/ parts use (no JSX render
// harness here; see WatchButton.npmtest.mjs's own header). The RENDERED values are measured by the
// design audit's compose-* specs, and the class closure is fitness function F42.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(here, "SectionCard.tsx"), "utf8");

test("A3: the card's four shell properties are the artboard's, applied by the component", () => {
  assert.match(SOURCE, /background: "var\(--card\)"/);
  assert.match(SOURCE, /border: "1px solid var\(--line-1\)"/);
  assert.match(SOURCE, /borderRadius: "var\(--radius-card\)"/);
  assert.match(SOURCE, /boxShadow: "var\(--shadow-card\)"/);
});

test("A1: overflow hidden is a card property, which is what keeps the rule INSIDE the radius", () => {
  // The operator's wording: "3px, full card width, inside the radius". Without `overflow: hidden`
  // a full-width rule paints square corners over the card's rounded ones.
  assert.match(SOURCE, /overflow: "hidden"/);
});

test("a caller's style object cannot drop any card property: the card's own spread comes last", () => {
  const styleBlock = SOURCE.slice(SOURCE.indexOf("const cardStyle"), SOURCE.indexOf("data-section-card"));
  const spreadAt = styleBlock.indexOf("...style,");
  const borderAt = styleBlock.indexOf('border: "1px solid var(--line-1)"');
  assert.ok(spreadAt >= 0 && borderAt > spreadAt, "the caller's style must be spread BEFORE the card's own properties");
});

test("A1: the rule is mounted unconditionally, in both layouts, with one named exemption", () => {
  const mounts = SOURCE.match(/<SectionRule \/>/g) ?? [];
  assert.equal(mounts.length, 2, "in-flow (unpadded card) and absolutely positioned (padded card)");
  assert.match(SOURCE, /suppressRuleForBandGrouping \? null :/);
  // Ruling 5.2: the band-grouping card is the one card whose top edge is the band-coloured border.
  assert.match(SOURCE, /5\.2/);
});

test("the padded layout positions the rule at the card's top edge, full width, not inset by padding", () => {
  assert.match(SOURCE, /position: "absolute", top: 0, left: 0, right: 0/);
  assert.match(SOURCE, /\.\.\.\(padded \? \{ position: "relative", padding \} : null\)/);
});

test("every card marks itself for the audit's class-closure check, and the exempt one by value", () => {
  assert.match(SOURCE, /data-section-card=\{suppressRuleForBandGrouping \? "band-grouping" : ""\}/);
});

test("the card draws no title and therefore no divider under one (ruling 5.1)", () => {
  assert.doesNotMatch(SOURCE, /borderBottom/);
});

test("no em dash in this component's prose (operator's standing rule on new prose)", () => {
  assert.ok(!SOURCE.includes("—"));
});
