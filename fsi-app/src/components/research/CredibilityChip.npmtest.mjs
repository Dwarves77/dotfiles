// Structural regression test for CredibilityChipAuthority.tsx and CredibilityChipEvidence.tsx,
// absence rule (2026-09-25 close): "a value that exists is shown; one that cannot exist yet names
// the data it needs"; the literal words "pending", "unscored" and "not scored" never render (see
// src/components/ui/Absence.tsx NEEDS_PHRASE). Both chips previously rendered the literal string
// "Not scored"; this lane (W2-C, 2026-09-29) replaced it with a specific needs-phrase per chip,
// derived from each file's own documented data requirement. Source-text regression, same convention
// as StateNote.npmtest.mjs's own header (no JSX render harness in this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const AUTHORITY = readFileSync(resolve(DIR, "CredibilityChipAuthority.tsx"), "utf8");
const EVIDENCE = readFileSync(resolve(DIR, "CredibilityChipEvidence.tsx"), "utf8");

test("CredibilityChipAuthority never renders the literal 'Not scored'; renders a specific needs-phrase instead", () => {
  assert.doesNotMatch(AUTHORITY, /:\s*"Not scored"/);
  assert.match(AUTHORITY, /:\s*"needs role-class data"/);
});

test("CredibilityChipEvidence never renders the literal 'Not scored'; renders a specific needs-phrase instead", () => {
  assert.doesNotMatch(EVIDENCE, /:\s*"Not scored"/);
  assert.match(EVIDENCE, /:\s*"needs evidence-synthesis data"/);
});

test("neither chip's short label spells the banned words 'pending', 'unscored' or 'not scored'", () => {
  for (const [name, source] of [["CredibilityChipAuthority", AUTHORITY], ["CredibilityChipEvidence", EVIDENCE]]) {
    const labelLine = source.match(/label = scored[\s\S]*?;|Evidence × agreement:.*$/m);
    // Fall back to scanning the whole file for the exact banned literal forms if the label
    // extraction regex doesn't match a future refactor; still catches the regression.
    const scope = labelLine ? labelLine[0] : source;
    assert.doesNotMatch(scope, /"Not scored"/, `${name} must not render the literal "Not scored"`);
  }
});

// ---------------------------------------------------------------------------------------------------------
// DFIX-1 (2026-10-08, row 02-l3 open item 3): the producer's output is richer than the chip's old 3-bucket
// type. scripts/research/authority-score.mjs `aggregateAuthorityDistribution` returns, beside the three
// buckets, `unknown` (a source whose standing could not be determined: not a guessed tier, spec rule 2) and
// `integrityFlagged` (a retracted source: a flag, never absorbed into a bucket count, rule 13). The chip used
// to print only the three buckets, so a distribution with six sources printed counts that summed to fewer and
// a retraction left no trace. Real rendered output: the chip is bundled with esbuild and rendered with
// react-dom/server, and the producer's own function builds the distribution under test, so the two cannot
// drift apart again.
// ---------------------------------------------------------------------------------------------------------
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { aggregateAuthorityDistribution } from "../../../scripts/research/authority-score.mjs";

const REPO_ROOT = resolve(DIR, "../../../");
const chipOut = join(REPO_ROOT, "scripts/tmp", `credchip-npmtest-${process.pid}-${Date.now()}.mjs`);
await esbuild.build({
  entryPoints: [resolve(DIR, "CredibilityChipAuthority.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile: chipOut,
  logLevel: "silent",
  absWorkingDir: REPO_ROOT,
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});
const { CredibilityChipAuthority: Chip } = await import(pathToFileURL(chipOut).href);
try {
  unlinkSync(chipOut);
} catch {
  // best-effort cleanup of a gitignored scratch bundle
}
const renderChip = (props) => renderToStaticMarkup(React.createElement(Chip, props));
const scored = (bucket, extra = {}) => ({ bucket, integrity: { isRetracted: false }, ...extra });

test("the chip renders every bucket the producer returns: unknown standing and integrity-flagged included", () => {
  const dist = aggregateAuthorityDistribution([
    scored("highAuthorityIndependent"),
    scored("highAuthorityIndependent"),
    scored("medium"),
    scored("vendorFlagged"),
    scored("unknown"),
    scored("unknown"),
    scored("medium", { integrity: { isRetracted: true } }),
  ]);
  assert.equal(dist.unknown, 2);
  assert.equal(dist.integrityFlagged, 1);
  const html = renderChip({ authorityDistribution: dist });
  assert.match(html, /2 high-authority/);
  assert.match(html, /2 medium/);
  assert.match(html, /1 vendor-flagged/);
  assert.match(html, /2 unknown standing/);
  assert.match(html, /1 integrity-flagged/);
});

test("a bucket that is zero is not printed beyond the three the chip always shows (no noise for the common case)", () => {
  const dist = aggregateAuthorityDistribution([scored("highAuthorityIndependent"), scored("medium"), scored("vendorFlagged")]);
  const html = renderChip({ authorityDistribution: dist });
  assert.match(html, /1 high-authority/);
  assert.doesNotMatch(html, /unknown standing/);
  assert.doesNotMatch(html, /integrity-flagged/);
});

test("the three-bucket shape the old callers pass still renders (nothing existing breaks)", () => {
  const html = renderChip({ authorityDistribution: { highAuthorityIndependent: 3, medium: 1, vendorFlagged: 2 } });
  assert.match(html, /3 high-authority · 1 medium · 2 vendor-flagged/);
});

test("no distribution still renders the needs-phrase, never a banned word", () => {
  const html = renderChip({});
  assert.match(html, /needs role-class data/);
  assert.doesNotMatch(html, /pending|unscored|not scored/i);
});
