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
