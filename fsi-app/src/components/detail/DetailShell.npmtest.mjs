// Structural regression test for src/components/detail/DetailShell.tsx (lane uidetails, 2026-09-06).
// No JSX render harness exists in this repo (see WatchButton.npmtest.mjs's own header for the same
// constraint) — this reads the component's source text to guard the contract points the dispatch and
// README §0.5 bind: one detail architecture, no tabs, the shared parts actually imported and used (not
// a page-local fork), and the searchParams read isolated in a Suspense-wrapped bridge (PERF-10
// precedent — see RegulationsLedger.tsx's SearchParamsFilterBridge) so the four detail routes' static
// generation is never forced dynamic by this shell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "DetailShell.tsx"),
  "utf8"
);

// Block comments carry historical/explanatory prose (e.g. naming the dead control this file
// replaces) — the vocabulary checks below care about CODE, not comments describing the change.
const CODE_ONLY = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");

test("imports the shared parts rather than reimplementing them (BandChip, TierChip, MilestoneTimeline, StateNote, ImpactMeter, Absence)", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/Chips"/);
  assert.match(SOURCE, /from "@\/components\/ui\/MilestoneTimeline"/);
  assert.match(SOURCE, /from "@\/components\/ui\/StateNote"/);
  assert.match(SOURCE, /from "@\/components\/ui\/ImpactMeter"/);
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
});

test("MilestoneTimeline and ImpactMeter are mounted with variant=\"full\" (the detail-rail/header variant, not the row variant)", () => {
  assert.match(SOURCE, /<MilestoneTimeline[^>]*variant="full"/);
  assert.match(SOURCE, /<ImpactMeter[^>]*variant="full"/);
});

test("no tab, tablist, or per-tab ask-bar vocabulary survives in the shell (README §0.5: 'no tabs, no per-tab ask bar')", () => {
  assert.doesNotMatch(SOURCE, /role="tab"/);
  assert.doesNotMatch(SOURCE, /role="tablist"/);
  assert.doesNotMatch(SOURCE, /TabKey/);
  assert.doesNotMatch(SOURCE, /AiPromptBar/);
});

test("no 'Complete brief' toggle vocabulary survives in code (the dead three-state control this lane removes)", () => {
  assert.doesNotMatch(CODE_ONLY, /Complete brief/i);
});

test("the searchParams read for 'In this list' lives inside a component calling useSearchParams, isolated from InThisListStat's own body", () => {
  assert.match(SOURCE, /function InThisListBridge/);
  assert.match(SOURCE, /useSearchParams\(\)/);
  // InThisListStat itself must not call the hook directly — only render the bridge inside Suspense.
  const statBody = SOURCE.slice(SOURCE.indexOf("export function InThisListStat"));
  assert.doesNotMatch(statBody.split("function ")[0], /useSearchParams\(\)/);
  assert.match(SOURCE, /<Suspense fallback=\{null\}>\s*<InThisListBridge/);
});

test("InThisListStat reads the confirmed list/pos/of URL param contract (the lists lane's withListPosition), not a hardcoded/fabricated position", () => {
  assert.match(SOURCE, /searchParams\.get\("pos"\)/);
  assert.match(SOURCE, /searchParams\.get\("of"\)/);
  assert.match(SOURCE, /searchParams\.get\("list"\)/);
});

// Lane uidetails2 (2026-09-07): the breadcrumb's own last segment ("1 of 9 in Action") reuses the
// SAME InThisListBridge/list-pos-of contract, mounted directly inside DetailHeader so every detail
// surface picks it up with no page-local change.
test("DetailHeader renders the breadcrumb list-position segment via the same shared bridge, not a second searchParams reader", () => {
  assert.match(SOURCE, /function BreadcrumbListPosition/);
  const headerBody = SOURCE.slice(
    SOURCE.indexOf("export function DetailHeader"),
    SOURCE.indexOf("// ── Exposure grid")
  );
  assert.match(headerBody, /<BreadcrumbListPosition band=\{band\} \/>/);
  // BreadcrumbListPosition itself must not call the hook directly — only render the shared bridge.
  const bridgeCompBody = SOURCE.slice(
    SOURCE.indexOf("function BreadcrumbListPosition"),
    SOURCE.indexOf("export function InThisListStat")
  );
  assert.doesNotMatch(bridgeCompBody.split("function ")[1] ?? bridgeCompBody, /useSearchParams\(\)/);
  assert.match(bridgeCompBody, /<InThisListBridge/);
});

test("the breadcrumb list-position segment renders nothing when pos/of are absent — Absence-by-omission, never a fabricated '1 of 1'", () => {
  const bridgeCompBody = SOURCE.slice(
    SOURCE.indexOf("function BreadcrumbListPosition"),
    SOURCE.indexOf("export function InThisListStat")
  );
  assert.match(bridgeCompBody, /\{known && `/);
});

test("an unknown list position renders the Absence convention, never a fabricated '1 of 1'", () => {
  assert.match(SOURCE, /<Absence reason="not in primary source" \/>/);
});

test("SectionIndex renders sticky (position: sticky), the README §0.5 'sticky section index' requirement", () => {
  const start = SOURCE.indexOf("export function SectionIndex");
  const end = SOURCE.indexOf("export function", start + 1);
  const body = SOURCE.slice(start, end === -1 ? undefined : end);
  assert.match(body, /position: "sticky"/);
});
