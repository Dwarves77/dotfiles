// Structural regression test for src/components/admin/redesign/AdminIssuesRail.tsx (lane
// fix58-account, 2026-09-07, dc.html p13, ruling 5.1). Source-text check, same constraint as every
// other .npmtest.mjs beside a source file in this repo (no JSX render harness) — the full geometry
// is measured at runtime by fsi-app/.discipline/rendering/audit/spec/admin-issues-rail.json; this
// locks the structural contract that spec depends on so a future edit cannot silently regress it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "AdminIssuesRail.tsx"),
  "utf8"
);

test("mounts the shared SectionRule (ruling 5.1) as the card's own first child", () => {
  assert.match(SOURCE, /import \{ SectionRule \} from "@\/components\/ui\/SectionRule"/);
  const body = SOURCE.slice(SOURCE.indexOf("data-audit=\"rail-card\""));
  assert.match(body.slice(0, 700), /<SectionRule \/>/);
});

test("no wrong-direction border-bottom divider under the title (the exact bug ruling 4.1/5.1 removes)", () => {
  assert.doesNotMatch(SOURCE, /borderBottom:\s*"2px solid var\(--text\)"/);
});

test("row.sub is not a field on RailRow (removed as dormant once unrendered — CLAUDE.md rule 13-18)", () => {
  assert.doesNotMatch(SOURCE, /\bsub:\s*string;/);
  assert.doesNotMatch(SOURCE, /row\.sub/);
});

test("zero-count rows stay non-interactive (aria-disabled), non-zero rows stay real buttons", () => {
  assert.match(SOURCE, /aria-disabled="true"/);
  assert.match(SOURCE, /onClick=\{\(\) => onNavigate\(row\.target\)\}/);
});

test("muted-grey text uses --ink-3 (#7A6E6C, dc.html's title/total/footer colour), not --text-2 (#5A6B67)", () => {
  assert.doesNotMatch(SOURCE, /var\(--text-2\)/);
  assert.match(SOURCE, /var\(--ink-3\)/);
});

test("zero-row label keeps dc.html's own second grey, #5A6B67 (--ink-2) — distinct from the title's --ink-3", () => {
  const body = SOURCE.slice(SOURCE.indexOf("function RailButton"));
  assert.match(body, /color:\s*zero \? "var\(--ink-2\)" : "var\(--text\)"/);
});

// Lane adminlayout (2026-09-08), the operator's item 5: "Issues queue rows are 11 rows tall at
// ~40px, design is 24px rows with the count right-aligned tabular; zero rows muted."
test("rows are a 24px line box: one-line label, no list gap, the interactive floor and nothing more", () => {
  const body = SOURCE.slice(SOURCE.indexOf("function RailButton"));
  // The label is one line: wrapping it to two is what made the rows ~40px.
  assert.match(body, /whiteSpace:\s*"nowrap"/);
  assert.match(body, /textOverflow:\s*"ellipsis"/);
  assert.match(body, /lineHeight:\s*"20px"/);
  // A zero row is not interactive, so it sits at a flat 24; a non-zero row is a button and
  // carries the 28px hit-target floor over the same 24px line box, never more.
  assert.match(body, /height:\s*zero \? 24 : undefined/);
  assert.match(body, /minHeight:\s*zero \? 24 : 28/);
  assert.match(body, /padding:\s*zero \? 0 : "2px 0"/);
  // The list itself no longer adds an 8px gap between rows; each row's own hairline separates them.
  const list = SOURCE.slice(SOURCE.indexOf("rows.map((r) =>") - 600, SOURCE.indexOf("rows.map((r) =>"));
  assert.doesNotMatch(list, /gap:\s*8/);
});

test("the count is right-aligned and tabular, and a zero count is muted (item 5)", () => {
  const body = SOURCE.slice(SOURCE.indexOf("function RailButton"));
  assert.match(body, /textAlign:\s*"right"/);
  assert.match(body, /fontVariantNumeric:\s*"tabular-nums"/);
  // The artboard draws a zero row's numeral in full ink (#1A1A1A); "zero rows muted" makes it
  // --ink-3. The zero row's LABEL keeps the artboard's own second grey (the test above).
  assert.match(body, /color:\s*zero \? "var\(--ink-3\)" : "var\(--sev-critical\)"/);
});
