// Structural regression test for src/components/ui/TagPopover.tsx (DEFECT-FIX item 3.2,
// 2026-09-07). No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's own
// header for the same constraint) — this reads the component's source text to guard the one
// contract point the audit named: when `open` is controlled, TagPopover renders no trigger button
// of its own, so the action row's "+ Tag" stays the only trigger that opens the popover.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "TagPopover.tsx"),
  "utf8"
);

test("the trigger button is gated on `!controlled` (no second '+ Tag' button when open/onOpenChange is supplied)", () => {
  assert.match(SOURCE, /const controlled = openProp !== undefined;/);
  assert.match(SOURCE, /\{!controlled && \(\s*<button/);
});

test("the '+ Tag' button JSX text lives inside the `!controlled &&` branch only (never a second, unconditional trigger)", () => {
  const gateStart = SOURCE.indexOf("{!controlled && (");
  assert.notEqual(gateStart, -1);
  const gateEnd = SOURCE.indexOf("</button>", gateStart);
  assert.notEqual(gateEnd, -1);
  const gateBody = SOURCE.slice(gateStart, gateEnd);
  assert.match(gateBody, />\s*\+ Tag\s*$/);
  // No JSX "+ Tag" text node outside that gated block.
  const rest = SOURCE.slice(0, gateStart) + SOURCE.slice(gateEnd + "</button>".length);
  assert.doesNotMatch(rest, />\s*\+ Tag\s*</);
});

test("the popover panel (role=\"listbox\") is NOT gated on `controlled` — it still renders (and anchors) when the trigger is hidden", () => {
  const panelStart = SOURCE.indexOf('role="listbox"');
  assert.notEqual(panelStart, -1);
  const before = SOURCE.slice(0, panelStart);
  // The last conditional opened before the panel must be `open &&`, not `!controlled &&`
  // (i.e. the panel's own gate is independent of whether the trigger renders).
  const lastOpenGate = before.lastIndexOf("{open && (");
  const lastControlledGate = before.lastIndexOf("{!controlled && (");
  assert.ok(lastOpenGate > lastControlledGate, "the listbox panel must be gated on `open`, not nested inside the `!controlled` trigger block");
});
