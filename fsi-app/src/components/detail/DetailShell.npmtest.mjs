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
// own VOL/breadcrumb line (dateLabel) — DetailHeader no longer carries a meta/breadcrumb line at
// all (see its own doc comment). The old DetailHeader-local BreadcrumbListPosition bridge was
// removed as dead code once DetailHeader stopped rendering it (CLAUDE.md rule 13).
test("DetailHeader carries no BreadcrumbListPosition / meta reader — the breadcrumb line moved to DetailMasthead", () => {
  assert.doesNotMatch(CODE_ONLY, /function BreadcrumbListPosition/);
  const headerBody = SOURCE.slice(
    SOURCE.indexOf("export function DetailHeader"),
    SOURCE.indexOf("// ── Masthead:")
  );
  assert.doesNotMatch(headerBody, /useSearchParams\(\)/);
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

test("SectionIndex renders sticky (position: sticky), the README §0.5 'sticky section index' requirement", () => {
  const start = SOURCE.indexOf("export function SectionIndex");
  const end = SOURCE.indexOf("export function", start + 1);
  const body = SOURCE.slice(start, end === -1 ? undefined : end);
  assert.match(body, /position: "sticky"/);
});

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

// DEFECT-FIX item 2.3 (2026-09-07, audit ruling, SUPERSEDES the prior "DetailHeader mounts a
// scoped CommandBar" test this replaces): "the CommandBar in the Masthead is the only search/ask
// surface" — a second, item-scoped ask box living inside DetailHeader (the old
// askPlaceholder/askScope props) was itself a second ask surface on every detail page. DetailHeader
// must not mount CommandBar (or any ask box) at all — nothing dormant left (no unused
// askPlaceholder/askScope prop survives either).
test("DetailHeader mounts no CommandBar and carries no askPlaceholder/askScope prop (item 2.3 — one ask surface, the Masthead, never a second box here)", () => {
  // CODE_ONLY (block comments stripped) — this file's own header prose is allowed to name the
  // removed props/import for history; the actual code must carry neither.
  assert.doesNotMatch(CODE_ONLY, /from "@\/components\/ui\/CommandBar"/);
  assert.doesNotMatch(CODE_ONLY, /askPlaceholder/);
  assert.doesNotMatch(CODE_ONLY, /askScope/);
  const headerBody = SOURCE.slice(
    SOURCE.indexOf("export function DetailHeader"),
    SOURCE.indexOf("// ── Masthead:")
  );
  assert.doesNotMatch(headerBody, /<CommandBar/);
  assert.doesNotMatch(headerBody, /role="search"/, "DetailHeader must not hand-roll a second search form");
});

// GAP G2 (2026-09-07): DetailHeader no longer renders an <h1> at all — the item title moved to the
// shared ui/Masthead (via DetailMasthead), so the item-1.2 "unconditional Anton title" guarantee is
// now Masthead.tsx's own contract (see Masthead.npmtest.mjs), not this file's. DetailHeader itself
// carries no title.length/itemGrade-shaped conditional anywhere.
test("DetailHeader renders no <h1> (title lives in DetailMasthead's Masthead mount, not duplicated here) and no length-based title-style switch survives in this file", () => {
  const headerBody = SOURCE.slice(
    SOURCE.indexOf("export function DetailHeader"),
    SOURCE.indexOf("// ── Masthead:")
  );
  assert.doesNotMatch(headerBody, /<h1/);
  assert.match(headerBody, /aria-label=\{title\}/);
  assert.doesNotMatch(SOURCE, /title\.length/, "no length-based title-style switch survives anywhere in this file");
});
