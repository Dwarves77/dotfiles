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

test("imports the shared parts rather than reimplementing them (StateNote, ImpactMeter, Absence)", () => {
  assert.match(SOURCE, /from "@\/components\/ui\/StateNote"/);
  assert.match(SOURCE, /from "@\/components\/ui\/ImpactMeter"/);
  assert.match(SOURCE, /from "@\/components\/ui\/Absence"/);
});

// Operator check 3 (lane PARITY-PARTS, 2026-09-24, superseding this test's own prior assertion
// that ImpactMeter/MilestoneTimeline MUST mount variant="full" here): impact is ONE stepped meter
// out of 12, the same row variant every list row draws, never the four-bar per-dimension block,
// see ImpactRailCard's own header comment. BandChip/TierChip/MilestoneTimeline moved into
// ActionCard.tsx (check 2's masthead-card port) and are no longer imported by this file at all.
test("ImpactRailCard never mounts ImpactMeter with variant=\"full\" (the retired four-bar block)", () => {
  assert.doesNotMatch(SOURCE, /<ImpactMeter[^>]*variant="full"/);
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

// FOLD-56 (F7): the mobile-390 spec's rail "prev/next links" — InThisListStat reads the bounded
// prev/next slugs withListPosition's row href now optionally carries, via a second Suspense-wrapped
// bridge (never a direct hook call in InThisListStat's own body, same isolation rule as the
// list/pos/of bridge above).
test("InThisListStat reads prev/next neighbour slugs via a second isolated bridge", () => {
  assert.match(SOURCE, /function InThisListNeighborsBridge/);
  assert.match(SOURCE, /searchParams\.get\("prev"\)/);
  assert.match(SOURCE, /searchParams\.get\("next"\)/);
  const statBody = SOURCE.slice(SOURCE.indexOf("export function InThisListStat"));
  assert.doesNotMatch(statBody.split("function ")[0], /useSearchParams\(\)/);
  assert.match(SOURCE, /<Suspense fallback=\{null\}>\s*<InThisListNeighborsBridge/);
});

test("InThisListStat reconstructs each neighbour's href from withListPosition (imported, not hand-built query string)", () => {
  assert.match(SOURCE, /import \{ withListPosition \} from "@\/components\/list-surface\/list-surface-helpers"/);
  const statBody = SOURCE.slice(SOURCE.indexOf("export function InThisListStat"), SOURCE.indexOf("export function InThisListStat") + 5000);
  assert.match(statBody, /withListPosition\(/);
});

test("InThisListStat's prev/next links are omitted, not rendered empty, when a neighbour is absent", () => {
  const statBody = SOURCE.slice(SOURCE.indexOf("export function InThisListStat"), SOURCE.indexOf("export function InThisListStat") + 5000);
  assert.match(statBody, /\(prevHref \|\| nextHref\) &&/);
  assert.match(statBody, /prevHref &&/);
  assert.match(statBody, /nextHref &&/);
});

// GAP G2 (2026-09-07, operator audit item 2.3, ruling R4): the breadcrumb's own last segment
// ("N of M in Band") now renders inside DetailMastheadBreadcrumb, feeding the shared Masthead's
// own VOL/breadcrumb line (dateLabel). The old DetailHeader-local BreadcrumbListPosition bridge was
// removed as dead code once DetailHeader stopped rendering it (CLAUDE.md rule 13); check 2 (lane
// PARITY-PARTS, 2026-09-24) later retired DetailHeader itself entirely (superseded by ActionCard,
// see BandChip/TierChip/MilestoneTimeline's own import line, now gone from this file), the three
// DetailHeader-body tests this file used to carry are removed with it, not tested against dead
// code (CLAUDE.md rule 13). `function BreadcrumbListPosition` staying gone is still asserted.
test("no dead BreadcrumbListPosition bridge survives (superseded by DetailMastheadBreadcrumb)", () => {
  assert.doesNotMatch(CODE_ONLY, /function BreadcrumbListPosition/);
});

test("DetailMastheadBreadcrumb renders the R4 breadcrumb format via the shared searchParams reader, isolated from DetailMasthead's own body", () => {
  assert.match(SOURCE, /function DetailMastheadBreadcrumb/);
  const bridgeBody = SOURCE.slice(
    SOURCE.indexOf("function DetailMastheadBreadcrumb"),
    SOURCE.indexOf("export interface DetailMastheadProps")
  );
  assert.match(bridgeBody, /useSearchParams\(\)/);
  assert.match(bridgeBody, /\$\{base\} \/ \$\{pos\} of \$\{of\} in \$\{band\.label\}/);
  const mastheadBody = SOURCE.slice(SOURCE.indexOf("export function DetailMasthead("));
  assert.doesNotMatch(mastheadBody.split("function ")[0], /useSearchParams\(\)/);
  assert.match(mastheadBody, /<Suspense fallback=\{null\}>\s*<DetailMastheadBreadcrumb/);
});

test("DetailMasthead mounts the shared ui/Masthead with size=\"detail\" and passes the scoped placeholder to its ONE CommandBar", () => {
  assert.match(SOURCE, /import \{ Masthead \} from "@\/components\/ui\/Masthead"/);
  const mastheadBody = SOURCE.slice(SOURCE.indexOf("export function DetailMasthead("));
  assert.match(mastheadBody, /<Masthead[\s\S]*size="detail"/);
  assert.match(mastheadBody, /commandBar=\{\{ itemCount: 0, placeholder, scope: surface\.toLowerCase\(\) \}\}/);
});

test("an unknown list position renders the Absence convention, never a fabricated '1 of 1'", () => {
  assert.match(SOURCE, /<Absence reason="not in primary source" \/>/);
});

// F45 duplicate-code (lane W10-ActionCard-a, 2026-09-21): SectionIndex itself (the sticky nav, the
// tab strip, the Summary|Full switch) moved entirely out of this file into
// src/components/ui/SectionIndex.tsx (lane W10-ActionCard-a's own fixed part). This file's own
// former "SectionIndex calls sectionIndexNavStyle()" / tab-ellipsis tests tested a function that no
// longer exists here; that coverage now lives in ui/SectionIndex.npmtest.mjs, alongside it, not
// re-derived against dead code (CLAUDE.md rule 13).

// Lane uiactions (2026-09-07, design ruling R3): the Summary | Full brief depth switch — TWO
// states only, never the old three-state control, and never role="tab"/"tablist" (that vocabulary
// is reserved for the per-tab architecture README §0.5 removes — see the "no tab" test above).
test("SummaryDepthSwitch offers exactly two depths (summary, full) and never reintroduces tab/tablist ARIA roles", () => {
  assert.match(SOURCE, /export type SummaryDepth = "summary" \| "full";/);
  const start = SOURCE.indexOf("export function SummaryDepthSwitch");
  assert.notEqual(start, -1);
  const body = SOURCE.slice(start);
  assert.doesNotMatch(body, /role="tab"/);
  assert.doesNotMatch(body, /role="tablist"/);
  assert.match(body, /opt\("summary", "Summary"\)/);
  assert.match(body, /opt\("full", "Full brief"\)/);
});

test("SummaryDepthSwitch's buttons clear the 44px law-2 hit-target floor (both states, no clearance-based exemption)", () => {
  const start = SOURCE.indexOf("export function SummaryDepthSwitch");
  const body = SOURCE.slice(start);
  assert.match(body, /minHeight: 44/);
});

// DEFECT-FIX item 2.3 (2026-09-07) retired DetailHeader's scoped CommandBar; check 2 (lane
// PARITY-PARTS, 2026-09-24) retired DetailHeader itself, superseded by ActionCard (band pill +
// action row + exposure + timeline, mounted via Masthead's own `actionSlot`). "One ask surface,
// the Masthead" is now trivially true (there is no second header component left to carry a second
// one), asserted at the file level instead of against a function that no longer exists.
test("no second CommandBar/ask-box surface survives in this file (the Masthead's own is the only one)", () => {
  assert.doesNotMatch(CODE_ONLY, /from "@\/components\/ui\/CommandBar"/);
  assert.doesNotMatch(CODE_ONLY, /askPlaceholder/);
  assert.doesNotMatch(CODE_ONLY, /askScope/);
  assert.doesNotMatch(CODE_ONLY, /role="search"/, "no hand-rolled second search form survives");
});

// GAP G2 (2026-09-07) moved the item title into the shared ui/Masthead; check 2 (2026-09-24)
// retired DetailHeader entirely, so there is no second title-bearing component left to test.
test("no length-based title-style switch survives anywhere in this file", () => {
  assert.doesNotMatch(SOURCE, /title\.length/);
});
