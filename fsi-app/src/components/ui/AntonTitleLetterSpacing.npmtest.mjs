// GAP G3 (2026-09-07, TRAIN-57 dispatch, AUDIT-2026-09-07 item A9): "Anton title letter-spacing is
// .04em only on Masthead and .02em on DetailHeader, DetailSection and dashboard SectionHeading.
// README section Display typography: Anton uppercase letter-spacing .04em for every display title."
// This locks .04em on the shared title components this pass fixed (Masthead already carried .04em;
// DetailSection, DashboardBrief's SectionHeading, PageMasthead's <h1>, WatchlistSurface's card
// title, and MapPageView's CardHead were .02em/.03em and are now .04em).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");

test("Masthead's <h1> carries letterSpacing 0.04em", () => {
  const text = readFileSync(resolve(ROOT, "components/ui/Masthead.tsx"), "utf8");
  const start = text.indexOf("<h1");
  const end = text.indexOf("</h1>");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
});

test("DetailSection's <h2> carries letterSpacing 0.04em (was 0.02em, item A9)", () => {
  const text = readFileSync(resolve(ROOT, "components/detail/DetailShell.tsx"), "utf8");
  const start = text.indexOf("export function DetailSection");
  const end = text.indexOf("// ── Page wrapper:");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
  assert.doesNotMatch(block, /letterSpacing: "0\.02em"/);
});

// UPDATED (lane comp-11, 2026-09-08): SectionHeading was promoted out of DashboardBrief into the
// shared ui/ layer, because artboard 11 carries the byte-identical card head on both its cards and
// a second copy would have been the duplication CLAUDE.md rule 13 forbids. The .04em assertion
// follows the component; the two callers are checked by the import that proves each uses it.
test("the shared SectionHeading's <h2> carries letterSpacing 0.04em (was 0.02em, item A9)", () => {
  const text = readFileSync(resolve(ROOT, "components/ui/SectionHeading.tsx"), "utf8");
  const start = text.indexOf("<h2");
  const end = text.indexOf("</h2>");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
  assert.doesNotMatch(block, /letterSpacing: "0\.02em"/);
});

test("DashboardBrief renders its card heads through the shared SectionHeading, not a page-local copy", () => {
  const text = readFileSync(resolve(ROOT, "components/dashboard/DashboardBrief.tsx"), "utf8");
  assert.match(text, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading"/);
  assert.doesNotMatch(text, /function SectionHeading\(/);
});

test("PageMasthead's page <h1> carries letterSpacing 0.04em", () => {
  const text = readFileSync(resolve(ROOT, "components/shell/PageMasthead.tsx"), "utf8");
  const start = text.indexOf("<h1");
  const end = text.indexOf("</h1>");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
});

test("WatchlistSurface's card titles go through the shared SectionHeading (which carries the .04em)", () => {
  const text = readFileSync(resolve(ROOT, "components/watchlist/WatchlistSurface.tsx"), "utf8");
  assert.match(text, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading"/);
  // dc.html p11's two card heads, in artboard order.
  assert.match(text, /<SectionHeading title=\{`Watched · \$\{items\.length\}`\} aside="Sorted by next date" \/>/);
  // UPDATED, lane counts 2026-09-08 (COUNTS-61): the aside was the literal "Since your last visit",
  // a claim with no instant behind it (see WatchlistSurface's own note). It is now the window the
  // /api/notices feed reports. This test's invariant is that the head goes through the shared
  // SectionHeading, which is unchanged; only the aside's value moved from a literal to a binding.
  assert.match(text, /<SectionHeading title="Recalculation notices" aside=\{noticesWindowLabel\} \/>/);
  // The page-local head this replaced set its own 18px font — the artboard says 20, which the
  // shared component now owns. No page-local title styling may return.
  assert.doesNotMatch(text, /fontSize: 18,/);
});

// UPDATED (lane map60, 2026-09-08): MapPageView's page-local CardHead is DELETED, artboard 10's
// two card heads are the same head artboards 1 and 11 draw, so the page renders the shared
// SectionHeading (which the .04em assertion above owns) instead of a third copy. The invariant is
// unchanged; its mount follows the component.
test("MapPageView renders its card heads through the shared SectionHeading, not a page-local copy", () => {
  const text = readFileSync(resolve(ROOT, "components/map/MapPageView.tsx"), "utf8");
  assert.match(text, /import \{ SectionHeading \} from "@\/components\/ui\/SectionHeading"/);
  assert.doesNotMatch(text, /function CardHead\(/);
  assert.match(text, /<SectionHeading\s+title="Regulatory map"/);
  assert.match(text, /<SectionHeading\s+title="Jurisdiction register"/);
});
