// Structural regression test for src/components/ui/Chips.tsx's mobile-390 additions:
// FilterChipGroup/FilterChip mobile measures (lane moblist, 2026-09-07), and TierChip's mobile
// media block (FOLD-56 fix F4, 2026-09-07, mobile-390 spec: 9.5px/800 letter-spacing .06em text
// in a 1px rgba(0,0,0,.2) radius-4 box below 768px). BandChip/TagChip/WorkspaceTagPill remain
// untouched and unguarded here.
// Text-level, same convention as ListRow.npmtest.mjs's own header explains.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "Chips.tsx"),
  "utf8"
);

test("FilterChipGroup becomes a 36px bordered shell below 768px, nowrap and non-shrinking", () => {
  assert.match(SOURCE, /@media \(max-width: 767px\)/);
  assert.match(SOURCE, /\.cl-filter-group\s*\{[^}]*height:\s*36px/);
  assert.match(SOURCE, /flex-wrap:\s*nowrap\s*!important/);
  assert.match(SOURCE, /flex-shrink:\s*0/);
});

test("FilterChip squares off (radius 6) and recolors by data-active below 768px", () => {
  assert.match(SOURCE, /\.cl-filter-chip\s*\{[^}]*border-radius:\s*6px\s*!important/);
  assert.match(SOURCE, /\.cl-filter-chip\[data-active="true"\]\s*\{\s*background:\s*#5A5552/);
  assert.match(SOURCE, /\.cl-filter-chip\[data-active="false"\]\s*\{[^}]*color:\s*#5A6B67/);
});

test("FilterChip carries data-active so the mobile CSS can select on it, without changing its desktop active/inactive logic", () => {
  assert.match(SOURCE, /data-active=\{active \? "true" : "false"\}/);
  assert.match(SOURCE, /background: active \? "var\(--brand\)" : "var\(--tag\)"/, "desktop active/inactive colors unchanged");
});

test("BandChip/TagChip/WorkspaceTagPill carry no mobile media query — out of scope for both mobile-390 lanes", () => {
  const bandChip = SOURCE.slice(SOURCE.indexOf("export function BandChip"), SOURCE.indexOf("const TIER_CHIP_MOBILE_CSS"));
  const tagChip = SOURCE.slice(SOURCE.indexOf("export function TagChip"), SOURCE.indexOf("export function WorkspaceTagPill"));
  const workspaceTagPill = SOURCE.slice(SOURCE.indexOf("export function WorkspaceTagPill"), SOURCE.indexOf("export interface FilterChipGroupProps"));
  assert.doesNotMatch(bandChip, /@media/);
  assert.doesNotMatch(tagChip, /@media/);
  assert.doesNotMatch(workspaceTagPill, /@media/);
});

test("TierChip carries the 767px mobile block (FOLD-56 F4): 9.5px/800 letter-spacing .06em text in a 1px rgba(0,0,0,.2) radius-4 box", () => {
  const tierChip = SOURCE.slice(SOURCE.indexOf("const TIER_CHIP_MOBILE_CSS"), SOURCE.indexOf("export function TagChip"));
  assert.match(tierChip, /@media \(max-width: 767px\)/);
  assert.match(tierChip, /\.cl-tier-chip\s*\{[^}]*font-size:\s*9\.5px\s*!important/);
  assert.match(tierChip, /\.cl-tier-chip\s*\{[^}]*font-weight:\s*800\s*!important/);
  assert.match(tierChip, /\.cl-tier-chip\s*\{[^}]*letter-spacing:\s*0\.06em\s*!important/);
  assert.match(tierChip, /\.cl-tier-chip\s*\{[^}]*border:\s*1px solid rgba\(0,0,0,\.2\)\s*!important/);
  assert.match(tierChip, /\.cl-tier-chip\s*\{[^}]*border-radius:\s*4px\s*!important/);
});
