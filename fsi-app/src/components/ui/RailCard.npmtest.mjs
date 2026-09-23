// Structural regression test for RailCard.tsx (lane W10-RailCard, 2026-09-22). Text-level, same
// convention as CommandBar.npmtest.mjs's own header explains (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "RailCard.tsx"), "utf8");

test("the part root carries data-part=\"rail-card\" on both the titleHref branch and the default branch", () => {
  const matches = SOURCE.match(/"data-part": "rail-card"/g) ?? [];
  assert.equal(matches.length, 2, "both render branches must stamp the part attribute");
});

test("the card is the shared SectionCard shell, never a hand-rolled div with its own border/radius/shadow", () => {
  assert.match(SOURCE, /import \{ SectionCard \} from "@\/components\/ui\/SectionCard";/);
  assert.doesNotMatch(SOURCE, /border:\s*"1px solid/, "no hand-rolled border literal, SectionCard owns it");
  assert.doesNotMatch(SOURCE, /boxShadow:/, "no hand-rolled shadow literal, SectionCard owns it");
});

test("the header title is 10.5px/800/.12em uppercase muted (parts-brief 2.12)", () => {
  assert.match(SOURCE, /fontSize:\s*"var\(--fs-105\)"/);
  assert.match(SOURCE, /fontWeight:\s*800/);
  assert.match(SOURCE, /letterSpacing:\s*"0\.12em"/);
  assert.match(SOURCE, /textTransform:\s*"uppercase"/);
});

test("headLink and headRight are mutually exclusive in the default branch, headLink takes precedence, headRight is the fallback", () => {
  assert.match(SOURCE, /const headTrailing = headLink \? \(/);
  assert.match(SOURCE, /headRight \?\? null/);
});

test("titleHref renders the title itself as a Link with a trailing arrow, carried over from the pre-lane DashboardRailCard shape", () => {
  assert.match(SOURCE, /import Link from "next\/link";/);
  assert.match(SOURCE, /\{title\} →/);
});

test("the card body padding is 14px 16px, the canonical rail-card padding every prior hand-rolled copy used", () => {
  const matches = SOURCE.match(/padding:\s*"14px 16px"/g) ?? [];
  assert.equal(matches.length, 2, "both render branches must use the canonical padding");
});
