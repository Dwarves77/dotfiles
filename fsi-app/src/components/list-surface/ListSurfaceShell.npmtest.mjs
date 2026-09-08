// Structural regression test for src/components/list-surface/ListSurfaceShell.tsx.
//
// REWRITTEN (lane compose-lists, 2026-09-07, operator audit "the filters were not above the
// regulations, they were on the right — same on every page"; artboard 02/id="p2"): the desktop
// facets cards this test used to guard (SectionRule + a padded `.cl-facets-desktop` card ABOVE the
// row list, once per facet group set) were removed from the content column entirely — the same
// facetGroups/secondaryFacetGroups data now renders as the rail's FiltersRailCard (checkbox lists,
// live counts, "Clear N") in ListSurfaceRailCards.tsx. This file now guards that relocation stays
// in place: no `.cl-facets-desktop` card in the content column, and the rail mounts FiltersRailCard
// built from the same facetGroups/secondaryFacetGroups props. Text-level, same convention as
// ListRow.npmtest.mjs's own header explains (no JSX mount infra for plain `node --test`; the audit
// harness's own `list-surface-1440` mount and the rendering guard's smoke specs are the real-DOM
// check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL_SOURCE = readFileSync(resolve(HERE, "ListSurfaceShell.tsx"), "utf8");
const RAIL_SOURCE = readFileSync(resolve(HERE, "ListSurfaceRailCards.tsx"), "utf8");

test("the content column no longer mounts a .cl-facets-desktop facets card (relocated to the rail)", () => {
  assert.doesNotMatch(
    SHELL_SOURCE,
    /className="cl-facets-desktop"/,
    "desktop facet chip cards must not remain in the content column — the artboard puts Filters in the rail",
  );
});

test("the rail mounts FiltersRailCard built from facetGroups + secondaryFacetGroups", () => {
  assert.match(SHELL_SOURCE, /import\s*\{\s*FiltersRailCard\s*\}\s*from\s*"@\/components\/list-surface\/ListSurfaceRailCards"/);
  assert.match(SHELL_SOURCE, /<FiltersRailCard\s/);
  assert.match(SHELL_SOURCE, /groups=\{allFacetGroups\}/, "FiltersRailCard must receive the same facetGroups + secondaryFacetGroups union every caller already computes");
});

test("FiltersRailCard renders a Filters title, a Clear control, and checkbox rows with live counts", () => {
  assert.match(RAIL_SOURCE, /Filters/);
  // Lane lists60 (2026-09-08): the Clear link is UNCONDITIONAL, because both artboards that draw
  // this card draw it — 02/id="p2" as `Clear 1` (one facet active) and 04/id="p4" as a bare `Clear`
  // (none active). It used to render only while a facet was active, so the composition capture
  // showed no Clear link at all. The count is still appended when there is one to state.
  assert.match(RAIL_SOURCE, /activeCount === 0 \? "Clear" : `Clear \$\{activeCount\}`/);
  // ...and with nothing to clear it is disabled rather than a press that silently does nothing
  // (operator audit P0 1.1's class: a control with no function behind it is a defect).
  assert.match(RAIL_SOURCE, /disabled=\{activeCount === 0\}/);
  assert.match(RAIL_SOURCE, /type="checkbox"/);
  // `countLabel ?? count` since lane comp-08 (2026-09-08): the live count is still what renders;
  // a facet whose count is a ratio rather than a tally (artboard 08's DIMENSION group, "3/5")
  // supplies its own display string. The invariant guarded here is unchanged — the rail row prints
  // the group's real count, never a static label.
  // UPDATED AT FOLD-61 for the same reason as the transition strip above: the live count still
  // renders and `countLabel` still wins when a facet supplies a ratio, but a bare tally now goes
  // through `formatNumber` so a four-digit facet count carries its separator.
  assert.match(RAIL_SOURCE, /\{opt\.countLabel \?\? formatNumber\(opt\.count\)\}/);
});

test("mobile strip + sheet mechanism (cl-facets-mobile / cl-filters-btn) is unchanged by the relocation", () => {
  assert.match(SHELL_SOURCE, /cl-facets-mobile/);
  assert.match(SHELL_SOURCE, /cl-filters-btn/);
});

// sortRow / flat (artboards 02/04, id="p2"/"p4": count + "grouped by band · Show as one list" left,
// "Sort ..." segmented control right, directly above the rows). Opt-in slot + rendering mode, not
// every surface's own copy — Research/Operations/Watchlist artboards do not carry this row.
test("sortRow renders directly above the rows, and flat concatenates rowsByBand into one unheaded list", () => {
  assert.match(SHELL_SOURCE, /\{sortRow\}/, "sortRow must be an explicit render slot");
  assert.match(SHELL_SOURCE, /flat \? \(/, "flat must switch to the unheaded single-list rendering branch");
  assert.match(
    SHELL_SOURCE,
    /rowsByBand\.flatMap\(\(section\) => section\.rows\)/,
    "flat mode must concatenate every band's own (already-sorted) rows, not re-derive a new order",
  );
});

// ── Band-card foot row + transition strip (lane comp-06, 2026-09-08) ───────────────────────────────
// Artboards 02/04/06 (id="p2"/"p4"/"p6") close every band section card with the SAME row: "All N
// <band> →" left, "then <next band> · N" right, "end of list" on the last rendered band; artboards
// 02 and 06 additionally draw a one-line transition strip under that row. Built once here for all
// five list surfaces rather than per page.

test("every band section card carries the foot row, with the artboard's own ground and rule", () => {
  assert.match(SHELL_SOURCE, /data-audit="band-foot"/);
  assert.match(SHELL_SOURCE, /background: "var\(--page\)"/);
  assert.match(SHELL_SOURCE, /borderTop: "1px solid var\(--line-2\)"/);
});

// FOLD-59 (2026-09-08): the INVARIANT is unchanged — the foot row's right side names the next
// populated band and its count, or says "end of list" on the last one. What changed is where that
// string is built. comp-06 and comp-08 built the foot strip independently; the fold kept ONE
// implementation, and the string now comes from the named `transitionLabel(sections, index)` helper
// (comp-08's, documented and reusable) rather than being interpolated inline at the call site. The
// test follows the product; it does not preserve the old shape.
test("the foot row names the next band, or says 'end of list' on the last rendered section", () => {
  assert.match(SHELL_SOURCE, /function transitionLabel\(/);
  // UPDATED AT FOLD-61: lane opsclip put every rendered integer through `formatNumber` (F36's
  // locale-pinned formatter), so a four-digit band total reads "1,135" and not "1135" here as it
  // already does on the band tiles. The invariant this line guards - the strip names the NEXT
  // band and its total - is unchanged; only the number's rendering moved.
  assert.match(SHELL_SOURCE, /`then \$\{next\.band\.label\} \\u00b7 \$\{formatNumber\(next\.total\)\}`/);
  assert.match(SHELL_SOURCE, /"end of list"/);
  // and it is the helper the foot row actually calls, not a dead function
  assert.match(SHELL_SOURCE, /\{transitionLabel\(populatedSections, sectionIndex\)\}/);
});

test("the 'All N <band>' link renders only when the band has rows left to reveal, never a dead control", () => {
  assert.match(SHELL_SOURCE, /\{section\.total > visible\.length && onExpandBand \? \(/);
});

test("sectionFoot is an optional per-band slot whose wrapper only exists when the caller returns a node", () => {
  assert.match(SHELL_SOURCE, /sectionFoot\?: \(bandKey: UrgencyBandKey, nextBandKey: UrgencyBandKey \| null\) => ReactNode;/);
  assert.match(SHELL_SOURCE, /const foot = sectionFoot\?\.\(section\.band\.key, nextSection \? nextSection\.band\.key : null\);/);
  assert.match(SHELL_SOURCE, /return foot \? <div style=\{\{ margin: "0 16px 14px" \}\}>\{foot\}<\/div> : null;/);
});

test("a caller-supplied empty state is not double-padded by the shell (artboard 06's own 28px 20px centred card)", () => {
  assert.match(SHELL_SOURCE, /\{emptyState \?\? <div style=\{\{ padding: 16 \}\}>/);
});

test("the masthead command-bar placeholder is a passthrough prop, not a per-surface masthead", () => {
  assert.match(SHELL_SOURCE, /searchPlaceholder\?: string;/);
  assert.match(SHELL_SOURCE, /placeholder: searchPlaceholder/);
});

test("a facet group with no options never renders as a bare heading in the rail", () => {
  assert.match(RAIL_SOURCE, /groups\.filter\(\(g\) => g\.options\.length > 0\)/);
});
