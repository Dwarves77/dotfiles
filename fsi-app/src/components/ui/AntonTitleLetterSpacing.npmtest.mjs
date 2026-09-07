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

test("DashboardBrief's SectionHeading <h2> carries letterSpacing 0.04em (was 0.02em, item A9)", () => {
  const text = readFileSync(resolve(ROOT, "components/dashboard/DashboardBrief.tsx"), "utf8");
  const start = text.indexOf("function SectionHeading(");
  const end = text.indexOf("/** The foot line");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
  assert.doesNotMatch(block, /letterSpacing: "0\.02em"/);
});

test("PageMasthead's page <h1> carries letterSpacing 0.04em", () => {
  const text = readFileSync(resolve(ROOT, "components/shell/PageMasthead.tsx"), "utf8");
  const start = text.indexOf("<h1");
  const end = text.indexOf("</h1>");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
});

test("WatchlistSurface's card title carries letterSpacing 0.04em", () => {
  const text = readFileSync(resolve(ROOT, "components/watchlist/WatchlistSurface.tsx"), "utf8");
  assert.match(text, /Watched · \{items\.length\}/);
  const idx = text.indexOf("fontSize: 18,");
  const block = text.slice(idx, idx + 200);
  assert.match(block, /letterSpacing: "0\.04em"/);
});

test("MapPageView's CardHead title carries letterSpacing 0.04em", () => {
  const text = readFileSync(resolve(ROOT, "components/map/MapPageView.tsx"), "utf8");
  const start = text.indexOf("function CardHead(");
  const end = text.indexOf("const railLabelStyle");
  const block = text.slice(start, end);
  assert.match(block, /letterSpacing: "0\.04em"/);
});
