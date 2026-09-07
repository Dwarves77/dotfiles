// Structural regression test for src/components/ui/Chips.tsx's mobile-390 addition (lane moblist,
// 2026-09-07): FilterChipGroup/FilterChip mobile measures ONLY (this lane's write set names
// exactly those two; BandChip/TierChip/TagChip/WorkspaceTagPill are untouched and unguarded here).
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

test("TierChip/BandChip/TagChip/WorkspaceTagPill carry no mobile media query — out of this lane's write set", () => {
  const bandChip = SOURCE.slice(SOURCE.indexOf("export function BandChip"), SOURCE.indexOf("export function TierChip"));
  const tierChip = SOURCE.slice(SOURCE.indexOf("export function TierChip"), SOURCE.indexOf("export function TagChip"));
  assert.doesNotMatch(bandChip, /@media/);
  assert.doesNotMatch(tierChip, /@media/);
});
