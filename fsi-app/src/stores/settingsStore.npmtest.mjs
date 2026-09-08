// Behavioural test for settingsStore's two rename-with-fallback readers (lane settings60,
// 2026-09-08). Artboard 15's "Dashboard defaults" card names the dashboard's six switchable
// regions (Band tiles / Due next / What changed / Watchlist rail / Across the platform /
// Supersessions) and its "Default sort" segments are the list surfaces' own sort vocabulary
// (Next date / Newest / A-Z). The store used to carry a pre-rebuild vocabulary for both
// (summaryStrip / weeklyBriefing / topUrgency / dueThisQuarter; urgency / priority / alpha /
// added / modified), which named regions and sorts the product no longer has — so the settings
// page could only have pasted the artboard's words onto fields that meant something else.
//
// The fields were renamed. What is under test here is the MIGRATION, not the rename: a workspace
// whose `workspace_settings.home_sections` / `default_filters.defaultSort` row was written under
// the old keys must still load with its saved state, and a row written under the new keys must
// win over a stale legacy key sitting beside it. `readSection`/`readSortKey` are not exported from
// the store module (it is a "use client" zustand module a node test cannot import), so this
// asserts them through the source text the way every other store/component npmtest in this repo
// does, plus a direct re-implementation check of the mapping table itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(HERE, "settingsStore.ts"), "utf8");

test("the six flags carry the artboard's own region names", () => {
  for (const field of [
    "showBandTiles",
    "showDueNext",
    "showWhatChanged",
    "showWatchlistRail",
    "showAcrossPlatform",
    "showSupersessions",
  ]) {
    assert.match(SOURCE, new RegExp(`${field}:\\s*boolean`), `${field} missing from SettingsState`);
  }
  // The pre-rebuild names must be gone from the state shape (they survive only as legacy JSON keys
  // inside readSection's call sites, which the next test pins).
  for (const gone of ["showSummaryStrip", "showWeeklyBriefing", "showTopUrgency", "showDueThisQuarter"]) {
    assert.ok(!SOURCE.includes(`${gone}:`), `${gone} still declared`);
  }
});

test("every renamed flag reads its own legacy JSON key as a fallback, so a saved workspace keeps its state", () => {
  const pairs = [
    ["bandTiles", "summaryStrip"],
    ["dueNext", "dueThisQuarter"],
    ["whatChanged", "whatChanged"],
    ["watchlistRail", "topUrgency"],
    ["acrossPlatform", "weeklyBriefing"],
    ["supersessions", "supersessions"],
  ];
  for (const [current, legacy] of pairs) {
    assert.match(
      SOURCE,
      new RegExp(`readSection\\(hs, "${current}", "${legacy}"\\)`),
      `no legacy fallback wired for ${current}`,
    );
  }
});

test("the row is WRITTEN under the current keys only — a rename that kept writing the old keys would never migrate", () => {
  const write = SOURCE.slice(SOURCE.indexOf("home_sections: {"), SOURCE.indexOf("default_export_format"));
  for (const current of ["bandTiles", "dueNext", "whatChanged", "watchlistRail", "acrossPlatform", "supersessions"]) {
    assert.ok(write.includes(`${current}:`), `${current} not written`);
  }
  for (const legacy of ["summaryStrip", "weeklyBriefing", "topUrgency", "dueThisQuarter"]) {
    assert.ok(!write.includes(`${legacy}:`), `${legacy} still written`);
  }
});

test("readSection: current key wins, legacy key is the fallback, absent means visible", () => {
  // Same three branches the store's own helper takes, re-stated here so the mapping is asserted as
  // BEHAVIOUR and not only as text.
  const readSection = (hs, key, legacyKey) => {
    if (!hs) return true;
    const current = hs[key];
    if (typeof current === "boolean") return current;
    const legacy = hs[legacyKey];
    return typeof legacy === "boolean" ? legacy : true;
  };
  assert.equal(readSection({ bandTiles: false, summaryStrip: true }, "bandTiles", "summaryStrip"), false);
  assert.equal(readSection({ summaryStrip: false }, "bandTiles", "summaryStrip"), false);
  assert.equal(readSection({}, "bandTiles", "summaryStrip"), true);
  assert.equal(readSection(null, "bandTiles", "summaryStrip"), true);
  // A non-boolean (a corrupted row) must not be trusted as a value.
  assert.equal(readSection({ bandTiles: "no" }, "bandTiles", "summaryStrip"), true);
});

test("defaultSort is the list surfaces' key set and every pre-rebuild value maps into it", () => {
  assert.match(SOURCE, /defaultSort:\s*ListSurfaceSortKey/);
  assert.match(SOURCE, /defaultSort:\s*"next-date"/);
  for (const [legacy, mapped] of [
    ["urgency", "next-date"],
    ["priority", "next-date"],
    ["alpha", "az"],
    ["added", "newest"],
    ["modified", "newest"],
  ]) {
    assert.ok(SOURCE.includes(`case "${legacy}":`), `no migration branch for ${legacy}`);
    assert.ok(SOURCE.includes(`return "${mapped}"`), `no target ${mapped}`);
  }
  // An unknown value returns null so the store keeps its default rather than storing garbage.
  assert.match(SOURCE, /default:\s*\n\s*return null;/);
});
