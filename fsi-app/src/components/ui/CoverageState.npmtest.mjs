// Regression tests for src/components/ui/CoverageState.tsx (lane COV-1, 2026-10-08): the ONE renderer for the
// six states of absence (spec 00 section 4). Like ImpactMeter.npmtest.mjs this compiles the REAL component with
// esbuild and renders it with react-dom/server in Node, because the claim under test is about rendered output:
// six states render six different treatments, an unknown state renders the caller's fallback, and the cell form
// is the declared dash. `react` / `react-dom` stay external so the component renders with the app's own React.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(HERE, "CoverageState.tsx");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const REPO_ROOT = resolve(HERE, "../../../"); // fsi-app/
const outfile = join(resolve(REPO_ROOT, "scripts/tmp"), `coveragestate-npmtest-${process.pid}-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [SOURCE_PATH],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile,
  logLevel: "silent",
  absWorkingDir: REPO_ROOT,
  alias: { "@": resolve(REPO_ROOT, "src") },
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "@supabase/*", "next/*", "next"],
});
const mod = await import(pathToFileURL(outfile).href);
try {
  unlinkSync(outfile);
} catch {
  // best-effort cleanup of gitignored scratch
}
const { CoverageState } = mod;
const html = (props) => renderToStaticMarkup(React.createElement(CoverageState, { subject: "OEM equipment roadmap", ...props }));

const STATES = ["not_applicable", "not_covered", "no_data_yet", "suppressed", "not_filtered_in", "error"];
const FULL = {
  reason: "No rows yet.", roadmap: "Phase 3", requestRef: "/market#oem-roadmap", expectedRefresh: "2026-11-01", lastValue: "EUR 71.2",
  asOf: "2026-09-30", reasonClass: "k_anonymity", hiddenCount: 7, noun: "obligation", onWiden: () => {}, onRetry: () => {}, statusHref: "/status",
};

test("each of the six states renders and declares which state it is", () => {
  for (const s of STATES) {
    const out = html({ ...FULL, state: s });
    assert.match(out, new RegExp(`data-coverage-state="${s}"`), s);
    assert.match(out, /data-part="coverage-state"/);
  }
});

test("six states render six different treatments (no two share markup)", () => {
  const outs = STATES.map((s) => html({ ...FULL, state: s }));
  assert.equal(new Set(outs).size, 6);
});

test("not applicable is the suppressed cell with its explanation on hover, whatever variant was asked for", () => {
  for (const variant of ["block", "inline", "cell"]) {
    const out = html({ state: "not_applicable", variant, reason: "A SECA surcharge does not apply to a rail leg." });
    assert.match(out, /data-absence="dash"/, variant);
    assert.match(out, /title="Not applicable: A SECA surcharge does not apply to a rail leg\."/);
    assert.match(out, /aria-label="Not applicable: A SECA surcharge/);
    assert.doesNotMatch(out, /<p/);
  }
});

test("not covered names the gap, the roadmap position, and offers Request coverage", () => {
  const out = html({ ...FULL, state: "not_covered" });
  assert.match(out, /Not covered/);
  assert.match(out, /OEM equipment roadmap is not covered yet\./);
  assert.match(out, /No rows yet\./);
  assert.match(out, /Roadmap position: Phase 3\./);
  assert.match(out, />Request coverage</);
  // No request target, no request action: it is never offered when it cannot post.
  assert.doesNotMatch(html({ state: "not_covered" }), /Request coverage/);
});

test("no data yet shows the expected refresh and the last known value with its as-of", () => {
  const out = html({ ...FULL, state: "no_data_yet" });
  assert.match(out, /Expected refresh: 2026-11-01\./);
  assert.match(out, /Last known value: EUR 71\.2 \(as of 2026-09-30\)\./);
});

test("suppressed states the reason class and is never worded as absence", () => {
  const out = html({ ...FULL, state: "suppressed" });
  assert.match(out, /Reason: Too few contributors to publish\./);
  assert.match(out, /exists and is withheld/);
  assert.doesNotMatch(out, /not covered|no data|missing/i);
});

test("not filtered in states the hidden count and offers the widen control; with no count it states none", () => {
  const out = html({ ...FULL, state: "not_filtered_in" });
  assert.match(out, /7 obligations hidden by your scope\./);
  assert.match(out, />Widen scope</);
  const unknown = html({ state: "not_filtered_in", onWiden: () => {} });
  assert.doesNotMatch(unknown, /\d+ \w+ hidden/);
  assert.match(unknown, /exists outside your current scope/);
});

test("error is an alert with a retry and a status link, distinct from every absence state", () => {
  const out = html({ ...FULL, reason: null, state: "error" });
  assert.match(out, /role="alert"/);
  assert.match(out, />Retry</);
  assert.match(out, /href="\/status"/);
  assert.match(out, /system fault, not an absence of data/);
  for (const s of STATES.filter((x) => x !== "error")) assert.doesNotMatch(html({ ...FULL, state: s }), /role="alert"/, s);
});

test("an unknown or missing state renders the caller's fallback, so an existing render is preserved", () => {
  assert.equal(renderToStaticMarkup(React.createElement(CoverageState, { subject: "x", state: "pending", fallback: React.createElement("i", null, "old") })), "<i>old</i>");
  assert.equal(renderToStaticMarkup(React.createElement(CoverageState, { subject: "x", state: undefined })), "");
});

test("the cell variant of any state is the declared dash carrying the state in its explanation", () => {
  const out = html({ state: "no_data_yet", variant: "cell", expectedRefresh: "next month" });
  assert.match(out, /data-absence="dash"/);
  assert.match(out, /data-part-variant="cell"/);
  assert.match(out, /title="No data yet: OEM equipment roadmap: the source has not published yet\. Expected refresh: next month\./);
});

test("source shape: tap targets are 44 px, no raw dash glyph, and no banned absence words are written", () => {
  assert.match(SOURCE, /minHeight: 44/);
  assert.doesNotMatch(SOURCE, /[\u2013\u2014\u00a7]/, "rule 022: the dash is written as the JS escape");
  assert.match(SOURCE, /\{"\\u2014"\}/);
  assert.doesNotMatch(SOURCE, /["'`](pending|unscored|not scored)["'`]/i);
});
