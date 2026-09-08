// Structural regression test for MembersPanel.tsx (lane admin60, 2026-09-08,
// artboard 14 / dc.html p14). Text-level, the same convention Chips.npmtest.mjs
// and TabRow.npmtest.mjs explain: what is guarded here is COMPOSITION, which
// shared part draws the region and where each control lives, which is exactly
// what regressed on this card before (flex rows instead of the artboard's table,
// Remove and Ban as text buttons on the row).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "MembersPanel.tsx"),
  "utf8"
);

test("the member list is the shared RowTable on dc.html p14's own track list", () => {
  assert.match(SOURCE, /<RowTable\s+columns=\{MEMBER_COLUMNS\}/);
  const labels = [...SOURCE.matchAll(/label: "([^"]*)", width/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Member", "Joined", "Role", ""]);
  const widths = [...SOURCE.matchAll(/width: "(1fr|\d+px)"/g)].map((m) => m[1]);
  assert.deepEqual(widths, ["1fr", "120px", "150px", "44px"]);
});

test("Remove and Ban live in the row overflow menu, not as text buttons on the row", () => {
  assert.match(SOURCE, /<RowTableOverflow/);
  assert.match(SOURCE, /key: "remove", label: "Remove from workspace", onSelect: \(\) => remove\(m\)/);
  assert.match(SOURCE, /key: "ban", label: "Ban from this workspace", onSelect: \(\) => setBanTarget\(m\)/);
  // The pre-handoff shape: a bare <button> whose child text was Remove / Ban.
  assert.equal(/>\s*Remove\s*<\/button>/.test(SOURCE), false);
  assert.equal(/>\s*Ban\s*<\/button>/.test(SOURCE), false);
});

test("the reader cannot be offered remove or ban on their own row", () => {
  assert.match(SOURCE, /isSelf\s*\?\s*\[\]/);
});

test("the invite row carries the artboard's label, placeholder and button text", () => {
  assert.match(SOURCE, /<FieldLabel>Invite by email<\/FieldLabel>/);
  assert.match(SOURCE, /placeholder="name@company\.com"/);
  assert.match(SOURCE, /Send invite/);
});

test("the seat strip states the seat clause through the Absence convention and draws no Manage seats link", () => {
  assert.match(SOURCE, /seat limit\{" "\}\s*<Absence reason="connect data" \/>/);
  // "Manage seats" survives only inside the comment that explains why it is not
  // drawn; it must never appear as a rendered link or button.
  assert.equal(/<a[^>]*>\s*Manage seats/.test(SOURCE), false);
  assert.equal(/Manage seats\s*→/.test(SOURCE), false);
});

test("the row's second line is the artboard's 'you · <email>', never a repeat of the ROLE column", () => {
  assert.match(SOURCE, /isSelf \? \(callerEmail \? `you · \$\{callerEmail\}` : "you"\)/);
});
