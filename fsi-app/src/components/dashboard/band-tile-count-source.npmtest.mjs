// The invariant: a band tile's COUNT and the page that tile OPENS read the same figure.
//
// The production defect this would have caught (click-through audit 2026-09-08): the dashboard's
// Monitor tile printed 1,135 and linked to /regulations, whose own Monitor tile printed 1,119 for
// the same band on the next screen; Action printed 32 against 14. The dashboard tiles read
// `getWorkspaceAggregates()` (workspace-wide, all five surfaces) while their hrefs pointed at the
// regulations surface. Nothing in the type system objected, because both are a WorkspaceAggregates.
//
// This is a SOURCE-level check on purpose. The defect is not a wrong computation, it is two call
// sites choosing two different data functions for one figure, which no unit test over either
// function alone can see.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(resolve(APP, rel), "utf8");

const dashboardPage = read("app/page.tsx");
const regulationsPage = read("app/regulations/page.tsx");
const brief = read("components/dashboard/DashboardBrief.tsx");

test("both band-tile surfaces source their counts from the same call", () => {
  const CALL = 'getPublicSurfaceCounts("regulations")';
  assert.ok(
    regulationsPage.includes(CALL),
    "/regulations' own tiles must come from getPublicSurfaceCounts(\"regulations\")"
  );
  assert.ok(
    dashboardPage.includes(CALL),
    "the dashboard's tiles link to /regulations, so they must come from the same call"
  );
});

test("the dashboard's tiles do not read the workspace-wide tally", () => {
  // `aggregates` is still fetched and still used — for the masthead's "N items across 5 surfaces",
  // which is genuinely workspace-wide. What may not happen is a BAND TILE reading it.
  const tileBlock = brief.slice(brief.indexOf("<BandTile"), brief.indexOf("</div>", brief.indexOf("<BandTile")));
  assert.ok(tileBlock.includes("bandCounts.byPriority"), "the tile count reads the surface counts");
  assert.ok(
    !tileBlock.includes("aggregates.byPriority"),
    "a band tile reading aggregates.byPriority is the 1,135-vs-1,119 defect"
  );
});

test("the band-footer totals beside the tiles read the same figure as the tiles", () => {
  // "All 14 immediate" / "then 32 action · 1,135 monitor" sit inside the same card as the tiles and
  // must not be able to disagree with them.
  for (const name of ["immediateTotal", "actionTotal", "monitorTotal"]) {
    const line = brief.split("\n").find((l) => l.includes(`const ${name} =`));
    assert.ok(line, `${name} is declared`);
    assert.ok(
      line.includes("bandCounts.byPriority"),
      `${name} must read the same bundle the tiles do, not a second one`
    );
  }
});
