// prose-renderer-scope.test.mjs — the regression guard for section-content rendering.
//
// HISTORY. This test used to guard the ProseSection/GfmSection split: `regulations/sections/
// ProseSection.tsx` rendered paragraphs only (no table, no list, no heading) and was scoped to "the
// tight 2-3-paragraph surface the mockup specifies", yet was imported by Operations, Market Intel and
// Research, whose section content is tabular — a GFM table handed to it rendered as a paragraph of
// pipe characters. GfmSection (remark-gfm) fixed that.
//
// lane uidetails (2026-09-06): the entire `regulations/sections/` tree (RegulationSections,
// ProseSection, ActionList, ObligationsTable, SectionCard, RegulationTimeline, SourcesList) was
// deleted — RegulationDetailSurface.tsx was rebuilt onto the ONE detail architecture (README §0.5)
// and re-parses each section's content_md directly into FactCards
// (src/components/detail/FactBlocks.tsx + src/lib/detail/fact-paragraphs.ts) instead of dispatching
// through that per-kind renderer tree. F25 module-liveness confirmed the tree had zero remaining
// production importers before deletion. The ProseSection-specific assertions below (its scoping, its
// typography match with GfmSection) are retired with it — CLAUDE.md rule 13 (a refuted/retired
// premise is corrected in place, not silently dropped).
//
// lane uidetails2 (2026-09-07): Operations, Market Intel and Research were themselves rebuilt onto
// the ONE detail architecture and now render every section's content_md through the same shared
// FactBlocks (src/components/detail/FactBlocks.tsx), which routes non-claim "prose" blocks through
// GfmSection internally — see FactBlocks.npmtest.mjs. A per-surface direct `import { GfmSection }`
// used only to satisfy this test (with no call site) is exactly the dead-import smell CLAUDE.md rule
// 13 forbids; Market's copy was that and has been removed. Research keeps a legitimate direct
// GfmSection usage of its own (the WO-25 "cluster synthesis" ThemeBriefCard renders brief.briefMd,
// content that never flows through FactBlocks/content_md), so it still appears in the direct-importer
// list below, but the invariant that actually matters for all three is: content_md-carrying sections
// render via FactBlocks, and GfmSection (wherever it is reached from) still actually enables GFM.
//
// WHY A SOURCE-TEXT ASSERTION. This repo has no component render harness — zero *.test.tsx, no
// vitest/jest/tsx runner; `node --test` over *.mjs is the only execution-wired proof surface (the same
// constraint F26 records for the storage-ceiling parity check). A component-level test would be a
// proof that never runs, which standing rule 15 forbids. What CAN be asserted here, and is what
// actually regresses, is WHICH renderer each surface is wired to.
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

test("regulations/sections/ (RegulationSections, ProseSection, and the rest of the per-kind renderer tree) no longer exists", () => {
  assert.equal(importersOf("ProseSection").length, 0, "ProseSection should have been deleted with the rest of regulations/sections/");
  assert.equal(importersOf("RegulationSections").length, 0, "RegulationSections should have been deleted (lane uidetails, 2026-09-06 — zero production importers per F25)");
});

test("Operations, Market Intel and Research each render content_md sections through the shared FactBlocks (which itself renders prose through GfmSection)", () => {
  const expected = [
    "components/operations/OperationsDetailSurface.tsx",
    "components/pages/MarketSignalDetailSurface.tsx",
    "components/research/ResearchFindingDetailSurface.tsx",
  ];
  const actual = importersOf("FactBlocks");
  for (const f of expected) assert.ok(actual.includes(f), `${f} must import FactBlocks (found: ${actual.join(", ")})`);
  // FactBlocks is the one place a content_md prose block reaches GfmSection — see FactBlocks.npmtest.mjs.
  assert.ok(importersOf("GfmSection").includes("components/detail/FactBlocks.tsx"));
});

test("no surface carries a direct GfmSection import with no call site (the dead-import smell rule 13 forbids)", () => {
  for (const f of importersOf("GfmSection")) {
    const src = readFileSync(join(SRC, f), "utf8");
    assert.match(src, /<GfmSection[\s/>]/, `${f} imports GfmSection but never renders <GfmSection .../> — remove the dead import`);
  }
});

test("GfmSection actually enables GFM — remark-gfm is what makes a table a table", () => {
  const src = readFileSync(join(SRC, "components/shared/GfmSection.tsx"), "utf8");
  assert.match(src, /from ["']remark-gfm["']/, "must import remark-gfm");
  assert.match(src, /remarkPlugins=\{\[\s*remarkGfm\s*\]\}/, "must pass remarkGfm to ReactMarkdown");
  for (const tag of ["table:", "thead:", "th:", "td:", "ul:", "ol:", "li:"]) {
    assert.ok(src.includes(tag), `GfmSection must style ${tag} — an unstyled table is the defect half-fixed`);
  }
});
