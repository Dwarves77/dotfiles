// Structural regression test for the /settings composition against artboard 15 (dc.html id="p15";
// lane settings60, 2026-09-08). The design audit's compose-15-settings spec measures the RENDERED
// page; this pins the source-level decisions the audit cannot see — which shared part each region
// is built from, and the values lifted verbatim from dc.html — the same convention TabRow.npmtest
// and Chips.npmtest use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "SettingsPage.tsx"), "utf8");
const PRIMS = readFileSync(resolve(HERE, "../account/AccountPrimitives.tsx"), "utf8");

test("the page is TWO columns, dc.html p15's own track sizes and gap", () => {
  assert.match(SOURCE, /gridTemplateColumns:\s*"minmax\(0,1fr\) 300px"/);
  assert.match(SOURCE, /gap:\s*28/);
  // Left column gap 18, right column gap 14 (dc.html p15).
  assert.match(SOURCE, /flexDirection:\s*"column",\s*gap:\s*18/);
  assert.match(SOURCE, /flexDirection:\s*"column",\s*gap:\s*14/);
});

test("left column is Dashboard defaults, Freight sectors, Notifications — in the artboard's order", () => {
  const left = SOURCE.indexOf('data-audit="settings-defaults"');
  const sectors = SOURCE.indexOf('data-audit="settings-sectors"');
  const notifs = SOURCE.indexOf('data-audit="settings-notifications"');
  assert.ok(left > 0 && sectors > left && notifs > sectors, "left column cards are out of order");
});

test("right column is Briefing schedule, Appearance, Data & supersessions — in the artboard's order", () => {
  const briefing = SOURCE.indexOf('dataAudit="settings-briefing"');
  const appearance = SOURCE.indexOf('dataAudit="settings-appearance"');
  const data = SOURCE.indexOf("DataAndSupersessionsRailCard />");
  assert.ok(briefing > 0 && appearance > briefing && data > appearance, "rail cards are out of order");
});

test("the rail cards are the SHARED RailCard, not a page-local card frame", () => {
  assert.match(SOURCE, /import \{ RailCard \} from "@\/components\/list-surface\/ListSurfaceRailCards"/);
  assert.ok(!/function\s+SettingsRailCard/.test(SOURCE), "a page-local rail card was forked");
});

test("the segmented controls are the SHARED SegmentedControl, used five times across the page", () => {
  assert.match(SOURCE, /SegmentedControl,/);
  assert.match(PRIMS, /export function SegmentedControl</);
  // Three on this page (sort / export / alert bands); Cadence and Day live in BriefingScheduleSection.
  assert.equal((SOURCE.match(/<SegmentedControl/g) || []).length, 3);
});

test("dc.html p15 copy, verbatim", () => {
  assert.ok(SOURCE.includes("Applies on every load"));
  assert.ok(SOURCE.includes("In-app now · email and push coming"));
  assert.ok(SOURCE.includes("filters your default view, briefings and relevance scoring"));
  assert.ok(
    SOURCE.includes(
      "Light only. There is one theme; the product reads like a printed ledger and stays that way.",
    ),
  );
  assert.ok(SOURCE.includes("Applies workspace-wide"));
  assert.ok(SOURCE.includes("See audit log →"));
  assert.ok(SOURCE.includes('Search settings — or ask "how do I change my briefing day?"'));
});

test("the toggle grid names the six regions the dashboard renders, in the artboard's order", () => {
  const order = ["BandTiles", "DueNext", "WhatChanged", "WatchlistRail", "AcrossPlatform", "Supersessions"];
  const labels = ["Band tiles", "Due next", "What changed", "Watchlist rail", "Across the platform", "Supersessions"];
  let cursor = SOURCE.indexOf("DASHBOARD_REGIONS");
  for (let i = 0; i < order.length; i += 1) {
    const at = SOURCE.indexOf(`{ key: "${order[i]}", label: "${labels[i]}" }`, cursor);
    assert.ok(at > cursor, `region ${order[i]} missing or out of order`);
    cursor = at;
  }
  // Each row is the 44px minimum the artboard draws.
  assert.match(SOURCE, /minHeight:\s*44/);
});

test("Freight sectors collapses to twelve with the disclosure, and the count in its label is LIVE", () => {
  assert.match(SOURCE, /const COLLAPSED_SECTOR_COUNT = 12;/);
  assert.match(SOURCE, /slice\(0, COLLAPSED_SECTOR_COUNT\)/);
  // dc.html's literal is "Show all 36 sectors"; 36 is its mock corpus, ALL_SECTORS is the app's.
  assert.match(SOURCE, /Show all \$\{formatNumber\(ALL_SECTORS\.length\)\} sectors/);
  assert.ok(!SOURCE.includes("Show all 36 sectors"), "the artboard's mock count was hard-coded");
});

test("a saved-search count still loading renders a skeleton, never a 0", () => {
  assert.match(SOURCE, /useState<number \| null>\(null\)/);
  assert.match(SOURCE, /savedCount === null \?/);
});

test("Alert bands take their words from the one urgency vocabulary, not a fourth hand-typed set", () => {
  assert.match(SOURCE, /import \{ BAND_ORDER, type PlatformPriority \} from "@\/lib\/urgency\/bands"/);
  assert.match(SOURCE, /BAND_ORDER\.filter\(/);
  assert.ok(!/label: "Immediate"/.test(SOURCE), "band labels were hand-typed instead of read from BAND_ORDER");
});

test("Default sort takes the list surfaces' own sort keys, not a second scale", () => {
  assert.match(SOURCE, /SegmentedOption<ListSurfaceSortKey>/);
  assert.ok(SOURCE.includes('{ id: "next-date", label: "Next date" }'));
  assert.ok(SOURCE.includes('{ id: "newest", label: "Newest" }'));
  assert.ok(SOURCE.includes('{ id: "az", label: "A-Z" }'));
});

test("ruling R9's section index survives, and R7's undesigned sections sit BELOW the two columns", () => {
  assert.match(SOURCE, /<SectionIndex sections=\{SETTINGS_SECTIONS\} \/>/);
  const columns = SOURCE.indexOf('data-audit="settings-columns"');
  for (const anchor of ['id="saved"', 'id="data"', 'id="archive"', 'id="help"']) {
    assert.ok(SOURCE.indexOf(anchor) > columns, `${anchor} is not below the designed columns`);
  }
});
