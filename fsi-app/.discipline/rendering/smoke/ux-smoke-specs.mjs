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
import { runSmoke as runHomeSectionsSmoke } from './home-sections-smoke.mjs';
import { runSmoke as runCommunitySmoke } from './community-smoke.mjs';
import { runSmoke as runSpec09Smoke } from './spec09-smoke.mjs';

export const UX_SMOKE_SPECS = [
  { name: "market-rows", run: runMarketRowsSmoke }, // lane MOBILE, Wave 3
  { name: "operations-rows", run: runOperationsRowsSmoke }, // lane MOBILE
  { name: "research-rows", run: runResearchRowsSmoke }, // lane MOBILE
  { name: "regulations-rows", run: runRegulationsRowsSmoke }, // lane MOBILE
  { name: "home-sections", run: runHomeSectionsSmoke }, // lane MOBILE
  { name: "community-surface", run: runCommunitySmoke }, // lane COMMUNITY-B
  { name: "spec09-panels", run: runSpec09Smoke }, // lane SPEC-09
];
