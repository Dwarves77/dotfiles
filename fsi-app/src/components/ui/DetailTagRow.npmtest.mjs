// Structural proof for the tag chip title (lane s8b-tag-attribution, 2026-10-07, migration 360). No JSX
// render harness exists in this repo, so this reads the sources; the render itself is proven in a real
// browser by .discipline/rendering/smoke/workspace-tags-smoke.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROW = readFileSync(resolve(HERE, "DetailTagRow.tsx"), "utf8");
const CHIPS = readFileSync(resolve(HERE, "Chips.tsx"), "utf8");

test("DetailTagRow passes 'applied by <name> on <date>' as each applied chip's title", () => {
  assert.match(ROW, /title=\{attributionText\(applications\.find\(\(a\) => a\.tagId === tag\.id\)\) \?\? undefined\}/);
  assert.match(ROW, /setApplications\(apps\);/);
});

test("WorkspaceTagPill puts an optional title on the chip itself and keeps the dot, label and remove button", () => {
  const start = CHIPS.indexOf("export function WorkspaceTagPill");
  const body = CHIPS.slice(start, CHIPS.indexOf("export interface FilterChipGroupProps"));
  assert.match(body, /title\?: string;/);
  assert.match(body, /data-part="chip-workspace-tag"\s+title=\{title\}/);
  assert.match(body, /aria-label=\{`Remove tag \$\{name\}`\}/);
});
