## 2026-10-07, lane s8f-industry-statements (Phase 1: fact register)

Brief: industry-level statements replace the removed calculator (plan Stage 8). Mid-task the coordinator redirected the lane from a design to a fact register (operator ruling: the coordinator designs, lanes do not). The output is `docs/dispatches/industry-statements-design-2026-10-08.md`, a register with no proposals. No product code, no migration, no database, no network beyond `gh pr diff 922` and `gh pr view 922`.

### Accomplished
- Register of six fact groups, each entry carrying a status token: spec 04 requirements and warnings quoted verbatim with line numbers; the calculator's exact mount point from `gh pr diff 922` (route file, view component, props); every operations table with the row count recorded in `docs/plans/system-map-2026-10-04.md` and its live consumers by grep; column lists and sample shapes (no values) for `regional_data_facts`, `state_cost_facts`, the labour chain, `emission_factors`, `regions`, `region_dimension_coverage`; the Operations list and detail blocks that render today with their tables; ADR-043's retirement scope quoted.

### Read and reused
- Read in full: `CLAUDE.md`, `docs/dispatches/lane-common-contract.md`, `ADR-043`, `docs/specs/04-operations.md`, `ADR-042`, `ADR-024` (decisions 1 to 3), `ADR-035` (decision), `src/app/operations/page.tsx`, `src/components/operations/OperationsLedger.tsx`, `src/lib/operations/labour-chain.ts` (to line 275), `src/lib/operations/region-grid.mjs` (to line 140), `src/lib/supabase-server.ts` lines 3600 to 3900, the full `gh pr diff 922` (4,324 lines, relevant hunks), migrations 106, 109, 152, 258, 267, 332 (column definitions), `docs/ops/session-log.d/2026-10-03-l13.md`.
- Read in part (headers and the parts cited): `RegionDimensionMatrix.tsx`, `OperationsDetailSurface.tsx`, `src/app/operations/[slug]/page.tsx`, `ThemeStrip.tsx`, the three regional producers and two parsers, `customer-source-tier.ts`, `envelope.mjs` (staleness and rounding), `read-register.mjs`, migrations 268, 274, 290.
- Reused: no code was built, so nothing was reused or duplicated.

### Corrections recorded (CLAUDE.md rule 14, in place in the register)
- `[REFUTED]` as worded: "`regional_data_facts` has no consumer after ADR-043" (buildout plan line 106 and the lane brief). Four read consumers exist; what is true is that nothing derives a value from it. Register entry 3.1.
- The lane began writing a design (statement classes, a generator, a mount proposal) before the redirect arrived. None of it was written to any file; the register contains no proposals.

### What is NOT done
- No design. The coordinator writes it. [NOT-WORK: fact, no action]
- No live counts were re-queried (no database). Every count is marked `[HYPOTHESIS]` with the document it was taken from. [NOT-WORK: build-mode hold, CLAUDE.md rule 16 / COMMON rule 5]
- Not traced: the source function behind `getPublicSurfaceCounts` (`fetchPublicSurfaceCounts`), the number of `nrg_pc_205` consumption bands, whether `state_cost_facts.value_numeric` is populated live, whether the live `regional_data_facts` rows carry `source_id`. [NOT-WORK: scope statement, no defect]

### Open items
- `docs/INDEX.md` needs a line for the new register (coordinator-only file per the lane contract). [WORK: DOCS-5]
- Value Delivery Check: this lane's work does not directly advance customer-facing value delivery. It is a read-only register feeding the coordinator's design for Stage 8 (Operations). It enumerates Regulations, Market Intel, Research, Operations and Community only where a table or block touches them (Operations blocks, Market-fed tables, `obligations` read by Regulations); Community is not touched. [NOT-WORK: fact, no action]
