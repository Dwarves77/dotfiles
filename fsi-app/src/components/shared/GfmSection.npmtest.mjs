// GfmSection render proof (lane w10-factcard-b, 2026-09-20; Amendment 1 section A).
//
// THE MEASURED DEFECT. Live DOM, 2026-09-20, sha 6d9d139c: on a regulation detail and a market
// detail, at Full brief depth, well-formed markers such as `**Cause:** FACT: "..."` and
// `*Source: FAQ ... 02/04/2025.*` sat as PLAIN TEXT in <p> elements with no <strong>/<em> children.
// The amendment's hypothesis was that the Full-brief insertion point prints the whole `full_brief`
// string raw, bypassing GfmSection. This test is the render proof for that hypothesis.
//
// [CONFIRMED, this lane, by this test] `GfmSection` (react-markdown + remark-gfm) renders the exact
// measured pattern correctly: `**Cause:**` becomes <strong>Cause:</strong> and the trailing
// `*Source: ... .*` line becomes <em>. No literal `*` character survives into the rendered text.
// [CONFIRMED, by source grep, see the companion assertions below] every Full-brief insertion point
// in the four detail surfaces (Regulation, Market, Research, Operations) already routes
// `r.fullBrief` through `<GfmSection markdown={r.fullBrief} />`, not a raw `<p>{r.fullBrief}</p>`.
//
// [REFUTED, this lane] the "Full brief depth bypasses GfmSection" half of the amendment's hypothesis,
// for these four call sites, as the tree stands on this branch. `git log` shows this GfmSection
// wiring predates this lane (last touched by Lane L34, commit 2f59c88b, before b1dd38e4). The
// measured live-DOM matches are therefore not explained by a rendering bypass at this insertion
// point; they most likely reflect content captured before this wiring existed, or literal markdown
// characters already escaped inside the stored `full_brief` text itself (a data question, not a
// render-path question, and outside this lane's write set, no DB access from this worktree).
//
// This test stays as the render-path regression guard regardless: if a future change swaps
// GfmSection for a raw print at any of these four insertion points, this test catches it.
// NOTE ON IMPORT SHAPE: this repo's `.npmtest.mjs` lane (run after `npm ci`, see
// .github/workflows/discipline.yml) has no jiti-through-JSX pipeline wired for importing a real
// `.tsx` React component directly (every existing `.npmtest.mjs` imports `.ts`/`.mjs` libraries,
// never a component) - confirmed by running this file against a direct `./GfmSection.tsx` import,
// which fails with ERR_UNKNOWN_FILE_EXTENSION. Rather than build a new JSX-import pipeline (out of
// this lane's write set), this test renders through the SAME library stack GfmSection.tsx uses
// (react-markdown + remark-gfm, plain npm packages, no TSX involved) and couples the proof to the
// real component with the source-grep assertion below, which pins GfmSection.tsx's actual
// remark-gfm wiring so the two cannot silently drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const HERE = dirname(fileURLToPath(import.meta.url));

function renderLikeGfmSection(markdown) {
  return renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown));
}

test("GfmSection.tsx wires react-markdown with remark-gfm (the config this test's render proof mirrors)", () => {
  const src = readFileSync(resolve(HERE, "GfmSection.tsx"), "utf8");
  assert.match(src, /import ReactMarkdown from "react-markdown"/);
  assert.match(src, /import remarkGfm from "remark-gfm"/);
  assert.match(src, /remarkPlugins=\{\[remarkGfm\]\}/);
});

// The measured pattern, verbatim from Amendment 1 section A.
const MEASURED_FIXTURE = `**Cause:** FACT: "ReFuelEU mandates 2% SAF blend at EU airports from January 2025."

*Source: FAQ document, European Commission, 02/04/2025.*`;

test("GfmSection renders the measured Cause/Source pattern with no literal * surviving", () => {
  const html = renderLikeGfmSection(MEASURED_FIXTURE);
  assert.match(html, /<strong>Cause:<\/strong>/, "the bold kind word becomes a real <strong>");
  assert.match(html, /<em>Source: FAQ document, European Commission, 02\/04\/2025\.<\/em>/, "the italic source line becomes a real <em>");
  // Strip tags, then assert no `*` character remains anywhere in the visible text.
  const text = html.replace(/<[^>]+>/g, "");
  assert.doesNotMatch(text, /\*/, "no literal asterisk survives into the rendered text");
});

test("GfmSection renders a longer full-brief-shaped fixture (multiple sections, bullets) cleanly", () => {
  const fixture = `# Section 3: Issues Requiring Immediate Action

- **ACTION REQUIRED:** Assess whether the workspace's Belgium-bound clients have registered with the Interregional Commission for Packaging.

**Cause:** FACT: "The regulation requires take-back registration for importers of filled packaging."

*Source: Commission Decision 1999/652/EC, European Commission, 15/09/1999.*`;
  const html = renderLikeGfmSection(fixture);
  const text = html.replace(/<[^>]+>/g, "");
  assert.doesNotMatch(text, /\*/, "no literal asterisk survives across headings, bullets and bold/italic runs together");
});

// ── Insertion-point inventory: every Full-brief call site routes through GfmSection ────────────
// One assertion per detail surface named in the brief plus the two others that share the pattern
// (Research, Operations), grepped from source rather than rendered, since these surfaces carry
// server data-fetching and hooks GfmSection itself does not.

function sourceOf(relPath) {
  return readFileSync(resolve(HERE, relPath), "utf8");
}

test("RegulationDetailSurface's Full-brief insertion point routes through GfmSection, not a raw print", () => {
  const src = sourceOf("../regulations/RegulationDetailSurface.tsx");
  assert.match(src, /depth === "full" && r\.fullBrief && \(/);
  assert.match(src, /<GfmSection markdown=\{r\.fullBrief\} \/>/);
  assert.doesNotMatch(src, /<p>\{r\.fullBrief\}<\/p>/, "never a raw <p> print of the whole brief");
});

test("MarketSignalDetailSurface's Full-brief insertion point routes through GfmSection, not a raw print", () => {
  const src = sourceOf("../pages/MarketSignalDetailSurface.tsx");
  assert.match(src, /depth === "full" && r\.fullBrief && \(/);
  assert.match(src, /<GfmSection markdown=\{r\.fullBrief\} \/>/);
  assert.doesNotMatch(src, /<p>\{r\.fullBrief\}<\/p>/, "never a raw <p> print of the whole brief");
});

test("ResearchFindingDetailSurface's two Full-brief insertion points route through GfmSection", () => {
  const src = sourceOf("../research/ResearchFindingDetailSurface.tsx");
  assert.equal((src.match(/<GfmSection markdown=\{r\.fullBrief\} \/>/g) ?? []).length, 2);
  assert.doesNotMatch(src, /<p>\{r\.fullBrief\}<\/p>/);
});

test("OperationsDetailSurface's Full-brief insertion point routes through GfmSection", () => {
  const src = sourceOf("../operations/OperationsDetailSurface.tsx");
  assert.match(src, /<GfmSection markdown=\{r\.fullBrief\} \/>/);
  assert.doesNotMatch(src, /<p>\{r\.fullBrief\}<\/p>/);
});
