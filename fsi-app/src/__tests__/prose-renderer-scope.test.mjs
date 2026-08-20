// prose-renderer-scope.test.mjs — the regression guard for the ProseSection/GfmSection split.
//
// THE DEFECT THIS LOCKS OUT. `regulations/sections/ProseSection.tsx` renders paragraphs only: it
// splits on blank lines and emits <p>, with inline bold/italic/code/link and nothing else. No table,
// no list, no heading. Its own docstring scopes it to "the tight 2-3-paragraph surface the mockup
// specifies". It was nevertheless imported by Operations, Market Intel and Research, whose section
// content is tabular — measured 2026-08-17 over `intelligence_item_sections`: 978 sections carry a
// markdown table, 714 a bullet list, and on those three surfaces 114 of 116 items hold content
// ProseSection cannot draw. A GFM table handed to it renders as a paragraph of pipe characters.
//
// WHY A SOURCE-TEXT ASSERTION. This repo has no component render harness — zero *.test.tsx, no
// vitest/jest/tsx runner; `node --test` over *.mjs is the only execution-wired proof surface (the same
// constraint F26 records for the storage-ceiling parity check, and the reason theme-stats.mjs exists).
// A component-level test would be a proof that never runs, which standing rule 15 forbids. What CAN be
// asserted here, and is what actually regresses, is WHICH renderer each surface is wired to.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const rel = (p) => relative(SRC, p).replace(/\\/g, "/");
const importersOf = (name) =>
  FILES.filter((f) => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(readFileSync(f, "utf8")))
    .map(rel)
    .sort();

test("ProseSection is imported ONLY by RegulationSections — it is correct in its own home, nowhere else", () => {
  assert.deepEqual(importersOf("ProseSection"), ["components/regulations/sections/RegulationSections.tsx"]);
});

test("Operations, Market Intel and Research each render sections through GfmSection", () => {
  const expected = [
    "components/operations/OperationsDetailSurface.tsx",
    "components/pages/MarketSignalDetailSurface.tsx",
    "components/research/ResearchFindingDetailSurface.tsx",
  ];
  const actual = importersOf("GfmSection");
  for (const f of expected) assert.ok(actual.includes(f), `${f} must import GfmSection (found: ${actual.join(", ")})`);
});

test("no surface still renders a <ProseSection> element outside the regulations section tree", () => {
  const offenders = FILES.filter((f) => /<ProseSection\b/.test(readFileSync(f, "utf8")))
    .map(rel)
    .filter((f) => !f.startsWith("components/regulations/"));
  assert.deepEqual(offenders, [], `these render ProseSection outside regulations: ${offenders.join(", ")}`);
});

test("GfmSection actually enables GFM — remark-gfm is what makes a table a table", () => {
  const src = readFileSync(join(SRC, "components/shared/GfmSection.tsx"), "utf8");
  assert.match(src, /from ["']remark-gfm["']/, "must import remark-gfm");
  assert.match(src, /remarkPlugins=\{\[\s*remarkGfm\s*\]\}/, "must pass remarkGfm to ReactMarkdown");
  for (const tag of ["table:", "thead:", "th:", "td:", "ul:", "ol:", "li:"]) {
    assert.ok(src.includes(tag), `GfmSection must style ${tag} — an unstyled table is the defect half-fixed`);
  }
});

test("GfmSection keeps ProseSection's paragraph typography so the prose path is a visual no-op", () => {
  const gfm = readFileSync(join(SRC, "components/shared/GfmSection.tsx"), "utf8");
  const prose = readFileSync(join(SRC, "components/regulations/sections/ProseSection.tsx"), "utf8");
  for (const decl of ["fontSize: 14", "lineHeight: 1.7", '"78ch"']) {
    assert.ok(prose.includes(decl), `precondition: ProseSection should declare ${decl}`);
    assert.ok(gfm.includes(decl), `GfmSection must match ProseSection's ${decl}`);
  }
});
