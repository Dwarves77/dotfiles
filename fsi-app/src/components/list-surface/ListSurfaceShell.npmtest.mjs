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

test("FiltersRailCard renders a Filters title, a Clear-N control, and checkbox rows with live counts", () => {
  assert.match(RAIL_SOURCE, /Filters/);
  assert.match(RAIL_SOURCE, /Clear \{activeCount\}/);
  assert.match(RAIL_SOURCE, /type="checkbox"/);
  assert.match(RAIL_SOURCE, /\{opt\.count\}/);
});

test("mobile strip + sheet mechanism (cl-facets-mobile / cl-filters-btn) is unchanged by the relocation", () => {
  assert.match(SHELL_SOURCE, /cl-facets-mobile/);
  assert.match(SHELL_SOURCE, /cl-filters-btn/);
});
