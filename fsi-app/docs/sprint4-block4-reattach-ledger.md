# Sprint 4 — Block-4 Reattach Ledger

**Purpose:** Block 1's thin-wrapper refactor (`/api/agent/run` → `start(generateBriefWorkflow)`) deliberately stranded real generation logic as stubs/orphans, to be re-wired when Block 4 fills the workflow step bodies. This ledger exists so those modules are NEVER mistaken for dead code in a future cleanup. Each entry is **KEEP — Block-4 reattach target**, not orphan-to-delete.

**Created 2026-05-31** (from the verification-blind-spot / drift audit). Read-only inventory; nothing here is deleted.

> Rule: before deleting ANY symbol in this ledger, the operator must confirm Block 4 no longer needs it. Default is KEEP.

## Orphaned-but-reserved modules (zero live importers TODAY, reattach in Block 4)

| Symbol / module | File | Reattaches at (Block-4 target) | Why kept |
|---|---|---|---|
| `buildSourcePool` | `src/lib/agent/source-pool.ts` | `generate-brief.ts` step `sourceOrFindForClaim` (active sourcing) | The dynamic per-item source pool feeder; the pre-refactor `/api/agent/run` used it. |
| agent system prompt (13-field contract) | `src/lib/agent/system-prompt.ts` | the DurableAgent / generation call inside the Block-4 generate step | The emission contract the workflow must send to Sonnet. |
| YAML parser (3-tier fallback) | `src/lib/agent/parse-output.ts` | the Block-4 generate step that parses model output → `section_claim_provenance` | Parses the 13-field + claim-provenance payload. |

## Stub step bodies to fill (present + wired, return placeholders TODAY)

| Step | File:symbol | Current placeholder | Block-4 fill |
|---|---|---|---|
| `sourceOrFindForClaim` | `generate-brief.ts` ~L47 | returns `{source_span:null, source_id:null}` | active sourcing via the canonical fetch fn (see D1) + `buildSourcePool` |
| `persistAgentRunSearches` | `generate-brief.ts` ~L59 | returns `0` | write `agent_run_searches` rows incl. `result_content_excerpt` |
| `validateItemProvenance` | `generate-brief.ts` ~L70 | returns `{valid:false}` | call `public.validate_item_provenance(item_id)` |
| `routeOnValidation` | `generate-brief.ts` ~L81 | returns `"noop"` | branch: valid → items/sections; invalid → `staged_updates`; span-check exhaustion → staging |

## Orphaned controls to reconstitute (binding preconditions)

| Item | Status | Block-4 requirement |
|---|---|---|
| Generation spend cap ($30/$15) | **Orphaned** — `b2-runner.mjs` + `sprint3-a5-sonnet-backfill.mjs` now `start()` fire-and-forget and meter NO spend (a5 carries a COST-GOVERNANCE-NOTE saying Block 4 must carry the cap). | Reconstitute the cap INSIDE the workflow generation step before ANY Phase-4 pass. Already a binding §7.6 / HC3 precondition. |
| Canonical fetch function (D1) | Pending D1 decision (re-measure `b1xvomeaj`). | The agent fetch path (`sourceOrFindForClaim`) MUST call the ONE canonical fetch function chosen in D1 — not a parallel implementation. |

## Cross-references
- Audit source: verification-blind-spot / state-drift brief (2026-05-31), decision log entries D1/D2/D3.
- Spend-cap precondition: governing-state §7.6 + decision log 2026-05-29 (orphaned-cap HC3 precondition).
