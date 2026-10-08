// Real-render and wiring tests for the SCOPED policy timeline (lane MKT-1, 2026-10-08, operator ruling:
// the Market policy timeline is filtered to the active mode and region, shows the filter as text, and
// carries the spec 00 section 4 "N hidden by your scope" widen control).
//
// The view is compiled with esbuild and rendered with react-dom/server (the ImpactMeter.npmtest.mjs
// pattern), so the claims are about rendered output. The one thing that must NOT change is the unscoped
// render, which Regulations and every detail rail rely on: it is asserted byte-for-byte free of any scope
// markup. The strip's fetch wiring and the page mount are source-text assertions (the strip is a client
// component driven by fetch and state; the click-through is covered by the ribbon smoke spec's mount of
// the same view in a real browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../");
const OUT_DIR = resolve(REPO_ROOT, "scripts/tmp");

const stubNextLink = {
  name: "stub-next-link",
  setup(build) {
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "next-link-stub", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: `import React from "react"; export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children); }`,
      loader: "js",
      resolveDir: REPO_ROOT,
    }));
  },
};

const outfile = join(OUT_DIR, `mkt1-strip-view-${process.pid}-${Date.now()}.mjs`);
await esbuild.build({
  entryPoints: [resolve(HERE, "UpcomingObligationsStripView.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  outfile,
  logLevel: "silent",
  absWorkingDir: REPO_ROOT,
  plugins: [stubNextLink],
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "lucide-react"],
});
const { UpcomingObligationsStripView } = await import(pathToFileURL(outfile).href);
try {
  unlinkSync(outfile);
} catch {
  // best-effort cleanup of a compiled fixture under gitignored scripts/tmp/
}

const EVENT = {
  id: "e1",
  event_date: "2026-11-01",
  date_precision: "day",
  event_kind: "compliance_deadline",
  obligation_text: "Surrender allowances",
  item: { id: "i1", title: "FuelEU Maritime", legacy_id: null, jurisdiction_iso: ["EU"] },
};
const noop = () => {};
const render = (props) => renderToStaticMarkup(React.createElement(UpcomingObligationsStripView, { variant: "list", ...props }));

test("unscoped render carries no scope markup at all (Regulations and every detail rail are unchanged)", () => {
  const withEvents = render({ events: [EVENT] });
  assert.doesNotMatch(withEvents, /policy-scope|hidden by your scope|Show all|Back to your scope/);
  assert.match(withEvents, /Upcoming obligations/);
  const empty = render({ events: [], hasJurisdictionFilter: true });
  assert.match(empty, /No upcoming obligations match your workspace&#x27;s jurisdictions right now\./);
  assert.doesNotMatch(empty, /policy-scope/);
});

test("scoped render shows the filter as text and the hidden count with a widen control", () => {
  const html = render({ events: [EVENT], scopeInfo: { label: "Ocean, EU", hiddenByScope: 3, widened: false, onToggleWiden: noop } });
  assert.match(html, /data-audit="policy-scope-label"[^>]*>Ocean, EU</);
  assert.match(html, /<button[^>]*data-audit="policy-scope-widen"[^>]*>3 hidden by your scope · Show all<\/button>/);
  assert.doesNotMatch(html, /Back to your scope/);
});

test("scoped render with nothing hidden draws no widen control", () => {
  const html = render({ events: [EVENT], scopeInfo: { label: "Ocean, EU", hiddenByScope: 0, widened: false, onToggleWiden: noop } });
  assert.match(html, />Ocean, EU</);
  assert.doesNotMatch(html, /hidden by your scope|policy-scope-widen/);
});

test("widened render says everything is showing and offers the way back, no hidden-count button", () => {
  const html = render({ events: [EVENT], scopeInfo: { label: "Ocean, EU", hiddenByScope: 3, widened: true, onToggleWiden: noop } });
  assert.match(html, />All modes and regions</);
  assert.match(html, /data-audit="policy-scope-narrow"[^>]*>Back to your scope</);
  assert.doesNotMatch(html, /policy-scope-widen|hidden by your scope/);
});

test("scoped empty state names the scope and still offers the widen control", () => {
  const html = render({ events: [], scopeInfo: { label: "Ocean, EU", hiddenByScope: 5, widened: false, onToggleWiden: noop } });
  assert.match(html, /No upcoming obligations match Ocean, EU right now\./);
  assert.match(html, /5 hidden by your scope · Show all/);
});

test("a scope that filters nothing reads as all modes and regions", () => {
  const html = render({ events: [EVENT], scopeInfo: { label: "", hiddenByScope: 0, widened: false, onToggleWiden: noop } });
  assert.match(html, />All modes and regions</);
});

test("the strip sends the scope to the route, widens with scope=all, and Regulations passes no scope", () => {
  const strip = readFileSync(resolve(HERE, "UpcomingObligationsStrip.tsx"), "utf8");
  assert.match(strip, /params\.set\("scope", "all"\)/);
  assert.match(strip, /params\.set\("scope", "1"\)/);
  assert.match(strip, /if \(modesKey\) params\.set\("modes", modesKey\)/);
  assert.match(strip, /if \(regionsKey\) params\.set\("regions", regionsKey\)/);
  assert.match(strip, /const scoped = variant === "list" && !!scope;/);
  // No Regulations mount hands the strip a scope.
  const regPage = readFileSync(resolve(HERE, "..", "..", "app", "regulations", "[slug]", "page.tsx"), "utf8");
  assert.doesNotMatch(regPage, /<UpcomingObligationsStrip[^>]*scope=/);
});

test("the Market page mounts the policy timeline through MarketPolicyTimeline, inside Suspense, and no longer the bare strip", () => {
  const page = readFileSync(resolve(HERE, "..", "..", "app", "market", "page.tsx"), "utf8");
  assert.match(page, /<Suspense fallback=\{null\}>\s*<MarketPolicyTimeline \/>\s*<\/Suspense>/);
  assert.doesNotMatch(page, /<UpcomingObligationsStrip\b/);
  const wrapper = readFileSync(resolve(HERE, "..", "market", "MarketPolicyTimeline.tsx"), "utf8");
  assert.match(wrapper, /filterFromSearchParams\(params\)/);
  assert.match(wrapper, /<UpcomingObligationsStrip variant="list" scope=\{scope\} \/>/);
});

test("the route resolves scope=1 from facets then profile, scope=all drops every filter, and no scope param is the old read", () => {
  const route = readFileSync(resolve(HERE, "..", "..", "app", "api", "obligations", "upcoming", "route.ts"), "utf8");
  assert.match(route, /const scoped = scopeParam === "1";/);
  assert.match(route, /const widened = scopeParam === "all";/);
  assert.match(route, /if \(variant === "list" && !widened\)/);
  assert.match(route, /jurisdictionFilter = defaultJurisdictionFilter\(profile\.jurisdictions\);/);
  assert.match(route, /countHidden: scoped/);
});
