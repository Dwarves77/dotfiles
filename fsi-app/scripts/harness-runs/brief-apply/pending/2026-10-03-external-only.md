## Change

Lane EXTERNAL-ONLY (2026-10-03, ADR-042): `src/lib/agent/canonical-pipeline.ts`, one of this family's five
governing files, drops the per-organization `planning_assumption_register` read from
`buildPlanningAssumptionContext` (the register was removed). The function keeps the research assessment
half (external data) and its "RESEARCH ASSESSMENT CONTEXT" header; `writeSynthesizedBrief` (the single write
site) and every non-research_finding path are unchanged. Covered by the updated fixture test
`src/lib/agent/canonical-pipeline.research-context.npmtest.mjs` (3 tests, fake client, no live model call),
not a live `brief-apply` run.

## Planned run

The next `.github/workflows/brief-apply.yml` dispatch against a `research_finding` item, landing the next
`brief-apply-run-NNN.json`. Delete this file the moment that artifact lands.
