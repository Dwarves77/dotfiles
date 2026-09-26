// UX smoke spec registry (2026-09-03, RD-60). run-rendering-guard.mjs iterates this list after the SM
// specs. Each entry is `{ name, run(browser) → { checks, failures } }`; a spec file exports `runSmoke`
// built on ux-harness.mjs's `runUxSpec`. Adding a spec is one import + one entry here, nothing else.
//
// Coverage contract (enforced by F35's registry check): every row/ledger component named in
// F35's ROW_COMPONENTS must be mounted by a spec registered here. A lane that fixes or adds a row
// component ships its spec in the same commit; the registry is the coordinator's one-line wiring.

import { runSmoke as runMarketRowsSmoke } from './market-rows-smoke.mjs';
import { runSmoke as runOperationsRowsSmoke } from './operations-rows-smoke.mjs';
import { runSmoke as runResearchRowsSmoke } from './research-rows-smoke.mjs';
import { runSmoke as runRegulationsRowsSmoke } from './regulations-rows-smoke.mjs';
import { runSmoke as runDashboardBriefSmoke } from './dashboard-brief-smoke.mjs';
import { runSmoke as runCommunitySmoke } from './community-smoke.mjs';
import { runSmoke as runSpec09Smoke } from './spec09-smoke.mjs';
import { runSmoke as runDetailSurfacesSmoke } from './detail-surfaces-smoke.mjs';
import { runSmoke as runNoticesRailSmoke } from './notices-rail-smoke.mjs';
import { runSmoke as runCorridorScopeSmoke } from './corridor-scope-smoke.mjs';
import { runSmoke as runMapSmoke } from './map-smoke.mjs';
import { runSmoke as runMastheadBalanceSmoke } from './masthead-balance-smoke.mjs';
import { runSmoke as runSearchResultsSmoke } from './search-results-smoke.mjs';
import { runSmoke as runPanel21cSmoke } from './panel-21c-smoke.mjs';
import { runSmoke as runActionCardSmoke } from './action-card-smoke.mjs';
import { runSmoke as runSectionIndexSmoke } from './section-index-smoke.mjs';
import { runSmoke as runRecordGradeSmoke } from './record-grade-smoke.mjs';
import { runSmoke as runItemGroupCoverageSmoke } from './item-group-coverage-smoke.mjs';
import { runSmoke as runParityChecksSmoke } from './parity-checks-smoke.mjs';

export const UX_SMOKE_SPECS = [
  { name: "market-rows", run: runMarketRowsSmoke }, // lane MOBILE, Wave 3
  { name: "operations-rows", run: runOperationsRowsSmoke }, // lane MOBILE
  { name: "research-rows", run: runResearchRowsSmoke }, // lane MOBILE
  { name: "regulations-rows", run: runRegulationsRowsSmoke }, // lane MOBILE
  { name: "dashboard-brief", run: runDashboardBriefSmoke }, // lane UIFIX, 2026-09-06 (supersedes home-sections/HomeSurface, deleted)
  { name: "community-surface", run: runCommunitySmoke }, // lane COMMUNITY-B
  { name: "spec09-panels", run: runSpec09Smoke }, // lane SPEC-09
  { name: "detail-surfaces", run: runDetailSurfacesSmoke }, // lane MOBILE-2 (the four detail surfaces)
  // lane NOTICES, 2026-09-05: notices-rail-smoke.mjs mounts the real RecalculationNotice.tsx (via
  // NoticesRail). Registered here by the ASSEMBLE-47 coordinator lane at landing, per
  // lane-common-contract.md's UX contract — proved GREEN locally by the authoring lane (see its report's
  // "UX smoke specs:" output); the matching F35 ROW_COMPONENTS entry is added in the same commit.
  { name: "notices-rail", run: runNoticesRailSmoke },
  // lane SCOPE-READER, 2026-09-06: mounts CarbonCostOverlay (unchanged shape, two new optional props)
  // and the new CorridorsAppliedStripView (regulation-detail "Corridors this applies on" block) — the
  // reader's two customer-facing surfaces.
  { name: "corridor-scope", run: runCorridorScopeSmoke },
  // lane uimapcomm, 2026-09-06: map-smoke.mjs mounts the real MapView (marker legend) and the real
  // ListRow (jurisdiction register rows, endStat prop) — the gap the perf audit named ("no smoke
  // spec mounts the map register or the marker legend").
  { name: "map-page", run: runMapSmoke },
  // D2 fix (operator report 2026-09-07, "your top text ... one line is very long and the next
  // line only has the word Cargo"): mounts the shared Masthead with the dashboard's own reported
  // dek content, proving `text-wrap: balance` removes the last-line word orphan at 1440 and at
  // the dashboard's actual masthead content width (masthead-balance-smoke.mjs's own header).
  { name: "masthead-balance", run: runMastheadBalanceSmoke },
  // lane W10-CommandBar, 2026-09-21: search-results-smoke.mjs mounts the real SearchResultsView
  // (/search's presentational half), the new results page ruling 2 of 2026-09-20 required.
  { name: "search-results", run: runSearchResultsSmoke },
  // lane w10-factcard-d, 2026-09-21, build item 6: measures the panel-21c fixture (ItemGroup +
  // FactCard, PANEL_21C_GROUPS) at 1440 against the operator's own acceptance list via the pure
  // detector in panel21c-accept.mjs (proven red-then-green in panel21c-accept.test.mjs).
  { name: "panel-21c", run: runPanel21cSmoke },
  // lane w10-actioncard-b, 2026-09-22, build item 7 (registered permanently; part A registered
  // these two specs only temporarily to self-check locally, per the lane contract's own
  // instruction to revert before commit): mounts the real ActionCard/Timeline and the real
  // SectionIndex against the regulation surface's own fixture data.
  { name: "action-card", run: runActionCardSmoke },
  { name: "section-index", run: runSectionIndexSmoke },
  // lane w10-actioncard-b, 2026-09-22, addendum ([CONFIRMED on production bfde1be8]: the
  // record-grade regulation page rendered 4 fact cards with ZERO [data-part="item-group"]).
  // Mounts the real ItemGroup + RecordFactCard against a frozen real record
  // (record-grade-fixture.ts, item f8268063-0e07-4562-82da-a1373d6dd797) in the two-group shape
  // RegulationDetailSurface.tsx's RecordGradeSections now renders.
  { name: "record-grade", run: runRecordGradeSmoke },
  // lane W10-SectionHeader, 2026-09-22, build item 1 verification: mounts each detail surface's
  // record-grade and full-brief fixtures (regulation/market/research record-grade, all four
  // full-brief) and asserts every [data-part="fact-card"] has an [data-part="item-group"]
  // ancestor, site-wide, both grades.
  { name: "item-group-coverage", run: runItemGroupCoverageSmoke },
  // lane PARITY-PARTS, 2026-09-24, invariant RD-84: checks 1/2/5/7/8 of the operator's 8-point
  // artboard-parity check (fsi-app/scripts/tmp/artboard-parity.mjs), execution-wired here rather
  // than left as a manual-only harness run. Reuses detail-surfaces-smoke.mjs's own regulation
  // fixture (rule 13, no duplicated fixture).
  { name: "parity-checks", run: runParityChecksSmoke },
];
